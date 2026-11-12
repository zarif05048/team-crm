// Sending on a Messenger, post-comments or TikTok line. Called by
// lib/whatsapp/send.ts for any line whose id says it is one, so the bot's and
// the staff's send paths are the same code as for WhatsApp.
import { createAdminClient } from "@/lib/supabase/admin";
import { accessTokenFor, noteAccountError } from "./accounts";
import { SOCIAL, bareId, chunkText, messageId, socialLineOf, withWhatsappLink, type SocialClinic } from "./lines";
import { replyToCommentPublicly, sendFacebookMessage } from "./facebook";
import { sendTikTokImage, sendTikTokText } from "./tiktok";

export interface SocialSendResult { ok: boolean; waMessageId?: string; error?: string }
export type SocialPayload =
  | {
      kind: "text"; body: string;
      /** post comments only: answer under the comment instead of privately */
      publicReply?: boolean;
      /** post comments only: the BOT's answer — sent privately AND posted under the comment */
      alsoPublic?: boolean;
    }
  | { kind: "image"; link: string; caption?: string };

/* WhatsApp first (owner, 12 Nov 2026: "make sure priorities whatsapp from
   messenger"): what goes up under a comment sends people on to the clinic's
   WhatsApp, never to Messenger. */
/** What the page posts under a comment once a staff member has answered it
 *  privately — so the commenter, and everyone reading the post, sees it was answered. */
export const publicAck = (clinic: SocialClinic) =>
  withWhatsappLink("Terima kasih. Kami telah menghantar mesej peribadi kepada anda.", clinic);
/** Hana's answer as it goes up under the comment (owner, 12 Nov 2026: "can hana
 *  comment in the facebook page also"): her words, ending on the WhatsApp link. */
export const publicAnswer = (answer: string, clinic: SocialClinic) => withWhatsappLink(answer.trim(), clinic);

/** Marks in wa_message_id: which comment a private message answered, and a
 *  public reply's own comment id. A comment gets ONE private message ever. */
export const privateReplyId = (commentId: string) => `fbc:pr:${commentId}`;
export const publicReplyId = (replyCommentId: string) => `fbc:pub:${replyCommentId}`;

/** `to` is the contact's wa_id ("fb:<psid>" / "fbc:<commenter id>" / "tt:<conversation id>"). */
export async function sendSocial(phoneNumberId: string, to: string, payload: SocialPayload): Promise<SocialSendResult> {
  const line = socialLineOf(phoneNumberId);
  if (!line) return { ok: false, error: "Not a Facebook or TikTok line." };
  const s = SOCIAL[line.provider];
  let token: string;
  try { token = await accessTokenFor(line.account, line.externalId); }
  catch (e) { return { ok: false, error: (e as Error).message }; }
  const target = bareId(to);

  if (line.provider === "fbcomments") return sendOnComments(phoneNumberId, to, line.externalId, line.clinic, token, payload);

  /** One piece; a failure is noted on the account's row for Settings. */
  const one = async (content: SocialPayload): Promise<SocialSendResult> => {
    if (line.provider === "facebook") {
      const r = await sendFacebookMessage(line.externalId, token, target, content.kind === "text"
        ? { text: content.body }
        : { attachment: { type: "image", payload: { url: content.link, is_reusable: true } } });
      if (!r.ok && r.reconnect) await noteAccountError("facebook", line.externalId, r.error ?? "The page's access no longer works.", true);
      return { ok: r.ok, error: r.error, waMessageId: r.messageId ? messageId("facebook", r.messageId) : undefined };
    }
    const r = content.kind === "text"
      ? await sendTikTokText(line.externalId, token, target, content.body)
      : await sendTikTokImage(line.externalId, token, target, content.link);
    return { ok: r.ok, error: r.error, waMessageId: r.messageId ? messageId("tiktok", r.messageId) : undefined };
  };

  if (payload.kind === "image") {
    const sent = await one(payload);
    if (!sent.ok) {
      // a market or account TikTok does not let send pictures: the link instead
      const asLink = await one({ kind: "text", body: [payload.caption, payload.link].filter(Boolean).join("\n") });
      return asLink.ok ? asLink : sent;
    }
    if (payload.caption) await one({ kind: "text", body: payload.caption });
    return sent;
  }

  let last: SocialSendResult = { ok: false, error: "Message is empty." };
  for (const piece of chunkText(payload.body, s.maxText)) {
    last = await one({ kind: "text", body: piece });
    if (!last.ok) return last;
  }
  return last;
}

