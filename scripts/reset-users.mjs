// Deletes ALL auth users (pre-launch cleanup) so the owner's signup is first=admin.
// Run from crm/ with: node scripts/reset-users.mjs
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

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data } = await admin.auth.admin.listUsers();
for (const u of data?.users ?? []) {
  const { error } = await admin.auth.admin.deleteUser(u.id);
  console.log("deleted", u.email, error?.message ?? "ok");
}
const { data: after } = await admin.auth.admin.listUsers();
console.log("users remaining:", after?.users?.length ?? 0);
