// Facebook Messenger and TikTok direct messages in the inbox (owner, 12 Nov
// 2026: "connect team crm with tiktok … and also fb pages dungun and paka").
//
// They ride on the existing tables, the same way the Google web chat does
// (lib/webchat.ts) and the clinic bot lines do with "unofficial:":
//   · each connected account is a row in whatsapp_numbers whose
//     phone_number_id is "fb:<clinic>:<page id>" / "tt:<clinic>:<business id>"
//     — the clinic is IN the id, so the bot and the screens know the branch
//     without another query
//   · each person is a contact whose wa_id is "fb:<their page-scoped id>" /
//     "tt:<the TikTok conversation id>" — exactly what a reply is addressed to
//   · each message's wa_message_id is "fb:<mid>" / "tt:<message id>", so a
//     webhook Meta or TikTok sends twice is one message
// The accounts' tokens are in channel_accounts (lib/social/accounts.ts), never
// here and never in the browser.
//
// This file is pure — no database, no network — so the screens, the bot and
// the tests can all read it.

/** Whose account a line runs on — what channel_accounts holds a token for. */
export type SocialProvider = "facebook" | "tiktok";
/** A kind of inbox line: Messenger, the comments under a page's posts (owner,
 *  12 Nov 2026: "yes add comments too"), or TikTok messages. Comments run on
 *  the same Facebook page connection as Messenger. */
export type SocialChannel = SocialProvider | "fbcomments";
export type SocialClinic = "dungun" | "paka";

export const SOCIAL = {
  facebook: {
    account: "facebook", prefix: "fb:", label: "Facebook", app: "Facebook Messenger", tag: "facebook", color: "#1877f2",
    /** Meta: free replies within 24 hours of the person's last message. */
    windowHours: 24,
    /** Messenger refuses a text over 2,000 characters. */
    maxText: 2000,
  },
  /* A comment is answered by ONE private Messenger message (Facebook allows
     one per comment, within 7 days of it) and/or a public reply under it. */
  fbcomments: {
    account: "facebook", prefix: "fbc:", label: "Facebook Comments", app: "Facebook post comments", tag: "facebook-comment", color: "#4267b2",
    windowHours: 7 * 24,
    maxText: 2000,
  },
  tiktok: {
    account: "tiktok", prefix: "tt:", label: "TikTok", app: "TikTok messages", tag: "tiktok", color: "#111827",
    /** TikTok: replies within 48 hours of the person's last message. */
    windowHours: 48,
    maxText: 2000,
  },
} as const;

export const CLINICS = {
  dungun: { branch: "Dungun", clinic: "Klinik Hijraa 24 Jam Dungun" },
  paka: { branch: "Paka", clinic: "Klinik Hijraa 24 Jam Paka" },
} as const;

export const isSocialClinic = (s: unknown): s is SocialClinic => s === "dungun" || s === "paka";

/** Which channel an id (a line's phone_number_id, a contact's wa_id, a message id) belongs to. */
export function providerOf(id: string | null | undefined): SocialChannel | null {
  if (!id) return null;
  if (id.startsWith(SOCIAL.fbcomments.prefix)) return "fbcomments";
  if (id.startsWith(SOCIAL.facebook.prefix)) return "facebook";
  if (id.startsWith(SOCIAL.tiktok.prefix)) return "tiktok";
  return null;
}
export const isSocial = (id: string | null | undefined) => providerOf(id) !== null;

/** "fb:dungun:1234567890" */
export const lineId = (provider: SocialChannel, clinic: SocialClinic, externalId: string) =>
  `${SOCIAL[provider].prefix}${clinic}:${externalId}`;
/** "fb:<psid>" / "tt:<conversation id>" */
export const contactId = (provider: SocialChannel, userId: string) => `${SOCIAL[provider].prefix}${userId}`;
/** "fb:<mid>" / "tt:<message id>" */
export const messageId = (provider: SocialChannel, id: string) => `${SOCIAL[provider].prefix}${id}`;
/** The provider's own id back out of a contact / message id. */
export const bareId = (id: string) => id.slice(id.indexOf(":") + 1);
export const lineName = (provider: SocialChannel, clinic: SocialClinic) =>
  `${SOCIAL[provider].label} · ${CLINICS[clinic].branch}`;

export interface SocialLine {
  provider: SocialChannel;
  /** whose connection it runs on (comments: the Facebook page) */
  account: SocialProvider;
  clinic: SocialClinic;
  /** the Facebook page id / the TikTok business account id */
  externalId: string;
  branch: string;
  clinicName: string;
}
/** A line's phone_number_id taken apart; null for WhatsApp, web chat and bot lines. */
export function socialLineOf(phoneNumberId: string | null | undefined): SocialLine | null {
  const provider = providerOf(phoneNumberId);
  if (!provider || !phoneNumberId) return null;
  const rest = phoneNumberId.slice(SOCIAL[provider].prefix.length);
  const at = rest.indexOf(":");
  const clinic = rest.slice(0, at);
  const externalId = rest.slice(at + 1);
  if (at < 1 || !isSocialClinic(clinic) || !externalId) return null;
  return { provider, account: SOCIAL[provider].account, clinic, externalId, branch: CLINICS[clinic].branch, clinicName: CLINICS[clinic].clinic };
}

