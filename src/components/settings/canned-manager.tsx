"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCannedReply,
  deleteCannedReply,
} from "@/app/(app)/settings/actions";
import type { CannedReply } from "@/lib/types";

export function CannedManager({ replies }: { replies: CannedReply[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    setError(null);
    start(async () => {
      const res = await createCannedReply(title, body);
      if (res.ok) {
        setTitle("");
        setBody("");
        router.refresh();
      } else setError(res.error ?? "Failed.");
    });
  };

  const remove = (id: string) =>
    start(async () => {
      await deleteCannedReply(id);
      router.refresh();
    });

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <MessageSquareText className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-800">Quick replies</h2>
        <span className="rounded-full bg-slate-100 px-2 text-xs text-slate-500">
          {replies.length}
        </span>
      </header>

      {error && (
        <p className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </p>
      )}

      <div className="border-b border-slate-100 bg-slate-50 p-4">
        <p className="mb-2 text-xs text-slate-500">
          Saved messages your team can insert into a chat with one click.
        </p>
        <div className="flex flex-col gap-2">
          <Input
            placeholder="Title (e.g. Greeting, Pricing, Opening hours)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            placeholder="Message text…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            className="resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
          <Button
            onClick={add}
            disabled={pending || !title.trim() || !body.trim()}
            className="self-start"
            size="sm"
          >
            <Plus className="h-4 w-4" /> Add quick reply
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-slate-100">
        {replies.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-slate-400">
            No quick replies yet.
          </li>
        )}
        {replies.map((r) => (
          <li key={r.id} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">{r.title}</p>
              <p className="truncate text-xs text-slate-500">{r.body}</p>
            </div>
            <button
              type="button"
              onClick={() => remove(r.id)}
              disabled={pending}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
              aria-label="Delete quick reply"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
