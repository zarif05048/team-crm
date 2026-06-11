import { createClient } from "@/lib/supabase/server";
import type { Contact, LeadStage } from "@/lib/types";

export interface ContactRow extends Contact {
  conversation_id: string | null;
  stage: LeadStage | null;
  last_activity: string | null;
}

/** All customer contacts with a link to their most recent conversation. */
export async function getContacts(): Promise<ContactRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select(
      `*, conversations(id, stage, last_message_at)`,
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[data] getContacts:", error.message);
    return [];
  }

  return (data ?? []).map((c) => {
    const convos = (c.conversations ?? []) as {
      id: string;
      stage: LeadStage;
      last_message_at: string;
    }[];
    const latest = convos
      .slice()
      .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))[0];
    return {
      ...(c as unknown as Contact),
      conversation_id: latest?.id ?? null,
      stage: latest?.stage ?? null,
      last_activity: latest?.last_message_at ?? null,
    };
  });
}
