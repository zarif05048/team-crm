"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { LineBadge } from "@/components/ui/line-badge";
import { cn } from "@/lib/utils";
import {
  setPatientStage,
  removeFromPipeline,
} from "@/app/(app)/inbox/[id]/actions";
import {
  STAGE_ORDER,
  STAGE_LABELS,
  type LeadStage,
  type Tag,
} from "@/lib/types";
import type { ConversationListRow } from "@/lib/data/conversations";

const STAGE_ACCENT: Record<LeadStage, string> = {
  new: "border-t-sky-400",
  contacted: "border-t-violet-400",
  qualified: "border-t-amber-400",
  won: "border-t-brand-500",
  lost: "border-t-slate-400",
};

/* How far along a stage is, for a patient whose threads disagree. A booking on
   one line moves only that thread, so the card follows the furthest one —
   and "new" then only ever means a first-time weight-loss enquiry. */
const STAGE_RANK: Record<LeadStage, number> = {
  new: 0,
  contacted: 1,
  qualified: 2,
  lost: 3,
  won: 4,
};

/**
 * One card per patient. A patient who messages two lines (say Marketing and
 * Dungun) has a thread on each, and each thread has its own stage — shown as
 * threads, they'd sit in two columns at once.
 */
interface PatientCard {
  contactId: string;
  stage: LeadStage;
  /** Newest thread: what the card opens and previews. */
  latest: ConversationListRow;
  /** Every weight-loss thread this patient has, moved together on drop. */
  conversationIds: string[];
  lines: string[];
  tags: Tag[];
}

function toPatients(conversations: ConversationListRow[]): PatientCard[] {
  const byContact = new Map<string, PatientCard>();
  // Rows arrive newest first, so the first thread seen is the latest.
  for (const c of conversations) {
    const p = byContact.get(c.contact.id);
    if (!p) {
      byContact.set(c.contact.id, {
        contactId: c.contact.id,
        stage: c.stage,
        latest: c,
        conversationIds: [c.id],
        lines: [c.whatsapp_number?.display_name ?? ""],
        tags: [...c.tags],
      });
      continue;
    }
    p.conversationIds.push(c.id);
    if (STAGE_RANK[c.stage] > STAGE_RANK[p.stage]) p.stage = c.stage;
    const line = c.whatsapp_number?.display_name ?? "";
    if (!p.lines.includes(line)) p.lines.push(line);
    for (const t of c.tags) {
      if (!p.tags.some((x) => x.id === t.id)) p.tags.push(t);
    }
  }
  return [...byContact.values()];
}

export function PipelineBoard({
  conversations,
}: {
  conversations: ConversationListRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dragOver, setDragOver] = useState<LeadStage | null>(null);

  const patients = toPatients(conversations);
  const byStage = (stage: LeadStage) =>
    patients.filter((p) => p.stage === stage);

  const move = (conversationIds: string[], stage: LeadStage) => {
    start(async () => {
      await setPatientStage(conversationIds, stage);
      router.refresh();
    });
  };

  const remove = (p: PatientCard, name: string) => {
    if (
      !window.confirm(
        `Remove ${name} from the pipeline?\n\n` +
          "Their chats stay in the inbox. They won't be added back " +
          'automatically — to put them back, add the "weight-loss" tag in their chat.',
      )
    )
      return;
    start(async () => {
      const res = await removeFromPipeline(p.contactId, p.conversationIds);
      if (!res.ok) window.alert(`Could not remove: ${res.error ?? "unknown error"}`);
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
              setDragOver(null);
              const raw = e.dataTransfer.getData("text/plain");
              if (!raw) return;
              let ids: unknown;
              try {
                ids = JSON.parse(raw);
              } catch {
                return; // something other than a card was dropped
              }
              if (Array.isArray(ids) && ids.length) move(ids as string[], stage);
            }}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-xl border-t-4 bg-slate-100/70",
              STAGE_ACCENT[stage],
              dragOver === stage && "ring-2 ring-brand-400",
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
              {cards.map((p) => (
                <PipelineCard key={p.contactId} p={p} onRemove={remove} />
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

function PipelineCard({
  p,
  onRemove,
}: {
  p: PatientCard;
  onRemove: (p: PatientCard, name: string) => void;
}) {
  const c = p.latest;
  const name = c.contact.name ?? c.contact.profile_name ?? c.contact.wa_id;
  // The delete button sits beside the link, not inside it: a button nested in
  // an <a> is invalid HTML and its click would also open the chat.
  return (
    <div
      className="relative"
      draggable
      onDragStart={(e) =>
        e.dataTransfer.setData("text/plain", JSON.stringify(p.conversationIds))
      }
    >
      <Link
        href={`/inbox/${c.id}`}
        draggable={false}
        className="block cursor-grab rounded-lg border border-slate-200 bg-white p-3 pr-9 shadow-sm transition-shadow hover:shadow active:cursor-grabbing"
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
        <div className="mt-2 flex flex-wrap gap-1">
          {p.lines.map((line) => (
            <LineBadge key={line} displayName={line} />
          ))}
        </div>
        {p.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {p.tags.map((t) => (
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
      <button
        type="button"
        onClick={() => onRemove(p, name)}
        title="Remove from pipeline (chat stays in the inbox)"
        aria-label={`Remove ${name} from pipeline`}
        className="absolute right-2 top-2 rounded p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600 focus:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
