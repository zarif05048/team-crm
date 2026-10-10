// Same CMS doctor rota used by the WhatsApp fleet: today, tomorrow and now.
// Only roster data is requested. No patient lookup or WhatsApp send occurs here.
interface Doctor { name: string; female?: boolean }
interface BranchRoster {
  name: string;
  shifts: { from: string; to: string; doctors: Doctor[] }[];
  extras: { name: string; doctors: Doctor[] }[];
  now?: Doctor[];
}
interface Roster { days: { label: string; dmy: string; branches: BranchRoster[] }[] }

const TTL_MS = 5 * 60_000;
let cached: { text: string | null; at: number } | null = null;

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
    const text = rosterText(await res.json());
    if (!text) throw new Error("No valid roster returned");
    cached = { text, at: Date.now() };
    return text;
  } catch (err) {
    console.warn("[bot] doctor roster unavailable:", err instanceof Error ? err.message : "request failed");
    // A failed refresh never answers with an old duty schedule. Retry in a minute.
    cached = { text: null, at: Date.now() - TTL_MS + 60_000 };
    return null;
  }
}
