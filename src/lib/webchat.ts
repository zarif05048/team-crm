// Google web chat — the clinic's own chat page, no WhatsApp involved.
//
// The owner's ask (2026-10-27): a patient tapping the clinic's link on Google
// lands in this CRM directly, so new enquiries stop depending on a WhatsApp
// number that Meta can restrict. One page per clinic (/chat/dungun,
// /chat/paka); nothing asked of the patient first — no name, no phone.
//
// It rides on the existing tables, the same way the clinic bot lines do with
// their "unofficial:" prefix:
//   · each clinic's page is a row in whatsapp_numbers, phone_number_id
//     "web:dungun" / "web:paka", created on the first message
//   · each visitor is a contact whose wa_id is "web:<their session id>"
//   · each message's wa_message_id is "web:<id the page gave it>", so a resend
//     after a dropped connection is the same message, not a second one
// "Sending" to a web visitor is just storing the message: the page reads its
// own thread every few seconds (see app/api/webchat).
//
// The session id is a random UUID kept in the visitor's browser. Whoever holds
// it can read that one conversation and nothing else.

import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export const WEB_PREFIX = "web:";

export const WEB_CLINICS = {
  dungun: { phoneNumberId: "web:dungun", displayName: "Google Chat · Dungun", clinic: "Klinik Hijraa 24 Jam Dungun", branch: "Dungun" },
  paka: { phoneNumberId: "web:paka", displayName: "Google Chat · Paka", clinic: "Klinik Hijraa 24 Jam Paka", branch: "Paka" },
} as const;
export type WebClinic = keyof typeof WEB_CLINICS;

export const isWebClinic = (s: string): s is WebClinic => s in WEB_CLINICS;
/** A web-chat line (the clinic's page) or a web visitor (contact wa_id). */
export const isWeb = (id: string | null | undefined) => !!id && id.startsWith(WEB_PREFIX);

/** Which clinic a web line belongs to, from its phone_number_id. */
export function webClinicOf(phoneNumberId: string | null | undefined): (typeof WEB_CLINICS)[WebClinic] | null {
  const key = (phoneNumberId ?? "").slice(WEB_PREFIX.length);
  return isWeb(phoneNumberId) && isWebClinic(key) ? WEB_CLINICS[key] : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isSessionId = (s: unknown): s is string => typeof s === "string" && UUID_RE.test(s);

/** Longest message a visitor may send, and how many in a short burst. */
export const MAX_BODY = 1000;
export const BURST_LIMIT = 8;
export const BURST_WINDOW_MS = 60_000;

/** The conversation for this visitor on this clinic's page, if it exists yet. */
export async function findWebConversation(admin: Admin, clinic: WebClinic, session: string) {
  const { data } = await admin
    .from("conversations")
    .select("id, contact:contacts!inner(wa_id), whatsapp_number:whatsapp_numbers!inner(phone_number_id)")
    .eq("contact.wa_id", WEB_PREFIX + session)
    .eq("whatsapp_number.phone_number_id", WEB_CLINICS[clinic].phoneNumberId)
    .maybeSingle();
  return data ? (data.id as string) : null;
}

/** Find or create line → contact → conversation for a visitor's first message. */
export async function ensureWebConversation(admin: Admin, clinic: WebClinic, session: string): Promise<string> {
  const c = WEB_CLINICS[clinic];

  const { data: line, error: lineErr } = await admin
    .from("whatsapp_numbers")
    .upsert(
      { phone_number_id: c.phoneNumberId, display_name: c.displayName, phone_display: "Web chat (Google)" },
      { onConflict: "phone_number_id", ignoreDuplicates: false },
    )
    .select("id")
    .single();
  if (lineErr || !line) throw new Error(`web line: ${lineErr?.message}`);

  const waId = WEB_PREFIX + session;
  let { data: contact } = await admin.from("contacts").select("id").eq("wa_id", waId).maybeSingle();
  if (!contact) {
    // Staff need something to call the thread; they can rename it once the
    // patient gives a name.
    const { data: created, error } = await admin
      .from("contacts")
      .insert({ wa_id: waId, name: `Pelawat Google ${session.slice(0, 4).toUpperCase()}` })
      .select("id")
      .single();
    if (error || !created) throw new Error(`web contact: ${error?.message}`);
    contact = created;
  }

  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("contact_id", contact.id)
    .eq("whatsapp_number_id", line.id)
    .maybeSingle();
  if (conv) return conv.id as string;
  const { data: newConv, error: convErr } = await admin
    .from("conversations")
    .insert({ contact_id: contact.id, whatsapp_number_id: line.id })
    .select("id")
    .single();
  if (convErr || !newConv) throw new Error(`web conversation: ${convErr?.message}`);
  await tagConversation(admin, newConv.id as string, "google", "#f59e0b");
  return newConv.id as string;
}

async function tagConversation(admin: Admin, conversationId: string, name: string, color: string) {
  const { data: tag } = await admin.from("tags").upsert({ name, color }, { onConflict: "name" }).select("id").single();
  if (tag) await admin.from("conversation_tags").upsert({ conversation_id: conversationId, tag_id: tag.id });
}

/** A line for the bot's system prompt when the thread is a web chat. */
export function webChatNote(phoneNumberId: string | null | undefined): string | null {
  const c = webClinicOf(phoneNumberId);
  if (!c) return null;
  return (
    `CHANNEL: this is the clinic's own WEB CHAT page for ${c.clinic}, opened from Google — NOT WhatsApp. ` +
    `The patient is anonymous: you do not have their name or phone number. Assume they are asking about the ${c.branch} branch unless they say otherwise. ` +
    `Before recording any booking or handing to staff for a follow-up, ask for their name and a phone number staff can call or WhatsApp, because staff cannot reach them otherwise. ` +
    `Do not tell them to "reply on WhatsApp"; they can keep chatting right here, and staff reply on this same page.`
  );
}
