// Synthetic database only. No Supabase, WhatsApp messages, or real contacts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const pg = new PGlite();
let checks = 0;
const contact = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const conversation = n => `00000001-0000-4000-8000-${String(n).padStart(12,'0')}`;
const initial = readFileSync(new URL('../supabase/migrations/2026-09-23_weight_loss_pipeline.sql', import.meta.url), 'utf8');
const classifier = initial.match(/create or replace function public\.is_weight_loss_enquiry[\s\S]*?\$\$;/)[0];
const migration = readFileSync(new URL('../supabase/migrations/2026-10-05_weight_loss_reenquiry.sql', import.meta.url), 'utf8');
function check(label, actual, expected) { assert.deepEqual(actual,expected,label); checks++; console.log(`PASS ${label}`); }
async function status(n) {
  const r = await pg.query(`SELECT c.stage,k.pipeline_removed_at IS NOT NULL AS removed,
    EXISTS(SELECT 1 FROM conversation_tags ct WHERE ct.conversation_id=c.id) AS tagged
    FROM conversations c JOIN contacts k ON k.id=c.contact_id WHERE c.id=$1`,[conversation(n)]);
  return r.rows[0];
}
async function inbound(n, body, created='2026-10-05T11:23:33Z', direction='inbound') {
  await pg.query(`INSERT INTO messages (conversation_id,body,created_at,direction) VALUES ($1,$2,$3,$4)`,[conversation(n),body,created,direction]);
}
try {
  await pg.exec(`CREATE TABLE contacts(id uuid PRIMARY KEY,pipeline_removed_at timestamptz);
    CREATE TABLE conversations(id uuid PRIMARY KEY,contact_id uuid REFERENCES contacts(id),stage text);
    CREATE TABLE tags(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text UNIQUE,color text);
    CREATE TABLE conversation_tags(conversation_id uuid REFERENCES conversations(id),tag_id uuid REFERENCES tags(id),PRIMARY KEY(conversation_id,tag_id));
    CREATE TABLE messages(id uuid DEFAULT gen_random_uuid(),conversation_id uuid REFERENCES conversations(id),direction text,body text,created_at timestamptz);`);
  await pg.exec(classifier);
  for(const [body,expected] of [['Mounjaro boleh spay x?',true],['Wegovy harga?',true],['Nak turun berat badan',true],['weight loss',true],['munjaro',true],['medical checkup percuma PeKa B40',false],['Assalamualaikum',false],['muslim',false]]) {
    check(`classifier: ${body}`, (await pg.query('SELECT is_weight_loss_enquiry($1) AS yes',[body])).rows[0].yes, expected);
  }
  for(let n=1;n<=10;n++) {
    await pg.query(`INSERT INTO contacts VALUES($1,$2)`,[contact(n),[2,3,4,6].includes(n)?'2026-09-23T06:52:33Z':null]);
    await pg.query(`INSERT INTO conversations VALUES($1,$2,$3)`,[conversation(n),contact(n),n===5?'won':'qualified']);
  }
  await pg.query(`INSERT INTO conversations VALUES($1,$2,'qualified')`,[conversation(12),contact(2)]);
  await inbound(12,'Mounjaro','2026-09-20T00:00:00Z');
  await pg.exec(`INSERT INTO tags(name,color) VALUES('weight-loss','#16a34a')`);
  await pg.query('INSERT INTO conversation_tags SELECT $1,id FROM tags',[conversation(5)]);
  await inbound(2,'Mounjaro boleh spay x?');
  await inbound(3,'Mounjaro','2026-09-21T08:00:00Z');
  await inbound(5,'Wegovy');
  await inbound(6,'medical checkup');
  await pg.exec(migration);
  await pg.exec(`CREATE TRIGGER messages_tag_weight_loss AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION trg_message_tag_weight_loss()`);
  check('backfill restores missed fresh enquiries to New',await status(2),{stage:'new',removed:false,tagged:true});
  check('backfill excludes pre-removal messages',await status(3),{stage:'qualified',removed:true,tagged:false});
  check('backfill keeps a Won prospect at Won',await status(5),{stage:'won',removed:false,tagged:true});
  check('ordinary checkup does not restore removed contact',await status(6),{stage:'qualified',removed:true,tagged:false});
  await inbound(1,'Wegovy');
  check('first weight-loss enquiry creates New prospect',await status(1),{stage:'new',removed:false,tagged:true});
  await pg.query("UPDATE conversations SET stage='booking' WHERE id=$1",[conversation(1)]);
  await inbound(1,'Mounjaro package');
  check('repeat enquiries preserve a staff-set Booking stage',await status(1),{stage:'booking',removed:false,tagged:true});
  await inbound(4,'Mounjaro','2026-09-20T00:00:00Z');
  check('replayed old message cannot restore a removed contact',await status(4),{stage:'qualified',removed:true,tagged:false});
  await inbound(4,'Wegovy');
  check('new message after removal restores New prospect',await status(4),{stage:'new',removed:false,tagged:true});
  await inbound(7,'Mounjaro','2026-10-05T11:23:33Z','outbound');
  check('outbound promotion cannot create a prospect', (await status(7)).tagged,false);
  await inbound(8,'PeKa B40 free medical checkup');
  check('free checkup is not a weight-loss enquiry',(await status(8)).tagged,false);
  await inbound(9,null);
  check('empty messages do not create prospects',(await status(9)).tagged,false);
  const before=(await pg.query('SELECT conversation_id,tag_id FROM conversation_tags ORDER BY conversation_id')).rows;
  await pg.exec(migration);
  check('migration is safe to repeat',(await pg.query('SELECT conversation_id,tag_id FROM conversation_tags ORDER BY conversation_id')).rows,before);
  check('repeat migration does not re-enrol older threads after clearing removal',(await status(12)).tagged,false);
  check('repeat migration does not reset Booking',(await status(1)).stage,'booking');
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url),'utf8');
  await pg.exec(schema.match(/create or replace function public\.is_weight_loss_enquiry[\s\S]*?\$\$;/)[0]);
  await pg.exec(schema.match(/create or replace function public\.trg_message_tag_weight_loss[\s\S]*?\$\$;/)[0]);
  await inbound(3,'Wegovy');
  check('fresh-install schema also restores fresh enquiries to New',await status(3),{stage:'new',removed:false,tagged:true});
  // Missing classifier/tagging failure must not lose a customer's message.
  await pg.exec('DROP TABLE conversation_tags');
  await inbound(10,'Mounjaro');
  check('tagging failure still stores the inbound message',(await pg.query('SELECT COUNT(*)::int AS n FROM messages WHERE conversation_id=$1',[conversation(10)])).rows[0].n,1);
  console.log(`All ${checks} weight-loss pipeline checks passed.`);
} finally { await pg.close(); }
