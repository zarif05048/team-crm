"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { malaysiaDate, validCalendarDate } from "@/lib/pipeline-follow-up";

type SaveResult = { ok: boolean; error?: string };

export async function savePipelineFollowUp(
  contactId: string,
  field: "booking" | "qualified",
  date: string | null,
): Promise<SaveResult> {
  if (field !== "booking" && field !== "qualified") {
    return { ok: false, error: "Unknown follow-up field." };
  }
  if (date !== null && !validCalendarDate(date)) {
    return { ok: false, error: "Choose a valid date." };
  }
  if (field === "qualified" && !date) {
    return { ok: false, error: "Choose the follow-up date." };
  }
  const now = new Date().toISOString();
  const today = malaysiaDate(now);
  if (field === "qualified" && date && date > today) {
    return { ok: false, error: "A completed follow-up cannot be in the future." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Today's follow-up uses the actual time, so an earlier reply today cannot count
  // as a reply to this follow-up. A past date starts at midnight in Malaysia.
  const update = field === "booking"
    ? { pipeline_booking_date: date }
    : { pipeline_follow_up_at: date ? (date === today ? now : `${date}T00:00:00+08:00`) : null };
  const { data, error } = await supabase.from("contacts")
    .update(update).eq("id", contactId).select("id").maybeSingle();
  if (error) return { ok: false, error: "Could not save. Please try again." };
  if (!data) return { ok: false, error: "Patient not found." };
  revalidatePath("/pipeline");
  return { ok: true };
}
