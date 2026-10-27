"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

/* The Google web chat a patient sees (lib/webchat.ts for the server side).
 *
 * The owner's brief (2026-10-27): as seamless as opening an ordinary WhatsApp
 * conversation. So nothing stands between the tap on Google and the chat — no
 * form, no name, no phone, no splash. The page opens on the clinic's greeting
 * with the message box ready, and it looks and behaves like a WhatsApp chat:
 * the green header with the clinic as the contact, beige wallpaper, white and
 * green bubbles with tails, time stamps, ticks, "sedang menaip…" while the bot
 * writes, *bold* and _italic_ as WhatsApp renders them.
 *
 * Nothing reaches the server until the patient sends something. Their session
 * id lives in this browser only, so coming back to the link on the same phone
 * reopens the same conversation. Colours are fixed (not the CRM theme): this
 * is the patient's screen, not staff's. */

type Msg = {
  key: string;
  id?: string;
  clientId: string | null;
  mine: boolean;
  type: string;
  body: string | null;
  media_url: string | null;
  at: string;
  state?: "sending" | "failed";
};

const POLL_MS = 2500;
const TYPING_FOR_MS = 60_000;

const QUICK = ["Waktu operasi klinik?", "Berapa harga konsultasi?", "Doktor bertugas hari ini?", "Lokasi klinik?"];

const noSubscribe = () => () => {};
const storeKey = (clinic: string) => `hijraa-chat:${clinic}`;
function readSession(clinic: string): string | null {
  try { return localStorage.getItem(storeKey(clinic)); } catch { return null; }
}
function newSession(clinic: string): string {
  const id = crypto.randomUUID();
  try { localStorage.setItem(storeKey(clinic), id); } catch { /* private mode: this visit only */ }
  return id;
}

