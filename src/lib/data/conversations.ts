import { createClient } from "@/lib/supabase/server";
import type {
  Conversation,
  Contact,
  WhatsappNumber,
  Message,
  Tag,
} from "@/lib/types";

export interface ConversationRow extends Conversation {
  // List views only need the display fields; getConversation returns the full
  // contact (typed loosely here so both fit).
  contact: Pick<Contact, "id" | "wa_id" | "name" | "profile_name"> &
    Partial<Contact>;
  whatsapp_number: Pick<WhatsappNumber, "id" | "display_name" | "phone_display"> &
    Partial<Pick<WhatsappNumber, "phone_number_id">>; // selected by getConversation (bridged-thread detection)
  assignee: { id: string; full_name: string | null } | null;
  last_message: Pick<Message, "body" | "direction" | "created_at"> | null;
  tags: Tag[];
  unread: number;
}

// Shape Supabase returns for the embedded conversation_tags(tags(...)) join.
type TagJoin = { tag: Tag | null } | { tags: Tag | null };
function flattenTags(rows: TagJoin[] | undefined): Tag[] {
  if (!rows) return [];
  return rows
    .map((r) => ("tag" in r ? r.tag : r.tags))
    .filter((t): t is Tag => !!t);
}

/**
 * List conversations for the inbox, newest activity first, each with its
 * latest message preview. Scoped by RLS to authenticated team members.
 */
export async function getConversations(): Promise<ConversationRow[]> {
  const supabase = await createClient();

  const { data: convos, error } = await supabase
    .from("conversations")
    .select(
      `*,
       contact:contacts(id, wa_id, name, profile_name),
       whatsapp_number:whatsapp_numbers(id, display_name, phone_display),
       assignee:profiles!conversations_assigned_to_fkey(id, full_name),
       conversation_tags(tag:tags(*))`,
    )
    .order("last_message_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[data] getConversations:", error.message);
    return [];
  }
  if (!convos?.length) return [];

  // Fetch the most recent message per conversation in one query, map in JS.
  // Capped: the listed conversations are the 200 most recently active, so
  // their previews live in the newest slice of messages — without the cap
  // this query grows unbounded with total message history.
  const ids = convos.map((c) => c.id);
  const { data: msgs } = await supabase
    .from("messages")
    .select("conversation_id, body, direction, created_at")
    .in("conversation_id", ids)
    .order("created_at", { ascending: false })
    .limit(1500);

  const lastByConvo = new Map<string, Pick<Message, "body" | "direction" | "created_at">>();
  for (const m of msgs ?? []) {
    if (!lastByConvo.has(m.conversation_id)) {
      lastByConvo.set(m.conversation_id, {
        body: m.body,
        direction: m.direction,
        created_at: m.created_at,
      });
    }
  }

  // Unread = inbound messages newer than when staff last opened the thread
  // (last_read_at; null = never opened -> everything counts). Counted from the
  // preview slice above, capped for display. Pre-migration (column missing)
  // last_read_at is undefined -> treat as read so nothing misleads.
  const readAt = new Map<string, number>();
  for (const c of convos as unknown as { id: string; last_read_at?: string | null }[]) {
    if ("last_read_at" in c) readAt.set(c.id, c.last_read_at ? Date.parse(c.last_read_at) : 0);
  }
  const unreadByConvo = new Map<string, number>();
  for (const m of msgs ?? []) {
    if (m.direction !== "inbound") continue;
    const seen = readAt.get(m.conversation_id);
    if (seen === undefined) continue; // column not migrated yet
    if (Date.parse(m.created_at) > seen) {
      unreadByConvo.set(m.conversation_id, Math.min((unreadByConvo.get(m.conversation_id) ?? 0) + 1, 99));
    }
  }

  return (convos as unknown as (ConversationRow & { conversation_tags?: TagJoin[] })[]).map(
    (c) => ({
      ...c,
      last_message: lastByConvo.get(c.id) ?? null,
      tags: flattenTags(c.conversation_tags),
      unread: unreadByConvo.get(c.id) ?? 0,
    }),
  );
}

/**
 * Message history for one conversation, oldest first. Capped to the most
 * recent 300 — long-running bot threads accumulate thousands of messages, and
 * fetching + rendering all of them made opening a thread slow (especially on
 * phones). 300 covers weeks of a busy chat; older history stays in the DB.
 */
const THREAD_MESSAGE_LIMIT = 300;

export async function getMessages(conversationId: string): Promise<Message[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(THREAD_MESSAGE_LIMIT);
  if (error) {
    console.error("[data] getMessages:", error.message);
    return [];
  }
  return (data as Message[]).reverse();
}

/** One conversation with contact + number, for the thread header. */
export async function getConversation(
  conversationId: string,
): Promise<ConversationRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select(
      `*,
       contact:contacts(*),
       whatsapp_number:whatsapp_numbers(id, display_name, phone_display, phone_number_id),
       assignee:profiles!conversations_assigned_to_fkey(id, full_name),
       conversation_tags(tag:tags(*))`,
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as ConversationRow & {
    conversation_tags?: TagJoin[];
  };
  return {
    ...row,
    last_message: null,
    tags: flattenTags(row.conversation_tags),
    unread: 0,
  };
}
