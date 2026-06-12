"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/types";

export type AdminState = { ok: boolean; error?: string };

/** Confirm the caller is a signed-in admin; returns their user id. */
async function requireAdmin(): Promise<
  { userId: string } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { error: "Admins only." };
  return { userId: user.id };
}

/** Create a team member account (admin only). They sign in with this password. */
export async function createMember(
  fullName: string,
  email: string,
  password: string,
  role: Role,
): Promise<AdminState> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (password.length < 6)
    return { ok: false, error: "Password must be at least 6 characters." };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName.trim() },
  });
  if (error) return { ok: false, error: error.message };

  // The new-user trigger creates the profile as 'agent'; set name + role.
  await admin
    .from("profiles")
    .update({ full_name: fullName.trim(), role })
    .eq("id", data.user.id);
  return { ok: true };
}

export async function updateMemberRole(
  userId: string,
  role: Role,
): Promise<AdminState> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (userId === auth.userId)
    return { ok: false, error: "You can't change your own role." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeMember(userId: string): Promise<AdminState> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (userId === auth.userId)
    return { ok: false, error: "You can't remove yourself." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function createCannedReply(
  title: string,
  body: string,
): Promise<AdminState> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!title.trim() || !body.trim())
    return { ok: false, error: "Title and message are required." };

  const admin = createAdminClient();
  const { error } = await admin.from("canned_replies").insert({
    title: title.trim(),
    body: body.trim(),
    created_by: auth.userId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteCannedReply(id: string): Promise<AdminState> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { error } = await admin.from("canned_replies").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function renameNumber(
  id: string,
  displayName: string,
): Promise<AdminState> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!displayName.trim())
    return { ok: false, error: "Name can't be empty." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("whatsapp_numbers")
    .update({ display_name: displayName.trim() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
