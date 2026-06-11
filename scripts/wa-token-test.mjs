import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const TOKEN=env.WHATSAPP_ACCESS_TOKEN, V=env.WHATSAPP_API_VERSION||"v21.0", PID=env.WHATSAPP_PHONE_NUMBER_ID;
const G=`https://graph.facebook.com/${V}`;
async function j(u){const r=await fetch(u);return {s:r.status,b:await r.json().catch(()=>({}))};}
// token + phone number sanity
const p=await j(`${G}/${PID}?fields=id,display_phone_number,verified_name&access_token=${encodeURIComponent(TOKEN)}`);
console.log("phone node:", p.s, JSON.stringify(p.b));
// WABA id via phone number's owning account
const w=await j(`${G}/${PID}?fields=whatsapp_business_account{id,name}&access_token=${encodeURIComponent(TOKEN)}`);
console.log("waba via phone:", w.s, JSON.stringify(w.b));
