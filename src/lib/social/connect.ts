// Shared by the "Connect" routes (app/api/connect/*): only a signed-in admin
// may start or finish connecting a Facebook page or TikTok account.
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/data/team";

/** The address the providers send people back to — fixed, because each
 *  provider only accepts a redirect address registered with it. */
export const publicBase = () => (process.env.PUBLIC_BASE_URL ?? "https://team-crm-one.vercel.app").replace(/\/+$/, "");
export const callbackUrl = (provider: "facebook" | "tiktok") => `${publicBase()}/api/connect/${provider}/callback`;
export const webhookUrl = (provider: "facebook" | "tiktok") => `${publicBase()}/api/webhooks/${provider}`;

export async function adminId(): Promise<string | null> {
  const profile = await getCurrentProfile();
  return profile?.role === "admin" ? profile.id : null;
}

/** Back to Settings → Channels with one line saying what happened. */
export function backToSettings(kind: "ok" | "error", message: string) {
  const u = new URL(`${publicBase()}/settings`);
  u.searchParams.set(kind === "ok" ? "channel_ok" : "channel_error", message.slice(0, 300));
  u.hash = "channels";
  return NextResponse.redirect(u);
}
