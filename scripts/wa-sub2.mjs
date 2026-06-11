import { readFileSync } from "node:fs";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const T=env.WHATSAPP_ACCESS_TOKEN,V=env.WHATSAPP_API_VERSION||"v21.0",W="100179786166143";
const G=`https://graph.facebook.com/${V}`;
async function j(u,o){const r=await fetch(u,o);return{s:r.status,b:await r.json().catch(()=>({}))};}
const sub=await j(`${G}/${W}/subscribed_apps`,{method:"POST",headers:{Authorization:`Bearer ${T}`}});
console.log("POST subscribed_apps:",sub.s,JSON.stringify(sub.b));
const list=await j(`${G}/${W}/subscribed_apps`,{headers:{Authorization:`Bearer ${T}`}});
console.log("GET  subscribed_apps:",list.s,JSON.stringify(list.b));
