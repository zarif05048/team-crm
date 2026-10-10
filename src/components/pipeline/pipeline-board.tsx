"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { LineBadge } from "@/components/ui/line-badge";
import { cn } from "@/lib/utils";
import { malaysiaDate, pipelineWarning } from "@/lib/pipeline-follow-up";
import { savePipelineFollowUp } from "@/app/(app)/pipeline/actions";
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
import type { PipelineConversationRow } from "@/lib/data/conversations";

const STAGE_ACCENT: Record<LeadStage, string> = {
  new: "border-t-sky-400",
  contacted: "border-t-violet-400",
  qualified: "border-t-amber-400",
  no_response: "border-t-rose-400",
  booking: "border-t-teal-400",
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
  // followed up and never answered (owner, 2026-10-10) — past Follow Up, short of a booking
  no_response: 3,
  booking: 4,
  lost: 5,
  won: 6,
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
  latest: PipelineConversationRow;
  /** Every weight-loss thread this patient has, moved together on drop. */
  conversationIds: string[];
  lines: string[];
  tags: Tag[];
  qualifiedSince: string | null;
}

/* The Contacted column is gone; a thread still holding that stage (from before
   2026-09-23_drop_contacted.sql) shows in New, where that migration puts it. */
const boardStage = (s: LeadStage): LeadStage => (s === "contacted" ? "new" : s);

function toPatients(conversations: PipelineConversationRow[]): PatientCard[] {
  const byContact = new Map<string, PatientCard>();
  // Rows arrive newest first, so the first thread seen is the latest.
  for (const c of conversations) {
    const stage = boardStage(c.stage);
    const p = byContact.get(c.contact.id);
    if (!p) {
      byContact.set(c.contact.id, {
        contactId: c.contact.id,
        stage,
        latest: c,
        conversationIds: [c.id],
        lines: [c.whatsapp_number?.display_name ?? ""],
        tags: [...c.tags],
        qualifiedSince: stage === "qualified" ? c.stage_entered_at : null,
      });
      continue;
    }
    p.conversationIds.push(c.id);
    if (STAGE_RANK[stage] > STAGE_RANK[p.stage]) p.stage = stage;
    if (stage === "qualified" && (!p.qualifiedSince || c.stage_entered_at < p.qualifiedSince)) {
      p.qualifiedSince = c.stage_entered_at;
    }
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
  today,
}: {
  conversations: PipelineConversationRow[];
  today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dragOver, setDragOver] = useState<LeadStage | null>(null);

  const patients = toPatients(conversations);
  const byStage = (stage: LeadStage) =>
    patients.filter((p) => p.stage === stage);

  const move = (conversationIds: string[], stage: LeadStage) => {
    start(async () => {
      const res = await setPatientStage(conversationIds, stage);
      if (!res.ok) window.alert(`Could not move: ${res.error ?? "unknown error"}`);
      router.refresh();
    });
  };

  const remove = (p: PatientCard, name: string) => {
    if (
      !window.confirm(
        `Remove ${name} from the pipeline?\n\n` +
          "Their chats stay in the inbox. A fresh weight-loss enquiry will " +
          'add them back to New. You can also add the "weight-loss" tag in their chat.',
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
                <PipelineCard key={p.contactId} p={p} today={today} disabled={pending} onRemove={remove} />
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
  today,
  disabled,
  onRemove,
}: {
  p: PatientCard;
  today: string;
  disabled: boolean;
  onRemove: (p: PatientCard, name: string) => void;
}) {
  const c = p.latest;
  const name = c.contact.name ?? c.contact.profile_name ?? c.contact.wa_id;
  const warning = pipelineWarning({
    stage: p.stage,
    bookingDate: c.contact.pipeline_booking_date,
    followUpAt: c.contact.pipeline_follow_up_at,
    qualifiedSince: p.qualifiedSince,
    lastInboundAt: c.patient_last_inbound_at,
  }, today);
  // The delete button sits beside the link, not inside it: a button nested in
  // an <a> is invalid HTML and its click would also open the chat.
  return (
    <div
      data-pipeline-card={p.contactId}
      className={cn(
        "relative rounded-lg border shadow-sm transition-shadow hover:shadow",
        warning ? "border-yellow-400 bg-yellow-100" : "border-slate-200 bg-white",
      )}
    >
      <Link
        href={`/inbox/${c.id}`}
        draggable={!disabled}
        onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify(p.conversationIds))}
        className="block cursor-grab p-3 pr-9 active:cursor-grabbing"
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
      {(p.stage === "qualified" || p.stage === "booking") && (
        <FollowUpControls
          key={`${p.stage}:${p.qualifiedSince}:${c.contact.pipeline_booking_date}:${c.contact.pipeline_follow_up_at}`}
          p={p}
          name={name}
          today={today}
          disabled={disabled}
        />
      )}
      {warning && (
        <p className="px-3 pb-3 text-xs font-medium text-yellow-900">{warning}</p>
      )}
      <button
        type="button"
        disabled={disabled}
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

function FollowUpControls({ p, name, today, disabled }: {
  p: PatientCard;
  name: string;
  today: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const booking = p.stage === "booking";
  const savedAt = p.latest.contact.pipeline_follow_up_at;
  const [date, setDate] = useState(
    booking ? p.latest.contact.pipeline_booking_date ?? "" : savedAt ? malaysiaDate(savedAt) : p.qualifiedSince ? malaysiaDate(p.qualifiedSince) : today,
  );
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const save = (nextDate: string) => {
    start(async () => {
      setStatus(null);
      setFailed(false);
      try {
        const result = await savePipelineFollowUp(
          p.contactId, booking ? "booking" : "qualified",
          nextDate || null,
        );
        if (!result.ok) {
          setFailed(true);
          setStatus(result.error ?? "Could not save. Please try again.");
          return;
        }
        setDate(nextDate);
        setStatus("Saved");
        router.refresh();
      } catch {
        setFailed(true);
        setStatus("Could not save. Please try again.");
      }
    });
  };

  return (
    <fieldset disabled={disabled || pending} className="mx-3 mb-3 border-t border-slate-200/70 pt-2 text-xs">
      <label htmlFor={`${booking ? "booking" : "follow-up"}-date-${p.contactId}`} className="block font-medium text-slate-700">
        {booking ? "Booking / follow-up date" : "Follow-up date"}
      </label>
      <input
        id={`${booking ? "booking" : "follow-up"}-date-${p.contactId}`}
        type="date"
        aria-label={`${booking ? "Booking / follow-up" : "Follow-up"} date for ${name}`}
        value={date}
        max={booking ? undefined : today}
        required={!booking}
        onChange={(e) => {
          const next = e.target.value;
          if (!booking && !next) {
            setFailed(true);
            setStatus("Choose the follow-up date.");
            return;
          }
          setDate(next);
          save(next);
        }}
        className="mt-2 block w-full min-w-0 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-brand-500 focus:outline-none disabled:opacity-60"
      />
      <p aria-live="polite" className={cn("mt-1 text-[11px]", failed ? "text-red-700" : "text-slate-500")}>
        {pending ? "Saving…" : status}
      </p>
    </fieldset>
  );
}
