// Web chat links carry ?src= (owner, 9 Nov 2026: which channel brings patients).
// Offline: src/lib/webchat.ts is transpiled and run against a stand-in database.
// Run: node scripts/test-webchat-source.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const src = readFileSync(new URL("../src/lib/webchat.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(js, { module: mod, exports: mod.exports, require: () => ({ createAdminClient: () => null }) });
const { webSource, ensureWebConversation, WEB_SOURCES } = mod.exports;

let n = 0;
const check = async (label, fn) => { await fn(); n++; console.log("PASS  " + label); };

// A stand-in for the few Supabase calls ensureWebConversation makes.
function fakeAdmin() {
  const rows = { whatsapp_numbers: [], contacts: [], conversations: [], tags: [], conversation_tags: [] };
  let id = 0;
  const admin = {
    rows,
    from(table) {
      let filters = [], pending = null;
      const q = {
        select() { return q; },
        eq(col, v) { filters.push([col, v]); return q; },
        upsert(row, opts) {
          const key = opts?.onConflict;
          const found = key && rows[table].find((r) => r[key] === row[key]);
          pending = found ?? Object.assign({ id: `${table}-${++id}` }, row);
          if (!found) rows[table].push(pending);
          return q;
        },
        insert(row) { pending = Object.assign({ id: `${table}-${++id}` }, row); rows[table].push(pending); return q; },
        single: async () => ({ data: pending, error: null }),
        maybeSingle: async () => ({ data: rows[table].find((r) => filters.every(([c, v]) => r[c] === v)) ?? null, error: null }),
        then(res) { return Promise.resolve({ data: pending, error: null }).then(res); },
      };
      return q;
    },
  };
  return admin;
}

await check("?src= values are read, with short forms; anything else is no source", () => {
  assert.equal(webSource("facebook"), "facebook");
  assert.equal(webSource(" FB "), "facebook");
  assert.equal(webSource("ig"), "instagram");
  assert.equal(webSource("tt"), "tiktok");
  assert.equal(webSource("maps"), "google");
  assert.equal(webSource("website"), "website");
  assert.equal(webSource("whatever"), null);
  assert.equal(webSource(undefined), null);
  assert.equal(webSource(42), null);
});

const SESSION = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
await check("a Facebook visitor's thread is named and tagged Facebook", async () => {
  const admin = fakeAdmin();
  await ensureWebConversation(admin, "dungun", SESSION, "facebook");
  assert.equal(admin.rows.contacts[0].name, "Pelawat Facebook 1B9D");
  assert.deepEqual(admin.rows.tags.map((t) => [t.name, t.color]), [["facebook", WEB_SOURCES.facebook.color]]);
  assert.equal(admin.rows.conversation_tags.length, 1);
});

await check("no source keeps the old behaviour: Google, tag google", async () => {
  const admin = fakeAdmin();
  await ensureWebConversation(admin, "paka", SESSION);
  assert.equal(admin.rows.contacts[0].name, "Pelawat Google 1B9D");
  assert.deepEqual(admin.rows.tags.map((t) => t.name), ["google"]);
});

await check("a later message finds the same thread and tags nothing again", async () => {
  const admin = fakeAdmin();
  const a = await ensureWebConversation(admin, "dungun", SESSION, "tiktok");
  const b = await ensureWebConversation(admin, "dungun", SESSION, "facebook");
  assert.equal(a, b);
  assert.deepEqual(admin.rows.tags.map((t) => t.name), ["tiktok"]);
  assert.equal(admin.rows.conversation_tags.length, 1);
});

console.log(`\nAll ${n} web chat source checks passed.`);
