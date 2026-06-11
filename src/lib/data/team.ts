import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** All team members, for assignment dropdowns and @mention pickers. */
export async function getTeamMembers(): Promise<
  Pick<Profile, "id" | "full_name" | "email" | "role">[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .order("full_name", { ascending: true });
  if (error) {
    console.error("[data] getTeamMembers:", error.message);
    return [];
  }
  return data ?? [];
}

/** The currently signed-in member's profile. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return (data as Profile) ?? null;
}
