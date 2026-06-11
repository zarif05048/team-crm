// Domain types mirroring supabase/schema.sql.

export type Role = "admin" | "agent";
export type ConversationStatus = "open" | "closed";
export type LeadStage = "new" | "contacted" | "qualified" | "won" | "lost";
export type MessageDirection = "inbound" | "outbound";
export type MessageType =
  | "text"
  | "image"
  | "document"
  | "audio"
  | "video"
  | "template";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  created_at: string;
}

export interface WhatsappNumber {
  id: string;
  phone_number_id: string;
  waba_id: string | null;
  display_name: string;
  phone_display: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Contact {
  id: string;
  wa_id: string;
  name: string | null;
  profile_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  contact_id: string;
  whatsapp_number_id: string;
  assigned_to: string | null;
  status: ConversationStatus;
  stage: LeadStage;
  last_message_at: string;
  last_inbound_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  wa_message_id: string | null;
  direction: MessageDirection;
  type: MessageType;
  body: string | null;
  media_url: string | null;
  status: string | null;
  sent_by: string | null;
  created_at: string;
}

export interface Note {
  id: string;
  conversation_id: string;
  author_id: string | null;
  body: string;
  mentions: string[];
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface CannedReply {
  id: string;
  title: string;
  body: string;
  created_by: string | null;
  created_at: string;
}

// Convenience: a conversation row joined with contact + number for list views.
export interface ConversationListItem extends Conversation {
  contact: Contact;
  whatsapp_number: WhatsappNumber;
  assignee: Pick<Profile, "id" | "full_name"> | null;
}

export const STAGE_LABELS: Record<LeadStage, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
};

export const STAGE_ORDER: LeadStage[] = [
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
];

/** WhatsApp lets you free-text a customer only within 24h of their last message. */
export const WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWindowOpen(lastInboundAt: string | null): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < WINDOW_MS;
}
