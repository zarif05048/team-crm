"use client";
import { contactName } from "@/lib/contact-phone";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Highlight } from "@/components/ui/highlight";
import { CHANNEL_TAG, LineBadge, lineTone } from "@/components/ui/line-badge";
import { cn, formatTime } from "@/lib/utils";
import type { ConversationListRow } from "@/lib/data/conversations";

export function ConversationList({
  conversations,
  query = "",
}: {
  conversations: ConversationListRow[];
  /** Active inbox search, lowercased — highlights the matching text. */
  query?: string;
}) {
  const pathname = usePathname();

  if (conversations.length === 0) {
    // While searching, the shell renders its own "no chats found" message.
    if (query) return null;
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-medium text-slate-600">No conversations yet</p>
        <p className="mt-1 text-xs text-slate-400">
          Incoming WhatsApp messages will appear here.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {conversations.map((c) => {
        const active = pathname === `/inbox/${c.id}`;
        const name = contactName(c.contact);
        const preview = c.last_message?.body ?? "";
        const outbound = c.last_message?.direction === "outbound";
        const tone = lineTone(c.whatsapp_number?.display_name);
        // the tag every thread on this line carries says what the badge already says
        const tags = c.tags.filter((t) => t.name !== CHANNEL_TAG[tone]);
        return (
          <li key={c.id}>
            <Link
              href={`/inbox/${c.id}`}
              className={cn(
                // a stripe in the channel's colour down the left edge: the list scans by channel at a glance
                "chan-stripe flex gap-3 px-4 py-3 transition-colors",
                `chan-${tone}`,
                active ? "bg-brand-50" : c.unread > 0 ? "bg-slate-50/60 hover:bg-slate-50" : "hover:bg-slate-50",
              )}
            >
              <Avatar name={name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p
                    className={cn(
                      "truncate text-sm text-slate-900",
                      c.unread > 0 ? "font-bold" : "font-medium",
                    )}
                  >
                    <Highlight text={name} query={query} />
                  </p>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {c.unread > 0 && (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white">
                        {c.unread > 9 ? "9+" : c.unread}
                      </span>
                    )}
                    {c.last_message && (
                      <span
                        className="text-xs text-slate-400"
                        suppressHydrationWarning
                      >
                        {formatTime(c.last_message.created_at)}
                      </span>
                    )}
                  </span>
                </div>
                <p
                  className={cn(
                    "truncate text-sm",
                    c.unread > 0 ? "font-semibold text-slate-800" : "text-slate-500",
                  )}
                >
                  {outbound && <span className="text-slate-400">You: </span>}
                  <Highlight text={preview} query={query} />
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <LineBadge displayName={c.whatsapp_number?.display_name} />
                  {c.stage !== "new" && (
                    <span className="rounded-md bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold capitalize text-primary">
                      {c.stage}
                    </span>
                  )}
                  {c.assignee && (
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      👤 {c.assignee.full_name ?? "Assigned"}
                    </span>
                  )}
                  {/* tags: a dot in the tag's colour on a calm chip — a full colour fill on every row was loud */}
                  {tags.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
