// The clinic's live price list, for the bot.
//
// Stock → Pricing in the clinic CMS is the one place the clinic keeps what a
// procedure, a test or a medicine costs. The CMS serves it to its bots at
// GET /api/bot/pricing (self-pay prices only, never a cost) on the same token
// the WhatsApp fleet uses. This module pulls it, keeps it for an hour, and
// turns it into (a) a block of the system prompt — the ~250 services — and
// (b) a lookup for the ~350 medications, which the model reaches through the
// lookup_medication tool. The wording matches the fleet's cms.js so the
// official line and the unofficial lines quote the same thing the same way.
//
// Off entirely when CMS_URL / CMS_REMINDER_TOKEN are not set: the prompt then
// carries only the hand-written estimates in knowledge.ts, exactly as before.

export interface PricedService {
  name: string;
  category: string;
  price: number | null;
  open: boolean;
  description?: string;
  lab_code?: string;
}
export interface PricedMedication {
  name: string;
  category: string;
  price: number | null;
  open: boolean;
  generic?: string;
  group?: string;
  unit?: string;
  chronic?: boolean;
}
export interface PricingList {
  services: PricedService[];
  medications: PricedMedication[];
  consult: { ranges: { from: string; to: string; fee: number | null }[]; weekend_ph: number | null } | null;
  version: string;
  generated_at: string;
}

const REFRESH_MS = 60 * 60_000;
let cached: { at: number; list: PricingList | null; section: string } = { at: 0, list: null, section: "" };

const configured = () => !!(process.env.CMS_URL && process.env.CMS_REMINDER_TOKEN);

/** The current list, refreshed at most hourly. Null when unconfigured or when
 *  the CMS could not be reached and nothing is cached yet. */
