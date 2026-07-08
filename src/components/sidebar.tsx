"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  KanbanSquare,
  Users,
  Settings,
  LogOut,
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
  // On a phone, an open chat takes the whole screen (the thread's back arrow
  // returns to the list, where the rail reappears). Always visible on desktop.
  const onThread = pathname.startsWith("/inbox/") && pathname !== "/inbox";

  return (
    <aside
      className={cn(
        "w-16 flex-col items-center bg-gradient-to-b from-brand-950 via-brand-900 to-brand-800 py-4 text-white lg:flex lg:w-60 lg:items-stretch lg:px-3",
        onThread ? "hidden lg:flex" : "flex",
      )}
    >
      {/* Brand — the Hijraa logo on a white chip (its art needs a light bg) */}
      <div className="mb-8 px-1">
        <div className="flex items-center justify-center rounded-xl bg-white p-1.5 shadow-lg shadow-brand-950/30 lg:p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Hijraa Clinic"
            className="h-8 w-auto object-contain lg:h-12"
          />
        </div>
        <p className="mt-2 hidden text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-400 lg:block">
          Marketing CRM
        </p>
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
                  "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                  active
                    ? "bg-white/10 text-white shadow-inner"
                    : "text-brand-100/70 hover:bg-white/5 hover:text-white",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent-400" />
                )}
                <Icon className="h-5 w-5 shrink-0" />
                <span className="hidden lg:block">{item.label}</span>
              </Link>
            );
          })}
      </nav>

      <div className="mt-auto border-t border-white/10 pt-3">
        <div className="hidden px-3 pb-2 lg:block">
          <p className="truncate text-sm font-medium text-white">
            {profile.full_name ?? profile.email}
          </p>
          <p className="text-xs capitalize text-brand-200/60">{profile.role}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-brand-100/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="hidden lg:block">Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
