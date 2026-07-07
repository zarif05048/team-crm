"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendText, sendTemplate } from "@/lib/whatsapp/send";
import { isWindowOpen } from "@/lib/types";

export type SendState = { ok: boolean; error?: string; conversationId?: string };

interface ConvForSend {
  id: string;
  last_inbound_at: string | null;
  contact: { id: string; wa_id: string; name: string | null; profile_name: string | null };
  whatsapp_number: { id: string; phone_number_id: string; waba_id: string | null };
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
       contact:contacts(id, wa_id, name, profile_name),
       whatsapp_number:whatsapp_numbers(id, phone_number_id, waba_id)`,
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !data) return { error: "Conversation not found." as const };
  return { supabase, user, conv: data as unknown as ConvForSend };
}

/**
 * Find (or create) this contact's conversation on a DIFFERENT WhatsApp line, so
 * staff can reply to a patient from any of the clinic's numbers. Each number is
 * a separate WhatsApp chat, so the reply lives in that line's own thread.
 */
async function findOrCreateConversationOnLine(
  contactId: string,
  numberId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("conversations")
    .select("id")
    .eq("contact_id", contactId)
    .eq("whatsapp_number_id", numberId)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await admin
    .from("conversations")
    .insert({ contact_id: contactId, whatsapp_number_id: numberId })
    .select("id")
    .single();
  if (error) return null;
  return created.id;
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

  // A manual staff reply means staff own this thread — pause the AI bot so it
  // doesn't talk over them. Re-enable any time from the thread toolbar.
  const { error: botErr } = await supabase
    .from("conversations")
    .update({ bot_enabled: false })
    .eq("id", conversationId)
    .eq("bot_enabled", true);
  if (botErr) console.warn("[actions] pause bot failed:", botErr.message);
}

/** Send a free-text reply — only allowed inside the 24h window. */
export async function sendReply(
  conversationId: string,
  body: string,
  viaNumberId?: string,
): Promise<SendState> {
  const text = body.trim();
  if (!text) return { ok: false, error: "Message is empty." };

  const loaded = await loadConversation(conversationId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const { user, conv } = loaded;

  // "Send from" a different clinic line: reply to this same patient from another
  // of our WhatsApp numbers. That number is a separate WhatsApp chat, so the
  // reply is recorded and delivered on THAT line's own thread, and we hand the
  // caller that conversation id to navigate to.
  if (viaNumberId && viaNumberId !== conv.whatsapp_number.id) {
    const admin = createAdminClient();
    const { data: target } = await admin
      .from("whatsapp_numbers")
      .select("id, phone_number_id, display_name")
      .eq("id", viaNumberId)
      .maybeSingle();
    if (!target) return { ok: false, error: "That line no longer exists." };
    if (!target.phone_number_id.startsWith("unofficial:")) {
      return { ok: false, error: "Replies can only be sent from the clinic bot lines." };
    }
    const targetConvId = await findOrCreateConversationOnLine(conv.contact.id, viaNumberId);
    if (!targetConvId) return { ok: false, error: "Could not open a chat on that line." };
    const res = await sendViaBridge(targetConvId, user.id, conv.contact.wa_id, text);
    return { ...res, conversationId: res.ok ? targetConvId : undefined };
  }

  // Bridged (unofficial marketing number) thread: no Meta API and no 24h-window
  // rule — queue the reply for the marketing-sender program to deliver.
  if (conv.whatsapp_number.phone_number_id.startsWith("unofficial:")) {
    return sendViaBridge(conversationId, user.id, conv.contact.wa_id, text);
  }

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

/**
 * Queue a reply for the unofficial marketing number: record the message in the
 * thread immediately, and let the sender program (which holds the WhatsApp
 * session) deliver it within a few seconds via bridge_outbox.
 */
async function sendViaBridge(
  conversationId: string,
  userId: string,
  waId: string,
  text: string,
): Promise<SendState> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: msg, error: msgErr } = await admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      direction: "outbound",
      type: "text",
      body: text,
      status: "sent",
      sent_by: userId,
      created_at: now,
    })
    .select("id")
    .single();
  if (msgErr) return { ok: false, error: msgErr.message };

  const { error: obErr } = await admin.from("bridge_outbox").insert({
    message_id: msg.id,
    conversation_id: conversationId,
    wa_id: waId,
    body: text,
  });
  if (obErr) {
    return {
      ok: false,
      error:
        "Bridge queue missing — run the 2026-07-06_bridge_outbox.sql migration in Supabase.",
    };
  }

  await admin
    .from("conversations")
    .update({ last_message_at: now, bot_enabled: false })
    .eq("id", conversationId);

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

/**
 * Mark a conversation as read: staff opened the thread. Unread badges in the
 * inbox clear only through this. Fail-soft while the last_read_at column
 * migration hasn't been run yet.
 */
export async function markConversationRead(
  conversationId: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("conversations")
    .update({ last_read_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (error) return { ok: false, error: error.message }; // pre-migration: column missing
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

/** Move a conversation to a lead-pipeline stage. */
export async function setStage(
  conversationId: string,
  stage: "new" | "contacted" | "qualified" | "won" | "lost",
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("conversations")
    .update({ stage })
    .eq("id", conversationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Turn the AI auto-reply bot on/off for a conversation. */
export async function setBotEnabled(
  conversationId: string,
  enabled: boolean,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("conversations")
    .update({ bot_enabled: enabled })
    .eq("id", conversationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Add a tag (by name) to a conversation, creating the tag if needed.
 * Tag creation is admin-only under RLS, so we use the service-role client here
 * after confirming the caller is signed in.
 */
export async function addTag(
  conversationId: string,
  tagName: string,
): Promise<ActionState> {
  const name = tagName.trim();
  if (!name) return { ok: false, error: "Tag is empty." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const palette = ["#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#ec4899"];
  const color = palette[Math.floor(Math.random() * palette.length)];

  const { data: tag, error: tagErr } = await admin
    .from("tags")
    .upsert({ name, color }, { onConflict: "name" })
    .select("id")
    .single();
  if (tagErr || !tag) return { ok: false, error: tagErr?.message ?? "Tag failed." };

  const { error: linkErr } = await admin
    .from("conversation_tags")
    .upsert({ conversation_id: conversationId, tag_id: tag.id });
  if (linkErr) return { ok: false, error: linkErr.message };
  return { ok: true };
}

/** Remove a tag from a conversation. */
export async function removeTag(
  conversationId: string,
  tagId: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("conversation_tags")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("tag_id", tagId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
