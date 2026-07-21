import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Web Push sender — delivers a notification to every subscribed device so a
 * Windows/desktop pop-up appears even when the CRM tab (or the whole browser)
 * is closed. This is what the in-app AttentionAlerts toasts can't do: those
 * only run while a tab is open.
 *
 * VAPID keys authenticate us to the browsers' push services (FCM/Mozilla/etc).
 * They live in env: NEXT_PUBLIC_VAPID_PUBLIC_KEY (also handed to the browser to
 * subscribe), VAPID_PRIVATE_KEY (secret), VAPID_SUBJECT (a mailto: contact).
 */

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!pub || !priv) return false; // push not set up yet — no-op, CRM unaffected
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string; // where clicking the notification should take the user
  tag?: string; // notifications with the same tag replace each other
  kind?: string; // urgent | staff | booking — drives styling in the SW
}

/**
 * Send to all stored subscriptions. Dead subscriptions (the browser was
 * uninstalled, permission revoked, or the endpoint expired → 404/410) are
 * pruned so the table never grows stale.
 */
export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; pruned: number }> {
  if (!ensureConfigured()) return { sent: 0, pruned: 0 };
  const sb = createAdminClient();
  const { data: subs } = await sb.from("push_subscriptions").select("endpoint, p256dh, auth");
  if (!subs || subs.length === 0) return { sent: 0, pruned: 0 };

  const body = JSON.stringify(payload);
  const dead: string[] = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 3600, urgency: payload.kind === "urgent" ? "high" : "normal" },
        );
        sent++;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) dead.push(s.endpoint); // gone for good
        // other errors (network blip, 429) are transient — leave the sub in place
      }
    }),
  );

  if (dead.length) {
    await sb.from("push_subscriptions").delete().in("endpoint", dead);
  }
  return { sent, pruned: dead.length };
}
