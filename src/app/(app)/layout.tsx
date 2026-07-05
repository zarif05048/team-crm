import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { AttentionAlerts } from "@/components/notifications/attention-alerts";
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
    <div className="flex h-screen overflow-hidden">
      <Sidebar profile={profile as Profile} />
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      <AttentionAlerts />
    </div>
  );
}
