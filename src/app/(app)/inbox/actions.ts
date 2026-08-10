"use server";

import { createClient } from "@/lib/supabase/server";
import {
  searchConversations,
  type ConversationListRow,
} from "@/lib/data/conversations";

/**
 * Inbox search fallback: find chats that aren't in the newest 200 the list
 * already loaded. The search box filters the loaded ones on the client (no
 * egress, instant) and calls this only for what it can't find there.
 */
export async function searchInbox(
  query: string,
): Promise<ConversationListRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return searchConversations(query);
}
