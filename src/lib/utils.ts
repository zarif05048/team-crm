import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names, resolving conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a timestamp as a short relative-ish time for chat lists.
 * Uses a fixed "en-US" locale so server and client produce identical output
 * (e.g. always "10:22 AM"); pair with suppressHydrationWarning on the element
 * to cover server-vs-client timezone differences in production.
 */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short" });
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
