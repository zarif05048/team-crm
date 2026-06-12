import { ShieldAlert } from "lucide-react";
import { getCurrentProfile, getTeamMembers } from "@/lib/data/team";
import { getCannedReplies } from "@/lib/data/canned";
import { getWhatsappNumbers } from "@/lib/data/numbers";
import { TeamManager } from "@/components/settings/team-manager";
import { CannedManager } from "@/components/settings/canned-manager";
import { NumbersList } from "@/components/settings/numbers-list";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();

  if (profile?.role !== "admin") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <p className="font-medium text-slate-700">Admins only</p>
        <p className="mt-1 max-w-xs text-sm text-slate-500">
          Settings are restricted to admins. Ask your team admin for access.
        </p>
      </div>
    );
  }

  const [members, canned, numbers] = await Promise.all([
    getTeamMembers(),
    getCannedReplies(),
    getWhatsappNumbers(),
  ]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center border-b border-slate-200 bg-white px-6">
        <h1 className="text-base font-semibold text-slate-900">Settings</h1>
      </header>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <TeamManager members={members} currentUserId={profile.id} />
          <CannedManager replies={canned} />
          <NumbersList numbers={numbers} />
        </div>
      </div>
    </div>
  );
}
