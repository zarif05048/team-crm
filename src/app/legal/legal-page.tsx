import type { ReactNode } from "react";

/* The two public pages Meta and TikTok link to from their consent screens
   (/legal/privacy, /legal/terms). Plain, readable on a phone, no login. The
   wording is the clinic's to keep true: it says what the inbox actually does
   (src/lib/social, src/lib/webchat, the retention job in api/cron/cleanup). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-white px-5 py-10 text-slate-800">
      <article className="mx-auto max-w-2xl text-[15px] leading-relaxed">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Klinik Hijraa 24 Jam · Dungun &amp; Paka</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-xs text-slate-400">Last updated: {updated}</p>
        <div className="mt-6 space-y-5 [&_h2]:mt-7 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
          {children}
        </div>
      </article>
    </main>
  );
}

export const CONTACT = (
  <>
    Klinik Hijraa 24 Jam Dungun — 2785 &amp; 2786 Tingkat Bawah Batu 48, Jalan Paka, 23000 Dungun, Terengganu ·
    telephone 09-848 9906 · WhatsApp 013-923 7548
  </>
);
