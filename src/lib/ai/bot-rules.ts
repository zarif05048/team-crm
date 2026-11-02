// The owner's live bot rules and clinic facts (table bot_rules, migration
// 2026-11-01_bot_rules.sql). The owner keeps them through their personal
// agent; every bot appends the rows meant for it to the END of its cached
// instructions, where they win over the built-in knowledge.ts text.
//
// Same wording and ordering as the WhatsApp fleet's bridge.js formatBotRules,
// so a rule reads the same on every line. Cached per server instance for a
// minute: an edit reaches the web chat on the next reply after that, and the
// prompt cache stays warm because the text only changes when a rule does.
// A missing table or a failed read keeps the last good text (or none).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface BotRuleRow {
  id: number;
  kind: string;
  scope: string;
  title: string | null;
  body: string | null;
  priority: number | null;
}

const MAX_CHARS = 16000;
const REFRESH_MS = 60_000;
const cache = new Map<string, { at: number; text: string }>();

/** The rows as the section the model reads. Pure, for the tests. */
export function formatBotRules(rows: BotRuleRow[] | null | undefined): string {
  const line = (r: BotRuleRow) => {
    const body = String(r.body ?? "").trim().replace(/\r\n/g, "\n").replace(/\n/g, "\n  ");
    const title = String(r.title ?? "").trim();
    return `- ${title ? title + ": " : ""}${body}`;
  };
  const sorted = [...(rows ?? [])]
    .filter((r) => r && String(r.body ?? "").trim())
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100) || a.id - b.id);
  let budget = MAX_CHARS;
  const keep = (r: BotRuleRow) => {
    const l = line(r);
    if (l.length > budget) return null;
    budget -= l.length + 1;
    return l;
  };
  const rules = sorted.filter((r) => r.kind !== "knowledge").map(keep).filter(Boolean) as string[];
  const facts = sorted.filter((r) => r.kind === "knowledge").map(keep).filter(Boolean) as string[];
  if (!rules.length && !facts.length) return "";
  return [
    "## OWNER'S LIVE RULES & KNOWLEDGE",
    "The clinic owner keeps these up to date. They are the NEWEST instructions: where anything above disagrees, follow this section, and a clinic fact here replaces an older one above.",
    ...(rules.length ? ["RULES:", ...rules] : []),
    ...(facts.length ? ["CLINIC KNOWLEDGE:", ...facts] : []),
  ].join("\n");
}

// A live rule can SUSPEND house calls (owner via Hermes, 1 Nov 2026); the
// booking and handoff tools check it so a model that ignores the prompt still
// cannot book one. Lifts when the rule is turned off. Same test as the fleet's
// ai.js houseCallBlocked: one entry names house calls AND says suspended.
const HOUSE_CALL_RE = /house\s*-?\s*calls?|home\s*visits?|lawatan\s*(ke\s*)?rumah|rawatan\s*(di\s*)?rumah/i;
const SUSPENDED_RE = /suspend|digantung|gantung|dihentikan|ditangguhkan|not (currently )?(available|offered)|tidak (lagi )?(ditawarkan|disediakan)/i;
export function houseCallBlocked(rulesText: string, ...texts: (string | undefined)[]): boolean {
  const suspended = String(rulesText || "").split(/\n- /).slice(1).some((e) => HOUSE_CALL_RE.test(e) && SUSPENDED_RE.test(e));
  return suspended && texts.some((t) => HOUSE_CALL_RE.test(String(t ?? "")));
}
export const HOUSE_CALL_REFUSAL =
  "REFUSED — not recorded and staff were NOT told: house calls are currently suspended (the owner's live rule). Tell the patient politely, as that rule says, that house calls are temporarily suspended; do not collect details, offer a waitlist or promise a callback. In-clinic visits (24 jam) are fine.";

/** Which rows a thread reads: everybody's, its channel's, and its clinic's. */
export function botRuleScopes(webBranch: string | null): string[] {
  return webBranch ? ["all", "webchat", webBranch.toLowerCase()] : ["all", "whatsapp"];
}

export async function botRulesSection(supabase: SupabaseClient, webBranch: string | null): Promise<string> {
  const scopes = botRuleScopes(webBranch);
  const key = scopes.join("/");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < REFRESH_MS) return hit.text;
  const { data, error } = await supabase
    .from("bot_rules")
    .select("id, kind, scope, title, body, priority")
    .eq("active", true)
    .in("scope", scopes)
    .order("priority")
    .order("id");
  if (error) {
    console.warn(`[bot-rules] not read (${error.message}); keeping the last good rules`);
    return hit?.text ?? "";
  }
  const text = formatBotRules(data as BotRuleRow[]);
  cache.set(key, { at: Date.now(), text });
  return text;
}
