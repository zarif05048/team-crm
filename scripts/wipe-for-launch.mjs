import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const a=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
// Deleting all contacts cascades to conversations -> messages/notes/conversation_tags
const {data:contacts}=await a.from("contacts").select("id");
for(const c of contacts){ await a.from("contacts").delete().eq("id",c.id); }
// Remove the fake test number from early simulation; keep the real connected one
await a.from("whatsapp_numbers").delete().eq("phone_number_id","TEST_PHONE_NUMBER_ID");
// Report final state
const counts={};
for(const t of ["contacts","conversations","messages","notes","conversation_tags","tags"]){ counts[t]=(await a.from(t).select("*",{count:"exact",head:true})).count; }
console.log("after wipe:",JSON.stringify(counts));
console.log("numbers:",JSON.stringify((await a.from("whatsapp_numbers").select("phone_number_id,display_name")).data));
console.log("profiles:",JSON.stringify((await a.from("profiles").select("email,role")).data));
console.log("canned:",JSON.stringify((await a.from("canned_replies").select("title")).data));
