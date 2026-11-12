import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
const source=await readFile(new URL('./Code.gs',import.meta.url),'utf8')+'\n'+await readFile(new URL('./OnlineBooking.gs',import.meta.url),'utf8');
const context=vm.createContext({});vm.runInContext(source,context);
const app=context.HalennOnlineCalls;
const secret='test-only-secret-not-a-production-key-0123456789';
const requestId='00000000-0000-4000-8000-000000000001';
const eventId='halenn'+requestId.replaceAll('-','');
const copy=value=>JSON.parse(JSON.stringify(value));
const format=(date,pattern)=>{
  if(pattern==='yyyy-MM-dd')return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  const offset=new Intl.DateTimeFormat('en',{timeZone:'Europe/Amsterdam',timeZoneName:'longOffset'}).formatToParts(date).find(p=>p.type==='timeZoneName').value;
  return offset.replace('GMT','').replace(':','');
};
function fixture(overrides={}){
 const store=new Map(),events=new Map(),sent=[];let inserts=0,cancels=0,patches=0;
 const deps={secret,now:()=>Date.parse('2026-11-11T12:00:00Z'),format,
  hmac:(value,key)=>[...createHmac('sha256',key).update(value).digest()].map(v=>v>127?v-256:v),
  load:k=>store.get(k)||null,save:(k,v)=>store.set(k,v),remove:k=>store.delete(k),properties:()=>Object.fromEntries(store),sleep:()=>{},
  busy:()=>[],list:()=>[],get:id=>events.get(id)||null,
  insert:raw=>{inserts++;const event={...copy(raw),status:'confirmed',etag:'version-1',created:new Date(deps.now()).toISOString(),updated:new Date(deps.now()).toISOString(),hangoutLink:'https://meet.google.com/abc-defg-hij'};events.set(raw.id,event);return event;},
  patch:(id,fields,etag)=>{patches++;assert.equal(etag,events.get(id).etag);const event={...events.get(id),...copy(fields),updated:new Date(deps.now()+patches*1000).toISOString(),etag:'version-'+(patches+1)};events.set(id,event);return event;},
  cancel:id=>{cancels++;events.set(id,{status:'cancelled',updated:new Date(deps.now()+100).toISOString()});},
  deliver:envelope=>{sent.push(copy(envelope));return true;},...overrides};
 return {deps,store,events,sent,inserts:()=>inserts,cancels:()=>cancels,patches:()=>patches};
}
function signed(deps,extra={}){
 const body=JSON.stringify({version:1,calendarId:'aevellgroup@gmail.com',requestId,operation:'book',eventId,start:'2026-11-12T08:00:00.000Z',name:'Test Customer',email:'customer@example.test',language:'en',...extra});
 const sentAt=String(Math.floor(deps.now()/1000));return {body,sentAt,signature:createHmac('sha256',secret).update('online-request.'+sentAt+'.'+body).digest('hex')};
}
test('forged, expired and wrong-calendar requests are rejected before writes',()=>{
 const f=fixture();const request=signed(f.deps);
 assert.throws(()=>app.process({...request,signature:'0'.repeat(64)},f.deps));
 assert.throws(()=>app.process({...request,sentAt:'1000000000'},f.deps));
 assert.throws(()=>app.process(signed(f.deps,{calendarId:'other@example.test'}),f.deps));assert.equal(f.inserts(),0);
});
test('Amsterdam slots preserve 09:00–23:00 and the forty-minute grid',()=>{
 const f=fixture();const slots=copy(app.slots('2026-11-12',f.deps));assert.equal(slots.length,21);assert.equal(slots[0],'2026-11-12T08:00:00.000Z');assert.equal(slots.at(-1),'2026-11-12T21:20:00.000Z');
});
test('summer time and both daylight-saving transition days use Amsterdam local time',()=>{
 for(const [now,day,first] of [['2026-03-27T12:00:00Z','2026-03-29','2026-03-29T07:00:00.000Z'],['2026-10-23T12:00:00Z','2026-10-25','2026-10-25T08:00:00.000Z']]){
  const f=fixture({now:()=>Date.parse(now)});assert.equal(app.slots(day,f.deps)[0],first);
 }
});
test('twelve-hour notice, busy periods and ten-minute buffers are enforced',()=>{
 const f=fixture({now:()=>Date.parse('2026-11-11T21:00:00Z'),busy:()=>[{start:'2026-11-12T09:55:00Z',end:'2026-11-12T10:30:00Z'}]});
 const slots=copy(app.slots('2026-11-12',f.deps));assert.ok(!slots.includes('2026-11-12T08:00:00.000Z'));assert.ok(!slots.includes('2026-11-12T09:20:00.000Z'));assert.ok(!slots.includes('2026-11-12T10:00:00.000Z'));assert.ok(slots.includes('2026-11-12T10:40:00.000Z'));
});
test('all-day events and the daily three-call maximum close availability',()=>{
 let f=fixture({busy:()=>[{start:'2026-11-11T23:00:00Z',end:'2026-11-12T23:00:00Z'}]});assert.equal(app.slots('2026-11-12',f.deps).length,0);
 f=fixture({list:()=>Array.from({length:3},()=>({status:'confirmed',summary:'Halenn · Project call (Client)'}))});assert.equal(app.slots('2026-11-12',f.deps).length,0);
});
test('calendar errors never become invented availability',()=>{
 const f=fixture({busy:()=>{throw Error('Unavailable');}});assert.throws(()=>app.slots('2026-11-12',f.deps));assert.equal(f.inserts(),0);
});
test('an unavailable time returns a signed rejection and can recover its callback',()=>{
 const f=fixture({busy:()=>[{start:'2026-11-12T07:00:00Z',end:'2026-11-12T10:00:00Z'}],deliver:()=>false});const response=app.process(signed(f.deps),f.deps);
 assert.equal(JSON.parse(response.body).status,'unavailable');assert.equal(f.inserts(),0);assert.ok(f.store.has('HALENN_ONLINE_RESULT_'+requestId));
 f.deps.deliver=()=>true;app.reconcile(f.deps);assert.ok(!f.store.has('HALENN_ONLINE_RESULT_'+requestId));assert.ok(f.store.has('HALENN_ONLINE_CURSOR'));
 f.deps.busy=()=>[];assert.equal(JSON.parse(app.process(signed(f.deps),f.deps).body).status,'unavailable');assert.equal(f.inserts(),0);
});
test('booking creates a Meet event without attendees or a separate Google invitation',()=>{
 const f=fixture();const response=app.process(signed(f.deps),f.deps), event=f.events.get(eventId);
 assert.equal(f.inserts(),1);assert.equal(event.attendees,undefined);assert.equal(event.visibility,'private');assert.equal(event.extendedProperties.private.halennOnlineCall,requestId);
 assert.equal(Date.parse(event.end.dateTime)-Date.parse(event.start.dateTime),1800000);assert.equal(JSON.parse(response.body).meetUrl,'https://meet.google.com/abc-defg-hij');
 assert.equal(response.signature,createHmac('sha256',secret).update('online-response.'+response.sentAt+'.'+response.body).digest('hex'));
});
test('retrying the same request cannot create a second appointment',()=>{
 const f=fixture();app.process(signed(f.deps),f.deps);app.process(signed(f.deps),f.deps);assert.equal(f.inserts(),1);
});
test('a lost callback is persisted and recovered without recreating the event',()=>{
 const f=fixture({deliver:()=>false});app.process(signed(f.deps),f.deps);assert.ok(f.store.has('HALENN_ONLINE_RESULT_'+requestId));
 f.deps.deliver=()=>true;app.reconcile(f.deps);assert.ok(!f.store.has('HALENN_ONLINE_RESULT_'+requestId));assert.equal(f.inserts(),1);
});
test('a delayed Meet link is not falsely confirmed and a later sync recovers it',()=>{
 const f=fixture();const insert=f.deps.insert;f.deps.insert=raw=>{const e=insert(raw);delete e.hangoutLink;return e;};
 assert.throws(()=>app.process(signed(f.deps),f.deps),/Meeting link is being prepared/);assert.equal(f.sent.length,0);
 f.events.get(eventId).hangoutLink='https://meet.google.com/abc-defg-hij';app.reconcile(f.deps);assert.equal(f.sent.length,1);assert.equal(f.inserts(),1);
});
test('cancellation only modifies an event owned by this booking request',()=>{
 const f=fixture();f.events.set(eventId,{status:'confirmed',extendedProperties:{private:{halennOnlineCall:'different'}}});
 assert.throws(()=>app.process(signed(f.deps,{operation:'cancel'}),f.deps));assert.equal(f.cancels(),0);
});
test('cancellation is idempotent and cannot recreate a cancelled appointment',()=>{
 const f=fixture();app.process(signed(f.deps),f.deps);const cancelled=app.process(signed(f.deps,{operation:'cancel'}),f.deps);assert.equal(JSON.parse(cancelled.body).status,'cancelled');
 app.process(signed(f.deps,{operation:'cancel'}),f.deps);app.process(signed(f.deps),f.deps);assert.equal(f.inserts(),1);assert.equal(f.cancels(),1);
});
test('native calendar deletion is detected through the tracked request',()=>{
 const f=fixture();app.process(signed(f.deps),f.deps);f.events.delete(eventId);app.reconcile(f.deps);assert.equal(JSON.parse(f.sent.at(-1).body).status,'cancelled');
});
test('legacy sync never guesses an attendee for website-managed appointments',()=>{
 const f=fixture();app.process(signed(f.deps),f.deps);assert.equal(context.HalennProjectCalls.selectEvent(f.events.get(eventId),{}),null);
});