/** The commenter's newest comment in this thread, and whether it has had its
 *  one private message. Read from the thread itself: inbound rows are the
 *  comments ("fbc:<comment id>"), outbound rows carry the marks above. */
async function latestComment(phoneNumberId: string, waId: string): Promise<{ conversationId: string; commentId: string; answered: boolean; at: string } | null> {
  const admin = createAdminClient();
  const { data: conv } = await admin.from("conversations")
    .select("id, contact:contacts!inner(wa_id), whatsapp_number:whatsapp_numbers!inner(phone_number_id)")
    .eq("contact.wa_id", waId).eq("whatsapp_number.phone_number_id", phoneNumberId).maybeSingle();
  if (!conv) return null;
  const { data: rows } = await admin.from("messages").select("wa_message_id, direction, created_at")
    .eq("conversation_id", (conv as { id: string }).id).like("wa_message_id", "fbc:%")
    .order("created_at", { ascending: false }).limit(200);
  const list = (rows as { wa_message_id: string; direction: string; created_at: string }[] | null) ?? [];
  const newest = list.find((m) => m.direction === "inbound" && !m.wa_message_id.startsWith("fbc:pr:") && !m.wa_message_id.startsWith("fbc:pub:"));
  if (!newest) return null;
  const commentId = bareId(newest.wa_message_id);
  return { conversationId: (conv as { id: string }).id, commentId, answered: list.some((m) => m.wa_message_id === privateReplyId(commentId)), at: newest.created_at };
}

async function sendOnComments(
  phoneNumberId: string, waId: string, pageId: string, clinic: SocialClinic, token: string, payload: SocialPayload,
): Promise<SocialSendResult> {
  const c = await latestComment(phoneNumberId, waId);
  if (!c) return { ok: false, error: "No comment from this person to answer." };

  if (payload.kind === "text" && payload.publicReply) {
    const r = await replyToCommentPublicly(c.commentId, token, payload.body.trim());
    return r.ok ? { ok: true, waMessageId: r.commentId ? publicReplyId(r.commentId) : undefined } : { ok: false, error: r.error };
  }
  // the bot's poster, or anything else that would be a second message
  if (payload.kind === "image") {
    return { ok: false, error: "A comment gets one private text message — send the poster in their Messenger chat instead." };
  }
  if (c.answered) {
    return { ok: false, error: "This comment already had its one private message — continue in their Messenger chat, or use Public reply." };
  }
  if (Date.now() - Date.parse(c.at) > SOCIAL.fbcomments.windowHours * 3_600_000) {
    return { ok: false, error: "Facebook allows a private message only within 7 days of the comment — use Public reply." };
  }
  // ONE message: a reply longer than Messenger takes is cut at the limit
  const text = chunkText(payload.body, SOCIAL.fbcomments.maxText)[0] ?? "";
  if (!text) return { ok: false, error: "Message is empty." };
  const r = await sendFacebookMessage(pageId, token, null, { text }, { commentId: c.commentId });
  if (!r.ok) {
    if (r.reconnect) await noteAccountError("facebook", pageId, r.error ?? "The page's access no longer works.", true);
    return { ok: false, error: r.error };
  }
  // and say so under the comment. The private message already went, so a
  // refusal here does not fail the send — but it is shown in the thread: the
  // public note when it posts, Facebook's own words when it does not.
  // the bot's answer is posted as it is (people reading the post see it too);
  // a staff member's private message stays private — only the short note
  const publicText = payload.kind === "text" && payload.alsoPublic ? publicAnswer(text, clinic) : publicAck(clinic);
  const ack = await replyToCommentPublicly(c.commentId, token, publicText)
    .catch((e) => ({ ok: false, error: (e as Error).message, commentId: undefined }));
  const admin = createAdminClient();
  if (ack.ok) {
    await admin.from("messages").insert({
      conversation_id: c.conversationId, wa_message_id: ack.commentId ? publicReplyId(ack.commentId) : null,
      direction: "outbound", type: "text", body: `💬 Public reply: ${publicText}`, status: "sent",
      sent_by: null, sent_by_bot: false, created_at: new Date().toISOString(),
    });
  } else {
    console.error("[facebook] public note under the comment failed:", ack.error);
    await admin.from("notes").insert({
      conversation_id: c.conversationId, author_id: null, mentions: [],
      body: `⚠️ The private message was sent, but Facebook did not accept the public note under the comment: ${ack.error ?? "no reason given"}`,
    });
  }
  return { ok: true, waMessageId: privateReplyId(c.commentId) };
}
