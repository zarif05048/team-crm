// CRM-only verification. seed/clean act ONLY on the two named test contacts.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => l && !l.startsWith("#") && l.includes("="))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname, "ewwzmyzegmjoiqstbjbn.supabase.co");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const phones = ["crm-pipeline-check-20261004-booking", "crm-pipeline-check-20261004-qualified"];
const mode = process.argv[2] ?? "check";
function checked(result) { if (result.error) throw new Error(result.error.message); return result.data; }
if (mode === "check") {
  checked(await sb.from("contacts").select("id, pipeline_booking_date, pipeline_follow_up_at").limit(1));
  checked(await sb.from("conversations").select("id, stage_entered_at").limit(1));
  console.log("Pipeline migration columns available through the live API.");
} else if (mode === "seed") {
  const existing = checked(await sb.from("contacts").select("id").in("wa_id", phones));
  assert.equal(existing.length, 0, "Test contacts already exist; clean before reseeding");
  const number = checked(await sb.from("whatsapp_numbers").select("id").limit(1).single());
  const tag = checked(await sb.from("tags").select("id").eq("name", "weight-loss").single());
  for (const [index, stage] of ["booking", "qualified"].entries()) {
    const contact = checked(await sb.from("contacts").insert({
      wa_id: phones[index], name: `CRM TEST — ${stage === "booking" ? "Booking" : "Qualified"}`,
      pipeline_booking_date: stage === "booking" ? "2026-09-27" : null,
      pipeline_follow_up_at: stage === "qualified" ? "2026-09-27T10:00:00+08:00" : null,
    }).select("id").single());
    const convo = checked(await sb.from("conversations").insert({
      contact_id: contact.id, whatsapp_number_id: number.id, stage, bot_enabled: false,
    }).select("id, stage_entered_at").single());
    checked(await sb.from("conversation_tags").insert({ conversation_id: convo.id, tag_id: tag.id }));
    // Stage-only changes reset the clock; setting the same stage doesn't.
    checked(await sb.from("conversations").update({ stage_entered_at: "2026-09-01T00:00:00Z" }).eq("id", convo.id));
    const same = checked(await sb.from("conversations").update({ stage }).eq("id", convo.id).select("stage_entered_at").single());
    assert.equal(same.stage_entered_at, "2026-09-01T00:00:00+00:00");
    const changed = checked(await sb.from("conversations").update({ stage: "new" }).eq("id", convo.id).select("stage_entered_at").single());
    assert.ok(Date.parse(changed.stage_entered_at) > Date.parse(same.stage_entered_at));
    checked(await sb.from("conversations").update({ stage }).eq("id", convo.id));
  }
  console.log("Two temporary Pipeline test cards seeded. No messages sent. Stage trigger passed.");
} else if (mode === "clean") {
  const contacts = checked(await sb.from("contacts").select("id, wa_id, name").in("wa_id", phones));
  assert.ok(contacts.every((c) => c.name.startsWith("CRM TEST — ")));
  if (contacts.length) checked(await sb.from("contacts").delete().in("id", contacts.map((c) => c.id)));
  console.log(`Removed ${contacts.length} temporary test cards and their test threads; patient data untouched.`);
} else if (mode === "reply") {
  const contact = checked(await sb.from("contacts").select("id").eq("wa_id", phones[1]).single());
  checked(await sb.from("conversations").update({ last_inbound_at: new Date().toISOString() }).eq("contact_id", contact.id));
  console.log("Simulated a reply on the Qualified test card only; no message sent.");
} else throw new Error("Use check, seed, reply or clean");
