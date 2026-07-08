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
 * Realtime can occasionally miss an event (socket drop, auth expiry, a table
 * not in the publication), so a message could land late. Two safety nets back
 * it up: a refresh every 60s, and an immediate refresh whenever the tab regains
 * focus (the moment staff look back at the inbox). The interval pauses while the
 * tab is hidden to avoid needless work.
 */
const POLL_MS = 60_000;

export function RealtimeRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pending: ReturnType<typeof setTimeout> | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    // Coalesce bursts of changes into a single refresh.
    const refresh = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => router.refresh(), 250);
    };

    const startPolling = () => {
      if (poll) return;
      poll = setInterval(() => {
        if (document.visibilityState === "visible") router.refresh();
      }, POLL_MS);
    };
    const stopPolling = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh(); // catch up immediately on return to the tab
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
