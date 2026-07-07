"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tag as TagIcon, X, Plus } from "lucide-react";
import { addTag, removeTag } from "@/app/(app)/inbox/[id]/actions";
import type { Tag } from "@/lib/types";

export function TagBar({
  conversationId,
  tags,
}: {
  conversationId: string;
  tags: Tag[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");

  const submit = () => {
    const name = value.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    start(async () => {
      await addTag(conversationId, name);
      setValue("");
      setAdding(false);
      router.refresh();
    });
  };

  const remove = (tagId: string) => {
    start(async () => {
      await removeTag(conversationId, tagId);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-4 py-1.5">
      <TagIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      {tags.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
          style={{ backgroundColor: t.color }}
        >
          {t.name}
          <button
            type="button"
            onClick={() => remove(t.id)}
            disabled={pending}
            className="rounded-full hover:bg-black/20"
            aria-label={`Remove ${t.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {adding ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") {
              setValue("");
              setAdding(false);
            }
          }}
          placeholder="tag name…"
          className="h-6 w-24 rounded border border-slate-300 px-1.5 text-[11px] focus:border-brand-500 focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={pending}
          className="inline-flex items-center gap-0.5 rounded border border-dashed border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100"
        >
          <Plus className="h-3 w-3" /> Tag
        </button>
      )}
    </div>
  );
}
