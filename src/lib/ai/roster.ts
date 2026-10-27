// Same CMS doctor rota used by the WhatsApp fleet: up to two weeks ahead as far
// as HR has published (today, tomorrow, lusa and the rest by weekday) and who
// is on duty now.
// Only roster data is requested. No patient lookup or WhatsApp send occurs here.
interface Doctor { name: string; female?: boolean }
interface BranchRoster {
  name: string;
  shifts: { from: string; to: string; doctors: Doctor[] }[];
  extras: { name: string; doctors: Doctor[] }[];
  now?: Doctor[];
}
interface Roster { today?: string; now?: string; days: { label: string; dmy: string; unpublished?: boolean; branches: BranchRoster[] }[] }

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
      if (day.unpublished) lines.push("  (jadual belum diterbitkan oleh klinik — staf akan sahkan)");
      else if (!b.shifts.length && !b.extras.length) lines.push(day.label === "HARI INI" ? "  (tiada jadual direkodkan untuk hari ini)" : "  (tiada jadual direkodkan untuk hari itu)");
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
    // two weeks ahead as far as published (19 Oct 2026); a CMS without the
    // parameter answers two days
    const res = await fetch(`${process.env.CMS_URL.replace(/\/$/, "")}/api/bot/roster?days=14`, {
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
   none named, both. A rota the CMS could not supply is not guessed at here.
   A WEEK OF ROTA (19 Oct 2026), as in the fleet: each sentence is checked
   against the day(s) it names — "hari ini", "esok", "lusa", a weekday or a
   dd/mm date — and one naming none carries on from the sentence before (the
   first from the patient's question; "Dr Ashbir kerja bila?" allows the whole
   week). A night shift counts on the morning after it too. A doctor said NOT
   to be on duty ("Dr Ashbir tidak bertugas…", "bukan Dr Zarif") is a right
   answer, not a wrong name. */
/* WHEN THE GUARD SPEAKS (27 Oct 2026), as in the fleet's ai.js: it had
   started answering questions nobody asked ("dr rafiq bukan doc locum kan"
   got the rota; "nak consult Dr Ashbir sahaja", after asking for his week,
   got the rota in place of the right dates). The patient must be asking about
   duty, a name counts only in a sentence that claims duty, and a follow-up
   with no day of its own takes the days from the message before it. */
const DOCTOR_WORD = /\b(doc|doktor|doctor|dr|dokter)\b/i;
const DUTY_INTENT = /bertugas|on ?duty|jadual|syif|\bshift\b|\brota\b|\broster\b|\b(jaga|kerja|bekerja|ada|available|bila|bile|when|who|siapa|pukul|jam|waktu|masa|sekarang|skrg|now|today|tonight|tomorrow|esok|lusa|pagi|petang|ptg|malam|mlm|minggu|week)\b/i;
const asksAboutDuty = (t: string) => /bertugas|on ?duty|syif|\bshift\b|\brota\b|\broster\b/i.test(t) || (DOCTOR_WORD.test(t) && DUTY_INTENT.test(t));
const DUTY_CLAIM = /bertugas|on ?duty|syif|\bshift\b|\b(kerja|bekerja|jaga|available|ada di|pagi|petang|ptg|malam|mlm|tengah ?hari|morning|afternoon|evening|night|tonight|today|tomorrow|hari ini|esok|lusa|ahad|isnin|selasa|rabu|khamis|jumaat|sabtu|sunday|monday|tuesday|wednesday|thursday|friday|saturday|pukul)\b|\b\d{1,2}(:\d\d)?\s*(am|pm|pagi|petang|malam)\b|\b\d{1,2}\/\d{1,2}\b/i;
const CLINIC_DOCTORS = ["ashbir", "zarif", "rafiq", "fatihah", "umairah", "ziad", "nadiah", "sakinah", "fizah", "hafizah"];
const DAY_WORDS = [["ahad", "sunday"], ["isnin", "monday"], ["selasa", "tuesday"], ["rabu", "wednesday"], ["khamis", "thursday"], ["jumaat", "friday"], ["sabtu", "saturday"]];
const TOMORROW_WORD = /\b(esok|esk|besok|bsk|tomorrow)\b/i;
const LUSA_WORD = /\b(lusa|day after tomorrow)\b/i;
const WEEK_WORD = /\b(minggu (ni|ini|depan)|this week|next week|seminggu|7 hari)\b/i;
const TODAY_WORD = /\b(hari ini|harini|hari ni|today|tonight|sekarang|skrg|now)\b|\b(malam|mlm|petang|ptg|pagi|tengah ?hari)\s+(ni|ini)\b/i;
const ASKS_WHEN = /\b(bila|bile|when|hari apa|which day|what day|jadual|schedule|rota)\b/i;
const DATE_IN_TEXT = /\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g;
const OFF_DUTY_AFTER = /^[^.!?\n]{0,25}?\b(?:tidak|tak|x|bukan|not|isn't|is not|tiada|takde|tak ada|no longer)\b(?:\s+\S+){0,2}?\s*\b(?:bertugas|kerja|bekerja|on duty|working|dijadualkan|scheduled|dalam jadual|in the (?:schedule|roster|rota)|on the (?:schedule|roster|rota)|ada)\b|^[^.!?\n]{0,15}?\b(?:cuti|off|day off|on leave)\b/i;
const OFF_DUTY_BEFORE = /\b(?:bukan|not|selain|kecuali|except|tiada|takde|no)\s+(?:dr\.?\s+)?$/i;
const shortOf = (d: Doctor) => String(d?.name || "").replace(/^dr\.?\s+/i, "").trim().toLowerCase();
const weekdayOf = (day: Roster["days"][number] | undefined) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(day?.dmy || ""));
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])).getUTCDay() : -1;
};
/** The rota days a text names, as indexes into body.days; null when it names none. */
function daysNamed(body: Roster, text: string): number[] | null {
  const t = String(text || ""), days = body.days || [], hit = new Set<number>();
  let named = false, dated = false;
  for (const m of t.matchAll(DATE_IN_TEXT)) {
    named = dated = true;
    const key = `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/`;
    days.forEach((d, i) => { if (String(d.dmy || "").startsWith(key)) hit.add(i); });
  }
  if (TODAY_WORD.test(t)) { named = true; hit.add(0); }
  if (TOMORROW_WORD.test(t)) { named = true; hit.add(1); }
  if (LUSA_WORD.test(t)) { named = true; hit.add(2); }
  if (WEEK_WORD.test(t)) { named = true; days.forEach((_, i) => hit.add(i)); }
  // a date names its own day — the weekday beside it is only its label; with
  // two weeks of rota a bare weekday is either one, "Isnin depan" next week's
  if (!dated) {
    const nextSunday = 7 - Math.max(0, weekdayOf(days[0]));
    DAY_WORDS.forEach((words, dow) => {
      const w = words.join("|");
      const next = new RegExp(`\\b(?:${w})\\s+(?:depan|hadapan)\\b|\\bnext\\s+(?:${w})\\b`, "i").test(t);
      if (!next && !new RegExp(`\\b(?:${w})\\b`, "i").test(t)) return;
      named = true;
      days.forEach((d, i) => { if (weekdayOf(d) === dow && (!next || (i >= nextSunday && i < nextSunday + 7))) hit.add(i); });
    });
  }
  // a day past the rota is named but empty: nobody can be quoted for it
  return named ? [...hit].filter((i) => i < days.length).sort((a, b) => a - b) : null;
}
const EVENING_WORD = /\b(petang|ptg|malam|mlm|evening|night|tonight)\b/i;
/** Who may be named for those days at the clinics in scope. */
function allowedOn(body: Roster, idxs: number[], scope: string[], seg: string): Set<string> {
  const ok = new Set<string>();
  const inScope = (day: Roster["days"][number] | undefined) => (day?.branches || []).filter((b) => scope.includes(b.name));
  for (const i of idxs) {
    for (const b of inScope(body.days[i])) {
      for (const s of [...b.shifts, ...b.extras]) for (const d of s.doctors) ok.add(shortOf(d));
      if (i === 0) for (const d of b.now || []) ok.add(shortOf(d));
    }
    // the night before runs into this morning — not into this evening
    if (EVENING_WORD.test(seg)) continue;
    for (const b of inScope(body.days[i - 1])) for (const s of b.shifts) if (String(s.to) <= String(s.from)) for (const d of s.doctors) ok.add(shortOf(d));
  }
  return ok;
}
const saidOffDuty = (seg: string, at: number, len: number) =>
  OFF_DUTY_AFTER.test(seg.slice(at + len)) || OFF_DUTY_BEFORE.test(seg.slice(Math.max(0, at - 20), at));
