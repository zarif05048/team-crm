// Which AI the CRM bot talks to.
//
// Since 2026-10-27 (owner: "all bots move to the OpenRouter account") the bot
// answers through OpenRouter — the same account and model as the clinic's
// WhatsApp fleet (anthropic/claude-haiku-5.5, ai.js there). The Anthropic
// account it used before had run out of credit on 19 Oct, which silently
// stopped every CRM reply.
//
// bot.ts still speaks the Anthropic Messages shape (system blocks, tools with
// input_schema, tool_use / tool_result content). This file keeps it that way:
// with OPENROUTER_API_KEY set, createMessage() re-shapes the request into
// OpenRouter's OpenAI-style chat call and the answer back into Anthropic
// blocks. Without it, the call goes to Anthropic as before.

import Anthropic from "@anthropic-ai/sdk";

type CreateParams = Anthropic.MessageCreateParamsNonStreaming;
export interface ModelReply {
  stop_reason: Anthropic.Message["stop_reason"];
  content: Anthropic.ContentBlock[];
}

export const aiConfigured = () => !!(process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY);
const viaOpenRouter = () => !!process.env.OPENROUTER_API_KEY;

const OR_MODEL = () => process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-5.5";
const isHaiku55 = (m: string) => /(?:^|\/)claude-haiku-5[.-]5(?:$|[-:])/i.test(m);

/* OpenRouter wants each assistant turn's reasoning handed back with its tool
   calls. Anthropic blocks have no place for it, so it travels in a block of
   our own that only this file reads (bot.ts pushes response.content back as
   the assistant turn unchanged). */
const REASONING = "or_reasoning";
type ReasoningBlock = { type: typeof REASONING; details: unknown };

export async function createMessage(params: CreateParams): Promise<ModelReply> {
  if (!viaOpenRouter()) {
    const r = await new Anthropic().messages.create(params);
    return { stop_reason: r.stop_reason, content: r.content };
  }
  return openRouter(params);
}

type OrMessage = Record<string, unknown>;

function toOrMessages(params: CreateParams): OrMessage[] {
  const system = typeof params.system === "string"
    ? [{ type: "text", text: params.system }]
    : (params.system ?? []).map((b) => ({
        type: "text",
        text: b.text,
        ...(b.cache_control ? { cache_control: { type: "ephemeral", ...(isHaiku55(OR_MODEL()) ? { ttl: "1h" } : {}) } } : {}),
      }));
  const out: OrMessage[] = [{ role: "system", content: system }];

  for (const m of params.messages) {
    if (typeof m.content === "string") { out.push({ role: m.role, content: m.content }); continue; }
    const blocks = m.content as unknown as Array<Record<string, unknown>>;
    if (m.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text as string).join("\n");
      const calls = blocks.filter((b) => b.type === "tool_use").map((b) => ({
        id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
      }));
      const reasoning = blocks.find((b) => b.type === REASONING) as ReasoningBlock | undefined;
      out.push({
        role: "assistant", content: text,
        ...(calls.length ? { tool_calls: calls } : {}),
        ...(reasoning ? { reasoning_details: reasoning.details } : {}),
      });
      continue;
    }
    // user turn: tool results become role "tool"; anything else stays user content
    const rest: Array<Record<string, unknown>> = [];
    for (const b of blocks) {
      if (b.type === "tool_result") {
        const c = b.content;
        out.push({ role: "tool", tool_call_id: b.tool_use_id, content: typeof c === "string" ? c : JSON.stringify(c ?? "") });
      } else if (b.type === "text") rest.push({ type: "text", text: b.text });
      else if (b.type === "image") {
        const s = b.source as { media_type: string; data: string };
        rest.push({ type: "image_url", image_url: { url: `data:${s.media_type};base64,${s.data}` } });
      }
    }
    if (rest.length) out.push({ role: "user", content: rest });
  }
  return out;
}

async function openRouter(params: CreateParams): Promise<ModelReply> {
  const model = OR_MODEL();
  const effort = String(process.env.AI_REASONING || (isHaiku55(model) ? "medium" : "off")).toLowerCase();
  const tc = params.tool_choice as { type?: string } | undefined;
  const body = {
    model,
    messages: toOrMessages(params),
    ...(params.tools?.length ? {
      tools: (params.tools as Anthropic.Tool[]).map((t) => ({
        type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema },
      })),
      tool_choice: tc?.type === "none" ? "none" : "auto",
    } : {}),
    // thinking tokens count against max_tokens, so leave room for both
    max_tokens: effort === "off" ? params.max_tokens : Math.max(params.max_tokens, 4096),
    reasoning: effort === "off" ? { enabled: false } : { effort },
    usage: { include: true },
  };

  let j: Record<string, unknown> = {};
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://team-crm-one.vercel.app",
        "X-Title": "Klinik Hijraa CRM",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(50_000),
    });
    j = await r.json().catch(() => ({}));
    const err = j.error as { code?: number; message?: string } | undefined;
    if (r.ok && !err) break;
    const status = Number(err?.code) || r.status;
    if (![429, 502, 503, 504].includes(status) || attempt === 2) {
      throw new Error(`OpenRouter HTTP ${status} ${err?.message ?? ""}`.trim());
    }
    await new Promise((res) => setTimeout(res, (attempt + 1) * 2000));
  }

  const choice = (j.choices as Array<Record<string, unknown>> | undefined)?.[0];
  const msg = (choice?.message ?? {}) as {
    content?: string | Array<{ text?: string }>;
    tool_calls?: Array<{ id: string; function?: { name?: string; arguments?: string } }>;
    reasoning_details?: unknown;
  };
  const u = (j.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number } };
  console.log(`[bot] AI (${j.model ?? model}): ${u.prompt_tokens_details?.cached_tokens ? `cache HIT ${u.prompt_tokens_details.cached_tokens}` : "cache miss"} prompt ${u.prompt_tokens ?? 0} out ${u.completion_tokens ?? 0}${u.cost != null ? ` cost $${Number(u.cost).toFixed(5)}` : ""}`);

  const text = typeof msg.content === "string" ? msg.content : (msg.content ?? []).map((b) => b.text ?? "").join("\n");
  const content: Anthropic.ContentBlock[] = [];
  if (msg.reasoning_details) content.push({ type: REASONING, details: msg.reasoning_details } as unknown as Anthropic.ContentBlock);
  if (text.trim()) content.push({ type: "text", text, citations: null } as Anthropic.TextBlock);
  for (const c of msg.tool_calls ?? []) {
    let input: unknown = {};
    try { input = c.function?.arguments ? JSON.parse(c.function.arguments) : {}; } catch { input = {}; }
    content.push({ type: "tool_use", id: c.id, name: c.function?.name ?? "", input } as Anthropic.ToolUseBlock);
  }

  const finish = choice?.finish_reason as string | undefined;
  const stop_reason: Anthropic.Message["stop_reason"] =
    (msg.tool_calls?.length || finish === "tool_calls") ? "tool_use"
      : finish === "length" ? "max_tokens"
      : finish === "content_filter" ? "refusal"
      : "end_turn";
  return { stop_reason, content };
}
