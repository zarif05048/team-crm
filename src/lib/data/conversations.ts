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

// Columns the list actually renders. Spelled out rather than `*` because this
// query runs on every realtime event for every open staff device — see the
// egress note on getConversations.
const LIST_COLUMNS =
  "id, contact_id, whatsapp_number_id, assigned_to, status, stage, bot_enabled, " +
  "last_message_at, last_inbound_at, last_message_body, last_message_direction, " +
  "unread_count, created_at";

/**
 * List conversations for the inbox, newest activity first, each with its
 * latest message preview. Scoped by RLS to authenticated team members.
 *
 * Egress-sensitive. Every realtime change refreshes this route on every open
 * staff device, so this query's size is multiplied by (events x devices) and
 * used to dominate the project's Supabase egress. It used to pull the newest
 * 1,500 `messages` rows to derive each row's preview and unread badge; those
 * now live on the conversation itself, maintained by the
 * `messages_touch_conversation` trigger. Keep this to one small query.
 *
 * REQUIRES migration 2026-07-26_conversation_preview.sql. PostgREST rejects the
 * whole select if a listed column is missing, so run it BEFORE deploying this —
 * an un-migrated database returns an empty inbox, not a degraded one.
 */
export async function getConversations(): Promise<ConversationRow[]> {
  const supabase = await createClient();

  const { data: convos, error } = await supabase
    .from("conversations")
    .select(
      `${LIST_COLUMNS},
       contact:contacts(id, wa_id, name, profile_name),
       whatsapp_number:whatsapp_numbers(id, display_name, phone_display),
       assignee:profiles!conversations_assigned_to_fkey(id, full_name),
       conversation_tags(tag:tags(id, name, color))`,
    )
    .order("last_message_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[data] getConversations:", error.message);
    return [];
  }
  if (!convos?.length) return [];

  type ListRow = ConversationRow & {
    conversation_tags?: TagJoin[];
    last_message_body?: string | null;
    last_message_direction?: string | null;
    unread_count?: number | null;
  };

  return (convos as unknown as ListRow[]).map((c) => ({
    ...c,
    // A thread with no messages yet has no preview.
    last_message:
      c.last_message_direction == null
        ? null
        : {
            body: c.last_message_body ?? "",
            direction: c.last_message_direction as Message["direction"],
            created_at: c.last_message_at,
          },
    tags: flattenTags(c.conversation_tags),
    unread: c.unread_count ?? 0,
  }));
}

/**
 * Message history for one conversation, oldest first. Capped to the most
 * recent 300 — long-running bot threads accumulate thousands of messages, and
 * fetching + rendering all of them made opening a thread slow (especially on
 * phones). 300 covers weeks of a busy chat; older history stays in the DB.
 */
const THREAD_MESSAGE_LIMIT = 300;

// Everything the timeline renders. `wa_message_id` and `sent_by` are omitted —
// nothing displays them, and 300 Meta message ids is pure wire weight on a
// query that re-runs on every refresh.
const THREAD_COLUMNS =
  "id, conversation_id, direction, type, body, media_url, status, sent_by_bot, created_at";

export async function getMessages(conversationId: string): Promise<Message[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select(THREAD_COLUMNS)
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
