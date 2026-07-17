"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
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
 */
const TICK_MS = 60_000; // how often the safety net wakes up to decide
const DOWN_POLL_MS = 60_000; // refresh cadence while realtime is broken
const HEALTHY_POLL_MS = 300_000; // refresh cadence while realtime is live

export function RealtimeRefresh() {
  const router = useRouter();

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
      pending = setTimeout(doRefresh, 250);
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

      channel = supabase
        .channel("inbox-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages" },
          refresh,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "conversations" },
          refresh,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notes" },
          refresh,
        )
        .subscribe((status) => {
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
  }, [router]);

  return null;
}
