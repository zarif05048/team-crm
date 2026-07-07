"use client";

import { useEffect } from "react";
import { markConversationRead } from "@/app/(app)/inbox/[id]/actions";

/**
 * Marks the open conversation as read — on first view and again whenever a
 * new message lands while the thread is on screen (lastMessageAt changes on
 * each realtime refresh), so an open thread never counts as unread.
 */
export function MarkRead({
  conversationId,
  lastMessageAt,
}: {
  conversationId: string;
  lastMessageAt: string | null;
}) {
  useEffect(() => {
    markConversationRead(conversationId).catch(() => {});
  }, [conversationId, lastMessageAt]);

  return null;
}
