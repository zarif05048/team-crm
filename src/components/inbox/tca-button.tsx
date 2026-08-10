"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Scissors, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addTcaEntry } from "@/app/(app)/inbox/[id]/actions";

/**
 * "TCA list" — put this patient into the clinic's TCA MINOR SURGICAL Google
 * Sheet (one tab per month) without leaving the chat.
 *
 * The AI bot files procedure requests by itself (book_minor_surgery); this is
 * the same thing for bookings staff arrange themselves, and it lets them fill
 * in the doctor and the confirmed slot the bot doesn't know.
 */
export function TcaButton({
  conversationId,
  patientName,
  defaultBranch,
}: {
  conversationId: string;
  patientName: string;
  defaultBranch: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = (k: string) => String(form.get(k) ?? "").trim();
    setError(null);
    start(async () => {
      const res = await addTcaEntry(conversationId, {
        patientName: value("patientName"),
        procedure: value("procedure"),
        branch: value("branch"),
        date: value("date"),
        time: value("time"),
        doctor: value("doctor"),
        notes: value("notes"),
      });
      if (!res.ok) {
        setError(res.error ?? "Could not add to the list.");
        router.refresh(); // the note is written either way
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Add this patient to the TCA minor surgical list (Google Sheet)"
        className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
      >
        <Scissors className="h-4 w-4" />
        TCA list
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
          <form
            onSubmit={onSubmit}
            className="max-h-full w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
          >
            <div className="mb-3 flex items-center gap-2">
              <Scissors className="h-4 w-4 text-teal-600" />
              <p className="flex-1 text-sm font-semibold text-slate-900">
                Add to TCA minor surgical list
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3">
              <Field label="Patient name">
                <input name="patientName" defaultValue={patientName} required className={inputClass} />
              </Field>
              <Field label="Procedure">
                <input
                  name="procedure"
                  required
                  placeholder="CHALAZION REMOVAL"
                  className={inputClass}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Branch (TEMPAT)">
                  <select name="branch" defaultValue={defaultBranch} className={inputClass}>
                    <option value="DUNGUN">DUNGUN</option>
                    <option value="PAKA">PAKA</option>
                  </select>
                </Field>
                <Field label="Date (TARIKH TCA)">
                  <input
                    name="date"
                    required
                    placeholder="12/08/2026"
                    className={inputClass}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Time (MASA)">
                  <input name="time" placeholder="10 pagi" className={inputClass} />
                </Field>
                <Field label="Doctor">
                  <input name="doctor" placeholder="DR RAFIQ" className={inputClass} />
                </Field>
              </div>
              <Field label="Notes (optional)">
                <input
                  name="notes"
                  placeholder="left eye, panel AIA"
                  className={inputClass}
                />
              </Field>
            </div>

            <p className="mt-2 text-[11px] text-slate-400">
              Goes into the tab for the month of the date above — a new month&apos;s tab
              is created if it doesn&apos;t exist yet. Write the date as
              day/month/year, or the patient&apos;s own words if it isn&apos;t fixed.
            </p>

            {error && (
              <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
                {error}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Adding…" : "Add to list"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

const inputClass =
  "h-9 w-full rounded-lg border border-slate-300 px-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
