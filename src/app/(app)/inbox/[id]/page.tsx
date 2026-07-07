import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { LineBadge } from "@/components/ui/line-badge";
import { MarkRead } from "@/components/inbox/mark-read";
import { Timeline } from "@/components/inbox/timeline";
import { Composer } from "@/components/inbox/composer";
import { ThreadToolbar } from "@/components/inbox/thread-toolbar";
import { TagBar } from "@/components/inbox/tag-bar";
import { getConversation, getMessages } from "@/lib/data/conversations";
import { getNotes } from "@/lib/data/notes";
import { getTeamMembers } from "@/lib/data/team";
import { getCannedReplies } from "@/lib/data/canned";
import { isWindowOpen } from "@/lib/types";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [conversation, messages, notes, members, cannedReplies] =
    await Promise.all([
      getConversation(id),
      getMessages(id),
      getNotes(id),
      getTeamMembers(),
      getCannedReplies(),
    ]);
  if (!conversation) notFound();

  const name =
    conversation.contact.name ??
    conversation.contact.profile_name ??
    conversation.contact.wa_id;
  // Bridged threads (unofficial marketing number, delivered by the sender
  // program) have no Meta 24h-window rule — always open for free-text replies.
  const bridged = conversation.whatsapp_number.phone_number_id?.startsWith("unofficial:") ?? false;
  const windowOpen = bridged || isWindowOpen(conversation.last_inbound_at);
  const memberNames = Object.fromEntries(
    members.map((m) => [m.id, m.full_name ?? m.email ?? "Unknown"]),
  );

  return (
    <div className="flex flex-1 flex-col">
      <MarkRead
        conversationId={conversation.id}
        lastMessageAt={messages.length ? messages[messages.length - 1].created_at : null}
      />
      {/* Thread header */}
      <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <Link
          href="/inbox"
          className="-ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
          aria-label="Back to inbox"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <Avatar name={name} className="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
            <LineBadge displayName={conversation.whatsapp_number.display_name} />
          </div>
          <p className="truncate text-xs text-slate-400">
            +{conversation.contact.wa_id} · via{" "}
            {conversation.whatsapp_number.display_name}
          </p>
        </div>
        <span
          className={
            windowOpen
              ? "rounded-full bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700"
              : "rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700"
          }
        >
          {bridged ? "Always open" : windowOpen ? "24h window open" : "Window closed"}
        </span>
      </header>

      <ThreadToolbar
        conversationId={conversation.id}
        assignedTo={conversation.assigned_to}
        status={conversation.status}
        stage={conversation.stage}
        botEnabled={conversation.bot_enabled ?? true}
        members={members}
      />

      <TagBar conversationId={conversation.id} tags={conversation.tags} />

      <Timeline messages={messages} notes={notes} memberNames={memberNames} />

      <Composer
        conversationId={conversation.id}
        windowOpen={windowOpen}
        members={members}
        cannedReplies={cannedReplies}
      />
    </div>
  );
}
