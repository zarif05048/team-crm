// Sending on a Messenger or TikTok line. Called by lib/whatsapp/send.ts for
// any line whose id says it is one, so the bot's and the staff's send paths
// are the same code as for WhatsApp.
import { accessTokenFor, noteAccountError } from "./accounts";
import { SOCIAL, bareId, chunkText, messageId, socialLineOf } from "./lines";
import { sendFacebookMessage } from "./facebook";
import { sendTikTokImage, sendTikTokText } from "./tiktok";

export interface SocialSendResult { ok: boolean; waMessageId?: string; error?: string }
export type SocialPayload = { kind: "text"; body: string } | { kind: "image"; link: string; caption?: string };

/** `to` is the contact's wa_id ("fb:<psid>" / "tt:<conversation id>"). */
export async function sendSocial(phoneNumberId: string, to: string, payload: SocialPayload): Promise<SocialSendResult> {
  const line = socialLineOf(phoneNumberId);
  if (!line) return { ok: false, error: "Not a Facebook or TikTok line." };
  const s = SOCIAL[line.provider];
  let token: string;
  try { token = await accessTokenFor(line.provider, line.externalId); }
  catch (e) { return { ok: false, error: (e as Error).message }; }
  const target = bareId(to);

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
