// Points the WABA's webhook to the permanent Vercel URL via the Graph API
// (override_callback_uri), so we no longer depend on the local tunnel.
// Usage: node scripts/set-webhook-override.mjs
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
const WABA = "100179786166143";
const CALLBACK = "https://team-crm-one.vercel.app/api/webhooks/whatsapp";
const VERIFY = env.WHATSAPP_VERIFY_TOKEN;

const res = await fetch(
  `https://graph.facebook.com/${V}/${WABA}/subscribed_apps`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      override_callback_uri: CALLBACK,
      verify_token: VERIFY,
    }),
  },
);
const body = await res.json().catch(() => ({}));
console.log("set override:", res.status, JSON.stringify(body));

const list = await fetch(
  `https://graph.facebook.com/${V}/${WABA}/subscribed_apps`,
  { headers: { Authorization: `Bearer ${TOKEN}` } },
);
console.log("subscribed_apps:", JSON.stringify(await list.json()));
