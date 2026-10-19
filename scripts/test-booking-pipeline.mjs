// PostgreSQL-compatible disposable database only. No patient records or messages.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const pg=new PGlite();let checks=0;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const migration=readFileSync('supabase/migrations/2026-10-19_auto_booking_pipeline.sql','utf8');
const check=(label,a,b)=>{assert.deepEqual(a,b,label);checks++;console.log('PASS '+label);};
async function seed(n,stage='new',tag='weight-loss',extra={}) {
  await pg.query('insert into contacts(id,pipeline_removed_at) values($1,$2)',[id(n),extra.removed?'2026-10-01T00:00:00Z':null]);
  for(const offset of [1000,2000]) await pg.query('insert into conversations(id,contact_id,stage) values($1,$2,$3)',[id(n+offset),id(n),stage]);
  if(tag)await tagThread(n+1000,tag);
  return id(n+2000); // book on the OTHER line, which need not carry the prospect tag
}
async function tagThread(n,name){await pg.query('insert into conversation_tags select $1,id from tags where name=$2 on conflict(conversation_id,tag_id) do update set tag_id=excluded.tag_id',[id(n),name]);}
async function stages(n){return (await pg.query('select stage from conversations where contact_id=$1 order by id',[id(n)])).rows.map(r=>r.stage);}
try {
  await pg.exec(`create role anon;create role authenticated;create role service_role;
    create table contacts(id uuid primary key,pipeline_removed_at timestamptz,pipeline_booking_date date);
    create table conversations(id uuid primary key,contact_id uuid references contacts(id),stage text,stage_entered_at timestamptz default now());
    create table tags(id uuid primary key default gen_random_uuid(),name text unique,color text);
    create table conversation_tags(conversation_id uuid references conversations(id),tag_id uuid references tags(id),primary key(conversation_id,tag_id));
    insert into tags(name)values('weight-loss'),('weight loss'),('booking'),('staff');`);
  // Records present before the migration exercise its narrowly scoped repair.
  await seed(1,'qualified');await tagThread(1001,'booking');
  await seed(2,'won');await tagThread(1002,'booking');
  await seed(3,'lost');await tagThread(1003,'booking');
  await seed(4,'qualified','weight-loss',{removed:true});await tagThread(1004,'booking');
  await seed(5,'new',null);await tagThread(1005,'booking');
  await seed(6,'qualified');await tagThread(1006,'staff');await tagThread(1006,'booking');
  await pg.exec(migration);
  check('repairs existing active booked prospects across lines',await stages(1),['booking','booking']);
  check('historical Won is preserved',await stages(2),['won','won']);
  check('historical Lost is preserved',await stages(3),['lost','lost']);
  check('removed patient is not restored by the migration',await stages(4),['qualified','qualified']);
  check('non-weight-loss historical booking is unchanged',await stages(5),['new','new']);
  check('staff are excluded from the repair',await stages(6),['qualified','qualified']);
  const botThread=await seed(10);
  await pg.query('select record_pipeline_booking($1)',[botThread]);
  check('bot booking moves every patient thread',await stages(10),['booking','booking']);
  await seed(11,'no_response','weight loss');await tagThread(2011,'booking');
  check('manual Booking tag accepts legacy weight-loss tag and another line',await stages(11),['booking','booking']);
  await pg.query("update conversations set stage='qualified' where contact_id=$1",[id(11)]);
  check('staff can move the card later despite a retained Booking tag',await stages(11),['qualified','qualified']);
  await tagThread(2011,'booking');
  check('a repeat recorded booking moves back to Booking',await stages(11),['booking','booking']);
  await seed(12,'qualified');
  await pg.query("update contacts set pipeline_booking_date='2026-10-25' where id=$1",[id(12)]);
  check('saving a booking date moves all patient threads',await stages(12),['booking','booking']);
  await pg.query("update conversations set stage='qualified' where contact_id=$1",[id(12)]);
  await pg.query("update contacts set pipeline_booking_date='2026-10-25' where id=$1",[id(12)]);
  check('resaving an unchanged date does not undo a staff move',await stages(12),['qualified','qualified']);
  await pg.query('update contacts set pipeline_booking_date=null where id=$1',[id(12)]);
  check('clearing a date does not create a booking',await stages(12),['qualified','qualified']);
  const normal=await seed(13,'new',null);await pg.query('select record_pipeline_booking($1)',[normal]);
  check('ordinary bot bookings keep previous single-thread Follow Up behaviour',await stages(13),['new','qualified']);
  await seed(14,'new',null);await tagThread(1014,'booking');
  check('manual tags on unrelated contacts leave the pipeline alone',await stages(14),['new','new']);
  await seed(15,'new','weight-loss',{removed:true});await tagThread(1015,'booking');
  await pg.query("update contacts set pipeline_booking_date='2026-10-26' where id=$1",[id(15)]);
  check('manual booking events do not restore removed patients',await stages(15),['new','new']);
  await seed(16);await tagThread(1016,'staff');await tagThread(1016,'booking');
  await pg.query("update contacts set pipeline_booking_date='2026-10-26' where id=$1",[id(16)]);
  check('manual booking events exclude Staff identity',await stages(16),['new','new']);
  await assert.rejects(pg.query('select record_pipeline_booking($1)',[id(999999)]),/Conversation not found/);checks++;
  const before=(await pg.query('select id,stage from conversations order by id')).rows;
  await pg.exec(migration);
  check('reapplying migration preserves the resulting stages',(await pg.query('select id,stage from conversations order by id')).rows,before);
  check('fresh-install schema contains identical booking rules',readFileSync('supabase/schema.sql','utf8').includes(migration),true);
  console.log(`All ${checks} booking-pipeline checks passed.`);
} finally {await pg.close();}
