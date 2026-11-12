// What Meta and TikTok post to the webhooks, read into one shape the inbox
// stores (lib/social/ingest.ts). Pure: no database, no network.
import crypto from "node:crypto";
import { reviewMessage, starCount, type SocialChannel } from "./lines";

export interface SocialEvent {
  /** Messenger, a post comment, or TikTok — which inbox line it belongs on */
  provider: SocialChannel;
  /** the Facebook page id / the TikTok business account id the event is about */
  accountId: string;
  /** who the clinic is talking to: a page-scoped user id / a TikTok conversation id */
  userId: string;
  /** their name, when the provider says it (TikTok does; Facebook is asked separately) */
  userName?: string;
  /** "in": they wrote to the clinic. "out": the clinic wrote — from the provider's own inbox app, or this CRM's own send echoed back. */
  direction: "in" | "out";
  /** an "out" this CRM sent itself (Meta says which app sent it): already stored, skip */
  own?: boolean;
  messageId: string;
  type: "text" | "image";
  body: string;
  mediaUrl?: string;
  /** ISO time the provider gives the message */
  at: string;
  /** a post comment: the post it is under (its id, for its link) */
  postId?: string;
  /** a Google review: may the bot answer it (new, and not answered yet) */
  botMay?: boolean;
}

/* ------------------------------ Facebook ------------------------------ */

interface FbAttachment { type?: string; payload?: { url?: string; sticker_id?: number; title?: string } }
interface FbMessaging {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; app_id?: number | string; attachments?: FbAttachment[] };
  postback?: { mid?: string; title?: string; payload?: string };
}
/** A change on the page's feed — here, a comment under one of its posts. */
interface FbFeedChange {
  field?: string;
  value?: {
    item?: string; verb?: string; comment_id?: string; post_id?: string; parent_id?: string;
    message?: string; created_time?: number; from?: { id?: string; name?: string }; photo?: string;
  };
}
export interface FbWebhookBody {
  object?: string;
  entry?: { id?: string; time?: number; messaging?: FbMessaging[]; changes?: FbFeedChange[] }[];
}

const ATTACHMENT_LABEL: Record<string, string> = {
  video: "🎥 Video", audio: "🎙️ Voice message", file: "📄 Document", location: "📍 Location", fallback: "🔗 Link", template: "🔗 Link",
};

/** One message's content the way the inbox shows it. A sticker reads exactly as
 *  a WhatsApp one does ("Sticker", an image), so the bot's sticker rule holds. */
function fbContent(m: NonNullable<FbMessaging["message"]>): Pick<SocialEvent, "type" | "body" | "mediaUrl"> {
  const text = (m.text ?? "").trim();
  const a = m.attachments?.[0];
  if (!a) return { type: "text", body: text };
  if (a.type === "image") {
    if (a.payload?.sticker_id) return { type: "image", body: "Sticker", mediaUrl: a.payload.url };
    return { type: "image", body: text || "📷 Photo", mediaUrl: a.payload?.url };
  }
  const label = ATTACHMENT_LABEL[a.type ?? ""] ?? "[Unsupported message — open Facebook to view]";
  const link = a.payload?.url && (a.type === "fallback" || a.type === "template") ? ` ${a.payload.url}` : "";
  return { type: "text", body: [text, `${label}${link}`].filter(Boolean).join("\n") };
}

/** Every message in a Page webhook body. `appId` is this CRM's Meta app: an
 *  echo it sent itself is marked `own`. Delivery and read receipts are not messages. */
export function parseFacebookWebhook(body: FbWebhookBody, appId: string | string[]): SocialEvent[] {
  const ownIds = (Array.isArray(appId) ? appId : [appId]).filter(Boolean);
  const out: SocialEvent[] = [];
  if (body?.object !== "page") return out;
  for (const entry of body.entry ?? []) {
    const pageId = String(entry.id ?? "");
    /* Comments under the page's posts (owner, 12 Nov 2026: "yes add comments
       too"). Only a NEW comment by someone other than the page: an edit, a
       removal, a like or the page's own reply is not something to answer. */
    for (const ch of entry.changes ?? []) {
      const v = ch.value;
      if (ch.field !== "feed" || v?.item !== "comment" || v.verb !== "add") continue;
      const userId = String(v.from?.id ?? "");
      if (!pageId || !userId || userId === pageId || !v.comment_id) continue;
      const text = (v.message ?? "").trim();
      if (!text && !v.photo) continue;
      out.push({
        provider: "fbcomments", accountId: pageId, userId, userName: (v.from?.name ?? "").trim() || undefined, direction: "in",
        messageId: v.comment_id, postId: v.post_id,
        type: v.photo && !text ? "image" : "text", body: text || "📷 Photo", mediaUrl: v.photo,
        at: new Date(v.created_time ? v.created_time * 1000 : Date.now()).toISOString(),
      });
    }
    for (const ev of entry.messaging ?? []) {
      const at = new Date(ev.timestamp || Date.now()).toISOString();
      if (ev.message?.mid) {
        const echo = !!ev.message.is_echo;
        // an echo is page -> person: the person is the recipient
        const userId = String((echo ? ev.recipient?.id : ev.sender?.id) ?? "");
        if (!pageId || !userId) continue;
        const content = fbContent(ev.message);
        if (!content.body && !content.mediaUrl) continue;
        out.push({
          provider: "facebook", accountId: pageId, userId, direction: echo ? "out" : "in",
          own: echo && ownIds.includes(String(ev.message.app_id ?? "")),
          messageId: ev.message.mid, at, ...content,
        });
      } else if (ev.postback && ev.sender?.id) {
        // a button on the page ("Get started"): what the person tapped
        const title = (ev.postback.title ?? "").trim();
        if (!pageId || !title) continue;
        out.push({
          provider: "facebook", accountId: pageId, userId: String(ev.sender.id), direction: "in",
          messageId: ev.postback.mid || `postback-${ev.sender.id}-${ev.timestamp ?? Date.now()}`,
          type: "text", body: title, at,
        });
      }
    }
  }
  return out;
}

