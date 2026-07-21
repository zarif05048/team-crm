import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Renamed from "middleware" per Next.js 16 (proxy file convention).
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all paths EXCEPT:
     * - Next.js internals (_next/static, _next/image)
     * - favicon and common static assets
     * - /api/webhooks/* (Meta must reach these without an auth cookie)
     * - /api/cron/* (Vercel Cron calls these with a CRON_SECRET, no auth cookie)
     * - /api/push/* (Supabase webhook uses a bearer secret; subscribe checks its
     *   own session — neither should be bounced to /login)
     * - PWA files (manifest + service worker must load before login)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/cron|api/push|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
