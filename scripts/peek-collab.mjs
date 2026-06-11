import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const a=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data:conv}=await a.from("conversations").select("status,assignee:profiles!conversations_assigned_to_fkey(full_name),contact:contacts(name)").eq("contact_id",(await a.from("contacts").select("id").eq("wa_id","601110018198").single()).data.id).single();
console.log("CONVERSATION:",JSON.stringify(conv));
const {data:notes}=await a.from("notes").select("body,mentions,author:profiles!notes_author_id_fkey(full_name)");
console.log("NOTES:",JSON.stringify(notes));
