import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { AttentionAlerts } from "@/components/notifications/attention-alerts";
import { PushSetup } from "@/components/notifications/push-setup";
import type { Profile } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Profile is created by a DB trigger on signup; if missing, something is off.
  if (!profile) redirect("/login");

  return (
    <>
      <WorkspaceLayout profile={profile as Profile}>{children}</WorkspaceLayout>
      <AttentionAlerts />
      <PushSetup />
    </>
  );
}
