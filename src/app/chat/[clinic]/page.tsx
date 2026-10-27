import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { WEB_CLINICS, isWebClinic } from "@/lib/webchat";
import { WebChat } from "./web-chat";

// The public Google web chat page — one per clinic, no login (lib/webchat.ts).

type Props = { params: Promise<{ clinic: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { clinic } = await params;
  if (!isWebClinic(clinic)) return {};
  const c = WEB_CLINICS[clinic];
  return {
    title: c.clinic,
    description: `Chat dengan ${c.clinic} — balasan segera, 24 jam.`,
    manifest: `/api/webchat/${clinic}/manifest`,
    icons: { icon: "/chat/favicon-64.png", apple: "/chat/apple-touch-icon.png" },
    appleWebApp: { capable: true, statusBarStyle: "default", title: `Hijraa ${c.branch}` },
    robots: { index: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#008069",
  width: "device-width",
  initialScale: 1,
  // stops iPhone zooming the page when the message box is tapped
  maximumScale: 1,
  viewportFit: "cover",
};

export default async function ChatPage({ params }: Props) {
  const { clinic } = await params;
  if (!isWebClinic(clinic)) notFound();
  return <WebChat clinic={clinic} name={WEB_CLINICS[clinic].clinic} />;
}
