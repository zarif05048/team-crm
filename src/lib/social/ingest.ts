// A Messenger or TikTok message into the inbox's own tables: the account's
// line, the person's contact, their thread, the message. See lines.ts for how
// each is named. Service-role client; called from the two webhooks.
import type { createAdminClient } from "@/lib/supabase/admin";
import type { BotTrigger } from "@/lib/ai/bot";
import type { SocialEvent } from "./events";
import { SOCIAL, contactId, isEnquiryComment, lineId, lineName, messageId, type SocialChannel, type SocialClinic, type SocialProvider } from "./lines";

type Admin = ReturnType<typeof createAdminClient>;

export interface IngestAccount { provider: SocialProvider; external_id: string; clinic: SocialClinic; name: string | null }

/** How recent one of our own messages must be for an echo of it to be taken as ours. */
const OWN_ECHO_WINDOW_MS = 2 * 60_000;

/** The account's line for this kind of message — a Facebook page has two:
 *  its Messenger, and the comments under its posts. */
async function ensureLine(admin: Admin, acc: IngestAccount, channel: SocialChannel): Promise<string> {
  const { data, error } = await admin.from("whatsapp_numbers").upsert({
    phone_number_id: lineId(channel, acc.clinic, acc.external_id),
    display_name: lineName(channel, acc.clinic),
    phone_display: acc.name || SOCIAL[channel].app,
  }, { onConflict: "phone_number_id", ignoreDuplicates: false }).select("id").single();
  if (error || !data) throw new Error(`social line: ${error?.message}`);
  return data.id as string;
}

async function ensureContact(admin: Admin, ev: SocialEvent, nameOf?: () => Promise<string | null>): Promise<string> {
  const waId = contactId(ev.provider, ev.userId);
  const { data: existing } = await admin.from("contacts").select("id").eq("wa_id", waId).maybeSingle();
  if (existing) return existing.id as string;
  // Staff need something to call the thread; they can rename it.
  const name = ev.userName || (nameOf ? await nameOf().catch(() => null) : null)
    || `${SOCIAL[ev.provider].label} ${ev.userId.slice(-4).toUpperCase()}`;
  const { data: created, error } = await admin.from("contacts")
    .insert({ wa_id: waId, name, profile_name: name }).select("id").single();
  if (created) return created.id as string;
  // two webhooks for a new person at once: the other one made the contact
  const { data: again } = await admin.from("contacts").select("id").eq("wa_id", waId).maybeSingle();
  if (again) return again.id as string;
  throw new Error(`social contact: ${error?.message}`);
}

async function ensureConversation(admin: Admin, contact: string, line: string, provider: SocialChannel): Promise<string> {
  const find = () => admin.from("conversations").select("id").eq("contact_id", contact).eq("whatsapp_number_id", line).maybeSingle();
  const { data: existing } = await find();
  if (existing) return existing.id as string;
  const { data: created, error } = await admin.from("conversations")
    .insert({ contact_id: contact, whatsapp_number_id: line }).select("id").single();
  if (!created) {
    const { data: again } = await find();
    if (again) return again.id as string;
    throw new Error(`social conversation: ${error?.message}`);
  }
  // the same source tag a web chat opened from a Facebook / TikTok link carries
  const s = SOCIAL[provider];
  const { data: tag } = await admin.from("tags").upsert({ name: s.tag, color: s.color }, { onConflict: "name" }).select("id").single();
  if (tag) await admin.from("conversation_tags").upsert({ conversation_id: created.id, tag_id: tag.id });
  return created.id as string;
}

/** Whether an "out" event is this CRM's own send coming back. Meta marks it
 *  (`own`); TikTok does not, so: the message is already stored by its id, or a
 *  message this CRM just sent on the thread contains it — a long reply goes
 *  out in pieces, and a poster's caption as a message of its own. */
async function isOwnEcho(admin: Admin, conversation: string, ev: SocialEvent): Promise<boolean> {
  if (ev.own) return true;
  const { data: byId } = await admin.from("messages").select("id").eq("wa_message_id", messageId(ev.provider, ev.messageId)).maybeSingle();
  if (byId) return true;
  const since = new Date(Date.parse(ev.at) - OWN_ECHO_WINDOW_MS).toISOString();
  const { data: recent } = await admin.from("messages").select("type, body, sent_by, sent_by_bot")
    .eq("conversation_id", conversation).eq("direction", "outbound").gte("created_at", since)
    .order("created_at", { ascending: false }).limit(10);
  return ((recent as { type: string; body: string | null; sent_by: string | null; sent_by_bot: boolean }[] | null) ?? [])
    .filter((m) => m.sent_by || m.sent_by_bot)
    .some((m) => (ev.type === "image" ? m.type === "image" : !!m.body && m.body.includes(ev.body)));
}

/** Store one event. Returns a trigger for the AI bot when a person's NEW
 *  message was stored; null for a duplicate, an echo, or the clinic's own. */
export async function ingestSocialEvent(
  admin: Admin, acc: IngestAccount, ev: SocialEvent, nameOf?: () => Promise<string | null>,
): Promise<BotTrigger | null> {
  const line = await ensureLine(admin, acc, ev.provider);
  const contact = await ensureContact(admin, ev, nameOf);
  const conversation = await ensureConversation(admin, contact, line, ev.provider);
  const waMessageId = messageId(ev.provider, ev.messageId);

  /* Meta marks a message this CRM's own app sent (ev.own). One sent in this
     thread is already stored under the same id, and the insert below refuses
     it. One that is NOT here is a private reply to a post comment, which
     Facebook delivers into the person's Messenger: stored here, so this thread
     (and the bot, when they answer) shows what was said. TikTok does not mark
     its echoes, so for those the thread is searched (isOwnEcho). */
  if (ev.direction === "out" && !ev.own && (await isOwnEcho(admin, conversation, ev))) return null;

  const { error } = await admin.from("messages").insert({
    conversation_id: conversation, wa_message_id: waMessageId,
    direction: ev.direction === "in" ? "inbound" : "outbound",
    // a comment carries a link to its post, so staff can open it in Facebook
    type: ev.type, body: ev.postId ? `${ev.body}\n\n🔗 Post: https://www.facebook.com/${ev.postId}` : ev.body,
    media_url: ev.mediaUrl ?? null,
    status: ev.direction === "in" ? "received" : "sent", created_at: ev.at,
  });
  if (error) {
    if (error.code !== "23505") console.error("[social] insert message failed:", error.message);
    return null;   // 23505: the provider sent this one before
  }
  if (ev.direction === "out") {
    // Staff answered from the Facebook / TikTok app itself: they own the
    // thread now, exactly as when they answer from the CRM. Our own send does not.
    if (ev.own) return null;
    await admin.from("conversations").update({ bot_enabled: false }).eq("id", conversation).eq("bot_enabled", true);
    return null;
  }
  // a comment that asks nothing ("mantap", a tagged friend) waits for staff, not the bot (lines.ts)
  if (ev.provider === "fbcomments" && !isEnquiryComment(ev.body)) return null;
  return { conversationId: conversation, waMessageId };
}
