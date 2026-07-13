// AI auto-reply bot: answers patient FAQs on WhatsApp via the Claude API.
//
// Flow: webhook ingests an inbound message → route schedules runBotReply()
// after the 200 response (next/server `after`) → we wait a moment so rapid
// multi-messages batch into one reply → call Claude with the clinic knowledge
// pack + conversation history → execute any tool calls (booking capture,
// staff handoff) → send the reply through the existing WhatsApp send path and
// record it like any other outbound message (sent_by_bot = true).
//
// The bot never replies when: ANTHROPIC_API_KEY is unset, the conversation's
// bot_enabled is false (staff took over), or a newer message superseded the
// trigger (that message's own run replies instead).

import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendText, sendImage } from "@/lib/whatsapp/send";
import { BOT_SYSTEM_PROMPT } from "./knowledge";

type Admin = ReturnType<typeof createAdminClient>;

/** Who/where the bot is talking to — needed by tools that send media. */
interface SendContext {
  waId: string;
  phoneNumberId: string;
}

/** Poster/leaflet images the bot can send (served from /public/leaflets). */
const LEAFLETS: Record<string, { file: string; caption: string }> = {
  mounjaro_packages: {
    file: "mounjaro-packages.jpeg",
    caption: "Pakej Rawatan Turun Berat Badan — Mounjaro (Klinik Hijraa Dungun & Paka)",
  },
  wegovy_packages: {
    file: "wegovy-packages.jpeg",
    caption: "Pakej Rawatan Turun Berat Badan — Wegovy (Klinik Hijraa Dungun & Paka)",
  },
  mounjaro_info: {
    file: "mounjaro-info.jpeg",
    caption: "Risalah Maklumat Pesakit — Mounjaro (tirzepatide)",
  },
  wegovy_info: {
    file: "wegovy-info.jpeg",
    caption: "Risalah Maklumat Pesakit — Wegovy (semaglutide)",
  },
  flexible_payment: {
    file: "flexible-payment.jpeg",
    caption: "Bayaran fleksibel/ansuran — Atome, Shopee PayLater, Maybank Ezy",
  },
  sunat_promo: {
    file: "sunat-promo.png",
    caption: "Jom Sunat — RM250 (clamp/laser), Klinik Hijraa Dungun & Paka",
  },
  health_screening: {
    file: "health-screening.png",
    caption: "Pakej Regular Health Screening — Basic RM100 · Essential RM150 · Premium RM200",
  },
  cancer_screening: {
    file: "cancer-screening.png",
    caption: "Pakej Cancer Screening — Lelaki RM300 · Wanita RM310",
  },
  std_screening: {
    file: "std-screening.png",
    caption: "Pakej STD Screening — RM300",
  },
  allergy_packages: {
    file: "allergy-packages.png",
    caption: "Pakej Allergy Test — RM400 (36) · RM450 (54) · RM500 (107)",
  },
};

const LEAFLET_BASE =
  process.env.PUBLIC_BASE_URL ?? "https://team-crm-one.vercel.app";

export interface BotTrigger {
  conversationId: string;
  waMessageId: string;
}

/** Rapid consecutive messages within this window get one combined reply. */
const BATCH_DELAY_MS = 2500;
const HISTORY_LIMIT = 30;
const MAX_TOOL_ROUNDS = 4;
/** How long a bot-off thread must stay quiet before the bot auto-resumes. */
const REENABLE_AFTER_MS =
  (Number(process.env.BOT_REENABLE_HOURS) || 1) * 3_600_000;

/** Tag names on a conversation from the embedded conversation_tags(tag:tags(name)).
 *  The nested `tag` join can come back as an object or a single-element array. */
