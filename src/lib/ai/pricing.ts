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

/* WHAT THE BOT MAY SAY ABOUT MONEY (owner, 7 Sep 2026; this line caught up
   19 Oct 2026). A procedure, a test or a scan is quoted as a rounded BAND
   around the catalogue figure, never the figure itself; a medicine is never
   priced at all; only what the clinic advertises (consultation fee, packages)
   stays exact. The fleet's cms.js priceBand / buildPricingSection, word for
   word, so both lines quote the same thing the same way. */
function timeMy(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return hhmm || "";
  const h = Number(m[1]), mm = m[2], h12 = h % 12 || 12;
  const part = h < 12 ? "pagi" : h < 15 ? "tengah hari" : h < 19 ? "petang" : "malam";
  return `${h12}:${mm} ${part} (${h12}${mm === "00" ? "" : ":" + mm}${h < 12 ? "AM" : "PM"})`;
}
export function priceBand(price: number | null): string | null {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return null;
  const step = n < 50 ? 5 : n < 200 ? 10 : n < 1000 ? 50 : 100;
  // 1e-9: 100 * 1.1 is 110.00000000000001 in binary floating point
  const low = Math.max(step, Math.floor((n * 0.9) / step + 1e-9) * step);
  let high = Math.ceil((n * 1.1) / step - 1e-9) * step;
  if (high <= low) high = low + step;
  return `${rm(low)}–${rm(high)}`;
}

export function buildPricingSection(p: PricingList): string {
  if (!p?.services?.length) return "";
  const lines: string[] = [];
  lines.push("## SENARAI PERKHIDMATAN KLINIK + ANGGARAN HARGA (dari sistem klinik, kadar cash/self-pay, versi " + (p.version || "?") + ")");
  lines.push("Peraturan untuk senarai ini:");
  lines.push("- Setiap item di sini diberi JULAT ANGGARAN, bukan harga tepat. Bila pesakit BERTANYA harga, sebut julat itu (contoh: \"anggaran RM60–RM80\") dan JANGAN sebut satu angka tepat.");
  lines.push("- Sentiasa tambah bahawa harga sebenar disahkan di klinik — ia bergantung pada penilaian doktor (saiz/kerumitan kes).");
  lines.push("- Sebut ia kadar cash/self-pay; pesakit panel/insurans ikut kadar panel masing-masing.");
  lines.push("- Item bertanda \"(ikut kes)\" tiada harga tetap — doktor tentukan selepas pemeriksaan; jangan teka angka.");
  lines.push("- Harga di sini MENGATASI senarai anggaran lama di atas bila kedua-duanya ada. Jika sesuatu tiada di sini, guna anggaran lama (sebagai anggaran) atau serahkan kepada staf.");
  lines.push("- Yuran konsultasi doktor dan pakej rasmi (checkup, program berat badan, khatan, house call) KEKAL harga tepat seperti bahagian lain — itu harga yang klinik sendiri iklankan.");
  lines.push("- UBAT: JANGAN SEBUT HARGA UBAT LANGSUNG — bukan angka, bukan julat, bukan \"lebih kurang\". Senarai ubat TIDAK ada di sini. Bila pesakit tanya tentang ubat tertentu (ada tak / berapa harga), guna alat lookup_medication dahulu; jangan kata klinik tiada ubat itu tanpa mencari.");
  if (p.consult?.ranges?.length) {
    lines.push("");
    lines.push("### Yuran konsultasi doktor (self-pay) — INI YANG BETUL, mengatasi angka yuran di bahagian lain");
    const weekdays = p.consult.weekend_ph != null ? " (Ahad–Khamis)" : "";
    for (const r of p.consult.ranges) if (r && r.fee != null) lines.push(`- ${timeMy(r.from)} hingga ${timeMy(r.to)}${weekdays}: ${rm(r.fee)}`);
    // the CMS's weekend rate is charged all day on every Friday and Saturday, and on public holidays
    if (p.consult.weekend_ph != null) lines.push(`- Jumaat, Sabtu dan cuti umum, sepanjang hari: ${rm(p.consult.weekend_ph)}`);
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
      const band = s.open || s.price == null ? null : priceBand(s.price);
      lines.push(`- ${s.name}: ${band ? "anggaran " + band : "(ikut kes)"}${extra}`);
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
  // Name, generic, group — deliberately NO price (owner, 7 Sep 2026): a figure
  // left in the tool's answer is a figure in front of the model.
  return hits.slice(0, limit).map(({ m }) =>
    [m.name, m.generic ? `(${m.generic})` : "", m.group ? `[${m.group}]` : "", m.chronic ? "· ubat kronik" : ""]
      .filter(Boolean)
      .join(" "));
}

/** What the lookup_medication tool hands back to the model. */
export async function lookupMedication(query: string): Promise<string> {
  const p = await getPricing();
  if (!p) return "The clinic's medication list is not available right now — tell the patient staff will check and reply here.";
  const hits = searchMedications(p, query, 8);
  if (!hits.length) return `No item matching "${query}" in the clinic's medication list. If it is a test, scan or procedure named in your clinic facts or the live service list (e.g. HPV DNA, pap smear, ECG, X-ray), the clinic DOES do it — answer from those facts. For a medicine, retry once with the generic or English name; if still nothing, do not say the clinic has none — say staff will check and reply here.`;
  return (
    "Matching items — the clinic carries these (this is the catalogue: NO stock level and NO panel coverage — for those, say staff will confirm).\n" +
    "NO PRICES: never quote or estimate what a medicine costs. If the patient asked about cost, say staff will confirm the price here, and they may walk in any time.\n" +
    hits.map((h) => `- ${h}`).join("\n")
  );
}
