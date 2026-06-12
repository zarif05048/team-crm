import { createClient } from "@/lib/supabase/server";
import type { CannedReply } from "@/lib/types";

/** Team-shared quick replies, newest first. */
export async function getCannedReplies(): Promise<CannedReply[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("canned_replies")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[data] getCannedReplies:", error.message);
    return [];
  }
  return (data as CannedReply[]) ?? [];
}
