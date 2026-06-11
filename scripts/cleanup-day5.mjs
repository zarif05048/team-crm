import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const a=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data:list}=await a.auth.admin.listUsers();
for(const u of list.users){ if(u.email==="pipeline.tester.crm@gmail.com"){ await a.auth.admin.deleteUser(u.id); console.log("deleted",u.email);} }
// remove test VIP tag + reset Zarif's real conversation
await a.from("tags").delete().eq("name","VIP"); // cascades conversation_tags
const {data:c}=await a.from("contacts").select("id").eq("wa_id","601110018198").single();
await a.from("conversations").update({stage:"new"}).eq("contact_id",c.id);
console.log("profiles:",JSON.stringify((await a.from("profiles").select("email,role")).data));
