import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const a=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
async function setStageByWa(wa,stage){const {data:c}=await a.from("contacts").select("id").eq("wa_id",wa).single(); if(c){await a.from("conversations").update({stage}).eq("contact_id",c.id);console.log(wa,"->",stage);}}
await setStageByWa("60123456789","contacted"); // Ahmad
await setStageByWa("60129998888","qualified"); // Siti
console.log("done");
