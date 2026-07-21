"use client";

import { useEffect } from "react";

/**
 * Registers this browser for Web Push so Windows/desktop pop-ups appear even
 * when the CRM tab (or the whole browser window) is closed — the thing in-app
 * toasts can't do. Runs silently on mount for logged-in staff: if notification
 * permission is granted, it subscribes and hands the subscription to the server
 * (/api/push/subscribe). No UI — the browser's own permission prompt is the
 * only thing the user sees, and only the first time.
 */
export function PushSetup() {
  useEffect(() => {
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) return; // push not configured — do nothing
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
      return; // browser can't do push (e.g. iOS Safari without an installed PWA)
    }

    let cancelled = false;

    (async () => {
      try {
        // Ask for permission if we haven't decided yet (best effort).
        let permission = Notification.permission;
        if (permission === "default") permission = await Notification.requestPermission();
        if (permission !== "granted" || cancelled) return;

        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          // The Push spec accepts the VAPID public key as a base64url string,
          // so no manual byte conversion is needed.
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: vapid,
          });
        }
        if (cancelled) return;

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub),
        });
      } catch {
        // Push is a best-effort enhancement; a failure here never breaks the CRM.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
