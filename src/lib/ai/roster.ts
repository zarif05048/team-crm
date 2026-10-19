// Same CMS doctor rota used by the WhatsApp fleet: today, tomorrow and now.
// Only roster data is requested. No patient lookup or WhatsApp send occurs here.
interface Doctor { name: string; female?: boolean }
interface BranchRoster {
  name: string;
  shifts: { from: string; to: string; doctors: Doctor[] }[];
  extras: { name: string; doctors: Doctor[] }[];
  now?: Doctor[];
}
interface Roster { today?: string; now?: string; days: { label: string; dmy: string; branches: BranchRoster[] }[] }

const TTL_MS = 5 * 60_000;
let cached: { text: string | null; body: Roster | null; at: number } | null = null;

export function timeMy(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return hhmm || "";
  const h = Number(m[1]), mm = m[2], h12 = h % 12 || 12;
  const part = h < 12 ? "pagi" : h < 15 ? "tengah hari" : h < 19 ? "petang" : "malam";
  return `${h12}:${mm} ${part} (${h12}${mm === "00" ? "" : ":" + mm}${h < 12 ? "AM" : "PM"})`;
}
const docLine = (d: Doctor) => d.name + (d.female ? " (doktor perempuan)" : "");

export function rosterText(p: Roster | null): string | null {
  if (!p || !Array.isArray(p.days) || !p.days.length) return null;
  const parts: string[] = [];
  for (const day of p.days) {
    const lines = [`${day.label} (${day.dmy}):`];
    for (const b of day.branches || []) {
      lines.push(`${b.name}:`);
      if (!b.shifts.length && !b.extras.length) lines.push("  (tiada jadual direkodkan untuk hari ini)");
      for (const s of b.shifts) {
        const label = `${timeMy(s.from).replace(/ \(.*\)$/, "")} hingga ${timeMy(s.to).replace(/ \(.*\)$/, "")} (${timeMy(s.from).replace(/^.*\(|\)$/g, "")}-${timeMy(s.to).replace(/^.*\(|\)$/g, "")})`;
        lines.push(`  ${label}: ${s.doctors.length ? s.doctors.map(docLine).join(", ") : "(tiada doktor dijadualkan)"}`);
      }
      for (const e of b.extras) lines.push(`  ${e.name}: ${e.doctors.map(docLine).join(", ")}`);
      if (day.label === "HARI INI" && (b.shifts.length || b.extras.length || b.now?.length)) {
        lines.push(b.now?.length ? `  >> BERTUGAS SEKARANG: ${b.now.map(docLine).join(", ")}` : "  >> BERTUGAS SEKARANG: (tiada dalam jadual pada waktu ini)");
      }
    }
    if (day.branches?.length) parts.push(lines.join("\n"));
  }
  return parts.length ? parts.join("\n\n") : null;
}

