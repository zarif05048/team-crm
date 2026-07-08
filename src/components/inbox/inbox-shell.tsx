"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ConversationList } from "@/components/inbox/conversation-list";
import type { ConversationRow } from "@/lib/data/conversations";

/**
 * Responsive master/detail shell.
 * - Desktop (>=lg): list and thread side by side.
 * - Narrow screens: show the list on /inbox, or the open thread on /inbox/[id].
 */
export function InboxShell({
  conversations,
  children,
}: {
  conversations: ConversationRow[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const threadOpen = pathname !== "/inbox" && pathname.startsWith("/inbox/");

  return (
    <div className="flex h-full">
      <div
        className={cn(
          "w-full flex-col border-r border-slate-200 bg-white lg:flex lg:max-w-sm",
          threadOpen ? "hidden lg:flex" : "flex",
        )}
      >
        <header className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
          <h1 className="text-base font-semibold text-slate-900">Inbox</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {conversations.length}
          </span>
        </header>
        <div className="flex-1 overflow-y-auto">
          <ConversationList conversations={conversations} />
        </div>
      </div>

      <div className={cn("min-w-0 flex-1", threadOpen ? "flex" : "hidden lg:flex")}>
        {children}
      </div>
    </div>
  );
}
