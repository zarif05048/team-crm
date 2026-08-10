"use client";

import { useEffect, useMemo, useState } from "react";
import { searchInbox } from "@/app/(app)/inbox/actions";
import { phoneCandidates } from "@/lib/search";
import type { ConversationListRow } from "@/lib/data/conversations";

/**
 * WhatsApp-style inbox search: find a chat by the person's name, their phone
 * number, the last message, or a tag.
 *
 * Two layers, because the inbox list only holds the newest 200 conversations:
 *
 *  1. the loaded rows are filtered in the browser on every keystroke — instant,
 *     and free (no Supabase egress, which every realtime refresh already taxes);
 *  2. a debounced server search covers everyone OLDER than those 200, by name /
 *     profile name / phone only. Its results are returned separately so the UI
 *     can label them, and anything already on screen is filtered out.
 */

const MIN_SERVER_QUERY = 2;
const DEBOUNCE_MS = 300;

export interface InboxSearchResult {
  /** Matches among the conversations already loaded. */
  loaded: ConversationListRow[];
  /** Older chats found on the server, never duplicating `loaded`. */
  older: ConversationListRow[];
  searching: boolean;
}

/** Everything about a conversation that the inbox search looks at. */
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

export function useInboxSearch(
  conversations: ConversationListRow[],
  rawQuery: string,
): InboxSearchResult {
  const query = rawQuery.trim().toLowerCase();
  // Results are stored WITH the query they answer, so "are we still searching?"
  // is derived rather than tracked — no stale spinner if a request is dropped.
  const [result, setResult] = useState<{
    query: string;
    rows: ConversationListRow[];
  }>({ query: "", rows: [] });

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
        const rows = await searchInbox(query);
        if (!cancelled) setResult({ query, rows });
      } catch (err) {
        console.error("[inbox] search failed:", err);
        // Record the failure against this query so the UI stops waiting.
        if (!cancelled) setResult({ query, rows: [] });
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const onScreen = useMemo(() => new Set(loaded.map((c) => c.id)), [loaded]);
  const older = useMemo(
    () =>
      result.query === query
        ? result.rows.filter((c) => !onScreen.has(c.id))
        : [],
    [result, query, onScreen],
  );

  return {
    loaded,
    older,
    searching: query.length >= MIN_SERVER_QUERY && result.query !== query,
  };
}
