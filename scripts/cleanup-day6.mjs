import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const a=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data:list}=await a.auth.admin.listUsers();
for(const u of list.users){ if(u.email==="temp.admin.crm@gmail.com"){ await a.auth.admin.deleteUser(u.id); console.log("deleted",u.email);} }
console.log("profiles:",JSON.stringify((await a.from("profiles").select("email,role")).data));
console.log("canned:",JSON.stringify((await a.from("canned_replies").select("title")).data));
