import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const { data: nums } = await a.from("whatsapp_numbers").select("phone_number_id, display_name, phone_display");
console.log("NUMBERS:", JSON.stringify(nums,null,2));
const { data: msgs } = await a.from("messages").select("direction, body, status, created_at, conversation:conversations(contact:contacts(name, profile_name, wa_id))").order("created_at",{ascending:false}).limit(5);
console.log("RECENT MESSAGES:", JSON.stringify(msgs,null,2));
