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

export type SocialProvider = "facebook" | "tiktok";
export type SocialClinic = "dungun" | "paka";

export const SOCIAL = {
  facebook: {
    prefix: "fb:", label: "Facebook", app: "Facebook Messenger", tag: "facebook", color: "#1877f2",
    /** Meta: free replies within 24 hours of the person's last message. */
    windowHours: 24,
    /** Messenger refuses a text over 2,000 characters. */
    maxText: 2000,
  },
  tiktok: {
    prefix: "tt:", label: "TikTok", app: "TikTok messages", tag: "tiktok", color: "#111827",
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

/** Which provider an id (a line's phone_number_id, a contact's wa_id, a message id) belongs to. */
export function providerOf(id: string | null | undefined): SocialProvider | null {
  if (!id) return null;
  if (id.startsWith(SOCIAL.facebook.prefix)) return "facebook";
  if (id.startsWith(SOCIAL.tiktok.prefix)) return "tiktok";
  return null;
}
export const isSocial = (id: string | null | undefined) => providerOf(id) !== null;

/** "fb:dungun:1234567890" */
export const lineId = (provider: SocialProvider, clinic: SocialClinic, externalId: string) =>
  `${SOCIAL[provider].prefix}${clinic}:${externalId}`;
/** "fb:<psid>" / "tt:<conversation id>" */
export const contactId = (provider: SocialProvider, userId: string) => `${SOCIAL[provider].prefix}${userId}`;
/** "fb:<mid>" / "tt:<message id>" */
export const messageId = (provider: SocialProvider, id: string) => `${SOCIAL[provider].prefix}${id}`;
/** The provider's own id back out of a contact / message id. */
export const bareId = (id: string) => id.slice(id.indexOf(":") + 1);
export const lineName = (provider: SocialProvider, clinic: SocialClinic) =>
  `${SOCIAL[provider].label} · ${CLINICS[clinic].branch}`;

export interface SocialLine {
  provider: SocialProvider;
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
  return { provider, clinic, externalId, branch: CLINICS[clinic].branch, clinicName: CLINICS[clinic].clinic };
}

/** Whether a reply may still be sent: inside the provider's window since the person last wrote. */
export function socialWindowOpen(provider: SocialProvider, lastInboundAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastInboundAt) return false;
  return now - new Date(lastInboundAt).getTime() < SOCIAL[provider].windowHours * 3_600_000;
}
/** What staff read when the window has closed — no template can reopen these. */
export function windowClosedNote(provider: SocialProvider): string {
  const s = SOCIAL[provider];
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
  const s = SOCIAL[line.provider];
  return (
    `CHANNEL: this is the ${s.app} inbox of ${line.clinicName} — NOT WhatsApp. ` +
    `The person wrote to the clinic's ${s.label} ${line.provider === "facebook" ? "page" : "account"}; no phone number is known and their profile name does not prove who they are. Assume they are asking about the ${line.branch} branch unless they say otherwise. ` +
    `Their messages are already saved in the CRM and staff can reply in this same chat, but only within ${s.windowHours} hours of the person's last message. ` +
    `So for a booking, or anything staff must follow up later, politely ask for a contact phone number as well (say staff may call or WhatsApp them) — but still record the request if they prefer not to give one. ` +
    `Do not tell them to "reply on WhatsApp" as if they were already there; they can keep chatting right here. Plain text only: no markdown tables, and keep each reply well under ${s.maxText} characters.`
  );
}
