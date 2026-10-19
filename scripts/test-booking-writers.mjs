import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const rpcCalls=[],stageWrites=[];
const db={auth:{getUser:async()=>({data:{user:{id:'test-staff'}}})},
  async rpc(name,input){rpcCalls.push({name,input});return{data:true,error:null};},
  from(table){const q={insert(){return q;},upsert(){return q;},select(){return q;},eq(){return q;},update(value){if(table==='conversations')stageWrites.push(value);return q;},
    async single(){return{data:{id:'test-tag'}};},async maybeSingle(){return{data:{id:'test-conversation',last_inbound_at:new Date().toISOString(),contact:{id:'test-contact',wa_id:'synthetic',phone_number:null,name:'TEST'},whatsapp_number:{id:'test-line',phone_number_id:'synthetic'}}};},
    then(resolve,reject){return Promise.resolve({data:null,error:null}).then(resolve,reject);}};return q;}};
function load(file,requireImpl){const exports={};const ctx=vm.createContext({exports,module:{exports},process:{env:{}},Date,Map,Set,console:{log(){},error(){}},require:requireImpl});vm.runInContext(compile(file),ctx);return ctx;}
const helper=load('src/lib/pipeline-booking.ts',()=>{throw Error('Unexpected import');}).module.exports;
const tca={addToTcaList:async()=>({ok:true,tab:'October',url:'https://example.invalid/test'}),malaysiaToday:()=>({year:2026,month:10,day:19,weekday:'Isnin'})};
const bot=load('src/lib/ai/bot.ts',name=>{
  if(name==='@/lib/pipeline-booking')return helper;
  if(name==='@anthropic-ai/sdk')return{default:class{}};
  if(name==='@/lib/sheets/tca')return tca;
  if(name==='./knowledge')return{BOT_SYSTEM_PROMPT:'synthetic'};
  if(name==='./peka-b40')return{isPekaB40Enquiry:()=>false};
  if(['@/lib/supabase/admin','@/lib/whatsapp/send','./pricing','./roster'].includes(name))return{};
  throw Error('Unexpected import '+name);
});
await bot.executeTool(db,'test-conversation',{}, {name:'book_appointment',input:{patient_name:'TEST',service:'house call',branch:'Paka',preferred_time:'tomorrow'}});
await bot.executeTool(db,'test-conversation',{}, {name:'book_minor_surgery',input:{patient_name:'TEST',procedure:'synthetic procedure',branch:'Paka',preferred_date:'2026-10-26'}});
const actions=load('src/app/(app)/inbox/[id]/actions.ts',name=>{
  if(name==='@/lib/pipeline-booking')return helper;
  if(name==='@/lib/supabase/server')return{createClient:async()=>db};
  if(name==='@/lib/supabase/admin')return{createAdminClient:()=>db};
  if(name==='@/lib/sheets/tca')return tca;
  if(name==='@/lib/data/conversations')return{WEIGHT_LOSS_TAG:'weight-loss'};
  if(['@/lib/whatsapp/send','@/lib/types'].includes(name))return{};
  throw Error('Unexpected action import '+name);
});
const result=await actions.module.exports.addTcaEntry('test-conversation',{patientName:'TEST',procedure:'synthetic',branch:'Paka',date:'2026-10-26'});
assert.equal(result.ok,true);
assert.equal(rpcCalls.length,3,'Both CRM bot booking tools and the manual staff action must call the shared database rule');
assert.ok(rpcCalls.every(c=>c.name==='record_pipeline_booking'&&c.input.p_conversation_id==='test-conversation'));
assert.equal(stageWrites.length,0,'Booking writers must never overwrite Booking with Follow Up');
await assert.rejects(helper.recordBookingStage({rpc:async()=>({error:{message:'synthetic failure'}})},'test-conversation'),/Could not update/);
// Exercise the actual fleet bridge booking path with no real database or notes.
const fleet=readFileSync('../HIJRAA-BOT-for-marketing-PC/bridge.js','utf8');
const scope=vm.createContext({module:{exports:{}},process:{env:{}},console:{log(){}},db,
  require(name){if(name==='@supabase/supabase-js')return{createClient:()=>db};return{timedFetch(){}};}});
vm.runInContext(fleet,scope);
vm.runInContext("crm=()=>db;numberId='test-line';ensureContact=async()=> 'test-contact';ensureConversation=async()=> 'test-conversation';",scope);
await scope.module.exports.noteBooking({phone:'synthetic',name:'TEST',service:'synthetic',branch:'Paka',preferredTime:'2026-10-26'});
assert.equal(rpcCalls.length,4,'Fleet bot bookings also call the shared database rule');
assert.equal(stageWrites.length,0);
console.log('All four booking writers use the shared rule; none overwrite Booking with Follow Up. RPC failures are reported. No messages or sheet entries sent.');
