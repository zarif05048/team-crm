import { createClient } from "@/lib/supabase/server";
import { lineLabel } from "@/components/ui/line-badge";

/**
 * Weight-loss enquiry counts, derived from the messages themselves.
 *
 * Nothing here reads a stored total: every number is recomputed from the
 * inbound messages each time the page loads, so it always reflects what is
 * actually in the inbox — including anything that arrived while a bot was down
 * and got mirrored in late.
 *
 * A "patient" is a distinct CONTACT, not a message. Somebody who asks about
 * Mounjaro five times in an afternoon is one person interested, and counting
 * their messages would make a chatty patient look like a busy week.
 */

/* The same test the WhatsApp bots use for their 9pm report (bridge.js
   WEIGHT_LOSS_RE) — kept identical on purpose so this page and that message
   can never disagree. `njaro` catches mounjaro/monjaro/munjaro misspellings;
   the \b on slim stops it matching "muslim". */
const WEIGHT_LOSS_RE =
  /njaro|wegov|ozempi|semaglutide|tirzepatide|kurus|turun\s*berat|berat\s*badan|penurunan\s*berat|weight\s*loss|weightloss|langsing|\bslim|\bdiet/i;

/* A coarse pre-filter pushed down to Postgres. The regex above is the real
   test, but running it in JS over every inbound message would mean pulling the
   whole table across the wire — and inbox egress is already the tightest
   budget in this project. These ILIKEs are deliberately WIDER than the regex
   (no word boundaries), so they can over-fetch but never miss; the regex then
   makes the final call in JS. */
const ILIKE_TERMS = [
  "njaro", "wegov", "ozempi", "semaglutide", "tirzepatide", "kurus",
  "turun berat", "berat badan", "penurunan berat", "weight loss", "weightloss",
  "langsing", "slim", "diet",
];

const MYT_OFFSET_MS = 8 * 60 * 60 * 1000; // clinic time, so "today" means their today

const pad = (n: number) => String(n).padStart(2, "0");

/** Calendar keys for a timestamp, in clinic time. */
function mytKeys(iso: string) {
  const d = new Date(Date.parse(iso) + MYT_OFFSET_MS);
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  // Week keyed by its Monday, so a week is a row staff can recognise.
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(d.getTime() - dow * 86_400_000);
  const week = `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
  const month = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  return { day, week, month };
}

export type Bucket = {
  key: string;
  label: string;
  total: number;
  byLine: Record<string, number>;
};

export type WeightLossStats = {
  lines: string[];
  today: Bucket;
  thisWeek: Bucket;
  thisMonth: Bucket;
  daily: Bucket[];
  weekly: Bucket[];
  monthly: Bucket[];
  scanned: number;
  since: string;
};

const emptyBucket = (key: string, label: string): Bucket => ({ key, label, total: 0, byLine: {} });

/** Months back to load. Messages older than a year are pruned by the cleanup cron. */
const MONTHS_BACK = 6;

export async function getWeightLossStats(): Promise<WeightLossStats> {
  const supabase = await createClient();
  const since = new Date(Date.now() - MONTHS_BACK * 31 * 86_400_000).toISOString();

  const orFilter = ILIKE_TERMS.map((t) => `body.ilike.%${t}%`).join(",");
  const { data, error } = await supabase
    .from("messages")
    .select("created_at, body, conversation:conversations!inner(contact_id, whatsapp_number_id)")
    .eq("direction", "inbound")
    .gte("created_at", since)
    .or(orFilter)
    .order("created_at", { ascending: true })
    .limit(20000);

  if (error) {
    console.error("[analytics] weight-loss stats:", error.message);
  }

  const numbers = await supabase.from("whatsapp_numbers").select("id, display_name");
  const nameOf = new Map((numbers.data ?? []).map((n) => [n.id, lineLabel(n.display_name)]));

  type Row = {
    created_at: string;
    body: string | null;
    conversation: { contact_id: string; whatsapp_number_id: string } | null;
  };
  // A patient counts once per bucket per line, so hold contact ids in a set and
  // take the sizes at the end rather than incrementing as we go.
  const seen = new Map<string, Map<string, Set<string>>>(); // bucketKey -> line -> contact ids
  const linesPresent = new Set<string>();
  let scanned = 0;

  for (const row of (data ?? []) as unknown as Row[]) {
    if (!row.conversation) continue;
    if (!WEIGHT_LOSS_RE.test(row.body ?? "")) continue; // the ILIKE net is wider than the rule
    scanned++;
    const line = nameOf.get(row.conversation.whatsapp_number_id) ?? "Unknown line";
    linesPresent.add(line);
    const { day, week, month } = mytKeys(row.created_at);
    for (const key of [`d:${day}`, `w:${week}`, `m:${month}`]) {
      let byLine = seen.get(key);
      if (!byLine) { byLine = new Map(); seen.set(key, byLine); }
      let ids = byLine.get(line);
      if (!ids) { ids = new Set(); byLine.set(line, ids); }
      ids.add(row.conversation.contact_id);
    }
  }

  const lines = [...linesPresent].sort();

  /* Distinct people, per line and overall. The overall figure is NOT the sum of
     the lines: one patient who asks the Marketing line and then the Paka line
     is one person, and adding the columns would double-count them. */
  const bucketFor = (key: string, label: string): Bucket => {
    const byLineIds = seen.get(key);
    const bucket = emptyBucket(key, label);
    if (!byLineIds) return bucket;
    const everyone = new Set<string>();
    for (const [line, ids] of byLineIds) {
      bucket.byLine[line] = ids.size;
      for (const id of ids) everyone.add(id);
    }
    bucket.total = everyone.size;
    return bucket;
  };

  const now = new Date(Date.now() + MYT_OFFSET_MS);
  const todayKeys = mytKeys(new Date().toISOString());

  // Recent periods, newest first, including empty ones so a quiet day still shows.
  const daily: Bucket[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getTime() - i * 86_400_000);
    const key = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const label = i === 0 ? "Today" : i === 1 ? "Yesterday"
      : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
    daily.push(bucketFor(`d:${key}`, label));
  }

  const weekly: Bucket[] = [];
  const thisMonday = new Date(now.getTime() - ((now.getUTCDay() + 6) % 7) * 86_400_000);
  for (let i = 0; i < 8; i++) {
    const m = new Date(thisMonday.getTime() - i * 7 * 86_400_000);
    const key = `${m.getUTCFullYear()}-${pad(m.getUTCMonth() + 1)}-${pad(m.getUTCDate())}`;
    const label = i === 0 ? "This week" : i === 1 ? "Last week"
      : `Week of ${m.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })}`;
    weekly.push(bucketFor(`w:${key}`, label));
  }

  const monthly: Bucket[] = [];
  for (let i = 0; i < MONTHS_BACK; i++) {
    const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${m.getUTCFullYear()}-${pad(m.getUTCMonth() + 1)}`;
    const label = m.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    monthly.push(bucketFor(`m:${key}`, i === 0 ? `${label} (so far)` : label));
  }

  return {
    lines,
    today: bucketFor(`d:${todayKeys.day}`, "Today"),
    thisWeek: bucketFor(`w:${todayKeys.week}`, "This week"),
    thisMonth: bucketFor(`m:${todayKeys.month}`, "This month"),
    daily,
    weekly,
    monthly,
    scanned,
    since,
  };
}
