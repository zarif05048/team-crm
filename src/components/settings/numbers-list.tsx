"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, Check, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { renameNumber } from "@/app/(app)/settings/actions";
import type { WhatsappNumber } from "@/lib/types";

export function NumbersList({ numbers }: { numbers: WhatsappNumber[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");

  const save = (id: string) => {
    start(async () => {
      await renameNumber(id, value);
      setEditing(null);
      router.refresh();
    });
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <Phone className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-800">
          WhatsApp numbers
        </h2>
        <span className="rounded-full bg-slate-100 px-2 text-xs text-slate-500">
          {numbers.length}
        </span>
      </header>

      <ul className="divide-y divide-slate-100">
        {numbers.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-slate-400">
            No numbers connected yet. They appear automatically on first message.
          </li>
        )}
        {numbers.map((n) => (
          <li key={n.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              {editing === n.id ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="h-8"
                    autoFocus
                  />
                  <button
                    onClick={() => save(n.id)}
                    disabled={pending}
                    className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"
                    aria-label="Save name"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  {n.display_name}
                  <button
                    onClick={() => {
                      setEditing(n.id);
                      setValue(n.display_name);
                    }}
                    className="text-slate-400 hover:text-slate-600"
                    aria-label="Rename"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </p>
              )}
              <p className="truncate text-xs text-slate-400">
                {n.phone_display ? `+${n.phone_display}` : n.phone_number_id}
              </p>
            </div>
            <span
              className={
                n.is_active
                  ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                  : "rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600"
              }
            >
              {n.is_active ? "Active" : "Inactive"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
