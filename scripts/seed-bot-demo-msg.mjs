// One-off: seed a fake bot outbound message into the AI Bot Test conversation
// so the violet AI bubble can be verified visually. Cleaned up afterwards.
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
const { data: contact } = await a
  .from("contacts")
  .select("id")
  .eq("wa_id", "60100000001")
  .single();
const { data: conv } = await a
  .from("conversations")
  .select("id")
  .eq("contact_id", contact.id)
  .single();
const { error } = await a.from("messages").insert({
  conversation_id: conv.id,
  direction: "outbound",
  type: "text",
  body: "Waalaikumussalam! Ya, klinik kami buka 24 jam setiap hari termasuk cuti umum. Boleh terus datang bila-bila masa 🙂",
  status: "sent",
  sent_by: null,
  sent_by_bot: true,
});
console.log(error ? `error: ${error.message}` : `seeded bot message in ${conv.id}`);
