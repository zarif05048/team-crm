import { cn, formatTime } from "@/lib/utils";
import type { Message } from "@/lib/types";

export function MessageThread({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
        No messages yet.
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-slate-50 px-6 py-4">
      {messages.map((m) => {
        const outbound = m.direction === "outbound";
        return (
          <div
            key={m.id}
            className={cn("flex", outbound ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                outbound
                  ? "rounded-br-sm bg-emerald-600 text-white"
                  : "rounded-bl-sm bg-white text-slate-800",
              )}
            >
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p
                className={cn(
                  "mt-1 text-right text-[10px]",
                  outbound ? "text-emerald-100" : "text-slate-400",
                )}
                suppressHydrationWarning
              >
                {formatTime(m.created_at)}
                {outbound && m.status ? ` · ${m.status}` : ""}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
