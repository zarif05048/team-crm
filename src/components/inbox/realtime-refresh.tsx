"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to Postgres changes on messages/conversations via Supabase
 * Realtime and refreshes the server components when anything changes — so the
 * conversation list and the open thread update live without a page reload.
 *
 * We attach the user's access token to the realtime socket BEFORE subscribing;
 * otherwise the socket connects anonymously and RLS blocks the change events.
 *
 * Battery/data care (staff use this on phones all day):
 * - While the app is hidden (screen off, another app in front) we never
 *   refresh — changes just mark the view dirty and ONE catch-up refresh runs
 *   the moment the app comes back. Refreshing a hidden tab burns radio and
 *   battery for pixels nobody sees.
 * - Realtime can occasionally miss an event (socket drop, auth expiry), so a
 *   polling safety net backs it up — but it stays slow (every 5 min) while the
 *   realtime channel is healthy, and only speeds up to every 60s when the
 *   channel is down. The focus-refresh covers the common case anyway.
 *
 * Egress care (free-tier Supabase quota):
 * - `conversations` is subscribed unfiltered because any thread's new message
 *   reorders the list — but the row is small, and the trigger that maintains
 *   the preview columns makes it the ONE event per message.
 * - `messages` and `notes` are subscribed ONLY for the thread currently open.
 *   Realtime ships the whole row to every subscriber, so an unfiltered messages
 *   subscription sent a copy of every message body to every staff device all
 *   day. The list doesn't need them — the conversations event covers it.
 */
const TICK_MS = 60_000; // how often the safety net wakes up to decide
const DOWN_POLL_MS = 60_000; // refresh cadence while realtime is broken
const HEALTHY_POLL_MS = 300_000; // refresh cadence while realtime is live
// Bursts are the norm — an inbound message and the bot's reply land seconds
// apart — so coalesce generously. Each refresh is a round of server queries.
const COALESCE_MS = 2_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function RealtimeRefresh() {
  const router = useRouter();
  // The open thread, if we're on /inbox/<id>. Null on the inbox root and on
  // the pipeline board, where no thread is rendered.
  const pathname = usePathname();
  const m = /^\/inbox\/([^/]+)/.exec(pathname ?? "");
  const openThreadId = m && UUID_RE.test(m[1]) ? m[1] : null;

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pending: ReturnType<typeof setTimeout> | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let connected = false; // realtime channel healthy?
    let dirty = false; // change arrived while hidden — catch up on return
    let lastRefresh = Date.now();

    const doRefresh = () => {
      dirty = false;
      lastRefresh = Date.now();
      router.refresh();
    };

    // Coalesce bursts of changes into a single refresh; never refresh while
    // hidden — just remember that we need to.
    const refresh = () => {
      if (document.visibilityState === "hidden") {
        dirty = true;
        return;
      }
      if (pending) clearTimeout(pending);
      pending = setTimeout(doRefresh, COALESCE_MS);
    };

    const startPolling = () => {
      if (poll) return;
      poll = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        const cadence = connected ? HEALTHY_POLL_MS : DOWN_POLL_MS;
        if (Date.now() - lastRefresh >= cadence) doRefresh();
      }, TICK_MS);
    };
    const stopPolling = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Catch up immediately on return — a change arrived while hidden, or
        // we've been away long enough that realtime may have silently dropped.
        if (dirty || Date.now() - lastRefresh >= DOWN_POLL_MS) doRefresh();
        startPolling();
      } else {
        stopPolling();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    startPolling();

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase.channel(
        openThreadId ? `inbox-realtime:${openThreadId}` : "inbox-realtime",
      );

      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        refresh,
      );

      if (openThreadId) {
        channel
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "messages",
              filter: `conversation_id=eq.${openThreadId}`,
            },
            refresh,
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "notes",
              filter: `conversation_id=eq.${openThreadId}`,
            },
            refresh,
          );
      }

      channel.subscribe((status) => {
        connected = status === "SUBSCRIBED";
        // Visible in the browser console for debugging.
        console.log("[realtime] inbox channel:", status);
      });
    })();

    return () => {
      cancelled = true;
      if (pending) clearTimeout(pending);
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
      if (channel) supabase.removeChannel(channel);
    };
    // Re-subscribing on thread change is deliberate: the messages/notes filters
    // are bound to the thread that's open.
  }, [router, openThreadId]);

  return null;
}
