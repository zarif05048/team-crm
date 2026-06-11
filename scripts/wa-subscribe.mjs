// Subscribes this app to its WhatsApp Business Account(s) so inbound messages
// are delivered to our webhook. Run from crm/: node scripts/wa-subscribe.mjs
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const TOKEN = env.WHATSAPP_ACCESS_TOKEN;
const V = env.WHATSAPP_API_VERSION || "v21.0";
const G = `https://graph.facebook.com/${V}`;

async function j(url, opts) {
  const r = await fetch(url, opts);
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

// 1) Inspect the token to discover the WABA id(s) it can access.
const dbg = await j(
  `${G}/debug_token?input_token=${encodeURIComponent(TOKEN)}&access_token=${encodeURIComponent(TOKEN)}`,
);
console.log("debug_token status:", dbg.status);

const scopes = dbg.body?.data?.granular_scopes ?? [];
const wabaIds = new Set();
for (const s of scopes) {
  if (
    s.scope?.includes("whatsapp_business_messaging") ||
    s.scope?.includes("whatsapp_business_management")
  ) {
    (s.target_ids ?? []).forEach((id) => wabaIds.add(id));
  }
}
console.log("granular_scopes:", JSON.stringify(scopes));
console.log("WABA ids found:", [...wabaIds]);

if (wabaIds.size === 0) {
  console.log("No WABA id in token scopes — will need it from the API Setup page.");
}

// 2) Subscribe the app to each WABA, then confirm.
for (const waba of wabaIds) {
  const sub = await j(`${G}/${waba}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  console.log(`POST subscribed_apps (${waba}):`, sub.status, JSON.stringify(sub.body));

  const list = await j(`${G}/${waba}/subscribed_apps`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  console.log(`GET  subscribed_apps (${waba}):`, JSON.stringify(list.body));
}
