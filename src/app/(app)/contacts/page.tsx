import Link from "next/link";
import { Users, MessageSquare } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatTime } from "@/lib/utils";
import { getContacts } from "@/lib/data/contacts";
import { STAGE_LABELS } from "@/lib/types";

export default async function ContactsPage() {
  const contacts = await getContacts();

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <h1 className="text-base font-semibold text-slate-900">Contacts</h1>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
          {contacts.length}
        </span>
      </header>

      {contacts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Users className="h-7 w-7" />
          </div>
          <p className="font-medium text-slate-600">No contacts yet</p>
          <p className="mt-1 text-sm text-slate-400">
            Customers appear here automatically when they message you.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-3xl divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {contacts.map((c) => {
              const name = c.name ?? c.profile_name ?? c.wa_id;
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
                >
                  <Avatar name={name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {name}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      +{c.wa_id}
                    </p>
                  </div>
                  {c.stage && (
                    <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600 sm:inline">
                      {STAGE_LABELS[c.stage]}
                    </span>
                  )}
                  {c.last_activity && (
                    <span className="hidden text-xs text-slate-400 md:inline" suppressHydrationWarning>
                      {formatTime(c.last_activity)}
                    </span>
                  )}
                  {c.conversation_id && (
                    <Link
                      href={`/inbox/${c.conversation_id}`}
                      className="flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Chat
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
