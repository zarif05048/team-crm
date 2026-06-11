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
 */
export function RealtimeRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pending: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    // Coalesce bursts of changes into a single refresh.
    const refresh = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => router.refresh(), 250);
    };

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
        .subscribe((status) => {
          // Visible in the browser console for debugging.
          console.log("[realtime] inbox channel:", status);
        });
    })();

    return () => {
      cancelled = true;
      if (pending) clearTimeout(pending);
      if (channel) supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
