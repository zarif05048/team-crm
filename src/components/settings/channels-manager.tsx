"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, MessagesSquare, Unplug } from "lucide-react";
import { disconnectChannel } from "@/app/(app)/settings/actions";

/* Settings → Channels (owner, 12 Nov 2026): the Facebook pages and TikTok
   accounts whose messages come into the inbox. Connecting is the provider's
   own sign-in — nobody types or copies a token; the server keeps it sealed. */

export interface ChannelRow {
  id: string;
  provider: "facebook" | "tiktok";
  clinic: "dungun" | "paka";
  name: string | null;
  status: "active" | "reauth";
  last_error: string | null;
  connected_at: string;
}

const LABEL = { facebook: "Facebook", tiktok: "TikTok" } as const;
const BRANCH = { dungun: "Dungun", paka: "Paka" } as const;
const linkBtn =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-surface px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50";

export function ChannelsManager({ channels, tiktokReady, notice }: {
  channels: ChannelRow[];
  /** the TikTok app's key and secret are on the server */
  tiktokReady: boolean;
  notice?: { kind: "ok" | "error"; text: string } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const disconnect = (c: ChannelRow) => {
    if (!window.confirm(`Disconnect ${LABEL[c.provider]} ${c.name ?? ""} (${BRANCH[c.clinic]})? Its new messages will stop coming into the inbox. The chats already here stay.`)) return;
    start(async () => {
      const r = await disconnectChannel(c.id);
      if (!r.ok) window.alert(r.error);
      router.refresh();
    });
  };

  return (
    <section id="channels" className="rounded-xl border border-slate-200 bg-surface">
      <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <MessagesSquare className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-800">Channels — Facebook &amp; TikTok</h2>
        <span className="rounded-full bg-slate-100 px-2 text-xs text-slate-500">{channels.length}</span>
      </header>

      {notice && (
        <p className={`mx-4 mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-medium ${notice.kind === "ok"
          ? "bg-brand-50 text-primary" : "bg-amber-50 text-amber-800"}`}>
          {notice.kind === "ok" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>{notice.text}</span>
        </p>
      )}

      <ul className="divide-y divide-slate-100">
        {channels.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-slate-400">
            Nothing connected yet. Messages to a connected page or account arrive in the inbox like a WhatsApp chat.
          </li>
        )}
        {channels.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{LABEL[c.provider]} · {BRANCH[c.clinic]}</p>
              <p className="truncate text-xs text-slate-400">{c.name ?? "—"}</p>
              {c.last_error && <p className="mt-0.5 text-xs text-amber-700">{c.last_error}</p>}
            </div>
            <span className={c.status === "active"
              ? "rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-primary"
              : "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"}>
              {c.status === "active" ? "Connected" : "Connect again"}
            </span>
            <button onClick={() => disconnect(c)} disabled={pending} title="Disconnect"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Disconnect">
              <Unplug className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
        {/* plain links: each goes off to the provider's own sign-in page */}
        <a href="/api/connect/facebook/start" className={linkBtn}>Connect Facebook pages</a>
        {tiktokReady ? (
          <>
            <a href="/api/connect/tiktok/start?clinic=dungun" className={linkBtn}>Connect TikTok · Dungun</a>
            <a href="/api/connect/tiktok/start?clinic=paka" className={linkBtn}>Connect TikTok · Paka</a>
          </>
        ) : (
          <span className="text-xs text-slate-400">TikTok: waiting for the TikTok app&apos;s key (TIKTOK_APP_ID / TIKTOK_APP_SECRET on the server).</span>
        )}
      </div>
      <p className="px-4 pb-3 text-[11px] leading-relaxed text-slate-400">
        Facebook pages are matched to a clinic by their name (Dungun / Paka). Replies are possible for 24 hours after a person&apos;s last
        message on Facebook and 48 hours on TikTok; after that the chat reopens when they write again.
      </p>
    </section>
  );
}
