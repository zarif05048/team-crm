"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { Profile } from "@/lib/types";
import { Sidebar } from "@/components/sidebar";
import { ResizableSplit } from "@/components/resizable-split";
import { RESIZE_HANDLE_WIDTH } from "@/lib/panel-size";

export function WorkspaceLayout({ profile, children }: { profile: Profile; children: ReactNode }) {
  const pathname = usePathname();
  const inInbox = pathname.startsWith("/inbox");
  const threadOpen = pathname.startsWith("/inbox/");
  return (
    <ResizableSplit id="navigation" label="Resize main tabs" defaultWidth={240}
      minWidth={192} maxWidth={400} minRemaining={inInbox ? 280 + RESIZE_HANDLE_WIDTH + 360 : 360}
      className="h-screen overflow-hidden"
      leftClassName={threadOpen ? "hidden w-16 lg:flex" : "flex w-16"}
      left={<Sidebar profile={profile} />}>
      <main className="crm-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </ResizableSplit>
  );
}
