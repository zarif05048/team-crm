// Which commit this deployment runs. scripts/ship.mjs waits for its own commit
// here before it calls a change live, and rolls back if it never arrives.
// Public on purpose (left out of the proxy matcher): a commit id, nothing else.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null },
    { headers: { "cache-control": "no-store" } },
  );
}
