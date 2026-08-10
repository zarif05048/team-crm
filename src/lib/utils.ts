import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names, resolving conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Every clock in this app is the clinic's clock.
 *
 * Timestamps used to be formatted in whatever zone the code happened to run in:
 * UTC on the server (Vercel), Asia/Kuala_Lumpur in a Malaysian browser. Because
 * the time elements carry suppressHydrationWarning, React KEEPS the server's
 * text at hydration — so staff read server-rendered times 8 hours behind, and a
 * later client re-render would silently jump them forward. Pinning the zone
 * here makes both sides produce the same Malaysian time, always.
 */
export const CLINIC_TZ = "Asia/Kuala_Lumpur";

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: CLINIC_TZ,
  hour: "2-digit",
  minute: "2-digit",
});
/** yyyy-mm-dd in Malaysia — used to compare calendar days, not to display. */
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLINIC_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const shortDateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: CLINIC_TZ,
  day: "2-digit",
  month: "short",
});
const fullFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: CLINIC_TZ,
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Short chat-list style stamp in Malaysian time: "10:22 AM" today,
 * "Yesterday", then "09 Aug".
 */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const key = dayKeyFmt.format(d);
  if (key === dayKeyFmt.format(now)) return timeFmt.format(d);
  if (key === dayKeyFmt.format(new Date(now.getTime() - 86_400_000))) {
    return "Yesterday";
  }
  return shortDateFmt.format(d);
}

/** Full Malaysian date + time, e.g. "Mon, 10 Aug 2026, 08:46 PM" — for tooltips. */
export function formatFullTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return fullFmt.format(d);
}

/**
 * Initials for an avatar bubble.
 *
 * Indexed by CODE POINT, not by `str[0]`. Plenty of WhatsApp contacts put an
 * emoji at the front of their name, and an emoji is two UTF-16 code units —
 * `str[0]` returns half of one. A lone surrogate cannot be encoded as UTF-8, so
 * the server wrote U+FFFD into the HTML while the browser kept the raw half,
 * and React reported a hydration mismatch on every page showing an avatar.
 */
export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const firstChar = (s: string | undefined) => (s ? Array.from(s)[0] ?? "" : "");
  const parts = name.trim().split(/\s+/);
  return firstChar(parts[0]) + firstChar(parts[1]);
}
