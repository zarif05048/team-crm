"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { setStage } from "@/app/(app)/inbox/[id]/actions";
import {
  STAGE_ORDER,
  STAGE_LABELS,
  type LeadStage,
} from "@/lib/types";
import type { ConversationRow } from "@/lib/data/conversations";

const STAGE_ACCENT: Record<LeadStage, string> = {
  new: "border-t-sky-400",
  contacted: "border-t-violet-400",
  qualified: "border-t-amber-400",
  won: "border-t-emerald-500",
  lost: "border-t-slate-400",
};

export function PipelineBoard({
  conversations,
}: {
  conversations: ConversationRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dragOver, setDragOver] = useState<LeadStage | null>(null);

  const byStage = (stage: LeadStage) =>
    conversations.filter((c) => c.stage === stage);

  const move = (conversationId: string, stage: LeadStage) => {
    start(async () => {
      await setStage(conversationId, stage);
      router.refresh();
    });
  };

  return (
    <div
      className={cn(
        "flex flex-1 gap-3 overflow-x-auto p-4",
        pending && "opacity-70",
      )}
    >
      {STAGE_ORDER.map((stage) => {
        const cards = byStage(stage);
        return (
          <div
            key={stage}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(stage);
            }}
            onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              setDragOver(null);
              if (id) move(id, stage);
            }}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-xl border-t-4 bg-slate-100/70",
              STAGE_ACCENT[stage],
              dragOver === stage && "ring-2 ring-emerald-400",
            )}
          >
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-semibold text-slate-700">
                {STAGE_LABELS[stage]}
              </span>
              <span className="rounded-full bg-white px-2 text-xs font-medium text-slate-500">
                {cards.length}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3">
              {cards.map((c) => (
                <PipelineCard key={c.id} c={c} />
              ))}
              {cards.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-slate-400">
                  Drag leads here
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PipelineCard({ c }: { c: ConversationRow }) {
  const name = c.contact.name ?? c.contact.profile_name ?? c.contact.wa_id;
  return (
    <Link
      href={`/inbox/${c.id}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
      className="block cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow active:cursor-grabbing"
    >
      <div className="flex items-center gap-2">
        <Avatar name={name} className="h-7 w-7 text-xs" />
        <span className="truncate text-sm font-medium text-slate-800">
          {name}
        </span>
      </div>
      {c.last_message?.body && (
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
          {c.last_message.body}
        </p>
      )}
      {c.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
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
      )}
      {c.assignee && (
        <div className="mt-2 flex items-center gap-1">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
            {c.assignee.full_name ?? "Assigned"}
          </span>
        </div>
      )}
    </Link>
  );
}
