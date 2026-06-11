"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCircle2, CheckCircle2, RotateCcw, KanbanSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STAGE_ORDER, STAGE_LABELS, type LeadStage } from "@/lib/types";
import {
  assignConversation,
  setConversationStatus,
  setStage,
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
  members,
}: {
  conversationId: string;
  assignedTo: string | null;
  status: "open" | "closed";
  stage: LeadStage;
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

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
      <UserCircle2 className="h-4 w-4 shrink-0 text-slate-400" />
      <select
        value={assignedTo ?? ""}
        onChange={(e) => onAssign(e.target.value)}
        disabled={pending}
        className="h-8 max-w-[150px] flex-1 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-50"
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
        className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-50"
      >
        {STAGE_ORDER.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>

      <div className="ml-auto flex items-center gap-2">
        <span
          className={
            status === "open"
              ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
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
