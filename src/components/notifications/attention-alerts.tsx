"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bot, CalendarClock, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Pops up an in-app toast (and a browser notification when the tab is in the
 * background) whenever the AI bot writes a system note that needs staff eyes:
 * 🚨 urgent handoffs, 🤖 staff-needed handoffs, and 📅 booking requests.
 * Clicking a toast jumps straight to the conversation.
 */

type AlertKind = "urgent" | "staff" | "booking";

interface AttentionAlert {
  id: string;
  kind: AlertKind;
  title: string;
  body: string;
  conversationId: string;
}

const KIND_META: Record<
  AlertKind,
  { title: string; card: string; icon: React.ReactNode }
> = {
  urgent: {
    title: "🚨 URGENT — patient needs attention NOW",
    card: "border-red-300 bg-red-50 text-red-900",
    icon: <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />,
  },
  staff: {
    title: "Staff attention needed",
    card: "border-amber-300 bg-amber-50 text-amber-900",
    icon: <Bot className="h-4 w-4 shrink-0 text-amber-600" />,
  },
  booking: {
    title: "New booking request",
    card: "border-sky-300 bg-sky-50 text-sky-900",
    icon: <CalendarClock className="h-4 w-4 shrink-0 text-sky-600" />,
  },
};

function classify(body: string): AlertKind | null {
  if (body.startsWith("🚨")) return "urgent";
  if (body.startsWith("🤖")) return "staff";
  if (body.startsWith("📅")) return "booking";
  return null;
}

export function AttentionAlerts() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<AttentionAlert[]>([]);

  const dismiss = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    // Best effort — if the browser blocks the prompt, in-app toasts still work.
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    const onNote = (payload: {
      new: { id: string; body: string; author_id: string | null; conversation_id: string };
    }) => {
      const note = payload.new;
      if (note.author_id !== null) return; // human notes don't need alerts
      const kind = classify(note.body ?? "");
      if (!kind) return;

      const alert: AttentionAlert = {
        id: note.id,
        kind,
        title: KIND_META[kind].title,
        body: note.body.slice(0, 160),
        conversationId: note.conversation_id,
      };
      setAlerts((prev) =>
        prev.some((a) => a.id === alert.id) ? prev : [...prev, alert],
      );
      // Urgent alerts stay until dismissed; the rest fade after 12s.
      if (kind !== "urgent") {
        setTimeout(() => dismiss(alert.id), 12_000);
      }

      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        document.visibilityState === "hidden"
      ) {
        const n = new Notification(alert.title, { body: alert.body });
        n.onclick = () => {
          window.focus();
          router.push(`/inbox/${alert.conversationId}`);
          n.close();
        };
      }
    };

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      // Auth must attach BEFORE subscribing or RLS blocks the events.
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      channel = supabase
        .channel("attention-alerts")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notes" },
          onNote,
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [router, dismiss]);

  if (alerts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          role="alert"
          className={cn(
            "pointer-events-auto cursor-pointer rounded-xl border p-3 shadow-lg transition hover:shadow-xl",
            KIND_META[a.kind].card,
          )}
          onClick={() => {
            dismiss(a.id);
            router.push(`/inbox/${a.conversationId}`);
          }}
        >
          <div className="flex items-start gap-2">
            {KIND_META[a.kind].icon}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{a.title}</p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-xs opacity-80">
                {a.body}
              </p>
              <p className="mt-1 text-[11px] font-medium underline">
                Open conversation →
              </p>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              className="rounded p-0.5 opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                dismiss(a.id);
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
