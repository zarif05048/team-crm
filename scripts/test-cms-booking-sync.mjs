import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const pg=new PGlite();
try {
  await pg.exec(`create role anon;create role authenticated;create role service_role;
    create table contacts(id uuid primary key default gen_random_uuid(),wa_id text,name text,profile_name text,phone_number text,pipeline_removed_at timestamptz,pipeline_booking_date date);
    create table conversations(id uuid primary key default gen_random_uuid(),contact_id uuid references contacts(id),stage text);
    create table tags(id uuid primary key default gen_random_uuid(),name text unique);
    create table conversation_tags(conversation_id uuid references conversations(id),tag_id uuid references tags(id),primary key(conversation_id,tag_id));
    insert into tags(name)values('weight-loss'),('staff');`);
  await pg.exec(readFileSync('supabase/migrations/2026-10-19_auto_booking_pipeline.sql','utf8'));
  await pg.exec(readFileSync('supabase/migrations/2026-10-19_cms_booking_sync.sql','utf8'));
  async function seed(phone,name='Synthetic',tag='weight-loss',extra={}) {
    const id=randomUUID();await pg.query('insert into contacts(id,wa_id,phone_number,name,pipeline_removed_at)values($1,$2,$3,$4,$5)',[id,randomUUID(),phone,name,extra.removed?'2026-10-01':null]);
    for(let i=0;i<2;i++)await pg.query("insert into conversations(contact_id,stage)values($1,'new')",[id]);
    if(tag)await pg.query('insert into conversation_tags select c.id,t.id from conversations c,tags t where c.contact_id=$1 and t.name=$2',[id,tag]);
    return id;
  }
  const sync=async(phone,name='Synthetic',key=randomUUID())=>(await pg.query('select record_cms_pipeline_booking($1,$2,$3)result',[key,phone,name])).rows[0].result;
  const stages=async(id)=>(await pg.query('select stage from conversations where contact_id=$1',[id])).rows.map(r=>r.stage);
  const patient=await seed('60123456789');const key=randomUUID();
  assert.equal(await sync('012-345 6789','Synthetic',key),'booking');assert.deepEqual(await stages(patient),['booking','booking']);
  await pg.query("update conversations set stage='won' where contact_id=$1",[patient]);
  assert.equal(await sync('+60 12 3456789','Synthetic',key),'duplicate');assert.deepEqual(await stages(patient),['won','won'],'retry preserves subsequent staff move');
  assert.equal(await sync('0060123456789'),'booking','new appointment reopens Booking');
  const normal=await seed('60123456000','Normal',null);assert.equal(await sync('0123456000','Normal'),'ignored');assert.deepEqual(await stages(normal),['new','new']);
  const removed=await seed('60123456001','Removed','weight-loss',{removed:true});assert.equal(await sync('0123456001','Removed'),'ignored');assert.deepEqual(await stages(removed),['new','new']);
  const staff=await seed('60123456002','Staff');await pg.query("insert into conversation_tags select c.id,t.id from conversations c,tags t where c.contact_id=$1 and t.name='staff'",[staff]);
  assert.equal(await sync('0123456002','Staff'),'ignored');
  const a=await seed('60123456003','Person A'),b=await seed('60123456003','Person B');
  assert.equal(await sync('0123456003','Unknown'),'ignored','ambiguous phone is never guessed');
  assert.equal(await sync('0123456003','Person B'),'booking');assert.deepEqual(await stages(a),['new','new']);assert.deepEqual(await stages(b),['booking','booking']);
  assert.equal(await sync(''),'ignored');assert.equal(await sync('not a phone'),'ignored');
  assert.equal((await pg.query("select has_function_privilege('authenticated','record_cms_pipeline_booking(uuid,text,text)','execute') allowed")).rows[0].allowed,false);
  await pg.exec(readFileSync('supabase/migrations/2026-10-19_cms_booking_sync.sql','utf8'));
  assert.equal(await sync('0123456789','Synthetic',key),'duplicate','receipts survive migration reruns');
  console.log('CMS to CRM sync: all 12 scenarios passed');
}finally{await pg.close()}
