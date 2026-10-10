import type { LeadStage } from "@/lib/types";

const DAY_MS = 86_400_000;
const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** A calendar date in Malaysia, independent of the server/browser timezone. */
export function malaysiaDate(iso: string | number): string {
  return new Date(new Date(iso).getTime() + MYT_OFFSET_MS)
    .toISOString().slice(0, 10);
}

export function validCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function daysAfter(date: string, today: string): number {
  return (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY_MS;
}

export interface FollowUpTiming {
  stage: LeadStage;
  bookingDate: string | null;
  followUpAt: string | null;
  qualifiedSince: string | null;
  lastInboundAt: string | null;
}

/** Booking ages from its chosen date; Follow Up only warns while unanswered. */
export function pipelineWarning(p: FollowUpTiming, today: string): string | null {
  if (p.stage === "booking") {
    return p.bookingDate && daysAfter(p.bookingDate, today) >= 7
      ? "Still in Booking · 7+ days after the set date"
      : null;
  }
  if (p.stage !== "qualified") return null;
  // An explicitly recorded follow-up may be backdated for existing cards.
  const anchor = p.followUpAt ?? p.qualifiedSince;
  if (!anchor || daysAfter(malaysiaDate(anchor), today) < 7) return null;
  if (p.lastInboundAt && Date.parse(p.lastInboundAt) > Date.parse(anchor)) return null;
  return "No patient reply · 7+ days since follow-up";
}

/** One Follow Up thread, as the Not Respond sweep sees it. */
export interface FollowUpThread {
  id: string;
  contactId: string;
  stageEnteredAt: string | null;
  /** contacts.pipeline_follow_up_at — shared by all the patient's threads */
  followUpAt: string | null;
  /** The patient's latest reply on ANY line, not just this thread. */
  lastInboundAt: string | null;
}

/**
 * Follow Up threads that go to Not Respond on their own (owner, 2026-10-10):
 * exactly the cards the board would paint yellow — 7+ Malaysia days since the
 * follow-up and no reply from the patient on any line since. Decided per
 * PATIENT, like the card: all their Follow Up threads move together.
 * The same rule as `pipelineWarning`, so the two can never disagree.
 */
export function unansweredFollowUps(threads: FollowUpThread[], today: string): string[] {
  const byContact = new Map<string, FollowUpThread[]>();
  for (const t of threads) {
    const list = byContact.get(t.contactId);
    if (list) list.push(t);
    else byContact.set(t.contactId, [t]);
  }
  const time = (s: string | null) => (s ? Date.parse(s) : NaN);
  const out: string[] = [];
  for (const list of byContact.values()) {
    const entered = list.map((t) => t.stageEnteredAt).filter((s): s is string => !!s)
      .sort((a, b) => time(a) - time(b))[0] ?? null;
    const replied = list.map((t) => t.lastInboundAt).filter((s): s is string => !!s)
      .sort((a, b) => time(b) - time(a))[0] ?? null;
    const stale = pipelineWarning({
      stage: "qualified",
      bookingDate: null,
      followUpAt: list.find((t) => t.followUpAt)?.followUpAt ?? null,
      qualifiedSince: entered,
      lastInboundAt: replied,
    }, today);
    if (stale) out.push(...list.map((t) => t.id));
  }
  return out;
}
