import type { SupabaseClient } from "@supabase/supabase-js";

/** Bot and staff bookings use the same patient-wide database rule. */
export async function recordBookingStage(supabase: SupabaseClient, conversationId: string) {
  const { error } = await supabase.rpc("record_pipeline_booking", {
    p_conversation_id: conversationId,
  });
  if (error) throw new Error(`Could not update the booking pipeline: ${error.message}`);
}
