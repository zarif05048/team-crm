"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { notifyInboxChange } from "@/components/inbox/realtime-refresh";
import type { Message } from "@/lib/types";
import type { NoteWithAuthor } from "@/lib/data/notes";

/**
 * Paint new messages and notes in the OPEN thread the moment Realtime delivers
 * them, from the payload itself.
 *
 * Before this, every incoming message went: realtime event → router.refresh()
 * → the whole route re-queried in Singapore → RSC payload back → repaint. That
 * is a second or more of "nothing is happening" on every message, on top of the
 * 2s burst-coalescing delay. The row is already in the event, so we render it
 * immediately and let the refresh follow at its own pace to reconcile the rest
 * (delivery ticks, conversation list order, unread badges).
 *
 * Merge rule: the SERVER's copy always wins for rows it already has — a refresh
 * happens after our event, so its row is at least as fresh. Live rows only fill
 * in what the server hasn't caught up with yet, which is exactly the message
 * that just arrived.
 *
 * This is also where the thread's messages/notes subscriptions live now (they
 * used to be in RealtimeRefresh). Keep them in ONE place: Realtime ships whole
 * rows to every subscriber, so a second subscription would double the egress
 * for every message on every open device.
 */

interface LiveRows {
  /** Which conversation these rows belong to — stale ones are ignored. */
  conversationId: string;
  messages: Record<string, Message>;
  notes: Record<string, NoteWithAuthor>;
}

const EMPTY: Pick<LiveRows, "messages" | "notes"> = { messages: {}, notes: {} };

export function useThreadRealtime(
  conversationId: string,
  serverMessages: Message[],
  serverNotes: NoteWithAuthor[],
): { messages: Message[]; notes: NoteWithAuthor[] } {
  const [live, setLive] = useState<LiveRows>(() => ({
    conversationId,
    ...EMPTY,
  }));

  // Rows from a thread we've navigated away from are dropped on read, so
  // switching conversations needs no state reset.
  const current = live.conversationId === conversationId ? live : EMPTY;

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    type Payload = { eventType: string; new: unknown; old: unknown };

    const apply = (key: "messages" | "notes") => (payload: Payload) => {
      setLive((prev) => {
        const base =
          prev.conversationId === conversationId
            ? prev
            : { conversationId, ...EMPTY };
        const rows = { ...base[key] } as Record<string, { id: string }>;
        if (payload.eventType === "DELETE") {
          const gone = (payload.old as { id?: string } | null)?.id;
          if (!gone || !(gone in rows)) return prev;
          delete rows[gone];
        } else {
          const row = payload.new as { id?: string } | null;
          if (!row?.id) return prev;
          rows[row.id] = row as { id: string };
        }
        return { ...base, [key]: rows };
      });
      // Let the shared refresher reconcile the rest of the UI on its own
      // schedule (list preview, unread counts, delivery ticks).
      notifyInboxChange();
    };

    (async () => {
      // RLS applies to the realtime socket too — authenticate before subscribing.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase
        .channel(`thread:${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          apply("messages"),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notes",
            filter: `conversation_id=eq.${conversationId}`,
          },
          apply("notes"),
        )
        .subscribe((status) => {
          console.log(`[realtime] thread ${conversationId}:`, status);
        });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const messages = useMemo(
    () => merge(serverMessages, current.messages),
    [serverMessages, current.messages],
  );
  const notes = useMemo(
    () => merge(serverNotes, current.notes),
    [serverNotes, current.notes],
  );
  return { messages, notes };
}

/** Server rows, plus any live row the server hasn't returned yet. */
function merge<T extends { id: string; created_at: string }>(
  server: T[],
  live: Record<string, T>,
): T[] {
  const known = new Set(server.map((r) => r.id));
  const extra = Object.values(live).filter((r) => !known.has(r.id));
  if (extra.length === 0) return server;
  return [...server, ...extra].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
}