/* ------------------------------- TikTok ------------------------------- */

export interface TtWebhookBody { event?: string; user_openid?: string; content?: string }
interface TtContent {
  conversation_id?: string; message_id?: string; type?: string; timestamp?: number;
  text?: { body?: string }; image?: { media_id?: string }; share_post?: { embed_url?: string };
  from?: string; to?: string; from_user?: { id?: string }; to_user?: { id?: string };
}

/** The message in a TikTok webhook body, if it carries one (im_receive_msg: a
 *  person wrote; im_send_msg: the account wrote — from the TikTok app or from here). */
export function parseTikTokWebhook(body: TtWebhookBody): SocialEvent[] {
  if (body?.event !== "im_receive_msg" && body?.event !== "im_send_msg") return [];
  const businessId = String(body.user_openid ?? "");
  let c: TtContent;
  try { c = JSON.parse(body.content ?? ""); } catch { return []; }
  if (!businessId || !c?.conversation_id || !c.message_id) return [];
  // told by who it is addressed to, not by the event's name
  const incoming = String(c.to_user?.id ?? "") === businessId;
  let content: Pick<SocialEvent, "type" | "body">;
  if (c.type === "text") content = { type: "text", body: (c.text?.body ?? "").trim() };
  else if (c.type === "image") content = { type: "image", body: "📷 Photo" };
  else if (c.type === "sticker") content = { type: "image", body: "Sticker" };
  else if (c.type === "share_post") content = { type: "text", body: `🔗 Shared a TikTok video${c.share_post?.embed_url ? `: ${c.share_post.embed_url}` : ""}` };
  else content = { type: "text", body: "[Unsupported message — open TikTok to view]" };
  if (!content.body) return [];
  const name = (incoming ? c.from : c.to) ?? "";
  return [{
    provider: "tiktok", accountId: businessId, userId: c.conversation_id, userName: name.trim() || undefined,
    direction: incoming ? "in" : "out", messageId: c.message_id,
    at: new Date(c.timestamp || Date.now()).toISOString(), ...content,
  }];
}

/** TikTok signs each webhook: header "t=<unix seconds>,s=<hex>", the HMAC-SHA256
 *  of "<t>.<raw body>" with the app secret. Old timestamps are refused (a replay). */
export function verifyTikTokSignature(
  rawBody: string, header: string | null | undefined, secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300,
): boolean {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => {
    const at = p.indexOf("=");
    return [p.slice(0, at).trim(), p.slice(at + 1).trim()];
  }));
  const t = Number(parts.t);
  const s = String(parts.s ?? "");
  if (!Number.isFinite(t) || !/^[0-9a-f]{64}$/i.test(s)) return false;
  if (Math.abs(nowSeconds - t) > toleranceSeconds) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest();
  const received = Buffer.from(s, "hex");
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

/* --------------------------- Google reviews --------------------------- */

export interface GoogleReview {
  reviewId?: string;
  reviewer?: { displayName?: string; isAnonymous?: boolean };
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
}
/** Reviews older than this are not brought in: the inbox keeps messages for a
 *  year (api/cron/cleanup), and a review imported older would be deleted and
 *  imported again every day. */
export const REVIEW_MAX_AGE_DAYS = 180;
/** The bot answers only a review this new — older unanswered ones wait for staff. */
export const REVIEW_BOT_MAX_AGE_DAYS = 3;

/** One Google review as inbox events: the review itself, and the clinic's
 *  reply when it already has one (marked own: it is already on Google, so it
 *  never takes the thread from the bot). `locationId` is "accounts/1/locations/2". */
export function googleReviewEvents(locationId: string, r: GoogleReview, now = Date.now()): SocialEvent[] {
  if (!r.reviewId || !r.createTime) return [];
  const created = Date.parse(r.createTime);
  if (!Number.isFinite(created) || now - created > REVIEW_MAX_AGE_DAYS * 86_400_000) return [];
  const name = r.reviewer?.isAnonymous ? "Google user" : r.reviewer?.displayName?.trim() || "Google user";
  const reply = r.reviewReply?.comment?.trim();
  const out: SocialEvent[] = [{
    provider: "greviews", accountId: locationId, userId: r.reviewId, userName: name, direction: "in",
    messageId: r.reviewId, type: "text", body: reviewMessage(starCount(r.starRating), r.comment),
    at: new Date(created).toISOString(),
    botMay: !reply && now - created <= REVIEW_BOT_MAX_AGE_DAYS * 86_400_000,
  }];
  if (reply) {
    const at = Date.parse(r.reviewReply?.updateTime ?? "");
    out.push({
      provider: "greviews", accountId: locationId, userId: r.reviewId, userName: name, direction: "out", own: true,
      messageId: replyMessageKey(r.reviewId), type: "text", body: reply,
      at: new Date(Number.isFinite(at) ? at : created).toISOString(),
    });
  }
  return out;
}
/** The id the clinic's reply to a review is stored under ("gr:re:<review id>") —
 *  the same whether the reply was posted from the CRM or found on Google. */
export const replyMessageKey = (reviewId: string) => `re:${reviewId}`;