const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const dayKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date(iso));
function dayLabel(iso: string) {
  const k = dayKey(iso);
  if (k === dayKey(new Date().toISOString())) return "HARI INI";
  if (k === dayKey(new Date(Date.now() - 86_400_000).toISOString())) return "SEMALAM";
  return new Intl.DateTimeFormat("ms-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso)).toUpperCase();
}

/** WhatsApp's own light formatting: *bold*, _italic_, ~strike~, and links. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="break-all text-[#027eb5] underline">{p}</a>;
        if (/^\*[^*]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>;
        if (/^_[^_]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
        if (/^~[^~]+~$/.test(p)) return <s key={i}>{p.slice(1, -1)}</s>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function Ticks({ state, read }: { state?: Msg["state"]; read: boolean }) {
  if (state === "sending") {
    return (
      <svg viewBox="0 0 16 15" className="h-3.5 w-3.5 text-[#8696a0]" aria-label="Menghantar"><circle cx="8" cy="7.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M8 4.5v3.2l2 1.3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
    );
  }
  return (
    <svg viewBox="0 0 18 11" className={`h-3 w-4 ${read ? "text-[#53bdeb]" : "text-[#8696a0]"}`} aria-label={read ? "Dibaca" : "Dihantar"}>
      <path d="M1 5.8l3.3 3.2L11 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.8 8.6l.6.4L14 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WebChat({ clinic, name }: { clinic: string; name: string }) {
  // Browser-only: the session lives in localStorage, and time stamps must be
  // this phone's, not the server's render (both read null on the server).
  const ready = useSyncExternalStore(noSubscribe, () => true, () => false);
  const stored = useSyncExternalStore(noSubscribe, () => readSession(clinic), () => null);
  const [created, setCreated] = useState<string | null>(null);
  const session = created ?? stored;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [typingSince, setTypingSince] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openedAt] = useState(() => new Date().toISOString());
  const lastAt = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);

  // Merge what the server has into the list, replacing our own drafts.
  const merge = useCallback((incoming: Omit<Msg, "key">[]) => {
    if (!incoming.length) return;
    setMsgs((cur) => {
      const next = [...cur];
      for (const m of incoming) {
        const key = m.clientId ?? m.id ?? `${m.at}:${m.body}`;
        const i = next.findIndex((x) => x.key === key || (m.clientId && x.clientId === m.clientId));
        const row = { ...m, key };
        if (i >= 0) next[i] = row; else next.push(row);
      }
      return next.sort((a, b) => (a.state === "sending" ? 1 : 0) - (b.state === "sending" ? 1 : 0) || a.at.localeCompare(b.at));
    });
    const newest = incoming[incoming.length - 1].at;
    if (!lastAt.current || newest > lastAt.current) lastAt.current = newest;
    if (incoming.some((m) => !m.mine)) setTypingSince(null);
  }, []);

  const poll = useCallback(async () => {
    if (!session) return;
    try {
      const q = new URLSearchParams({ s: session });
      if (lastAt.current) q.set("after", lastAt.current);
      const r = await fetch(`/api/webchat/${clinic}?${q}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { messages: Omit<Msg, "key">[] };
      merge(j.messages ?? []);
    } catch { /* offline for a moment — the next tick tries again */ }
  }, [clinic, session, merge]);

  // Read the thread while the page is on screen; pause when it is not.
  useEffect(() => {
    if (!session) return;
    const first = setTimeout(() => void poll(), 0);
    const t = setInterval(() => { if (document.visibilityState === "visible") void poll(); }, POLL_MS);
    const onShow = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { clearTimeout(first); clearInterval(t); document.removeEventListener("visibilitychange", onShow); };
  }, [session, poll]);

  // Keep the newest message in view, as WhatsApp does — unless the patient
  // has scrolled up to read something.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [msgs, typingSince]);

  // The "typing" line gives up after a minute (staff may be the ones to answer).
  useEffect(() => {
    if (!typingSince) return;
    const t = setTimeout(() => setTypingSince(null), TYPING_FOR_MS);
    return () => clearTimeout(t);
  }, [typingSince]);

  const deliver = useCallback(async (draft: Msg, sid: string) => {
    try {
      const r = await fetch(`/api/webchat/${clinic}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s: sid, id: draft.clientId, text: draft.body }),
      });
      if (r.status === 429) {
        const j = await r.json().catch(() => ({}));
        setNotice(j.error ?? "Sila tunggu sebentar.");
      }
      if (!r.ok) throw new Error(String(r.status));
      setTypingSince(Date.now());
      void poll();
    } catch {
      setMsgs((cur) => cur.map((m) => (m.key === draft.key ? { ...m, state: "failed" } : m)));
    }
  }, [clinic, poll]);

  const send = (raw: string) => {
    const body = raw.trim().slice(0, 1000);
    if (!body) return;
    const sid = session ?? newSession(clinic);
    if (!session) setCreated(sid);
    const clientId = crypto.randomUUID();
    const draft: Msg = { key: clientId, clientId, mine: true, type: "text", body, media_url: null, at: new Date().toISOString(), state: "sending" };
    setMsgs((cur) => [...cur, draft]);
    setText("");
    setNotice(null);
    atBottom.current = true;
    void deliver(draft, sid);
    box.current?.focus();
  };

  const retry = (m: Msg) => {
    if (!session) return;
    const again = { ...m, state: "sending" as const };
    setMsgs((cur) => cur.map((x) => (x.key === m.key ? again : x)));
    void deliver(again, session);
  };

  // Grow the message box with its text, up to five lines, like WhatsApp's.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  // A message of ours counts as read once the clinic has written after it.
  const lastReplyAt = [...msgs].reverse().find((m) => !m.mine)?.at ?? "";
  const greeting: Msg = {
    key: "greeting", clientId: null, mine: false, type: "text", media_url: null,
    at: msgs[0]?.at && msgs[0].at < openedAt ? msgs[0].at : openedAt,
    body: `Assalamualaikum & selamat datang ke *${name}* 👋\n\nAda apa-apa yang boleh kami bantu? Taip soalan anda di bawah — kami balas di sini.`,
  };
  const all = [greeting, ...msgs];
  const started = msgs.length > 0;

  return (
    <div className="fixed inset-0 flex flex-col bg-[#efeae2] text-[#111b21]" style={{ colorScheme: "light" }}>
      {/* header — the clinic as the contact, as in WhatsApp */}
      <header className="flex shrink-0 items-center gap-3 bg-[#008069] px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] text-white shadow-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-medium leading-tight">{name}</p>
          <p className="truncate text-[13px] leading-tight text-white/80">
            {typingSince ? "sedang menaip…" : "dalam talian · 24 jam"}
          </p>
        </div>
      </header>

      {/* the conversation */}
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2"
        style={{
          backgroundImage: "radial-gradient(rgba(0,0,0,0.035) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      >
        {ready && <div className="mx-auto flex max-w-3xl flex-col gap-1">
          <p className="mx-auto my-2 max-w-[22rem] rounded-lg bg-[#ffeecd] px-3 py-1.5 text-center text-[12px] leading-snug text-[#54656f] shadow-sm">
            🔒 Mesej anda dihantar terus kepada {name} dan disimpan oleh klinik untuk membalas pertanyaan anda.
          </p>
          {all.map((m, i) => {
            const prev = all[i - 1];
            const newDay = !prev || dayKey(prev.at) !== dayKey(m.at);
            const firstOfRun = !prev || prev.mine !== m.mine || newDay;
            return (
              <div key={m.key} className="flex flex-col">
                {newDay && (
                  <span className="mx-auto my-2 rounded-lg bg-white/90 px-3 py-1 text-[12px] font-medium text-[#54656f] shadow-sm">
                    {dayLabel(m.at)}
                  </span>
                )}
                <Bubble msg={m} tail={firstOfRun} read={m.mine && !!lastReplyAt && lastReplyAt > m.at} onRetry={() => retry(m)} />
              </div>
            );
          })}
          {typingSince && (
            <div className="relative mt-1 self-start rounded-lg rounded-tl-none bg-white px-3 py-2.5 shadow-sm">
              <span className="flex gap-1">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-[#8696a0]" style={{ animationDelay: `${d * 150}ms` }} />
                ))}
              </span>
            </div>
          )}
        </div>}
      </div>

      {/* quick questions, before the first message only */}
      {!started && (
        <div className="flex shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden gap-2 overflow-x-auto px-3 pb-1 pt-2">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => send(q)}
              className="shrink-0 whitespace-nowrap rounded-full border border-[#d1d7db] bg-white px-3 py-1.5 text-[14px] text-[#008069] shadow-sm active:bg-[#f0f2f5]">
              {q}
            </button>
          ))}
        </div>
      )}
      {notice && <p className="shrink-0 px-4 pb-1 text-center text-[12px] text-[#d93025]">{notice}</p>}

      {/* the message box */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(text); }}
        className="flex shrink-0 items-end gap-2 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5"
      >
        <div className="flex min-h-[48px] flex-1 items-end rounded-[24px] bg-white px-4 py-[11px] shadow-sm">
          <textarea
            ref={box}
            value={text}
            rows={1}
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends on a computer; on a phone it is a new line, as in WhatsApp.
              const touch = typeof window !== "undefined" && matchMedia("(pointer: coarse)").matches;
              if (e.key === "Enter" && !e.shiftKey && !touch) { e.preventDefault(); send(text); }
            }}
            placeholder="Mesej"
            style={{ outline: "none", boxShadow: "none" }}
            aria-label="Mesej"
            className="max-h-[120px] w-full resize-none bg-transparent text-[16px] leading-[22px] text-[#111b21] outline-none placeholder:text-[#8696a0]"
          />
        </div>
        <button
          type="submit"
          aria-label="Hantar"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-sm transition active:scale-95 disabled:opacity-60"
          disabled={!text.trim()}
        >
          <svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6" fill="currentColor" aria-hidden="true">
            <path d="M3.4 20.4 21.85 12.6a.65.65 0 0 0 0-1.2L3.4 3.6a.65.65 0 0 0-.9.75L4.2 11 13 12l-8.8 1-1.7 6.65a.65.65 0 0 0 .9.75z" />
          </svg>
        </button>
      </form>
    </div>
  );
}

function Bubble({ msg, tail, read, onRetry }: { msg: Msg; tail: boolean; read: boolean; onRetry: () => void }) {
  const mine = msg.mine;
  const body = msg.type === "image" && msg.body ? msg.body.replace(/^📄\s*/, "") : msg.body;
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} ${tail ? "mt-1.5" : ""}`}>
      <div
        className={[
          "relative max-w-[85%] rounded-lg px-2.5 pb-1.5 pt-1.5 text-[15px] leading-[20px] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] sm:max-w-[65%]",
          mine ? "bg-[#d9fdd3]" : "bg-white",
          tail ? (mine ? "rounded-tr-none" : "rounded-tl-none") : "",
        ].join(" ")}
      >
        {tail && (
          <svg viewBox="0 0 8 13" className={`absolute top-0 h-[13px] w-2 ${mine ? "-right-2 text-[#d9fdd3]" : "-left-2 text-white"}`} aria-hidden="true">
            <path d={mine ? "M0 0h8L0 13z" : "M8 0H0l8 13z"} fill="currentColor" />
          </svg>
        )}
        {msg.type === "image" && msg.media_url && (
          <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="-mx-1.5 -mt-0.5 mb-1 block overflow-hidden rounded-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={msg.media_url} alt={body ?? "Poster"} className="block max-h-[22rem] w-full object-cover" loading="lazy" />
          </a>
        )}
        {body && (
          <span className="whitespace-pre-wrap break-words">
            <Rich text={body} />
          </span>
        )}
        {/* time + ticks, floated so they tuck under the last line like WhatsApp's */}
        <span className="float-right ml-2 mt-1.5 flex translate-y-0.5 items-center gap-1 pl-1 text-[11px] leading-none text-[#667781]">
          {hhmm(msg.at)}
          {mine && msg.state !== "failed" && <Ticks state={msg.state} read={read} />}
        </span>
        {msg.state === "failed" && (
          <button type="button" onClick={onRetry} className="clear-both mt-1 block w-full text-right text-[12px] font-medium text-[#d93025]">
            ⚠ Tidak dihantar — ketik untuk cuba lagi
          </button>
        )}
      </div>
    </div>
  );
}
