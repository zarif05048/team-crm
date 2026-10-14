import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import { ThemeController } from "@/components/theme-controls";
import { THEME_BOOTSTRAP } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Marketing CRM",
  description: "Shared WhatsApp inbox & lead pipeline for your team",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Marketing CRM",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4f6fd",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head><script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} /></head>
      <body className="min-h-full flex flex-col">
        <ThemeController />
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