/** The days a question is about: the ones it names, else the whole rota for a WHEN question, else today.
 *  A follow-up naming no day takes them from the patient's message before it. */
function askedDays(body: Roster, asked: string, earlier: string[] = []): number[] {
  for (const t of [asked, ...earlier.slice().reverse()]) {
    const named = daysNamed(body, t);
    if (named) return named;
    if (ASKS_WHEN.test(t)) return (body.days || []).map((_, i) => i);
  }
  return [0];
}

/** Is the patient (in their last three messages) asking who is on duty? */
export const aboutDuty = (patientTexts: string[]) => patientTexts.slice(-3).some(asksAboutDuty);

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
/** The doctor names in a reply that are not on the rota for the day(s) each sentence is about. */
export function offRota(body: Roster, scope: string[], patientTexts: string[], reply: string): string[] {
  const everyone = new Set(CLINIC_DOCTORS);
  for (const d of body.days) for (const b of d.branches || []) for (const s of [...b.shifts, ...b.extras]) for (const doc of s.doctors) everyone.add(shortOf(doc));
  const msgs = patientTexts.slice(-3);
  let current = askedDays(body, msgs[msgs.length - 1] || "", msgs.slice(0, -1));
  const segs = String(reply || "").split(/\n+|(?<=[.!?])\s+/);
  // "Dr Ashbir bertugas di Paka pada:" and then the dates — an opening line
  // before the first day the reply names is about the days the reply goes on to list
  const replyDays = [...new Set(segs.flatMap((s) => daysNamed(body, s) || []))];
  let dayYet = false;
  const wrong = new Set<string>();
  for (const seg of segs) {
    const named = daysNamed(body, seg);
    if (named) { current = named; dayYet = true; }
    const days = named || (!dayYet && replyDays.length ? [...new Set([...current, ...replyDays])] : current);
    if (!DUTY_CLAIM.test(seg)) continue;   // names a doctor without saying when they work
    const ok = allowedOn(body, days, scope, seg);
    for (const n of everyone) {
      if (!n || ok.has(n)) continue;
      const m = new RegExp(`\\b${n}\\b`, "i").exec(seg);
      if (m && !saidOffDuty(seg, m.index, n.length)) wrong.add(n);
    }
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
  const asked = patientTexts[patientTexts.length - 1] || "";
  // only the day(s) asked about — a fortnight is a lot to send for "malam ni?";
  // a "bila?" gets the first week
  const keep = new Set(daysNamed(body, asked) || (ASKS_WHEN.test(asked) ? body.days.map((_, i) => i).slice(0, 7) : [0, 1]));
  const table = rosterText(scopedRoster({ ...body, days: body.days.filter((_, i) => keep.has(i)) }, scope))
    ?? rosterText(scopedRoster(body, scope));
  if (!table) return null;
  const en = langOf(asked) === "en";
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
