import { Users } from "lucide-react";

export default function ContactsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 items-center border-b border-slate-200 bg-white px-6">
        <h1 className="text-base font-semibold text-slate-900">Contacts</h1>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Users className="h-7 w-7" />
        </div>
        <p className="font-medium text-slate-700">Contacts</p>
        <p className="mt-1 max-w-xs text-sm text-slate-500">
          Customer profiles with full chat history. Coming on Day 5.
        </p>
      </div>
    </div>
  );
}