export async function fetchRosterText(): Promise<string | null> {
  if (!process.env.CMS_URL || !process.env.CMS_REMINDER_TOKEN) {
    console.warn("[bot] doctor roster: CMS connection not configured");
    return null;
  }
  if (cached && Date.now() - cached.at < TTL_MS) return cached.text;
  try {
    const res = await fetch(`${process.env.CMS_URL.replace(/\/$/, "")}/api/bot/roster`, {
      headers: { "x-reminder-token": process.env.CMS_REMINDER_TOKEN },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as Roster;
    const text = rosterText(body);
    if (!text) throw new Error("No valid roster returned");
    cached = { text, body, at: Date.now() };
    return text;
  } catch (err) {
    console.warn("[bot] doctor roster unavailable:", err instanceof Error ? err.message : "request failed");
    // A failed refresh never answers with an old duty schedule. Retry in a minute.
    cached = { text: null, body: null, at: Date.now() - TTL_MS + 60_000 };
    return null;
  }
}

/* ── THE DUTY GUARD (owner, 19 Oct 2026) ─────────────────────────────────────
   The same check as the WhatsApp fleet's (ai.js dutyGuard), kept in step by
   test-duty-guard.js there. Sun 18 Oct, 6:52 pm, a fleet bot was asked
   "Mlm ni siapa Dr bertugas ya" at Dungun. The rota it held was right — Dr
   Nadiah / Dr Umairah / Dr Umairah — but it answered "malam Dr Ziad" (Paka's
   MONDAY morning) and then "Dr Zarif" (Dungun's MONDAY evening): it mixed the
   rows of a two-clinic, two-day table. This line serves both clinics and has
   the same table, so a duty reply is checked against the rota as data,
   sentence by sentence: a doctor named where the reply is talking about today
   must be on the rota today (or on duty now, last night's shift included);
   once a sentence or heading turns to tomorrow ("esok", "Isnin" when today is
   Sunday), tomorrow's doctors are allowed too. Any other name and the reply is
   replaced with the rota itself. Only the clinic(s) the patient named count;
   none named, both. A rota the CMS could not supply is not guessed at here. */
const DUTY_TALK = /\b(doc|doktor|doctor|dr|dokter)\b|bertugas|on ?duty|jadual|syif|\bshift\b|siapa.*(jaga|kerja)/i;
const CLINIC_DOCTORS = ["ashbir", "zarif", "rafiq", "fatihah", "umairah", "ziad", "nadiah", "sakinah", "fizah", "hafizah"];
const DAY_WORDS = [["ahad", "sunday"], ["isnin", "monday"], ["selasa", "tuesday"], ["rabu", "wednesday"], ["khamis", "thursday"], ["jumaat", "friday"], ["sabtu", "saturday"]];
const TOMORROW_WORD = /\b(esok|esk|besok|bsk|tomorrow|lusa)\b/i;
const TODAY_WORD = /\b(hari ini|harini|hari ni|today|tonight|sekarang|skrg|now)\b|\b(malam|mlm|petang|ptg|pagi|tengah ?hari)\s+(ni|ini)\b/i;
const shortOf = (d: Doctor) => String(d?.name || "").replace(/^dr\.?\s+/i, "").trim().toLowerCase();

/** Is the chat (the patient's last three messages) about who is on duty? */
export const aboutDuty = (patientTexts: string[]) => patientTexts.slice(-3).some((t) => DUTY_TALK.test(t));

/** The clinic(s) the patient named lately; none named, every clinic. */
export function rosterScope(body: Roster, patientTexts: string[]): string[] {
  const all = (body.days[0]?.branches || []).map((b) => b.name);
  const recent = patientTexts.slice(-3).join("\n");
  const named = all.filter((n) => new RegExp(`\\b${n}\\b`, "i").test(recent));
  return named.length ? named : all;
}
export function scopedRoster(body: Roster, scope: string[]): Roster {
  return { ...body, days: body.days.map((d) => ({ ...d, branches: (d.branches || []).filter((b) => scope.includes(b.name)) })) };
}
function rostered(day: Roster["days"][number] | undefined, scope: string[], withNow: boolean): Set<string> {
  const ok = new Set<string>();
  for (const b of (day?.branches || []).filter((x) => scope.includes(x.name))) {
    for (const s of [...b.shifts, ...b.extras]) for (const d of s.doctors) ok.add(shortOf(d));
    if (withNow) for (const d of b.now || []) ok.add(shortOf(d));
  }
  return ok;
}
/** "Isnin" names a later day unless today IS Isnin. */
function laterDayRe(todayIso?: string): RegExp {
  const dow = /^\d{4}-\d{2}-\d{2}$/.test(String(todayIso || "")) ? new Date(`${todayIso}T12:00:00Z`).getUTCDay() : -1;
  const words = DAY_WORDS.filter((_, i) => i !== dow).flat();
  return new RegExp(`${TOMORROW_WORD.source}|\\b(${words.join("|")})\\b`, "i");
}
/** The doctor names in a reply that are not on the rota for the day each sentence is about. */
export function offRota(body: Roster, scope: string[], patientTexts: string[], reply: string): string[] {
  const [today, tomorrow] = body.days;
  const todayOk = rostered(today, scope, true);
  const laterOk = new Set([...todayOk, ...rostered(tomorrow, scope, false)]);
  const everyone = new Set(CLINIC_DOCTORS);
  for (const d of body.days) for (const b of d.branches || []) for (const s of [...b.shifts, ...b.extras]) for (const doc of s.doctors) everyone.add(shortOf(doc));
  const LATER = laterDayRe(body.today);
  const asked = patientTexts[patientTexts.length - 1] || "";
  let later = LATER.test(asked) && !TODAY_WORD.test(asked);
  const wrong = new Set<string>();
  for (const seg of String(reply || "").split(/\n+|(?<=[.!?])\s+/)) {
    if (LATER.test(seg)) later = true;
    else if (TODAY_WORD.test(seg)) later = false;
    const ok = later ? laterOk : todayOk;
    for (const n of everyone) if (n && !ok.has(n) && new RegExp(`\\b${n}\\b`, "i").test(seg)) wrong.add(n);
  }
  return [...wrong];
}
const EN_WORDS = new Set("the a an is are was were be been am i i'm im you your my me we our it this that these those to of for from with and or but if can could would should will do does did have has had please pls thanks thank sorry need want help what when where which who how why whether there here any some much many not no yes about after before".split(" "));
const MY_WORDS = new Set("saya sy aku nak nk hendak boleh blh bleh tak tk x ke kah ada apa berapa brp bila mana dengan dgn untuk utk yang yg ini ni itu tu awak encik cik puan tuan terima kasih tq harga buat datang pukul esok hari malam pagi petang sakit ubat macam mcm la lah je jer sahaja saja tolong minta mintak kalau kalu dah sudah belum lagi pun dan atau tapi tetapi kena perlu nanti sekarang skrg berapa camne macamana bole".split(" "));
/** The fleet's language judgement: a clear majority of common words, or null. */
export function langOf(text: string): "en" | "ms" | null {
  const words = String(text || "").toLowerCase().match(/[a-z']+/g) || [];
  let en = 0, my = 0;
  for (const w of words) { if (EN_WORDS.has(w)) en++; if (MY_WORDS.has(w)) my++; }
  if (en >= 3 && en >= my * 2) return "en";
  if (my >= 2 && my >= en * 2) return "ms";
  return null;
}
/** Pure: null when the reply may stand, otherwise the reply to send instead
 *  (the rota, printed by code) and the names that were wrong. */
export function dutyReplacement(body: Roster | null, patientTexts: string[], reply: string): { text: string; wrong: string[] } | null {
  if (!aboutDuty(patientTexts) || !body || !Array.isArray(body.days) || !body.days.length) return null;
  const scope = rosterScope(body, patientTexts);
  const wrong = offRota(body, scope, patientTexts, reply);
  if (!wrong.length) return null;
  const table = rosterText(scopedRoster(body, scope));
  if (!table) return null;
  const en = langOf(patientTexts[patientTexts.length - 1] || "") === "en";
  return { wrong, text: (en ? "Here is the doctor duty schedule from the clinic system:\n\n" : "Ini jadual doktor bertugas dari sistem klinik:\n\n") + table };
}
/** The reply to send: unchanged unless it names a doctor off the rota. */
export async function guardDutyReply(patientTexts: string[], reply: string): Promise<string> {
  if (!aboutDuty(patientTexts)) return reply;
  await fetchRosterText();
  const r = dutyReplacement(cached?.body ?? null, patientTexts, reply);
  if (!r) return reply;
  console.warn(`[bot] duty guard replaced a reply naming ${r.wrong.join(", ")} (not on the rota for that day)`);
  return r.text;
}
/** What check_doctor_roster hands the model: only the clinic(s) the patient
 *  named, so it has fewer rows to mix up. Nothing named, the whole rota. */
export async function scopedRosterText(patientTexts: string[]): Promise<string | null> {
  const full = await fetchRosterText();
  const body = cached?.body;
  if (!full || !body) return full;
  return rosterText(scopedRoster(body, rosterScope(body, patientTexts))) ?? full;
}
