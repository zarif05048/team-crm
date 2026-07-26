// Runs the EXACT select getConversations() uses against the live database, and
// reports the payload size — the number this change set out to shrink.
// PostgREST rejects a select naming a missing column, so this passing means the
// deployed inbox query is valid.
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

const LIST_COLUMNS =
  "id, whatsapp_number_id, assigned_to, status, stage, bot_enabled, " +
  "last_message_at, last_message_body, last_message_direction, unread_count";

const t0 = Date.now();
const [{ data, error }, { data: numbers }] = await Promise.all([
  a
    .from("conversations")
    .select(
      `${LIST_COLUMNS},
       contact:contacts(id, wa_id, name, profile_name),
       assignee:profiles!conversations_assigned_to_fkey(id, full_name),
       conversation_tags(tag:tags(id, name, color))`,
    )
    .order("last_message_at", { ascending: false })
    .limit(200),
  a.from("whatsapp_numbers").select("id, display_name"),
]);

if (error) {
  console.log("QUERY FAILED —", error.message);
  process.exit(1);
}
const listBytes =
  Buffer.byteLength(JSON.stringify(data)) + Buffer.byteLength(JSON.stringify(numbers ?? []));
console.log(
  `new list query: OK — ${data.length} conversations + ${numbers?.length ?? 0} numbers, ` +
    `${(listBytes / 1024).toFixed(0)} KB, ${Date.now() - t0} ms`,
);

// Now measure what the OLD implementation fetched, so the comparison is real
// rather than inferred: the wider row shape plus the 1,500-row message scan.
const { data: oldConvos } = await a
  .from("conversations")
  .select(
    `id, contact_id, whatsapp_number_id, assigned_to, status, stage, bot_enabled,
     last_message_at, last_inbound_at, last_read_at, created_at,
     contact:contacts(id, wa_id, name, profile_name),
     whatsapp_number:whatsapp_numbers(id, display_name, phone_display),
     assignee:profiles!conversations_assigned_to_fkey(id, full_name),
     conversation_tags(tag:tags(*))`,
  )
  .order("last_message_at", { ascending: false })
  .limit(200);
const oldListBytes = Buffer.byteLength(JSON.stringify(oldConvos ?? []));

const ids = (oldConvos ?? []).map((c) => c.id);
const { data: msgs } = await a
  .from("messages")
  .select("conversation_id, body, direction, created_at")
  .in("conversation_id", ids)
  .order("created_at", { ascending: false })
  .limit(1500);
const oldMsgBytes = Buffer.byteLength(JSON.stringify(msgs ?? []));

console.log(`old list rows:          ${(oldListBytes / 1024).toFixed(0)} KB`);
console.log(`old messages scan:      ${(oldMsgBytes / 1024).toFixed(0)} KB (${msgs?.length ?? 0} rows)`);

const before = oldListBytes + oldMsgBytes;
console.log(
  `\nper refresh: ${(before / 1024).toFixed(0)} KB -> ${(listBytes / 1024).toFixed(0)} KB ` +
    `(${(100 - (listBytes / before) * 100).toFixed(0)}% less)`,
);
