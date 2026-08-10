/** Shared helpers for searching people by name or phone number. */

/** Digits only — "011-2965 0884" → "01129650884". */
export const digitsOnly = (s: string) => s.replace(/\D/g, "");

/**
 * The ways a Malaysian number a staff member types could appear in `wa_id`,
 * which is always international without a plus ("60112965 0884" → 60112965…).
 * Typing "011...", "+6011..." or "11..." all have to find the same chat.
 */
export function phoneCandidates(query: string): string[] {
  const d = digitsOnly(query);
  if (d.length < 3) return [];
  const out = new Set<string>([d]);
  if (d.startsWith("0")) out.add(`60${d.slice(1)}`);
  if (d.startsWith("60")) out.add(`0${d.slice(2)}`);
  else out.add(`60${d}`);
  return [...out];
}

/** Strip the characters that would break a PostgREST `or(...)` filter string. */
export const forFilter = (s: string) => s.replace(/[,()*"\\]/g, " ").trim();
