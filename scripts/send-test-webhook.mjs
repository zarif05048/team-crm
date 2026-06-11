// Simulates inbound WhatsApp messages by POSTing sample webhook payloads to the
// local webhook, then prints the resulting DB rows. Run from crm/:
//   node scripts/send-test-webhook.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const URL_BASE = "http://localhost:3000/api/webhooks/whatsapp";
const PHONE_NUMBER_ID = "TEST_PHONE_NUMBER_ID";

function payload(waId, name, wamid, text) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "TEST_WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: PHONE_NUMBER_ID,
              },
              contacts: [{ wa_id: waId, profile: { name } }],
              messages: [
                {
                  from: waId,
                  id: wamid,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

const samples = [
  ["60123456789", "Ahmad (Lead)", "wamid.TEST_A1", "Hi, is the package still available?"],
  ["60129998888", "Siti Nurhaliza", "wamid.TEST_B1", "Hello! Saw your ad on Facebook. How much is it?"],
  ["60123456789", "Ahmad (Lead)", "wamid.TEST_A2", "Also do you deliver to Penang?"],
];

for (const [waId, name, wamid, text] of samples) {
  const res = await fetch(URL_BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload(waId, name, wamid, text)),
  });
  console.log(`POST ${wamid} -> ${res.status} ${await res.text()}`);
}

// Verify what landed in the DB.
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
await new Promise((r) => setTimeout(r, 500));

const { data: convos } = await admin
  .from("conversations")
  .select("id, last_inbound_at, contact:contacts(name, wa_id)")
  .order("last_message_at", { ascending: false });
console.log("\nConversations:", JSON.stringify(convos, null, 2));

const { data: msgs } = await admin
  .from("messages")
  .select("direction, body, status")
  .order("created_at", { ascending: true });
console.log("Messages:", JSON.stringify(msgs, null, 2));
