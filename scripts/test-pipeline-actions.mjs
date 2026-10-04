// Verify actual built Server Actions against disposable test data only.
// Start `npm run start -- --port 3102`, then run this script. `live` verifies
// deployed markup as well; the local action tests always run before deployment.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { malaysiaDate } from "../src/lib/pipeline-follow-up.ts";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname, "ewwzmyzegmjoiqstbjbn.supabase.co");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const base = "http://localhost:3102";
const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
const actionId = (name) => Object.entries(manifest.node).find(([,value]) =>
  Object.values(value.workers).some((worker) => worker.exportedName === name))?.[0];
let userId;
let contactId;
let cookie;
const checked = (result) => { if (result.error) throw new Error(result.error.message); return result.data; };
async function action(name, args) {
  const response = await fetch(`${base}/pipeline`, {
    method:"POST", headers:{Cookie:cookie, Origin:base, "Next-Action":actionId(name), "Content-Type":"text/plain;charset=UTF-8"},
    body:JSON.stringify(args), redirect:"manual",
  });
  assert.equal(response.status, 200, `${name} returned HTTP ${response.status}`);
  const body = await response.text();
  assert.ok(body.includes('"ok":true'), `${name} did not succeed`);
}
async function readContact() {
  return checked(await admin.from("contacts").select("pipeline_follow_up_at").eq("id",contactId).single());
}
try {
  const password = `${randomUUID()}!CrmTest`;
  const email = `crm-pipeline-${randomUUID()}@example.com`;
  const user = checked(await admin.auth.admin.createUser({ email, password, email_confirm:true,
    user_metadata:{full_name:"CRM temporary verification"} }));
  userId = user.user.id;
  const jar = new Map();
  const session = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})), setAll:(items)=>items.forEach(({name,value})=>jar.set(name,value))},
  });
  checked(await session.auth.signInWithPassword({email,password}));
  cookie = [...jar].map(([name,value])=>`${name}=${value}`).join("; ");
  const contact = checked(await admin.from("contacts").insert({wa_id:`crm-actions-test-${randomUUID()}`,name:"CRM ACTIONS TEST"}).select("id").single());
  contactId = contact.id;
  const numbers = checked(await admin.from("whatsapp_numbers").select("id").limit(2));
  assert.ok(numbers.length);
  const conversations = checked(await admin.from("conversations").insert(numbers.map((number)=>({
    contact_id:contactId,whatsapp_number_id:number.id,stage:"new",bot_enabled:false,
  }))).select("id"));
  const ids = conversations.map((c)=>c.id);
  const tag = checked(await admin.from("tags").select("id").eq("name","weight-loss").single());
  checked(await admin.from("conversation_tags").insert(ids.map((id)=>({conversation_id:id,tag_id:tag.id}))));

  const html = await (await fetch(`${base}/pipeline`,{headers:{Cookie:cookie}})).text();
  assert.ok(html.includes("Follow Up"));
  assert.ok(!html.includes('type="checkbox"'), "Checkbox must be removed");
  assert.ok(!html.includes("Record another follow-up today"));
  await action("setPatientStage", [ids,"qualified"]);
  const movedDate = (await readContact()).pipeline_follow_up_at;
  assert.ok(movedDate);
  assert.equal(malaysiaDate(movedDate), malaysiaDate(Date.now()), "Move records today's Malaysia date");
  const stages = checked(await admin.from("conversations").select("stage").in("id",ids));
  assert.ok(stages.every((c)=>c.stage === "qualified"));
  await action("savePipelineFollowUp", [contactId,"qualified","2026-09-27"]);
  const savedDate = (await readContact()).pipeline_follow_up_at;
  assert.equal(malaysiaDate(savedDate), "2026-09-27");
  await action("setPatientStage", [ids,"qualified"]);
  assert.equal((await readContact()).pipeline_follow_up_at,savedDate,"Same-column drop preserves the date");
  await action("setPatientStage", [ids,"new"]);
  await action("setPatientStage", [ids,"qualified"]);
  assert.equal(malaysiaDate((await readContact()).pipeline_follow_up_at), malaysiaDate(Date.now()),"Re-entry records a fresh follow-up");
  await action("savePipelineFollowUp", [contactId,"booking","2026-10-10"]);
  console.log("Server Action checks passed: New → Follow Up records today's date across lines; edited date persists; same-column move preserves it; re-entry resets it; Booking date still saves; no checkbox or extra follow-up button.");
  if (process.argv[2] === "live") {
    const response = await fetch("https://team-crm-one.vercel.app/pipeline",{headers:{Cookie:cookie}});
    const live = await response.text();
    assert.equal(response.status,200);
    assert.ok(live.includes("Follow Up"),"Production column rename isn't live yet");
    assert.ok(!live.includes('type="checkbox"'),"Production still has follow-up checkboxes");
    assert.ok(live.includes("Follow-up date"));
    console.log("Production verification passed: Follow Up column, editable dates and no checkboxes.");
  }
} finally {
  if (contactId) checked(await admin.from("contacts").delete().eq("id",contactId));
  if (userId) checked(await admin.auth.admin.deleteUser(userId));
  console.log("Temporary test contact, test threads and test account removed. No patient messages sent.");
}
