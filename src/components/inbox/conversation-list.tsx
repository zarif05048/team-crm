"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { LineBadge } from "@/components/ui/line-badge";
import { cn, formatTime } from "@/lib/utils";
import type { ConversationRow } from "@/lib/data/conversations";

export function ConversationList({
  conversations,
}: {
  conversations: ConversationRow[];
}) {
  const pathname = usePathname();

  if (conversations.length === 0) {
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
        const name = c.contact.name ?? c.contact.profile_name ?? c.contact.wa_id;
        const preview = c.last_message?.body ?? "";
        const outbound = c.last_message?.direction === "outbound";
        return (
          <li key={c.id}>
            <Link
              href={`/inbox/${c.id}`}
              className={cn(
                "flex gap-3 px-4 py-3 transition-colors",
                active ? "bg-emerald-50" : "hover:bg-slate-50",
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
                    {name}
                  </p>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {c.unread > 0 && (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white">
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
                  {preview}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <LineBadge displayName={c.whatsapp_number?.display_name} />
                  {c.assignee && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                      {c.assignee.full_name ?? "Assigned"}
                    </span>
                  )}
                  {c.stage !== "new" && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium capitalize text-emerald-700">
                      {c.stage}
                    </span>
                  )}
                  {c.tags.map((t) => (
                    <span
                      key={t.id}
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                      style={{ backgroundColor: t.color }}
                    >
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
