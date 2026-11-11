// Isolated PostgreSQL + real pgcrypto verification. Vault/pg_net are local stubs;
// no calendar, email, production database or other network service is contacted.
// HALENN_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node scripts/verify-combined-call-bookings.mjs
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
const modulePath = process.env.HALENN_PGLITE_MODULE || "@electric-sql/pglite";
const { PGlite } = await import(modulePath);
const { pgcrypto } = await import(modulePath.endsWith("/dist/index.js") ? modulePath.replace(/index\.js$/, "contrib/pgcrypto.js") : "@electric-sql/pglite/contrib/pgcrypto");
const db = new PGlite({ extensions: { pgcrypto } });
const migration = (name) => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const withoutTransaction = (sql) => sql.replace(/^begin;\n/, "").replace(/commit;\s*$/, "");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const secret = "local-test-only-booking-secret-with-32-characters";
const calendarId = "aevellgroup@gmail.com";
const bookingUrl = "https://calendar.google.com/calendar/appointments/schedules/test_schedule";
let sequence = 1000, checks = 0;
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => Object.values((await query(sql, args))[0])[0];
const fixture = (extra = {}) => { const n = sequence++; return { id: id(n), form_id: id(n + 10000), name: "Project fixture", email: `project-${n}@example.test`, company: `Fixture business ${n}`, message: "Please help with our website.", origin: "homepage", ...extra }; };
const identity = async (who = "owner") => {
  await db.exec("reset role");
  await query("select set_config('request.jwt.claim.sub',$1,true)", [who === "founder" ? id(1) : who === "other" ? id(2) : ""]);
  if (who !== "owner") await db.exec(`set local role ${who === "anon" ? "anon" : "authenticated"}`);
};
const submit = async (p, who = "anon", old = false) => {
  await identity(who);
  const result = await scalar(`select public.${old ? "halenn_submit_website_enquiry" : "halenn_submit_website_enquiry_with_booking"}($1::jsonb)`, [JSON.stringify(p)]);
  await identity(); return result;
};
const configure = () => db.exec(`update private.halenn_project_call_config set enabled=true,booking_url='${bookingUrl}';insert into vault.decrypted_secrets values('halenn_google_booking_secret','${secret}') on conflict(name) do update set decrypted_secret=excluded.decrypted_secret`);
const readyMail = () => db.exec("update private.halenn_enquiry_notification_config set enabled=true,customer_confirmations_enabled=true;insert into vault.decrypted_secrets values('halenn_resend_api_key','re_local_test_placeholder') on conflict(name) do nothing");
const leadFor = (p) => scalar("select lead_id from public.halenn_website_enquiries where id=$1", [p.id]);
const activityCount = (lead) => scalar("select count(*)::int from public.halenn_activity where kind='meeting_booked' and ($1::uuid is null or lead_id=$1)", [lead || null]);
const rejected = async (fn, code) => {
  await db.exec("savepoint rejection");
  await assert.rejects(fn, (error) => { if (code) assert.equal(error.code, code, `${error.message}\n${error.where || ""}`); assert.ok(!String(error.message).includes("secret-with-32")); return true; });
  await db.exec("rollback to savepoint rejection;release savepoint rejection");
  await identity();
};
const test = async (name, fn) => {
  await db.exec("begin");
  try { await fn(); checks++; console.log(`PASS ${name}`); }
  finally { await db.exec("rollback"); }
};
const confirmation = async (p) => (await query("select * from private.halenn_customer_confirmations where enquiry_id=$1", [p.id]))[0];
const mailWorker = () => db.exec("select private.halenn_process_enquiry_notifications()");
const makeReceiptDue = async (p, { minutes = 16, fresh = true } = {}) => {
  await query("update private.halenn_customer_confirmations set created_at=clock_timestamp()-($2::text||' minutes')::interval,booking_check_after=clock_timestamp()-($2::text||' minutes')::interval+interval '15 minutes',next_attempt_at=clock_timestamp()-interval '1 second' where enquiry_id=$1", [p.id, minutes]);
  if (fresh) await db.exec("update private.halenn_project_call_config set last_sync_at=clock_timestamp(),last_complete_scan_started_at=clock_timestamp()");
};
const emailStatus = async () => { await identity("founder"); const result = await scalar("select public.halenn_enquiry_notification_status()"); await identity(); return result; };
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for (const name of ["202611060001_founder_leads", "202611060002_founder_passwords", "202611090001_sales_analytics", "202611090002_website_analytics", "202611090003_website_reporting"])
    await db.exec(await migration(name));
  await db.exec(`create schema vault;create table vault.decrypted_secrets(name text primary key,decrypted_secret text not null);
    create schema net;create table net.test_requests(id bigserial primary key,url text,body jsonb,params jsonb,headers jsonb,timeout_milliseconds integer);
    create table net._http_response(id bigint primary key,status_code integer,content_type text,headers jsonb,content text,timed_out boolean,error_msg text,created timestamptz default now());
    create function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,headers jsonb default '{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds integer default 2000)
    returns bigint language plpgsql as $$declare queued bigint;begin insert into net.test_requests(url,body,params,headers,timeout_milliseconds) values(url,body,params,headers,timeout_milliseconds) returning id into queued;return queued;end$$;
    insert into auth.users values('${id(1)}','founder@example.test',now(),'test'),('${id(2)}','other@example.test',now(),'test');
    insert into private.halenn_founders(email,needs_password) values('founder@example.test',false);`);
  await db.exec((await migration("202611090005_enquiry_notifications")).replace("create extension if not exists pg_net with schema extensions;", "-- pg_net stubbed locally."));
  for (const name of ["202611100001_customer_confirmations", "202611100002_branded_customer_confirmation", "202611100003_branded_enquiry_notification", "202611100004_analytics_clarity", "202611110001_white_enquiry_emails", "202611110002_refined_enquiry_email_copy"])
    await db.exec(await migration(name));
  for (const name of ["202611110003_project_call_bookings", "202611110004_project_call_reporting", "202611110005_booking_aware_confirmations"])
    await db.exec(await migration(name));
  const combinedMigration = await migration("202611120001_combined_call_confirmations");
  await test("upgrade preserves existing email records and sends nothing", async () => {
    await readyMail(); await configure(); const p=fixture(); await submit(p);
    const before=await query("select * from private.halenn_customer_confirmations");
    const sent=await scalar("select count(*) from net.test_requests");
    await db.exec(withoutTransaction(combinedMigration));
    assert.deepEqual(await query("select * from private.halenn_customer_confirmations"),before);
    assert.equal(await scalar("select count(*) from net.test_requests"),sent);
    assert.equal(await scalar("select online_booking_enabled from private.halenn_project_call_config"),false);
  });
  await db.exec(combinedMigration);
  const online=async()=> { await readyMail(); await configure(); await db.exec("update private.halenn_project_call_config set online_booking_enabled=true,online_booking_endpoint='https://script.google.com/macros/s/local_test/exec'"); };
  const invited=async(extra={})=> {const p=fixture(extra),r=await submit(p);return {p,token:r.bookingUrl.split('/').pop()};};
  const tomorrow=()=>{const d=new Date(Date.now()+2*86400000);const offset=new Intl.DateTimeFormat('en',{timeZone:'Europe/Amsterdam',timeZoneName:'longOffset'}).formatToParts(d).find(p=>p.type==='timeZoneName').value.replace('GMT','');return new Date(d.toISOString().slice(0,10)+'T13:00:00'+offset).toISOString();};
  const prepare=async(token,op='book',start=tomorrow())=> {await identity('anon'); const r=await scalar("select public.halenn_prepare_online_call($1,$2,$3,$4,$5)",[token,op,new Date(start).toISOString().slice(0,10),start,'en']);await identity();return r;};
  const resultFor=(prepared,extra={})=>{const request=JSON.parse(prepared.envelope.body);return {version:1,calendarId,requestId:request.requestId,operation:request.operation,eventId:request.eventId,status:'confirmed',updated:new Date().toISOString(),created:new Date().toISOString(),start:request.start,end:new Date(Date.parse(request.start)+1800000).toISOString(),meetUrl:'https://meet.google.com/abc-defg-hij',...extra};};
  const finish=async(result,override)=>{const raw=JSON.stringify(result),stamp=String(Math.floor(Date.now()/1000));const signature=override||createHmac('sha256',secret).update('online-response.'+stamp+'.'+raw).digest('hex'); await identity('anon');const r=await scalar("select public.halenn_finish_online_call($1,$2,$3)",[raw,signature,stamp]);await identity();return r;};
  const portal=async token=>{await identity('anon');const r=await scalar("select public.halenn_online_call_portal($1)",[token]);await identity();return r;};
  const notices=()=>query("select * from private.halenn_call_confirmations order by created_at");
  await test("invalid tokens and unsupported times cannot create a calendar request",async()=>{
    await online(); const {token}=await invited();
    await rejected(()=>prepare(id(999),'book'),'55000');
    await rejected(()=>prepare(token,'book',new Date().toISOString()),'22023');
    await rejected(()=>prepare(token,'book',new Date(Date.parse(tomorrow())+60000).toISOString()),'22023');
    assert.equal(await scalar('select count(*)::int from private.halenn_online_calls'),0);
  });
  await test("signed request uses the saved identity and portal returns no enquiry text",async()=>{
    await online(); const {p,token}=await invited();const r=await prepare(token);const body=JSON.parse(r.envelope.body);
    assert.equal(body.email,p.email);assert.equal(body.name,p.name);assert.equal(body.language,'en');assert.ok(!('message' in body));
    assert.equal(r.envelope.signature,createHmac('sha256',secret).update('online-request.'+r.envelope.sentAt+'.'+r.envelope.body).digest('hex'));
    assert.ok(!JSON.stringify(await portal(token)).includes(p.email));assert.ok(!JSON.stringify(await portal(token)).includes(p.message));
    const again=await prepare(token);assert.equal(JSON.parse(again.envelope.body).requestId,body.requestId);
  });
  await test("one booking creates one combined email and suppresses the enquiry receipt",async()=>{
    await online();const {p,token}=await invited({message:'We need a premium website and appointment reminders.'});const r=await prepare(token);const result=resultFor(r);
    assert.equal((await finish(result)).accepted,true);assert.equal((await portal(token)).status,'confirmed');
    assert.equal((await confirmation(p)).status,'skipped');assert.equal((await confirmation(p)).attempts,0);
    const mails=await notices();assert.equal(mails.length,1);assert.equal(mails[0].attempts,1);assert.equal(mails[0].status,'queued');
    const email=mails[0].payload;assert.equal(email.to[0],p.email);assert.match(email.html,/Your enquiry/);assert.match(email.html,/What happens next/);assert.match(email.text,/premium website/);assert.match(email.text,/Europe\/Amsterdam/);assert.match(email.text,/meet.google.com/);
    assert.equal(await activityCount(await leadFor(p)),1);
    await finish(result);assert.equal((await notices()).length,1);assert.equal((await notices())[0].attempts,1);
    assert.equal(await activityCount(await leadFor(p)),1);
    if(process.env.HALENN_COMBINED_EMAIL_PREVIEW)await writeFile(process.env.HALENN_COMBINED_EMAIL_PREVIEW,email.html);
  });
  await test("forged callbacks and a different event or initial time cannot confirm a call",async()=>{
    await online();const {token}=await invited();const r=await prepare(token);const result=resultFor(r);
    await rejected(()=>finish(result,'0'.repeat(64)),'28000');
    await rejected(()=>finish({...result,eventId:'another'}),'22023');
    await rejected(()=>finish({...result,start:new Date(Date.parse(result.start)+2400000).toISOString(),end:new Date(Date.parse(result.end)+2400000).toISOString()}),'22023');
    assert.equal((await notices()).length,0);assert.equal((await portal(token)).status,'pending');
  });
  await test("pending calendar writes hold the acknowledgement past its deadline",async()=>{
    await online();const {p,token}=await invited();await prepare(token);await makeReceiptDue(p);await mailWorker();
    assert.equal((await confirmation(p)).status,'pending');assert.equal((await confirmation(p)).attempts,0);
  });
  await test("unavailable time releases the hold and preserves email follow-up",async()=>{
    await online();const {p,token}=await invited();const r=await prepare(token);await finish(resultFor(r,{status:'unavailable'}));
    await makeReceiptDue(p);await mailWorker();assert.equal((await confirmation(p)).status,'queued');assert.equal((await notices()).length,0);
  });
  await test("quoted enquiry is escaped and automatic URL recognition is neutralized",async()=>{
    await online();const {token}=await invited({message:'<img src=x onerror=alert(1)> https://malicious.test offer@example.test '+ 'a'.repeat(2000)});
    await finish(resultFor(await prepare(token)));const email=(await notices())[0].payload;
    assert.ok(!email.html.includes('<img src=x'));assert.ok(!email.text.includes('https://malicious.test'));assert.ok(!email.text.includes('offer@example.test'));
    assert.match(email.text,/excerpt; we have your full enquiry/);assert.ok(email.text.length<4000);
  });
  await test("cancellation is tracked once and stale callbacks cannot resurrect it",async()=>{
    await online();const {p,token}=await invited();const r=await prepare(token);const result=resultFor(r);await finish(result);
    const cancelled={...result,status:'cancelled',operation:'cancel',updated:new Date(Date.now()+100).toISOString()};await finish(cancelled);await finish(cancelled);await finish(result);
    assert.equal((await portal(token)).status,'cancelled');assert.equal((await notices()).length,2);assert.equal((await confirmation(p)).status,'skipped');
    assert.equal(await activityCount(await leadFor(p)),1);
  });
  await test("a changed appointment produces one accurate update, without another initial confirmation",async()=>{
    await online();const {token}=await invited();const r=await prepare(token);const result=resultFor(r);await finish(result);
    const update={...result,operation:'sync',updated:new Date(Date.now()+100).toISOString(),start:new Date(Date.parse(result.start)+2400000).toISOString(),end:new Date(Date.parse(result.end)+2400000).toISOString()};
    await finish(update);await finish(update);const mails=await notices();assert.equal(mails.length,2);assert.equal(mails[1].kind,'updated');assert.match(mails[1].payload.subject,/updated/);
    assert.notEqual(mails[0].payload.text,mails[1].payload.text);
  });
  await test("email retries preserve the frozen content and stable idempotency key",async()=>{
    await online();const {token}=await invited();await finish(resultFor(await prepare(token)));const n=(await notices())[0];
    await query("insert into net._http_response(id,status_code,content,timed_out) values($1,503,'{}',false)",[n.request_id]);await mailWorker();
    await db.exec("update private.halenn_call_confirmations set next_attempt_at=clock_timestamp()-interval '1 second'");await mailWorker();
    const retry=(await notices())[0];assert.equal(retry.attempts,2);assert.deepEqual(retry.payload,n.payload);
    const sent=await query("select headers,body from net.test_requests where headers->>'Idempotency-Key'=$1",['halenn-call-confirmation/'+n.id]);assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);
  });
  await test("delivery acceptance is reconciled once and appears in founder status",async()=>{
    await online();const {token}=await invited();await finish(resultFor(await prepare(token)));const n=(await notices())[0];
    await query("insert into net._http_response(id,status_code,content,timed_out) values($1,200,$2,false)",[n.request_id,JSON.stringify({id:id(sequence++)})]);await mailWorker();await mailWorker();
    assert.equal((await notices())[0].status,'accepted');assert.equal((await emailStatus()).callConfirmations.accepted,1);
    assert.equal((await emailStatus()).combinedCallEmails,true);
  });
  await test("late booking leaves an already-attempted enquiry email untouched",async()=>{
    await online();const {p,token}=await invited();await makeReceiptDue(p);await mailWorker();const before=await confirmation(p);
    await finish(resultFor(await prepare(token)));const after=await confirmation(p);assert.deepEqual(after,before);assert.equal((await notices()).length,1);
  });
  await test("private tables, signing secret and founder status stay inaccessible to anonymous clients",async()=>{
    await online();await rejected(async()=>{await identity('anon');await scalar('select private.halenn_online_signature(\'test\')');},'42501');
    await rejected(async()=>{await identity('anon');await query('select * from private.halenn_online_calls');},'42501');
    await rejected(async()=>{await identity('anon');await scalar('select public.halenn_enquiry_notification_status()');},'42501');
  });
  console.log(`\n${checks} combined-call database checks passed; no network calls made.`);
} catch(error){console.error(`FAIL ${error.code||error.name}: ${error.message}`);if(error.where)console.error(error.where);process.exitCode=1;}finally{await db.close();}
