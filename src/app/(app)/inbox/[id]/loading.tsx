/**
 * Instant skeleton shown while a thread loads — makes clicking a
 * conversation feel immediate even before the server responds.
 */
export default function ThreadLoading() {
  return (
    <div className="flex flex-1 animate-pulse flex-col">
      {/* Thread header */}
      <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <div className="h-9 w-9 rounded-full bg-slate-200" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-3.5 w-36 rounded bg-slate-200" />
          <div className="h-3 w-48 rounded bg-slate-100" />
        </div>
        <div className="h-6 w-24 rounded-full bg-slate-100" />
      </header>

      {/* Toolbar */}
      <div className="flex h-12 items-center gap-2 border-b border-slate-200 bg-white px-4">
        <div className="h-7 w-32 rounded-lg bg-slate-100" />
        <div className="h-7 w-24 rounded-lg bg-slate-100" />
        <div className="h-7 w-24 rounded-lg bg-slate-100" />
      </div>

      {/* Message bubbles */}
      <div className="flex flex-1 flex-col justify-end gap-3 overflow-hidden p-4">
        <div className="h-12 w-56 self-start rounded-2xl bg-slate-200" />
        <div className="h-16 w-72 self-end rounded-2xl bg-brand-100" />
        <div className="h-10 w-44 self-start rounded-2xl bg-slate-200" />
        <div className="h-12 w-64 self-end rounded-2xl bg-brand-100" />
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200 bg-white p-3">
        <div className="h-10 rounded-xl bg-slate-100" />
      </div>
    </div>
  );
}