const changeId='10000000-0000-4000-8000-000000000001';
const move=(f,extra={})=>signed(f.deps,{operation:'reschedule',changeId,expectedUpdated:f.events.get(eventId).updated,start:'2026-11-12T10:00:00.000Z',...extra});
test('rescheduling patches the same event, preserves Meet and language, with no guest invitation',()=>{
 const f=fixture();app.process(signed(f.deps,{language:'nl'}),f.deps);const original=copy(f.events.get(eventId));
 const request=move(f);const result=JSON.parse(app.process(request,f.deps).body);app.process(request,f.deps);
 const changed=f.events.get(eventId);assert.equal(f.inserts(),1);assert.equal(f.patches(),1);assert.equal(f.cancels(),0);
 assert.equal(changed.id,eventId);assert.equal(changed.hangoutLink,original.hangoutLink);assert.equal(changed.description,original.description);assert.equal(changed.attendees,undefined);
 assert.equal(changed.start.dateTime,'2026-11-12T10:00:00.000Z');assert.equal(Date.parse(changed.end.dateTime)-Date.parse(changed.start.dateTime),1800000);
 assert.equal(result.rescheduleOutcome,'confirmed');assert.equal(result.changeId,changeId);
});
test('moving on a full day excludes only this call from the three-call limit',()=>{
 const f=fixture();app.process(signed(f.deps),f.deps);const own=f.events.get(eventId);
 const other=id=>({...copy(own),id,start:{dateTime:'2026-11-12T18:00:00Z'},end:{dateTime:'2026-11-12T18:30:00Z'}});
 f.deps.list=()=>[own,other('other1'),other('other2')];f.deps.busy=()=>[{start:own.start.dateTime,end:own.end.dateTime}];
 const slots=JSON.parse(app.process(signed(f.deps,{operation:'availability',day:'2026-11-12',excludeEventId:eventId,excludeCallId:requestId}),f.deps).body).slots;
 assert.ok(slots.includes('2026-11-12T10:00:00.000Z'));assert.equal(JSON.parse(app.process(move(f),f.deps).body).rescheduleOutcome,'confirmed');
 f.deps.list=()=>[other('other1'),other('other2'),other('other3')];assert.equal(JSON.parse(app.process(move(f,{changeId:changeId.replace(/1$/,'2'),start:'2026-11-12T12:00:00.000Z'}),f.deps).body).rescheduleOutcome,'unavailable');
});
test('merged freebusy never hides another overlapping event or an all-day block',()=>{
 const f=fixture();app.process(signed(f.deps),f.deps);const own=f.events.get(eventId);
 const other={id:'other',status:'confirmed',start:{dateTime:own.start.dateTime},end:{dateTime:own.end.dateTime}};
 f.deps.busy=()=>[{start:own.start.dateTime,end:own.end.dateTime}];f.deps.list=()=>[own,other];
 assert.ok(!copy(app.slots('2026-11-12',f.deps,own)).includes(own.start.dateTime));
 other.transparency='transparent';assert.ok(copy(app.slots('2026-11-12',f.deps,own)).includes(own.start.dateTime));
 delete other.transparency;other.start={date:'2026-11-12'};other.end={date:'2026-11-13'};
 assert.equal(app.slots('2026-11-12',f.deps,own).length,0);
});
test('unavailable changes preserve the original and remain terminal when the time later opens',()=>{
 const f=fixture();app.process(signed(f.deps),f.deps);const original=copy(f.events.get(eventId)),request=move(f);
 f.deps.busy=()=>[{start:'2026-11-12T09:00:00Z',end:'2026-11-12T11:00:00Z'}];
 assert.equal(JSON.parse(app.process(request,f.deps).body).rescheduleOutcome,'unavailable');assert.deepEqual(f.events.get(eventId),original);
 f.deps.busy=()=>[];assert.equal(JSON.parse(app.process(request,f.deps).body).rescheduleOutcome,'unavailable');assert.equal(f.patches(),0);
});
test('stale versions and concurrent Calendar changes cannot be overwritten',()=>{
 const f=fixture();app.process(signed(f.deps),f.deps);
 assert.equal(JSON.parse(app.process(move(f,{expectedUpdated:'2026-11-10T12:00:00Z'}),f.deps).body).rescheduleOutcome,'conflict');assert.equal(f.patches(),0);
 const original=copy(f.events.get(eventId));f.deps.patch=()=>{throw Error('Precondition failed 412');};
 assert.equal(JSON.parse(app.process(move(f,{changeId:changeId.replace(/1$/,'2')}),f.deps).body).rescheduleOutcome,'conflict');assert.deepEqual(f.events.get(eventId),original);
});
test('a patch that commits before a lost response is recovered without a second write',()=>{
 const f=fixture();app.process(signed(f.deps),f.deps);const patch=f.deps.patch;
 f.deps.patch=(...args)=>{patch(...args);throw Error('Lost response');};
 assert.throws(()=>app.process(move(f),f.deps),/being checked/);assert.ok(f.store.has('HALENN_ONLINE_MOVE_'+changeId));
 f.deps.patch=patch;app.reconcile(f.deps);assert.equal(f.patches(),1);assert.ok(!f.store.has('HALENN_ONLINE_MOVE_'+changeId));
 assert.equal(JSON.parse(f.sent.at(-1).body).rescheduleOutcome,'confirmed');
});
test('old change retries never rewind newer tracking or discard a newer pending callback',()=>{
 const f=fixture();app.process(signed(f.deps),f.deps);const first=move(f);app.process(first,f.deps);
 const second=move(f,{changeId:changeId.replace(/1$/,'2'),start:'2026-11-12T12:00:00.000Z'});f.deps.deliver=()=>false;app.process(second,f.deps);
 const pending=f.store.get('HALENN_ONLINE_RESULT_'+requestId);f.deps.deliver=()=>true;app.process(first,f.deps);
 assert.equal(f.store.get('HALENN_ONLINE_RESULT_'+requestId),pending);app.reconcile(f.deps);
 assert.equal(f.events.get(eventId).start.dateTime,'2026-11-12T12:00:00.000Z');assert.equal(f.patches(),2);
 f.deps.now=()=>Date.parse('2026-11-11T12:00:03Z');app.process(signed(f.deps,{operation:'cancel'}),f.deps);app.process(first,f.deps);
 assert.equal(JSON.parse(f.store.get('HALENN_ONLINE_TRACK_'+requestId)).status,'cancelled');
});
test('rescheduling and exclusion reject an event owned by someone else',()=>{
 const f=fixture();app.process(signed(f.deps),f.deps);f.events.get(eventId).extendedProperties.private.halennOnlineCall='other';
 assert.throws(()=>app.process(move(f),f.deps),/Unexpected calendar event/);
 assert.throws(()=>app.process(signed(f.deps,{operation:'availability',day:'2026-11-12',excludeEventId:eventId,excludeCallId:requestId}),f.deps),/Unexpected calendar event/);
 assert.equal(f.patches(),0);
});
