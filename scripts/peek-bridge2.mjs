import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

const numberId = "9ff86b54-df50-482c-881c-69b3b4c36049";
const { data: convos, error: convErr } = await a.from("conversations").select("id, status, bot_enabled, last_inbound_at, last_message_at, contact:contacts(name, profile_name, wa_id)").eq("whatsapp_number_id", numberId);
console.log("BRIDGED CONVERSATIONS:", JSON.stringify(convos, null, 2), convErr || "");

if (convos?.length) {
  const ids = convos.map(c => c.id);
  const { data: msgs, error: msgErr } = await a.from("messages").select("direction, body, status, sent_by_bot, created_at, conversation_id").in("conversation_id", ids).order("created_at", { ascending: false }).limit(15);
  console.log("RECENT MESSAGES:", JSON.stringify(msgs, null, 2), msgErr || "");
}
