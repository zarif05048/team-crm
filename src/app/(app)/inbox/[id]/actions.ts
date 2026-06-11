"use server";

import { createClient } from "@/lib/supabase/server";
import { sendText, sendTemplate } from "@/lib/whatsapp/send";
import { isWindowOpen } from "@/lib/types";

export type SendState = { ok: boolean; error?: string };

interface ConvForSend {
  id: string;
  last_inbound_at: string | null;
  contact: { wa_id: string };
  whatsapp_number: { phone_number_id: string; waba_id: string | null };
}

async function loadConversation(conversationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." as const };

  const { data, error } = await supabase
    .from("conversations")
    .select(
      `id, last_inbound_at,
       contact:contacts(wa_id),
       whatsapp_number:whatsapp_numbers(phone_number_id, waba_id)`,
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !data) return { error: "Conversation not found." as const };
  return { supabase, user, conv: data as unknown as ConvForSend };
}

async function recordOutbound(
  conversationId: string,
  userId: string,
  type: string,
  body: string,
  waMessageId: string | undefined,
) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    wa_message_id: waMessageId ?? null,
    direction: "outbound",
    type,
    body,
    status: "sent",
    sent_by: userId,
    created_at: now,
  });
  await supabase
    .from("conversations")
    .update({ last_message_at: now })
    .eq("id", conversationId);
}

/** Send a free-text reply — only allowed inside the 24h window. */
export async function sendReply(
  conversationId: string,
  body: string,
): Promise<SendState> {
  const text = body.trim();
  if (!text) return { ok: false, error: "Message is empty." };

  const loaded = await loadConversation(conversationId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const { user, conv } = loaded;

  if (!isWindowOpen(conv.last_inbound_at)) {
    return {
      ok: false,
      error:
        "The 24-hour reply window is closed. Use an approved template to re-open the chat.",
    };
  }

  const result = await sendText(
    conv.whatsapp_number.phone_number_id,
    conv.contact.wa_id,
    text,
  );
  if (!result.ok) return { ok: false, error: result.error };

  await recordOutbound(conversationId, user.id, "text", text, result.waMessageId);
  return { ok: true };
}

/** Send an approved template — allowed even when the 24h window is closed. */
export async function sendTemplateReply(
  conversationId: string,
  templateName: string,
  languageCode = "en_US",
): Promise<SendState> {
  const loaded = await loadConversation(conversationId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const { user, conv } = loaded;

  const result = await sendTemplate(
    conv.whatsapp_number.phone_number_id,
    conv.contact.wa_id,
    templateName,
    languageCode,
  );
  if (!result.ok) return { ok: false, error: result.error };

  await recordOutbound(
    conversationId,
    user.id,
    "template",
    `[Template: ${templateName}]`,
    result.waMessageId,
  );
  return { ok: true };
}

// ---------------------------------------------------------------------------
//  Collaboration: assignment, status, internal notes
// ---------------------------------------------------------------------------

export type ActionState = { ok: boolean; error?: string };

/** Assign (or unassign with null) a conversation to a team member. */
export async function assignConversation(
  conversationId: string,
  assigneeId: string | null,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("conversations")
    .update({ assigned_to: assigneeId })
    .eq("id", conversationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Open or close a conversation. */
export async function setConversationStatus(
  conversationId: string,
  status: "open" | "closed",
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("conversations")
    .update({ status })
    .eq("id", conversationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Add an internal note (never sent to the customer). `mentions` = profile ids. */
export async function addNote(
  conversationId: string,
  body: string,
  mentions: string[] = [],
): Promise<ActionState> {
  const text = body.trim();
  if (!text) return { ok: false, error: "Note is empty." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase.from("notes").insert({
    conversation_id: conversationId,
    author_id: user.id,
    body: text,
    mentions,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
