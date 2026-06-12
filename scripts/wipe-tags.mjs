import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const a=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data:tags}=await a.from("tags").select("id,name");
console.log("orphan tags:",JSON.stringify(tags.map(t=>t.name)));
for(const t of tags){ await a.from("tags").delete().eq("id",t.id); }
console.log("tags after:",(await a.from("tags").select("*",{count:"exact",head:true})).count);