function tagNamesOf(conv: {
  conversation_tags?:
    | { tag: { name: string | null } | { name: string | null }[] | null }[]
    | null;
}): string[] {
  const out: string[] = [];
  for (const row of conv.conversation_tags ?? []) {
    const t = row.tag;
    if (!t) continue;
    for (const it of Array.isArray(t) ? t : [t]) {
      if (it?.name) out.push(it.name.toLowerCase());
    }
  }
  return out;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "book_appointment",
    description:
      "Record a booking request for the clinic staff to confirm. Call this once you have the patient's name, the service, the branch (Dungun or Paka), and their preferred date/time. Do not call it with missing fields — ask the patient first.",
    input_schema: {
      type: "object",
      properties: {
        patient_name: { type: "string", description: "Patient's name" },
        service: {
          type: "string",
          description:
            "Service requested, e.g. house call, khatan, health screening, ultrasound, vaksin",
        },
        branch: {
          type: "string",
          enum: ["Dungun", "Paka"],
          description: "Which branch the patient wants",
        },
        preferred_time: {
          type: "string",
          description: "Preferred date and time in the patient's own words",
        },
        extra_notes: {
          type: "string",
          description: "Any other details the patient gave (optional)",
        },
      },
      required: ["patient_name", "service", "branch", "preferred_time"],
    },
  },
  {
    name: "send_leaflet",
    description:
      "Send one of the clinic's poster/leaflet images to the patient on WhatsApp. Use when the topic matches a leaflet (prices/packages/medicine info) — send the image, then give a short text summary. At most 2 leaflets per reply; never resend one already sent in this conversation.",
    input_schema: {
      type: "object",
      properties: {
        leaflet: {
          type: "string",
          enum: Object.keys(LEAFLETS),
          description:
            "Which leaflet to send: mounjaro_packages / wegovy_packages (prices), mounjaro_info / wegovy_info (patient leaflet: how it works, side effects), flexible_payment (installments), sunat_promo (khatan), health_screening / cancer_screening / std_screening / allergy_packages (checkup packages)",
        },
      },
      required: ["leaflet"],
    },
  },
  {
    name: "alert_staff",
    description:
      "Hand the conversation to human staff. Call this when the patient asks for a human, has a medical question or complaint you must not answer, mentions emergency symptoms, or asks something outside your clinic facts (prices, unlisted panels, medicine stock). After this call, staff take over and you send one final message.",
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Short summary of why staff are needed",
        },
        urgency: {
          type: "string",
          enum: ["normal", "urgent"],
          description: "urgent = emergency symptoms or very distressed patient",
        },
      },
      required: ["reason", "urgency"],
    },
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Entry point — called from the webhook route via next/server `after()`. */
export async function runBotReply(trigger: BotTrigger): Promise<void> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log("[bot] ANTHROPIC_API_KEY not set — bot disabled");
      return;
    }

    await sleep(BATCH_DELAY_MS);

    const supabase = createAdminClient();

    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select(
        `id, bot_enabled,
         contact:contacts(wa_id, name, profile_name),
         whatsapp_number:whatsapp_numbers(phone_number_id),
         conversation_tags(tag:tags(name))`,
      )
      .eq("id", trigger.conversationId)
      .maybeSingle();
    if (convErr || !conv) {
      console.error("[bot] load conversation failed:", convErr?.message);
      return;
    }

    // Internal staff chat ("staff" tag = the contact IS a clinic staff member):
    // the bot never replies here, even if the AI toggle is accidentally on.
    const convTags = tagNamesOf(conv);
    if (convTags.includes("staff") || convTags.includes("with staff")) return;

    const { data: history, error: histErr } = await supabase
      .from("messages")
      .select("wa_message_id, direction, type, body, created_at")
      .eq("conversation_id", trigger.conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    if (histErr || !history?.length) {
      console.error("[bot] load history failed:", histErr?.message);
      return;
    }

    // Only the run triggered by the newest message replies; older runs yield.
    // Also covers staff/bot having already replied (newest would be outbound).
    if (history[0].wa_message_id !== trigger.waMessageId) return;

    // Bot is off (handed to staff / manual pause / spam). Decide whether to
    // auto-resume: stay off if this is an internal staff chat ("staff" tag —
    // the contact is a clinic staff member, never a bot conversation) or spam;
    // otherwise resume once the thread has been quiet for a while, so a
    // patient messaging again after staff went silent isn't left unanswered.
    if (conv.bot_enabled === false) {
      if (convTags.includes("spam")) return; // staff tags already returned above
      const prev = history[1]; // history[0] is this newest inbound (the trigger)
      const gapMs = prev
        ? Date.parse(history[0].created_at) - Date.parse(prev.created_at)
        : Infinity;
      if (gapMs < REENABLE_AFTER_MS) return; // staff were recently active — stay off
      await supabase
        .from("conversations")
        .update({ bot_enabled: true })
        .eq("id", trigger.conversationId);
      await supabase.from("notes").insert({
        conversation_id: trigger.conversationId,
        author_id: null,
        mentions: [],
        body: "🔄 AI auto-resumed — this chat went quiet and isn't tagged 'staff'. Tag the conversation as Staff (toolbar) if the bot should stay off here.",
      });
      console.log(
        `[bot] auto-resumed ${trigger.conversationId} (quiet ${Math.round(gapMs / 3_600_000)}h)`,
      );
    }

    // Auto-stop on spam: a flood of messages or keyboard-mash gibberish from
    // outside. Flips the bot off for this thread so it stops replying (and
    // burning API calls); staff re-enable from the toolbar if it was a real
    // patient. Runs before the Claude call so junk never triggers a reply.
    const spam = detectSpam(history);
    if (spam) {
      await flagSpam(supabase, trigger.conversationId, spam);
      return;
    }

    const messages = toClaudeMessages(history.slice().reverse());
    if (messages.length === 0) return;

    const contact = conv.contact as unknown as {
      wa_id: string;
      name: string | null;
      profile_name: string | null;
    };
    const number = conv.whatsapp_number as unknown as {
      phone_number_id: string;
    };

    const sendCtx: SendContext = {
      waId: contact.wa_id,
      phoneNumberId: number.phone_number_id,
    };
    const replyText = await converse(
      supabase,
      trigger.conversationId,
      sendCtx,
      messages,
    );
    if (!replyText) return;
    console.log(
      `[bot] reply for ${trigger.conversationId}: ${replyText.slice(0, 800)}`,
    );

    const result = await sendText(number.phone_number_id, contact.wa_id, replyText);
    if (!result.ok) {
      console.error("[bot] WhatsApp send failed:", result.error);
      return;
    }

    const now = new Date().toISOString();
    await supabase.from("messages").insert({
      conversation_id: trigger.conversationId,
      wa_message_id: result.waMessageId ?? null,
      direction: "outbound",
      type: "text",
      body: replyText,
      status: "sent",
      sent_by: null,
      sent_by_bot: true,
      created_at: now,
    });
    await supabase
      .from("conversations")
      .update({ last_message_at: now })
      .eq("id", trigger.conversationId);
  } catch (err) {
    console.error("[bot] unexpected error:", err);
  }
}

