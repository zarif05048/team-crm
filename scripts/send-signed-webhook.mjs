// One-off: send a SIGNED simulated WhatsApp webhook to the local dev server
// to verify the ingest → bot-trigger wiring. Cleans nothing — pair with
// bot-webhook-cleanup.mjs afterwards.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ENV_PATH = "D:/app 1/crm/.env.local";
const env = Object.fromEntries(
  readFileSync(ENV_PATH, "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const body = JSON.stringify({
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
              phone_number_id: "TEST_PHONE_NUMBER_ID",
            },
            contacts: [
              { wa_id: "60100000001", profile: { name: "AI Bot Test" } },
            ],
            messages: [
              {
                from: "60100000001",
                id: "wamid.BOTTEST_1",
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: "Assalamualaikum, klinik buka ke sekarang?" },
              },
            ],
          },
        },
      ],
    },
  ],
});

const sig =
  "sha256=" +
  createHmac("sha256", env.META_APP_SECRET).update(body, "utf8").digest("hex");

const res = await fetch("http://localhost:3000/api/webhooks/whatsapp", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-hub-signature-256": sig,
  },
  body,
});
console.log("webhook response:", res.status, await res.text());

// Confirm the message landed.
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
await new Promise((r) => setTimeout(r, 800));
const { data } = await admin
  .from("messages")
  .select("id, direction, body, conversation_id")
  .eq("wa_message_id", "wamid.BOTTEST_1");
console.log("stored message:", JSON.stringify(data));
