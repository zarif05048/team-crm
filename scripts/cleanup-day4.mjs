import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const a=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
// delete throwaway Aisha
const {data:list}=await a.auth.admin.listUsers();
for(const u of list.users){ if(u.email==="aisha.agent.crm@gmail.com"){ await a.auth.admin.deleteUser(u.id); console.log("deleted",u.email);} }
// delete test note + reset owner conversation
await a.from("notes").delete().like("body","This customer is a hot lead%");
const {data:c}=await a.from("contacts").select("id").eq("wa_id","601110018198").single();
await a.from("conversations").update({status:"open",assigned_to:null}).eq("contact_id",c.id);
const {data:profs}=await a.from("profiles").select("email,role");
console.log("remaining profiles:",JSON.stringify(profs));
console.log("notes left:",(await a.from("notes").select("id")).data.length);
