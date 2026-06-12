import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const a=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data,error}=await a.auth.admin.createUser({email:"temp.admin.crm@gmail.com",password:"tempadmin123",email_confirm:true,user_metadata:{full_name:"Temp Admin"}});
if(error){console.log("err",error.message);process.exit(1);}
await a.from("profiles").update({role:"admin",full_name:"Temp Admin"}).eq("id",data.user.id);
console.log("created temp admin, id",data.user.id);
