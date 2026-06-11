// Types for the subset of the Meta WhatsApp Cloud API webhook payload we use.
// Full reference: developers.facebook.com/docs/whatsapp/cloud-api/webhooks

export interface WaWebhookBody {
  object: string;
  entry: WaEntry[];
}

export interface WaEntry {
  id: string; // WABA id
  changes: WaChange[];
}

export interface WaChange {
  field: string; // "messages"
  value: WaValue;
}

export interface WaValue {
  messaging_product: "whatsapp";
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WaContact[];
  messages?: WaMessage[];
  statuses?: WaStatus[];
}

export interface WaContact {
  wa_id: string;
  profile: { name: string };
}

export interface WaMessage {
  from: string; // customer wa_id
  id: string; // wamid...
  timestamp: string; // unix seconds (string)
  type: WaMessageType;
  text?: { body: string };
  image?: WaMedia;
  document?: WaMedia & { filename?: string };
  audio?: WaMedia;
  video?: WaMedia;
  sticker?: WaMedia;
  button?: { text: string; payload: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
}

export type WaMessageType =
  | "text"
  | "image"
  | "document"
  | "audio"
  | "video"
  | "sticker"
  | "button"
  | "interactive"
  | "unsupported";

export interface WaMedia {
  id: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
}

export interface WaStatus {
  id: string; // wamid of the outbound message
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: { code: number; title: string; message?: string }[];
}

/** Map a WhatsApp message type to our DB message.type + a human-readable body. */
export function extractContent(msg: WaMessage): {
  type: string;
  body: string;
} {
  switch (msg.type) {
    case "text":
      return { type: "text", body: msg.text?.body ?? "" };
    case "image":
      return { type: "image", body: msg.image?.caption ?? "📷 Photo" };
    case "video":
      return { type: "video", body: msg.video?.caption ?? "🎥 Video" };
    case "document":
      return {
        type: "document",
        body: msg.document?.filename ?? "📄 Document",
      };
    case "audio":
      return { type: "audio", body: "🎙️ Voice message" };
    case "sticker":
      return { type: "image", body: "Sticker" };
    case "button":
      return { type: "text", body: msg.button?.text ?? "" };
    case "interactive":
      return {
        type: "text",
        body:
          msg.interactive?.button_reply?.title ??
          msg.interactive?.list_reply?.title ??
          "",
      };
    default:
      return { type: "text", body: "[Unsupported message type]" };
  }
}
