import { createAdminClient } from "@/lib/supabase/admin";
import { extractContent, type WaWebhookBody, type WaValue } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Process a full WhatsApp webhook body: store inbound messages and apply
 * delivery-status updates. Uses the service-role client (bypasses RLS).
 */
export async function ingestWebhook(body: WaWebhookBody): Promise<void> {
  if (body.object !== "whatsapp_business_account") return;
  const supabase = createAdminClient();

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      await ingestValue(supabase, change.value, entry.id);
    }
  }
}

async function ingestValue(supabase: Admin, value: WaValue, wabaId: string) {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) return;

  // 1) Ensure the WhatsApp number this came in on exists (auto-connect).
  const numberId = await ensureNumber(
    supabase,
    phoneNumberId,
    value.metadata.display_phone_number,
    wabaId,
  );

  // 2) Inbound messages
  for (const msg of value.messages ?? []) {
    const profileName = value.contacts?.find((c) => c.wa_id === msg.from)
      ?.profile?.name;
    const contactId = await ensureContact(supabase, msg.from, profileName);
    const conversationId = await ensureConversation(
      supabase,
      contactId,
      numberId,
    );

    const { type, body } = extractContent(msg);
    const createdAt = new Date(Number(msg.timestamp) * 1000).toISOString();

    // Insert message; ignore duplicates (Meta may retry webhooks).
    const { error: insErr } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      wa_message_id: msg.id,
      direction: "inbound",
      type,
      body,
      status: "received",
      created_at: createdAt,
    });
    if (insErr && insErr.code !== "23505") {
      console.error("[whatsapp] insert message failed:", insErr.message);
    }

    // Bump conversation timestamps (last_inbound_at drives the 24h window).
    await supabase
      .from("conversations")
      .update({ last_message_at: createdAt, last_inbound_at: createdAt })
      .eq("id", conversationId);
  }

  // 3) Delivery-status updates for our outbound messages
  for (const status of value.statuses ?? []) {
    await supabase
      .from("messages")
      .update({ status: status.status })
      .eq("wa_message_id", status.id);
  }
}

async function ensureNumber(
  supabase: Admin,
  phoneNumberId: string,
  displayPhone: string | undefined,
  wabaId: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("whatsapp_numbers")
    .select("id")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("whatsapp_numbers")
    .insert({
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      display_name: displayPhone ? `WhatsApp ${displayPhone}` : "WhatsApp",
      phone_display: displayPhone ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`ensureNumber: ${error.message}`);
  return data.id;
}

async function ensureContact(
  supabase: Admin,
  waId: string,
  profileName: string | undefined,
): Promise<string> {
  const { data: existing } = await supabase
    .from("contacts")
    .select("id, name")
    .eq("wa_id", waId)
    .maybeSingle();

  if (existing) {
    // Backfill the WhatsApp profile name if we don't have one yet.
    if (profileName && !existing.name) {
      await supabase
        .from("contacts")
        .update({ profile_name: profileName, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    }
    return existing.id;
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({ wa_id: waId, name: profileName ?? null, profile_name: profileName ?? null })
    .select("id")
    .single();
  if (error) throw new Error(`ensureContact: ${error.message}`);
  return data.id;
}

async function ensureConversation(
  supabase: Admin,
  contactId: string,
  numberId: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("contact_id", contactId)
    .eq("whatsapp_number_id", numberId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("conversations")
    .insert({ contact_id: contactId, whatsapp_number_id: numberId })
    .select("id")
    .single();
  if (error) throw new Error(`ensureConversation: ${error.message}`);
  return data.id;
}
