// bot_rules migration, offline on PGlite: re-runnable, refuses bad rows, and
// every insert/edit/delete lands in bot_rules_log with before and after.
// Run: node scripts/test-bot-rules.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const pg = new PGlite();
const sql = readFileSync("supabase/migrations/2026-11-01_bot_rules.sql", "utf8");
await pg.exec(sql);
await pg.exec(sql);

await pg.query("insert into bot_rules (kind, scope, title, body, updated_by) values ('rule','dungun','Tone','Say hi','hermes')");
await pg.query("update bot_rules set body = 'Say hello', updated_by = 'hermes' where id = 1");
await pg.query("delete from bot_rules where id = 1");
const log = (await pg.query("select rule_id, action, before->>'body' as b, after->>'body' as a, changed_by from bot_rules_log order by id")).rows;
assert.deepEqual(log.map((r) => [r.action, r.b, r.a, r.changed_by]), [
  ["insert", null, "Say hi", "hermes"],
  ["update", "Say hi", "Say hello", "hermes"],
  ["delete", "Say hello", null, "hermes"],
]);

for (const bad of [
  "insert into bot_rules (scope, body) values ('everyone', 'x')",
  "insert into bot_rules (kind, body) values ('secret', 'x')",
  "insert into bot_rules (body) values ('   ')",
  `insert into bot_rules (body) values ('${"x".repeat(3001)}')`,
]) await assert.rejects(pg.query(bad));

const rls = (await pg.query("select relname, relrowsecurity from pg_class where relname in ('bot_rules','bot_rules_log') order by relname")).rows;
assert.deepEqual(rls.map((r) => r.relrowsecurity), [true, true], "only the secret key may read or write");

console.log("bot_rules: re-runnable, bad rows refused, every change logged with before/after, RLS on");
