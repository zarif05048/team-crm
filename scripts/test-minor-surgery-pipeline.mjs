// Minor-surgery board (2026-11-09_minor_surgery_pipeline.sql), on a synthetic
// in-memory database. No Supabase, no real contacts or messages.
// Run: node scripts/test-minor-surgery-pipeline.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const pg = new PGlite();
let checks = 0;
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); checks++; console.log(`PASS ${label}`); };
const contact = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const conv = (n) => `00000001-0000-4000-8000-${String(n).padStart(12, "0")}`;
const migration = readFileSync(new URL("../supabase/migrations/2026-11-09_minor_surgery_pipeline.sql", import.meta.url), "utf8");

const say = (n, body, created = new Date().toISOString(), direction = "inbound") =>
  pg.query(`INSERT INTO messages (conversation_id, body, created_at, direction) VALUES ($1,$2,$3,$4)`, [conv(n), body, created, direction]);
const state = async (n) => (await pg.query(
  `SELECT c.stage,
     EXISTS (SELECT 1 FROM conversation_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.conversation_id = c.id AND t.name = 'minor-surgery') AS on_board
   FROM conversations c WHERE c.id = $1`, [conv(n)])).rows[0];
const tag = (n, name) => pg.query(`INSERT INTO conversation_tags SELECT $1, id FROM tags WHERE name = $2`, [conv(n), name]);

await pg.exec(`
  CREATE TABLE contacts (id uuid PRIMARY KEY, pipeline_removed_at timestamptz);
  CREATE TABLE conversations (id uuid PRIMARY KEY, contact_id uuid REFERENCES contacts(id), stage text);
  CREATE TABLE tags (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, color text);
  CREATE TABLE conversation_tags (conversation_id uuid REFERENCES conversations(id), tag_id uuid REFERENCES tags(id), PRIMARY KEY (conversation_id, tag_id));
  CREATE TABLE messages (id uuid DEFAULT gen_random_uuid(), conversation_id uuid REFERENCES conversations(id), direction text, body text, created_at timestamptz);
  INSERT INTO tags (name, color) VALUES ('weight-loss', '#16a34a'), ('staff', '#64748b');`);
for (let n = 1; n <= 9; n++) {
  await pg.query(`INSERT INTO contacts (id) VALUES ($1)`, [contact(n)]);
  await pg.query(`INSERT INTO conversations VALUES ($1,$2,'qualified')`, [conv(n), contact(n)]);
}
// before the migration: an enquiry 10 days ago (backfilled) and one 90 days ago (left off)
await say(1, "Berapa harga buang ketuat?", new Date(Date.now() - 10 * 864e5).toISOString());
await say(2, "Nak buang sista kat belakang", new Date(Date.now() - 90 * 864e5).toISOString());
// a weight-loss card asking about a lipoma 5 days ago keeps its stage
await tag(3, "weight-loss");
await pg.query(`UPDATE conversations SET stage = 'booking' WHERE id = $1`, [conv(3)]);
await say(3, "Boleh buang lipoma sekali?", new Date(Date.now() - 5 * 864e5).toISOString());
// a staff member asking is never a prospect
await tag(4, "staff");
await say(4, "Dr, bisul kat kaki boleh toreh?", new Date(Date.now() - 3 * 864e5).toISOString());

await pg.exec(migration);
await pg.exec(migration);   // safe to run twice

for (const [body, yes] of [
  ["Berapa harga buang ketuat?", true], ["nak buang tahi lalat", true], ["skin tag kat leher", true],
  ["ada sista kecil", true], ["lipoma", true], ["benjol kat tangan", true], ["bisul bernanah", true],
  ["kuku masuk isi", true], ["ingrown toenail", true], ["chalazion mata", true], ["pembedahan kecil", true],
  ["minor surgery price?", true], ["Hi assistant", false], ["Assalamualaikum doktor", false],
  ["Nak sunat anak", false], ["Mounjaro harga?", false], ["moleculer", false],
]) check(`classifier: ${body}`, (await pg.query(`SELECT is_minor_surgery_enquiry($1) AS y`, [body])).rows[0].y, yes);

check("backfill: a 10-day-old enquiry is on the board, in New", await state(1), { stage: "new", on_board: true });
check("backfill: a 90-day-old enquiry is left off", await state(2), { stage: "qualified", on_board: false });
check("backfill: a weight-loss card joins the board but keeps its stage", await state(3), { stage: "booking", on_board: true });
check("backfill: staff are skipped", await state(4), { stage: "qualified", on_board: false });

await say(5, "Doktor, saya nak tanya pasal buang kutil");
check("new enquiry: tagged and starts in New", await state(5), { stage: "new", on_board: true });
await pg.query(`UPDATE conversations SET stage = 'booking' WHERE id = $1`, [conv(5)]);
await say(5, "ketuat tu dah makin besar");
check("a second message never resets a stage staff moved", await state(5), { stage: "booking", on_board: true });
await say(6, "buang ketuat?", new Date().toISOString(), "outbound");
check("the clinic's own messages do not tag", await state(6), { stage: "qualified", on_board: false });
await say(7, "Hi, waktu buka bila?");
check("an ordinary question does not tag", await state(7), { stage: "qualified", on_board: false });

// removal: older/replayed messages stay off, a fresh enquiry comes back
const removedAt = new Date(Date.now() - 60_000).toISOString();
await pg.query(`UPDATE contacts SET surgery_removed_at = $2 WHERE id = $1`, [contact(8), removedAt]);
await say(8, "nak cabut kuku", new Date(Date.now() - 120_000).toISOString());
check("removed: a message from before the removal stays off", await state(8), { stage: "qualified", on_board: false });
await say(8, "nak cabut kuku jari kaki");
check("removed: a fresh enquiry puts them back in New", await state(8), { stage: "new", on_board: true });
check("removed: the marker is cleared", (await pg.query(`SELECT surgery_removed_at FROM contacts WHERE id = $1`, [contact(8)])).rows[0].surgery_removed_at, null);
check("the weight-loss removal marker is a different column, untouched",
  (await pg.query(`SELECT pipeline_removed_at FROM contacts WHERE id = $1`, [contact(8)])).rows[0].pipeline_removed_at, null);

console.log(`\nAll ${checks} minor-surgery pipeline checks passed.`);
