// Checks whether the 2026-07-26 conversation-preview migration has been applied:
// the three denormalised columns exist, the backfill ran, and the trigger fires.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// 1) columns present?
const cols = await a
  .from("conversations")
  .select("id, last_message_at, last_message_body, last_message_direction, unread_count")
  .order("last_message_at", { ascending: false })
  .limit(5);
if (cols.error) {
  console.log("columns: MISSING —", cols.error.message);
  process.exit(1);
}
console.log("columns: OK");

// 2) did the backfill populate them?
const withPreview = cols.data.filter((c) => c.last_message_direction != null).length;
console.log(`backfill: ${withPreview}/${cols.data.length} of the newest threads have a preview`);
for (const c of cols.data) {
  const body = (c.last_message_body ?? "").replace(/\s+/g, " ").slice(0, 48);
  console.log(`  ${c.last_message_direction ?? "-"} | unread=${c.unread_count} | ${body}`);
}

// 3) does the preview match the real newest message? (spot-check the top thread)
const top = cols.data[0];
if (top) {
  const newest = await a
    .from("messages")
    .select("body, direction, created_at")
    .eq("conversation_id", top.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const m = newest.data?.[0];
  if (m) {
    const expect = (m.body ?? "").slice(0, 160);
    const got = top.last_message_body ?? "";
    console.log("preview matches newest message:", expect === got ? "OK" : `MISMATCH\n  expected: ${expect}\n  got:      ${got}`);
    console.log("direction matches:", m.direction === top.last_message_direction ? "OK" : "MISMATCH");
  }
}

// 4) is the trigger live? insert a message into the oldest thread, check, remove.
const probe = await a
  .from("conversations")
  .select("id, last_message_at, last_message_body, last_message_direction, unread_count")
  .order("last_message_at", { ascending: true })
  .limit(1);
const target = probe.data?.[0];
if (!target) {
  console.log("trigger: SKIPPED (no conversations to probe)");
  process.exit(0);
}
const marker = `__migration probe ${Date.now()}__`;
const ins = await a
  .from("messages")
  .insert({
    conversation_id: target.id,
    direction: "inbound",
    type: "text",
    body: marker,
    status: "received",
    created_at: new Date().toISOString(),
  })
  .select("id")
  .single();
if (ins.error) {
  console.log("trigger: could not probe —", ins.error.message);
  process.exit(1);
}
const after = await a
  .from("conversations")
  .select("last_message_body, last_message_direction, unread_count, last_inbound_at")
  .eq("id", target.id)
  .single();
const fired =
  after.data?.last_message_body === marker &&
  after.data?.last_message_direction === "inbound" &&
  after.data?.unread_count === (target.unread_count ?? 0) + 1;
console.log("trigger:", fired ? "OK (preview, direction and unread all updated)" : "NOT FIRING");
if (!fired) console.log("  got:", after.data);

// clean up the probe and restore the row
await a.from("messages").delete().eq("id", ins.data.id);
await a
  .from("conversations")
  .update({
    last_message_at: target.last_message_at,
    last_message_body: target.last_message_body,
    last_message_direction: target.last_message_direction,
    unread_count: target.unread_count,
  })
  .eq("id", target.id);
console.log("probe cleaned up");
