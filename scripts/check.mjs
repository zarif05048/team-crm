// Verifies the real signup path end to end, then cleans up.
// Run from crm/ with: node scripts/check.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const email = `verify.${Date.now()}@gmail.com`;

// 1) Sign up exactly like the UI does
const { data: signUpData, error: signUpErr } = await anon.auth.signUp({
  email,
  password: "test123456",
  options: { data: { full_name: "Verify User" } },
});
console.log("1) signUp error:", signUpErr?.message ?? "none");
console.log("   session returned (email-confirm OFF?):", !!signUpData?.session);
const userId = signUpData?.user?.id;
console.log("   user id:", userId ?? "none");

// 2) Did the trigger create a profile, and is the first user admin?
await new Promise((r) => setTimeout(r, 800));
const { data: profile } = await admin
  .from("profiles")
  .select("email, full_name, role")
  .eq("id", userId)
  .maybeSingle();
console.log("2) profile from trigger:", profile);

// 3) Clean up so the owner's real signup becomes the FIRST (admin) user
if (userId) {
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  console.log("3) cleanup deleteUser error:", delErr?.message ?? "none");
}
const { data: remaining } = await admin.from("profiles").select("email");
console.log("   profiles remaining after cleanup:", remaining);