/** Map stored messages to Claude turns (inbound=user, outbound=assistant). */
function toClaudeMessages(
  rows: { direction: string; type: string; body: string | null }[],
): Anthropic.MessageParam[] {
  const turns: Anthropic.MessageParam[] = [];
  for (const m of rows) {
    const text =
      m.body?.slice(0, 1500) || (m.type !== "text" ? `[${m.type}]` : "");
    if (!text) continue;
    turns.push({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: text,
    });
  }
  // The API requires the first turn to be from the user.
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
}

/** Run the Claude conversation, executing tool calls, until a final text. */
async function converse(
  supabase: Admin,
  conversationId: string,
  sendCtx: SendContext,
  messages: Anthropic.MessageParam[],
): Promise<string | null> {
  const anthropic = new Anthropic();

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: BOT_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "refusal") {
      console.warn("[bot] Claude refused; handing off to staff");
      await alertStaff(supabase, conversationId, {
        reason: "AI could not answer this conversation (safety refusal)",
        urgency: "normal",
      });
      return null;
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return text || null;
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tool of toolUses) {
      const output = await executeTool(supabase, conversationId, sendCtx, tool);
      results.push({
        type: "tool_result",
        tool_use_id: tool.id,
        content: output,
      });
    }
    messages.push({ role: "user", content: results });
  }

  console.warn("[bot] tool-round limit reached without final text");
  return null;
}

async function executeTool(
  supabase: Admin,
  conversationId: string,
  sendCtx: SendContext,
  tool: Anthropic.ToolUseBlock,
): Promise<string> {
  try {
    const input = tool.input as Record<string, string | undefined>;
    console.log(`[bot] tool ${tool.name}:`, JSON.stringify(input));
    if (tool.name === "send_leaflet") {
      const leaflet = LEAFLETS[input.leaflet ?? ""];
      if (!leaflet) return `Unknown leaflet: ${input.leaflet}`;
      const url = `${LEAFLET_BASE}/leaflets/${leaflet.file}`;
      const result = await sendImage(
        sendCtx.phoneNumberId,
        sendCtx.waId,
        url,
        leaflet.caption,
      );
      if (!result.ok) {
        console.error("[bot] leaflet send failed:", result.error);
        return "Sending the image failed — continue with a text-only answer.";
      }
      const now = new Date().toISOString();
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        wa_message_id: result.waMessageId ?? null,
        direction: "outbound",
        type: "image",
        body: `📄 ${leaflet.caption}`,
        media_url: url,
        status: "sent",
        sent_by: null,
        sent_by_bot: true,
        created_at: now,
      });
      await supabase
        .from("conversations")
        .update({ last_message_at: now })
        .eq("id", conversationId);
      return "Leaflet image sent to the patient. Now send a short text follow-up.";
    }
    if (tool.name === "book_appointment") {
      const body =
        `📅 Booking request (via AI bot)\n` +
        `Name: ${input.patient_name}\n` +
        `Service: ${input.service}\n` +
        `Branch: ${input.branch ?? "?"}\n` +
        `Preferred time: ${input.preferred_time}` +
        (input.extra_notes ? `\nNotes: ${input.extra_notes}` : "");
      await supabase.from("notes").insert({
        conversation_id: conversationId,
        author_id: null,
        body,
        mentions: [],
      });
      await addTag(supabase, conversationId, "booking", "#0ea5e9");
      await supabase
        .from("conversations")
        .update({ stage: "qualified" })
        .eq("id", conversationId);
      return "Booking recorded. Staff will confirm the slot with the patient soon.";
    }
    if (tool.name === "alert_staff") {
      await alertStaff(supabase, conversationId, {
        reason: input.reason ?? "Patient needs staff",
        urgency: input.urgency === "urgent" ? "urgent" : "normal",
      });
      return "Staff have been alerted and will take over this conversation. Send the patient one final message now.";
    }
    return `Unknown tool: ${tool.name}`;
  } catch (err) {
    console.error("[bot] tool execution failed:", err);
    return "Tool failed — apologise and direct the patient to call 013-9237548.";
  }
}