export async function getPricing(): Promise<PricingList | null> {
  if (!configured()) return null;
  if (cached.list && Date.now() - cached.at < REFRESH_MS) return cached.list;
  try {
    const base = (process.env.CMS_URL ?? "").replace(/\/$/, "");
    const v = cached.list?.version ? `?v=${encodeURIComponent(cached.list.version)}` : "";
    const res = await fetch(`${base}/api/bot/pricing${v}`, {
      headers: { "x-reminder-token": process.env.CMS_REMINDER_TOKEN ?? "" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as PricingList & { unchanged?: boolean };
    if (body.unchanged && cached.list) {
      cached.at = Date.now();
      return cached.list;
    }
    if (!Array.isArray(body.services) || !Array.isArray(body.medications)) throw new Error("bad shape");
    cached = { at: Date.now(), list: body, section: buildPricingSection(body) };
    console.log(`[bot] price list v${body.version}: ${body.services.length} services, ${body.medications.length} medications`);
    return body;
  } catch (err) {
    console.warn("[bot] price list unavailable:", err instanceof Error ? err.message : err);
    // Stale is better than none; note the time so we do not hammer a down CMS.
    cached.at = Date.now() - REFRESH_MS + 5 * 60_000;
    return cached.list;
  }
}

/** The prompt block for the current list ("" when there is none). */
export async function pricingSection(): Promise<string> {
  await getPricing();
  return cached.section;
}

const CAT_LABEL: Record<string, string> = {
  INVESTIGATION: "Ujian makmal & saringan (investigations)",
  IMAGING: "Imbasan & X-ray (imaging)",
  PROCEDURE: "Prosedur & rawatan kecil (procedures)",
  SERVICE: "Perkhidmatan lain (services)",
};
const rm = (n: number) => (Number.isInteger(n) ? `RM${n}` : `RM${n.toFixed(2)}`);

export function buildPricingSection(p: PricingList): string {
  if (!p?.services?.length) return "";
  const lines: string[] = [];
  lines.push(`## SENARAI HARGA RASMI KLINIK (dari sistem klinik, harga CASH/SELF-PAY, versi ${p.version || "?"})`);
  lines.push("Peraturan untuk senarai ini:");
  lines.push("- Ini harga RASMI semasa, jadi bila pesakit BERTANYA harga, sebut harga yang tersenarai — bukan anggaran.");
  lines.push("- Sebut ia harga cash/self-pay; pesakit panel/insurans ikut kadar panel masing-masing.");
  lines.push("- Untuk prosedur/rawatan, tambah bahawa harga akhir bergantung pada penilaian doktor (saiz/kerumitan kes).");
  lines.push('- Item bertanda "(ikut kes)" tiada harga tetap — doktor tentukan selepas pemeriksaan; jangan teka angka.');
  lines.push("- Harga di sini MENGATASI senarai anggaran lama di atas bila kedua-duanya ada. Jika sesuatu tiada di sini, guna anggaran lama (sebagai anggaran) atau serahkan kepada staf.");
  lines.push("- Yuran konsultasi doktor dan pakej rasmi (checkup, program berat badan, khatan, house call) kekal seperti bahagian lain.");
  lines.push("- UBAT: senarai ubat TIDAK ada di sini. Bila pesakit tanya tentang ubat tertentu (ada tak / berapa harga), guna alat lookup_medication dahulu; jangan kata klinik tiada ubat itu tanpa mencari.");
  if (p.consult?.ranges?.length) {
    lines.push("");
    lines.push("### Yuran konsultasi doktor (self-pay)");
    for (const r of p.consult.ranges) if (r && r.fee != null) lines.push(`- ${r.from}–${r.to}: ${rm(r.fee)}`);
    if (p.consult.weekend_ph != null) lines.push(`- Cuti umum: ${rm(p.consult.weekend_ph)}`);
  }
  const byCat: Record<string, PricedService[]> = {};
  for (const s of p.services) (byCat[s.category] ??= []).push(s);
  for (const cat of ["INVESTIGATION", "IMAGING", "PROCEDURE", "SERVICE"]) {
    const rows = byCat[cat];
    if (!rows?.length) continue;
    lines.push("");
    lines.push(`### ${CAT_LABEL[cat] ?? cat}`);
    for (const s of rows) {
      const extra = s.description && s.description !== s.name ? ` — ${s.description}` : "";
      lines.push(`- ${s.name}: ${s.open || s.price == null ? "(ikut kes)" : rm(s.price)}${extra}`);
    }
  }
  return lines.join("\n");
}

const normWords = (s: string) =>
  s.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);

/** Medications whose name/generic/group contain EVERY word of the query,
 *  else ANY word. Display lines, best first. */
export function searchMedications(p: PricingList | null, query: string, limit = 8): string[] {
  const meds = p?.medications ?? [];
  const words = normWords(query ?? "").filter((w) => w.length >= 2);
  if (!words.length || !meds.length) return [];
  const hay = (m: PricedMedication) => normWords([m.name, m.generic, m.group].filter(Boolean).join(" ")).join(" ");
  const scored = meds.map((m) => {
    const h = ` ${hay(m)} `;
    let all = 0, any = 0;
    for (const w of words) {
      const hit = h.includes(` ${w} `) ? 2 : h.includes(w) ? 1 : 0;
      if (hit) any++;
      all += hit;
    }
    return { m, any, all };
  });
  let hits = scored.filter((x) => x.any === words.length);
  if (!hits.length) hits = scored.filter((x) => x.any > 0);
  hits.sort((a, b) => b.all - a.all || a.m.name.localeCompare(b.m.name));
  return hits.slice(0, limit).map(({ m }) => {
    const price = m.open || m.price == null ? "harga ikut kes" : rm(m.price) + (m.unit ? ` / ${m.unit.toLowerCase()}` : "");
    return [m.name, m.generic ? `(${m.generic})` : "", m.group ? `[${m.group}]` : "", `— ${price}`, m.chronic ? "· ubat kronik" : ""]
      .filter(Boolean)
      .join(" ");
  });
}

/** What the lookup_medication tool hands back to the model. */
export async function lookupMedication(query: string): Promise<string> {
  const p = await getPricing();
  if (!p) return "The clinic's price list is not available right now — tell the patient staff will check and reply here.";
  const hits = searchMedications(p, query, 8);
  if (!hits.length) return `No item matching "${query}" in the clinic's medication price list. Do not say the clinic has none — say staff will check and reply here.`;
  return (
    "Matching items (cash/self-pay price per unit; panel patients follow their panel; this is the price list, NOT today's stock):\n" +
    hits.map((h) => `- ${h}`).join("\n")
  );
}
