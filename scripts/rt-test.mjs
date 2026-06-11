import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const url=env.NEXT_PUBLIC_SUPABASE_URL, anonKey=env.NEXT_PUBLIC_SUPABASE_ANON_KEY, svc=env.SUPABASE_SERVICE_ROLE_KEY;
const anon=createClient(url,anonKey);
const { data: sess, error: se } = await anon.auth.signInWithPassword({email:"rt.tester.crm@gmail.com",password:"tester123456"});
console.log("signin:", se?se.message:"ok, user "+sess.user.email);
const admin=createClient(url,svc,{auth:{persistSession:false}});
let received=false;
const ch=anon.channel("diag-"+Date.now())
  .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},(p)=>{received=true;console.log(">>> EVENT received:",p.new?.body);})
  .subscribe((status,err)=>{console.log("channel status:",status, err?("err="+err.message):"");});
await new Promise(r=>setTimeout(r,3500));
const {data:c}=await admin.from("contacts").select("id").eq("wa_id","601110018198").single();
const {data:conv}=await admin.from("conversations").select("id").eq("contact_id",c.id).single();
const {error:ie}=await admin.from("messages").insert({conversation_id:conv.id,direction:"inbound",type:"text",body:"diag-rt-"+Date.now(),status:"received"});
console.log("insert:", ie?ie.message:"ok");
await new Promise(r=>setTimeout(r,5000));
console.log("RESULT received event:", received);
process.exit(0);
