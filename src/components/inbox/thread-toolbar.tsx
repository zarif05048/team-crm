"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  UserCircle2,
  CheckCircle2,
  RotateCcw,
  KanbanSquare,
  Bot,
  Headset,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { STAGE_ORDER, STAGE_LABELS, type LeadStage } from "@/lib/types";
import {
  assignConversation,
  setConversationStatus,
  setStage,
  setBotEnabled,
  setStaffChat,
} from "@/app/(app)/inbox/[id]/actions";

interface Member {
  id: string;
  full_name: string | null;
  email: string | null;
}

export function ThreadToolbar({
  conversationId,
  assignedTo,
  status,
  stage,
  botEnabled,
  isStaffChat,
  members,
}: {
  conversationId: string;
  assignedTo: string | null;
  status: "open" | "closed";
  stage: LeadStage;
  botEnabled: boolean;
  isStaffChat: boolean;
  members: Member[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const onAssign = (value: string) => {
    start(async () => {
      await assignConversation(conversationId, value || null);
      router.refresh();
    });
  };

  const onStage = (value: string) => {
    start(async () => {
      await setStage(conversationId, value as LeadStage);
      router.refresh();
    });
  };

  const toggleStatus = () => {
    start(async () => {
      await setConversationStatus(
        conversationId,
        status === "open" ? "closed" : "open",
      );
      router.refresh();
    });
  };

  const toggleBot = () => {
    start(async () => {
      await setBotEnabled(conversationId, !botEnabled);
      router.refresh();
    });
  };

  const toggleStaffChat = () => {
    start(async () => {
      await setStaffChat(conversationId, !isStaffChat);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
      <UserCircle2 className="h-4 w-4 shrink-0 text-slate-400" />
      <select
        value={assignedTo ?? ""}
        onChange={(e) => onAssign(e.target.value)}
        disabled={pending}
        className="h-8 max-w-[150px] flex-1 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50"
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.full_name ?? m.email}
          </option>
        ))}
      </select>

      <KanbanSquare className="h-4 w-4 shrink-0 text-slate-400" />
      <select
        value={stage}
        onChange={(e) => onStage(e.target.value)}
        disabled={pending}
        className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50"
      >
        {STAGE_ORDER.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={toggleBot}
        disabled={pending}
        title={
          botEnabled
            ? "AI auto-reply is ON — click to pause the bot for this chat"
            : "AI auto-reply is OFF — click to let the bot answer this chat"
        }
        className={
          botEnabled
            ? "flex h-8 items-center gap-1.5 rounded-lg bg-violet-100 px-2.5 text-xs font-medium text-violet-700 hover:bg-violet-200 disabled:opacity-50"
            : "flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        }
      >
        <Bot className="h-4 w-4" />
        {botEnabled ? "AI on" : "AI off"}
      </button>

      <button
        type="button"
        onClick={toggleStaffChat}
        disabled={pending}
        title={
          isStaffChat
            ? "This contact is marked as clinic STAFF (internal chat) — the AI bot never replies here. Click to unmark."
            : "Mark this contact as clinic STAFF (internal chat): the AI bot will never reply or auto-resume in this conversation."
        }
        className={
          isStaffChat
            ? "flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            : "flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        }
      >
        <Headset className="h-4 w-4" />
        Staff
      </button>

      <div className="ml-auto flex items-center gap-2">
        <span
          className={
            status === "open"
              ? "rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700"
              : "rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600"
          }
        >
          {status === "open" ? "Open" : "Closed"}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={toggleStatus}
          disabled={pending}
        >
          {status === "open" ? (
            <>
              <CheckCircle2 className="h-4 w-4" /> Close
            </>
          ) : (
            <>
              <RotateCcw className="h-4 w-4" /> Reopen
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
