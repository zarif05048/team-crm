// "TCA MINOR SURGICAL" — the clinic's Google Sheet of booked minor-surgery /
// procedure appointments (TCA = to come again).
//
// The clinic keeps ONE TAB PER MONTH, named like "tca minor surgical ogos 2026"
// (Malay month + year), and files each patient under the month of their
// appointment date. This module reproduces that by hand: work out the month
// from the appointment date (Malaysian time), find that month's tab, create it
// with the standard header if the clinic hasn't made it yet, and append the row.
//
// Columns (must stay in this order — it is the clinic's own sheet layout):
//   NAME | PROCEDURE | TEMPAT | TARIKH TCA | MASA | DR BERTUGAS |
//   CONFIRMATION TCA DONE BY STAFF | STATUS | FOLLOW UP POST OP DONE
// The CRM fills the first five; the last four are the staff's to tick off.

import { appendRow, createTab, listTabs, sheetsEnabled } from "./google";

export const TCA_HEADER = [
  "NAME",
  "PROCEDURE",
  "TEMPAT",
  "TARIKH TCA",
  "MASA",
  "DR BERTUGAS",
  "CONFIRMATION TCA DONE BY STAFF",
  "STATUS",
  "FOLLOW UP POST OP DONE",
];

/** Tab titles use Malay month names, like the clinic's existing tabs. */
const MALAY_MONTHS = [
  "januari",
  "februari",
  "mac",
  "april",
  "mei",
  "jun",
  "julai",
  "ogos",
  "september",
  "oktober",
  "november",
  "disember",
];

/** Staff sometimes name a tab in English — both spellings are matched. */
const ENGLISH_MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export interface TcaEntry {
  /** Patient's full name as the clinic would write it in the list. */
  patientName: string;
  /** Procedure in the clinic's wording, e.g. "CHALAZION REMOVAL". */
  procedure: string;
  /** "Dungun" or "Paka" (free text is accepted and written as given). */
  branch: string;
  /** Appointment date — dd/mm/yyyy when known, otherwise the patient's words. */
  dateText: string;
  /** Appointment time in the patient's words, e.g. "10 pagi", "PT REQ 14:00". */
  timeText?: string;
  /** Doctor, when staff already know who is doing it. */
  doctor?: string;
  /** Patient's WhatsApp number (wa_id) — written next to the procedure. */
  phone?: string;
  /** Anything else worth carrying over, kept short. */
  notes?: string;
}

export type TcaResult =
  | { ok: true; tab: string; url: string }
  /** Integration not configured — the caller should carry on regardless. */
  | { ok: false; disabled: true }
  | { ok: false; disabled?: false; error: string };

function spreadsheetId(): string | null {
  return process.env.TCA_SHEET_ID?.trim() || null;
}

/** Today in Malaysia — Vercel runs in UTC, which is 8 hours behind. */
export function malaysiaToday(): { day: number; month: number; year: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .format(new Date())
    .split("/");
  return {
    day: Number(parts[0]),
    month: Number(parts[1]),
    year: Number(parts[2]),
  };
}

/**
 * Read an appointment date the way the clinic writes it: dd/mm/yyyy (also
 * d/m/yy, with - or . separators, and ISO yyyy-mm-dd). Day-first always —
 * "05/08/2026" is 5 August, never 8 May. Returns null for anything else
 * ("pt nak confirm balik nanti"), which is fine: that text goes in as-is.
 */
export function parseTcaDate(
  text: string,
): { day: number; month: number; year: number } | null {
  const t = text.trim();
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return { year: +iso[1], month: +iso[2], day: +iso[3] };
  }
  const dmy = t.match(/(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2,4})/);
  if (!dmy) return null;
  const day = +dmy[1];
  const month = +dmy[2];
  let year = +dmy[3];
  if (year < 100) year += 2000;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return { day, month, year };
}

/** Tab name this month's rows belong in, in the clinic's own style. */
export function monthTabTitle(month: number, year: number): string {
  return `tca minor surgical ${MALAY_MONTHS[month - 1]} ${year}`;
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Find the clinic's tab for a month. Matches on the month name (Malay or
 * English) plus the year, so "TCA MINOR SURGICAL OGOS 2026", "Ogos 2026" and
 * "august 2026" all resolve. A month-only tab ("ogos") is accepted as a
 * fallback, but a tab for a different year never is.
 */
export function findMonthTab(
  titles: string[],
  month: number,
  year: number,
): string | null {
  const names = [MALAY_MONTHS[month - 1], ENGLISH_MONTHS[month - 1]];
  const withYear = titles.find((t) => {
    const n = normalise(t);
    return names.some((m) => n.includes(m)) && n.includes(String(year));
  });
  if (withYear) return withYear;
  return (
    titles.find((t) => {
      const n = normalise(t);
      return names.some((m) => n.includes(m)) && !/\b(19|20)\d{2}\b/.test(n);
    }) ?? null
  );
}

const localPhone = (waId: string) =>
  waId.startsWith("60") ? `0${waId.slice(2)}` : waId;

/**
 * Add one patient to the TCA minor surgical list.
 *
 * Fails soft in every direction: no credentials → `disabled` (callers still
 * write their internal note), API error → `error` so the caller can tell staff
 * to add the row by hand. It never throws into a WhatsApp reply path.
 */
export async function addToTcaList(entry: TcaEntry): Promise<TcaResult> {
  const id = spreadsheetId();
  if (!sheetsEnabled() || !id) return { ok: false, disabled: true };

  const parsed = parseTcaDate(entry.dateText);
  const today = malaysiaToday();
  const month = parsed?.month ?? today.month;
  const year = parsed?.year ?? today.year;

  const tabs = await listTabs(id);
  if (!tabs.ok) return { ok: false, error: tabs.error };

  let tab = findMonthTab(tabs.titles, month, year);
  if (!tab) {
    // New month, and nobody has made the tab yet — make it and write the header.
    tab = monthTabTitle(month, year);
    const created = await createTab(id, tab);
    if (!created.ok) return { ok: false, error: created.error ?? "Could not create the month tab." };
    const header = await appendRow(id, tab, TCA_HEADER);
    if (!header.ok) return { ok: false, error: header.error ?? "Could not write the header row." };
  }

  const procedureCell = [
    entry.procedure.trim(),
    entry.notes?.trim() ? `(${entry.notes.trim()})` : "",
    entry.phone ? `(${localPhone(entry.phone)})` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const dateCell = parsed
    ? `${String(parsed.day).padStart(2, "0")}/${String(parsed.month).padStart(2, "0")}/${parsed.year}`
    : entry.dateText.trim();

  const appended = await appendRow(id, tab, [
    entry.patientName.trim(),
    procedureCell,
    entry.branch.trim().toUpperCase(),
    dateCell,
    entry.timeText?.trim() ?? "",
    entry.doctor?.trim() ?? "",
    "",
    "",
    "",
  ]);
  if (!appended.ok) return { ok: false, error: appended.error ?? "Append failed." };

  return { ok: true, tab, url: `https://docs.google.com/spreadsheets/d/${id}/edit` };
}
