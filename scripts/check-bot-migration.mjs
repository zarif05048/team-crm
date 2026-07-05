// Checks whether the 2026-07-05 AI bot migration has been applied.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const conv = await a.from("conversations").select("id, bot_enabled").limit(1);
const msg = await a.from("messages").select("id, sent_by_bot").limit(1);
console.log(
  "conversations.bot_enabled:",
  conv.error ? `MISSING (${conv.error.message})` : "OK",
);
console.log(
  "messages.sent_by_bot:",
  msg.error ? `MISSING (${msg.error.message})` : "OK",
);
