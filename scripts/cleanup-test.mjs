import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const a=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
// 1) delete throwaway tester (keep the real admin zarif)
const {data:list}=await a.auth.admin.listUsers();
for(const u of list.users){ if(u.email==="rt.tester.crm@gmail.com"){ await a.auth.admin.deleteUser(u.id); console.log("deleted user",u.email);} }
// 2) delete the junk messages I injected into the real conversation
const patterns=["REALTIME TEST%","diag-rt-%","LIVE UPDATE works%"];
for(const p of patterns){ const {data,error}=await a.from("messages").delete().like("body",p).select("id"); console.log("deleted",p,"->",error?error.message:(data?.length??0)); }
// 3) show remaining users + zarif's messages
const {data:profs}=await a.from("profiles").select("email,role");
console.log("remaining profiles:",JSON.stringify(profs));
const {data:msgs}=await a.from("messages").select("body,created_at,conversation:conversations(contact:contacts(name))").order("created_at",{ascending:true});
console.log("all messages:",JSON.stringify(msgs.map(m=>({n:m.conversation.contact.name,b:m.body})),null,1));
