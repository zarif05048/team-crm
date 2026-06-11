import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — BYPASSES Row Level Security.
 * SERVER ONLY. Use exclusively in trusted server code such as the WhatsApp
 * webhook, where there is no logged-in user but we must write to the DB.
 * Never import this into a Client Component.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
