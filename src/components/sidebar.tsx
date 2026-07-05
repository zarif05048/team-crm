"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  KanbanSquare,
  Users,
  Settings,
  LogOut,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

const nav = [
  { href: "/inbox", label: "Inbox", icon: Inbox, adminOnly: false },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare, adminOnly: false },
  { href: "/contacts", label: "Contacts", icon: Users, adminOnly: false },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

export function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-16 flex-col items-center border-r border-slate-200 bg-white py-4 lg:w-60 lg:items-stretch lg:px-3">
      <div className="mb-6 flex items-center gap-2 px-2 lg:px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <MessageCircle className="h-5 w-5" />
        </div>
        <span className="hidden text-base font-semibold text-slate-900 lg:block">
          Marketing CRM
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {nav
          .filter((item) => !item.adminOnly || profile.role === "admin")
          .map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="hidden lg:block">{item.label}</span>
              </Link>
            );
          })}
      </nav>

      <div className="mt-auto border-t border-slate-100 pt-3">
        <div className="hidden px-3 pb-2 lg:block">
          <p className="truncate text-sm font-medium text-slate-800">
            {profile.full_name ?? profile.email}
          </p>
          <p className="text-xs capitalize text-slate-400">{profile.role}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="hidden lg:block">Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