/** Whether a reply may still be sent: inside the provider's window since the person last wrote. */
export function socialWindowOpen(provider: SocialChannel, lastInboundAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastInboundAt) return false;
  return now - new Date(lastInboundAt).getTime() < SOCIAL[provider].windowHours * 3_600_000;
}
/** What staff read when the window has closed — no template can reopen these. */
export function windowClosedNote(provider: SocialChannel): string {
  const s = SOCIAL[provider];
  if (provider === "fbcomments") {
    return "Facebook only allows a private message about a comment within 7 days of it, and that time has passed. " +
      "Switch to Public reply to answer under the comment, or leave an Internal note.";
  }
  return `${s.label} only allows a reply within ${s.windowHours} hours of the person's last message, and that time has passed. ` +
    `The chat reopens by itself when they message again — until then, leave an Internal note or reach them another way.`;
}

/** A long reply as pieces the provider accepts, cut at a paragraph, a line or a space. */
export function chunkText(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const head = rest.slice(0, max);
    let cut = head.lastIndexOf("\n\n");
    if (cut < max * 0.5) cut = head.lastIndexOf("\n");
    if (cut < max * 0.5) cut = head.lastIndexOf(" ");
    if (cut < max * 0.5) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Facebook pages are matched to a clinic by their name. */
export function clinicFromName(name: string | null | undefined): SocialClinic | null {
  const n = (name ?? "").toLowerCase();
  if (n.includes("paka")) return "paka";
  if (n.includes("dungun")) return "dungun";
  return null;
}

/** A line for the bot's system prompt when the thread is Messenger or TikTok. */
export function socialChatNote(phoneNumberId: string | null | undefined): string | null {
  const line = socialLineOf(phoneNumberId);
  if (!line) return null;
  if (line.provider === "fbcomments") {
    return (
      `CHANNEL: these are PUBLIC COMMENTS the person wrote under a post on the Facebook page of ${line.clinicName} — NOT WhatsApp, and not a private chat. ` +
      `Your reply is sent to them as ONE PRIVATE Messenger message (Facebook allows only one per comment) AND the same words are posted PUBLICLY under their comment, for everyone reading the post. ` +
      `So write ONE short, complete message: answer what they asked (prices, opening hours, how to book), then invite them to reply in Messenger to continue. Assume the ${line.branch} branch unless they say otherwise. ` +
      `Because it is public, keep it to what anyone may read: services, prices, hours, how to book. Never mention their health, symptoms, name, phone or IC, even if they wrote them. Do not send leaflets or several messages; no markdown.`
    );
  }
  const s = SOCIAL[line.provider];
  return (
    `CHANNEL: this is the ${s.app} inbox of ${line.clinicName} — NOT WhatsApp. ` +
    `The person wrote to the clinic's ${s.label} ${line.provider === "facebook" ? "page" : "account"}; no phone number is known and their profile name does not prove who they are. Assume they are asking about the ${line.branch} branch unless they say otherwise. ` +
    `Their messages are already saved in the CRM and staff can reply in this same chat, but only within ${s.windowHours} hours of the person's last message. ` +
    `So for a booking, or anything staff must follow up later, politely ask for a contact phone number as well (say staff may call or WhatsApp them) — but still record the request if they prefer not to give one. ` +
    `Do not tell them to "reply on WhatsApp" as if they were already there; they can keep chatting right here. Plain text only: no markdown tables, and keep each reply well under ${s.maxText} characters.`
  );
}

/* Which comments the bot answers. A post's comments are mostly not questions:
   friends tagged, "nice", emojis, "amin". The bot replies privately, and Facebook
   allows that once per comment — spent on "mantap" it would be noise in a
   stranger's inbox. So only a comment that asks something, or names something
   the clinic sells, gets the bot; every comment still lands in the inbox. */
const ENQUIRY = /\?|\b(harga|berapa|brp|price|cost|kos|caj|nak|mahu|mau|boleh|bole|buka|open|slot|book|booking|tempah|appointment|temujanji|pm|dm|inbox|info|details?|macam\s*mana|camne|bila|when|where|mana|how|ada\s*tak|ada\s*x|available|pakej|package|promo|sunat|berkhatan|khatan|vaksin|vaccine|cyst|ketumbuhan|kurus|berat|slim|mounjaro|ozempic|scan|ultrasound|x-?ray|saringan|screening|ujian)\b/i;
export function isEnquiryComment(text: string | null | undefined): boolean {
  const t = (text ?? "").replace(/@\[[^\]]*\]|@\S+/g, " ").trim();   // tagged friends are not words
  if (!/[a-zÀ-ɏ]{2,}/i.test(t)) return false;              // emoji / punctuation only
  return ENQUIRY.test(t);
}
