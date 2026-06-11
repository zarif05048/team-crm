// Reliably upsert all .env.local vars into the Vercel project via the REST API.
// Usage: VERCEL_TOKEN=... node scripts/set-vercel-env.mjs
import { readFileSync } from "node:fs";

const token = process.env.VERCEL_TOKEN;
if (!token) throw new Error("VERCEL_TOKEN env not set");

const { projectId, orgId } = JSON.parse(
  readFileSync(".vercel/project.json", "utf8"),
);

const vars = readFileSync(".env.local", "utf8")
  .split(/\r?\n/)
  .filter((l) => l && !l.startsWith("#") && l.includes("="))
  .map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
  .filter(([, v]) => v);

for (const [key, value] of vars) {
  const res = await fetch(
    `https://api.vercel.com/v10/projects/${projectId}/env?upsert=true&teamId=${orgId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key,
        value,
        type: "encrypted",
        target: ["production", "preview", "development"],
      }),
    },
  );
  const body = await res.json().catch(() => ({}));
  console.log(
    `${key}: ${res.status} ${res.ok ? "ok (" + value.length + " chars)" : JSON.stringify(body.error)}`,
  );
}
