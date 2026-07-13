// Check the status of every WhatsApp line the CRM knows about.
//
// Reads the lines from the `whatsapp_numbers` table (what the app routes on),
// then asks Meta's Graph API for the live status of each one:
//   - name_status              (is the display name approved?)
//   - code_verification_status (is the number verified?)
//   - quality_rating           (GREEN / YELLOW / RED — WhatsApp's health signal)
//   - messaging_limit_tier     (how many new conversations/day are allowed)
//   - platform_type / throughput
//
// Run from crm/ with real secrets in .env.local:
//   node scripts/check-lines.mjs
//
// Needs (all already in .env.local for production):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (to list the lines)
//   WHATSAPP_ACCESS_TOKEN, WHATSAPP_API_VERSION          (to ask Meta status)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TOKEN = env.WHATSAPP_ACCESS_TOKEN;
const V = env.WHATSAPP_API_VERSION || "v21.0";
const G = `https://graph.facebook.com/${V}`;

function die(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

if (!SUPA_URL || !SUPA_KEY) die("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
if (!TOKEN) die("Missing WHATSAPP_ACCESS_TOKEN — cannot query Meta for live line status.");

const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

// 1) Every line the CRM knows about.
const { data: lines, error } = await supa
  .from("whatsapp_numbers")
  .select("phone_number_id, waba_id, display_name, phone_display, is_active")
  .order("display_name");

if (error) die(`Could not read whatsapp_numbers: ${error.message}`);
if (!lines?.length) {
  console.log("No lines found in whatsapp_numbers. (No numbers connected yet.)");
  process.exit(0);
}

console.log(`\nFound ${lines.length} line(s) in the CRM. Checking live status with Meta…\n`);

async function graph(url) {
  try {
    const r = await fetch(url);
    const b = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, body: b };
  } catch (e) {
    return { ok: false, status: 0, body: { error: { message: String(e) } } };
  }
}

const FIELDS =
  "id,display_phone_number,verified_name,name_status,code_verification_status,quality_rating,platform_type,throughput,messaging_limit_tier";

let anyProblem = false;

for (const line of lines) {
  const label = `${line.display_name}${line.phone_display ? ` (${line.phone_display})` : ""}`;
  const res = await graph(
    `${G}/${line.phone_number_id}?fields=${FIELDS}&access_token=${encodeURIComponent(TOKEN)}`,
  );

  if (!res.ok) {
    anyProblem = true;
    const m = res.body?.error?.message ?? `HTTP ${res.status}`;
    console.log(`● ${label}`);
    console.log(`    DB: active=${line.is_active}  phone_number_id=${line.phone_number_id}`);
    console.log(`    ✖ Meta lookup failed: ${m}\n`);
    continue;
  }

  const b = res.body;
  const quality = b.quality_rating ?? "UNKNOWN";
  const nameOk = b.name_status === "APPROVED";
  const verifiedOk = b.code_verification_status === "VERIFIED";
  const flag = quality === "RED" || quality === "YELLOW" || !nameOk || !verifiedOk || !line.is_active;
  if (flag) anyProblem = true;

  console.log(`${flag ? "⚠" : "✔"} ${label}`);
  console.log(`    number:        ${b.display_phone_number ?? "?"}  (verified name: ${b.verified_name ?? "?"})`);
  console.log(`    active in CRM: ${line.is_active}`);
  console.log(`    name status:   ${b.name_status ?? "?"}`);
  console.log(`    verified:      ${b.code_verification_status ?? "?"}`);
  console.log(`    quality:       ${quality}`);
  console.log(`    limit tier:    ${b.messaging_limit_tier ?? "?"}`);
  console.log(`    platform:      ${b.platform_type ?? "?"}${b.throughput?.level ? `  throughput=${b.throughput.level}` : ""}\n`);
}

console.log(anyProblem
  ? "Done — one or more lines need attention (see ⚠ / ✖ above)."
  : "Done — all lines look healthy. ✅");
