// Exchanges a short-lived token for a long-lived (~60 day) token using the
// app secret, then reports the new token's actual expiry.
// Usage: node scripts/exchange-token.mjs <short-lived-token>
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

const APP_ID = "1013631327812903";
const APP_SECRET = env.META_APP_SECRET;
const V = env.WHATSAPP_API_VERSION || "v21.0";
const shortToken = process.argv[2];
if (!shortToken) throw new Error("pass the short-lived token as an argument");

const res = await fetch(
  `https://graph.facebook.com/${V}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${encodeURIComponent(shortToken)}`,
);
const data = await res.json();
if (!res.ok) {
  console.error("exchange failed:", JSON.stringify(data));
  process.exit(1);
}
const longToken = data.access_token;
console.log("LONG_TOKEN=" + longToken);

// Verify expiry of the new token
const dbg = await fetch(
  `https://graph.facebook.com/${V}/debug_token?input_token=${encodeURIComponent(longToken)}&access_token=${encodeURIComponent(longToken)}`,
);
const info = await dbg.json();
const exp = info?.data?.expires_at;
console.log(
  "expires_at:",
  exp === 0 ? "NEVER (0)" : exp ? new Date(exp * 1000).toISOString() : "unknown",
);
console.log("data_access_expires_at:", info?.data?.data_access_expires_at ? new Date(info.data.data_access_expires_at*1000).toISOString() : "n/a");
