import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Who is allowed to start a scheduled job.
 *
 * Cron endpoints do real work on the live database (the cleanup job DELETES
 * messages), so they are not ordinary pages — being a signed-in team member is
 * NOT enough. Exactly two callers get through:
 *
 *   1. Vercel's scheduler, which attaches `Authorization: Bearer <CRON_SECRET>`
 *      to every cron request when the CRON_SECRET env var is set.
 *   2. The clinic owner, signed in to the CRM, triggering a job by hand — their
 *      account email must be listed in CRON_OWNER_EMAILS *and* their profile
 *      role must be `admin`. Other admins and every agent are refused.
 *
 * Anything else gets 401, and the attempt is written to `cron_runs` so the
 * owner can see who tried.
 */

/** Accounts allowed to run a job by hand. Comma-separated, override in env. */
const OWNER_EMAILS = (process.env.CRON_OWNER_EMAILS ?? "zarif_05048@yahoo.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export type CronAuth =
  | { ok: true; triggeredBy: string }
  | { ok: false; status: number; error: string; triggeredBy: string };

export async function authorizeCron(request: Request): Promise<CronAuth> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed: with no secret configured this would be an open endpoint.
    return {
      ok: false,
      status: 503,
      error: "CRON_SECRET is not configured",
      triggeredBy: "unconfigured",
    };
  }

  if (request.headers.get("authorization") === `Bearer ${secret}`) {
    return { ok: true, triggeredBy: "vercel-cron" };
  }

  // No secret — the only other accepted caller is the owner's own session.
  // A failure to read the session (no cookies at all) is the common case for a
  // stranger hitting the URL, so treat any error as "not the owner".
  let email: string | undefined;
  let role: string | undefined;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email?.toLowerCase();
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      role = data?.role;
    }
  } catch {
    // fall through to the refusal below
  }

  if (email && role === "admin" && OWNER_EMAILS.includes(email)) {
    return { ok: true, triggeredBy: email };
  }

  return {
    ok: false,
    status: 401,
    error: "unauthorized",
    triggeredBy: email ?? "anonymous",
  };
}

/**
 * Record an attempt to start a job — allowed or refused — so the owner has a
 * trail of who ran what. Fail-soft on purpose: a missing `cron_runs` table
 * (migration not applied yet) or any logging error must never stop or fail the
 * job itself.
 */
export async function logCronRun(entry: {
  job: string;
  triggeredBy: string;
  allowed: boolean;
  detail?: unknown;
}): Promise<void> {
  try {
    const sb = createAdminClient();
    await sb.from("cron_runs").insert({
      job: entry.job,
      triggered_by: entry.triggeredBy,
      allowed: entry.allowed,
      detail: entry.detail ?? null,
    });
  } catch {
    // logging is best-effort
  }
}
