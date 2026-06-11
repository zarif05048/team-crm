import { createClient } from "@/lib/supabase/server";
import type { Note } from "@/lib/types";

export interface NoteWithAuthor extends Note {
  author: { id: string; full_name: string | null } | null;
}

/** Internal notes for a conversation, oldest first. */
export async function getNotes(conversationId: string): Promise<NoteWithAuthor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notes")
    .select(
      `*, author:profiles!notes_author_id_fkey(id, full_name)`,
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[data] getNotes:", error.message);
    return [];
  }
  return (data as unknown as NoteWithAuthor[]) ?? [];
}