async function alertStaff(
  supabase: Admin,
  conversationId: string,
  { reason, urgency }: { reason: string; urgency: "normal" | "urgent" },
): Promise<void> {
  await supabase.from("notes").insert({
    conversation_id: conversationId,
    author_id: null,
    body:
      (urgency === "urgent" ? "🚨 URGENT — " : "🤖 ") +
      `AI bot handed off to staff.\nReason: ${reason}`,
    mentions: [],
  });
  await addTag(
    supabase,
    conversationId,
    urgency === "urgent" ? "urgent" : "needs-staff",
    urgency === "urgent" ? "#ef4444" : "#f59e0b",
  );
  // Staff own the thread from here; the toolbar toggle re-enables the bot.
  await supabase
    .from("conversations")
    .update({ bot_enabled: false, status: "open" })
    .eq("id", conversationId);
}

/**
 * One keyboard-mash / gibberish message, e.g. "Cdbsbsj", "Dhdghdgdjdrhdf".
 * Heuristic: a short, punctuation-free, number-free blob of ≤3 words whose
 * letters are almost all consonants. Malay/English is vowel-rich, so real short
 * replies ("Salam", "Ok", "Assalamualaikum", "Baik") stay well clear.
 */
function isJunk(body: string | null): boolean {
  const t = (body ?? "").trim();
  if (t.length < 5) return false; // too short to judge
  if (/\d/.test(t) || /[?!]/.test(t)) return false; // numbers/questions = real intent
  if (t.split(/\s+/).length > 3) return false; // a real phrase/sentence
  const letters = t.replace(/[^a-z]/gi, "");
  if (letters.length < 5) return false;
  const vowels = (letters.match(/[aeiou]/gi) ?? []).length;
  return vowels / letters.length < 0.25; // almost no vowels = mash
}

/**
 * Is this conversation being spammed from outside? Trips on a rapid flood of
 * inbound messages, or several recent gibberish messages. Conservative on
 * purpose (needs a clear pattern) so genuine patients are never auto-silenced.
 */
function detectSpam(
  rows: { direction: string; body: string | null; created_at: string }[],
): "flood" | "gibberish" | null {
  const inbound = rows.filter((r) => r.direction === "inbound");
  const now = Date.now();
  const recent = inbound.filter(
    (r) => now - new Date(r.created_at).getTime() < 5 * 60_000,
  );
  if (recent.length >= 10) return "flood";
  const junk = inbound.slice(0, 6).filter((r) => isJunk(r.body)).length;
  if (junk >= 3) return "gibberish";
  return null;
}

/** Auto-pause the bot on a spammy thread: note + `spam` tag + bot_enabled off. */
async function flagSpam(
  supabase: Admin,
  conversationId: string,
  kind: string,
): Promise<void> {
  await supabase.from("notes").insert({
    conversation_id: conversationId,
    author_id: null,
    mentions: [],
    body: `🚫 AI auto-paused — spam/junk messages detected (${kind}). If this is a real patient, turn the AI back on from the toolbar.`,
  });
  await addTag(supabase, conversationId, "spam", "#64748b");
  await supabase
    .from("conversations")
    .update({ bot_enabled: false })
    .eq("id", conversationId);
  console.log(`[bot] spam auto-pause (${kind}) for ${conversationId}`);
}

async function addTag(
  supabase: Admin,
  conversationId: string,
  name: string,
  color: string,
): Promise<void> {
  const { data: tag } = await supabase
    .from("tags")
    .upsert({ name, color }, { onConflict: "name" })
    .select("id")
    .single();
  if (tag) {
    await supabase
      .from("conversation_tags")
      .upsert({ conversation_id: conversationId, tag_id: tag.id });
  }
}
