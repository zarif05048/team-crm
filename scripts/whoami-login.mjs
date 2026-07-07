import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const a=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data,error}=await a.from("profiles").select("email,full_name,role").order("role");
if(error){console.log("error:",error.message);process.exit(0);}
console.log("Accounts:"); for(const p of data){ console.log(` - ${p.email}  (${p.role})  ${p.full_name??""}`);}
