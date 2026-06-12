import { createClient } from "@/lib/supabase/server";
import type { WhatsappNumber } from "@/lib/types";

/** Connected WhatsApp Business numbers. */
export async function getWhatsappNumbers(): Promise<WhatsappNumber[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_numbers")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[data] getWhatsappNumbers:", error.message);
    return [];
  }
  return (data as WhatsappNumber[]) ?? [];
}
