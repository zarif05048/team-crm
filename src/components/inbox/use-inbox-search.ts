"use client";

import { useEffect, useMemo, useState } from "react";
import { searchInbox } from "@/app/(app)/inbox/actions";
import { phoneCandidates } from "@/lib/search";
import type {
  ConversationListRow,
  MessageHit,
} from "@/lib/data/conversations";

/**
 * WhatsApp-style inbox search: find a chat by the person's name, their phone
 * number, a tag, or something that was actually said in the conversation.
 *
 * Three layers, because the inbox list only holds the newest 200 conversations:
 *
 *  1. those loaded rows are filtered in the browser on every keystroke —
 *     instant, and free (no Supabase egress, which every realtime refresh
 *     already taxes);
 *  2. a debounced server search finds chats OLDER than those 200, by name /
 *     profile name / phone;
 *  3. the same round trip searches the TEXT of every message (3 characters
 *     minimum — that is what the pg_trgm index can serve).
 *
 * Each layer is returned separately so the UI can label where a result came
 * from, and anything already on screen is filtered out of the server results.
 */

const MIN_SERVER_QUERY = 2;
const DEBOUNCE_MS = 300;

export interface InboxSearchResult {
  /** Matches among the conversations already loaded. */
  loaded: ConversationListRow[];
  /** Older chats found on the server, never duplicating `loaded`. */
  older: ConversationListRow[];
  /** Messages whose text matched, newest first. */
  messages: MessageHit[];
  searching: boolean;
}

/** Everything about a conversation that the client-side filter looks at. */
function haystack(c: ConversationListRow): string {
  return [
    c.contact.name,
    c.contact.profile_name,
    c.contact.wa_id,
    c.last_message?.body,
    c.assignee?.full_name,
    ...c.tags.map((t) => t.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

interface ServerResult {
  query: string;
  conversations: ConversationListRow[];
  messages: MessageHit[];
}

const NO_RESULT: ServerResult = { query: "", conversations: [], messages: [] };

export function useInboxSearch(
  conversations: ConversationListRow[],
  rawQuery: string,
): InboxSearchResult {
  const query = rawQuery.trim().toLowerCase();
  // Results are stored WITH the query they answer, so "are we still searching?"
  // is derived rather than tracked — no stale spinner if a request is dropped.
  const [result, setResult] = useState<ServerResult>(NO_RESULT);

  const loaded = useMemo(() => {
    if (!query) return conversations;
    const phones = phoneCandidates(query);
    return conversations.filter((c) => {
      const text = haystack(c);
      if (text.includes(query)) return true;
      return phones.some((p) => c.contact.wa_id.includes(p));
    });
  }, [conversations, query]);

  useEffect(() => {
    if (query.length < MIN_SERVER_QUERY) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await searchInbox(query);
        if (!cancelled) setResult({ query, ...found });
      } catch (err) {
        console.error("[inbox] search failed:", err);
        // Record the failure against this query so the UI stops waiting.
        if (!cancelled) setResult({ ...NO_RESULT, query });
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const fresh = result.query === query;
  const onScreen = useMemo(() => new Set(loaded.map((c) => c.id)), [loaded]);
  const older = useMemo(
    () =>
      fresh ? result.conversations.filter((c) => !onScreen.has(c.id)) : [],
    [fresh, result.conversations, onScreen],
  );

  return {
    loaded,
    older,
    messages: fresh ? result.messages : [],
    searching: query.length >= MIN_SERVER_QUERY && !fresh,
  };
}
