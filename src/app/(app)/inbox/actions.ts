"use server";

import { createClient } from "@/lib/supabase/server";
import {
  searchConversations,
  searchMessages,
  type ConversationListRow,
  type MessageHit,
} from "@/lib/data/conversations";

export interface InboxSearchResults {
  /** Chats matched by the person: name, profile name, phone. */
  conversations: ConversationListRow[];
  /** Individual messages whose TEXT matched. */
  messages: MessageHit[];
}

/**
 * Inbox search, server half. Two things the browser cannot do over the loaded
 * list: chats older than the newest 200 it holds, and the text of every message
 * ever sent (see searchMessages — needs the pg_trgm migration).
 */
export async function searchInbox(query: string): Promise<InboxSearchResults> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { conversations: [], messages: [] };

  const [conversations, messages] = await Promise.all([
    searchConversations(query),
    searchMessages(query),
  ]);
  return { conversations, messages };
}
