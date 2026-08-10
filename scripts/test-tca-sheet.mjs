// Checks the TCA MINOR SURGICAL Google Sheet connection end to end.
//
//   node scripts/test-tca-sheet.mjs            → sign in, list the tabs
//   node scripts/test-tca-sheet.mjs --append   → also append one TEST row
//
// Reads GOOGLE_SERVICE_ACCOUNT_JSON + TCA_SHEET_ID from .env.local. Same auth
// flow as src/lib/sheets/google.ts, kept standalone so it can be run before the
// app is deployed (and against production values by pasting them in .env.local).
import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const sheetId = env.TCA_SHEET_ID;
if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON missing from .env.local");
if (!sheetId) throw new Error("TCA_SHEET_ID missing from .env.local");

const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
const privateKey = sa.private_key.replace(/\\n/g, "\n");
const b64 = (v) => Buffer.from(v).toString("base64url");

const now = Math.floor(Date.now() / 1000);
const unsigned =
  b64(JSON.stringify({ alg: "RS256", typ: "JWT" })) +
  "." +
  b64(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
const assertion = `${unsigned}.${b64(createSign("RSA-SHA256").update(unsigned).sign(privateKey))}`;

const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  }),
});
const tokenJson = await tokenRes.json();
if (!tokenJson.access_token) {
  console.error("Sign-in failed:", tokenJson);
  process.exit(1);
}
console.log("✅ signed in as", sa.client_email);

const api = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
const auth = { Authorization: `Bearer ${tokenJson.access_token}` };

const metaRes = await fetch(`${api}?fields=properties(title),sheets(properties(title))`, {
  headers: auth,
});
const meta = await metaRes.json();
if (!metaRes.ok) {
  console.error("Cannot read the spreadsheet:", meta.error?.message ?? metaRes.status);
  console.error("Share the sheet with", sa.client_email, "as an Editor.");
  process.exit(1);
}
console.log("✅ spreadsheet:", meta.properties?.title);
console.log("   tabs:", meta.sheets.map((s) => s.properties.title).join(" | "));

if (!process.argv.includes("--append")) {
  console.log("\n(run again with --append to write one TEST row)");
  process.exit(0);
}

const MALAY = ["januari","februari","mac","april","mei","jun","julai","ogos","september","oktober","november","disember"];
const [d, m, y] = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})
  .format(new Date())
  .split("/");
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ");
const tab =
  meta.sheets
    .map((s) => s.properties.title)
    .find((t) => norm(t).includes(MALAY[Number(m) - 1]) && norm(t).includes(y)) ?? null;
if (!tab) {
  console.error(`No tab for ${MALAY[Number(m) - 1]} ${y} — the app would create one named "tca minor surgical ${MALAY[Number(m) - 1]} ${y}".`);
  process.exit(1);
}

const appendRes = await fetch(
  `${api}/values/${encodeURIComponent(`${tab}!A:Z`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
  {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      values: [[
        "TEST — CRM CONNECTION (delete me)",
        "TEST ROW (0123456789)",
        "DUNGUN",
        `${d}/${m}/${y}`,
        "-",
        "",
        "",
        "",
        "",
      ]],
    }),
  },
);
const appended = await appendRes.json();
if (!appendRes.ok) {
  console.error("Append failed:", appended.error?.message ?? appendRes.status);
  process.exit(1);
}
console.log(`✅ test row appended to "${tab}" (${appended.updates?.updatedRange}) — delete it in the sheet.`);
