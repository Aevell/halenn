// Isolated PostgreSQL + real pgcrypto verification. Vault/pg_net are local stubs;
// no calendar, email, production database or other network service is contacted.
// HALENN_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node scripts/verify-project-call-bookings.mjs
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
let sequence = 1000, checks = 0, timeBase = Date.now();
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
const iso = (seconds = 0) => new Date(timeBase + seconds * 1000).toISOString();
const event = (email, extra = {}) => ({ id: `event_${sequence++}`, status: "confirmed", updated: iso(-60), created: iso(-90), start: iso(86400), end: iso(86400 + 1800), attendeeEmail: email, attendeeName: "Project guest", preferredLanguage: "en", ...extra });
const sign = (raw, sentAt) => createHmac("sha256", secret).update(`${sentAt}.${raw}`).digest("hex");
const receiveRaw = async (raw, sentAt = String(Math.floor(Date.now() / 1000)), signature = sign(raw, sentAt)) => {
  await identity("anon");
  const result = await scalar("select public.halenn_receive_project_call_events($1,$2,$3)", [raw, signature, sentAt]);
  await identity(); return result;
};
const receive = (events, extra = {}) => receiveRaw(JSON.stringify({ version: 1, calendarId, events, ...extra }));
const record = async (e) => (await query("select * from private.halenn_project_call_bookings where event_id=$1", [e.id]))[0];
const leadFor = (p) => scalar("select lead_id from public.halenn_website_enquiries where id=$1", [p.id]);
const activityCount = (lead) => scalar("select count(*)::int from public.halenn_activity where kind='meeting_booked' and ($1::uuid is null or lead_id=$1)", [lead || null]);
const status = async () => { await identity("founder"); const result = await scalar("select public.halenn_project_call_status()"); await identity(); return result; };
const link = async (booking, lead, who = "founder") => { await identity(who); const result = await scalar("select public.halenn_link_project_call($1,$2)", [booking, lead]); await identity(); return result; };
const rejected = async (fn, code) => {
  await db.exec("savepoint rejection");
  await assert.rejects(fn, (error) => { if (code) assert.equal(error.code, code, `${error.message}\n${error.where || ""}`); assert.ok(!String(error.message).includes("secret-with-32")); return true; });
  await db.exec("rollback to savepoint rejection;release savepoint rejection");
  await identity();
};
const test = async (name, fn) => {
  timeBase = Date.now();
  await db.exec("begin");
  try { await fn(); checks++; console.log(`PASS ${name}`); }
  finally { await db.exec("rollback"); }
};
const customer = (p) => scalar("select payload from private.halenn_customer_confirmations where enquiry_id=$1", [p.id]);
const founderMail = (p) => scalar("select payload from private.halenn_enquiry_notifications where enquiry_id=$1", [p.id]);
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
  const bookingMigration = await migration("202611110003_project_call_bookings");
  await test("migration preserves mail config, frozen payloads, workers, internal renderer and history without sends", async () => {
    await readyMail(); const p = fixture(); await submit(p, "anon", true);
    const snapshot = async () => ({
      config: await query("select * from private.halenn_enquiry_notification_config"),
      customer: await query("select * from private.halenn_customer_confirmations"),
      internal: await query("select * from private.halenn_enquiry_notifications"),
      requests: await query("select * from net.test_requests"),
      functions: await query("select pg_get_functiondef('private.halenn_notification_payload(uuid)'::regprocedure),pg_get_functiondef('private.halenn_process_enquiry_notifications()'::regprocedure)"),
      enquiries: await query("select * from public.halenn_website_enquiries"), activities: await query("select * from public.halenn_activity")
    });
    const before = await snapshot();
    await db.exec(withoutTransaction(bookingMigration));
    assert.deepEqual(await snapshot(), before);
    assert.equal(await scalar("select count(*)::int from private.halenn_project_call_invitations"), 0);
    await configure();
    for (const row of [before.customer[0], before.internal[0]])
      await query("insert into net._http_response(id,status_code,content,timed_out) values($1,503,'{}',false)", [row.request_id]);
    await db.exec("select private.halenn_process_enquiry_notifications();update private.halenn_customer_confirmations set next_attempt_at=clock_timestamp()-interval '1 second';update private.halenn_enquiry_notifications set next_attempt_at=clock_timestamp()-interval '1 second';select private.halenn_process_enquiry_notifications()");
    for (const [prefix, payload] of [["halenn-customer-confirmation/", before.customer[0].payload], ["halenn-enquiry/", before.internal[0].payload]])
      assert.deepEqual(await scalar("select body from net.test_requests where headers->>'Idempotency-Key'=$1 order by id desc limit 1", [prefix + p.id]), payload);
  });
  await db.exec(bookingMigration);
  await db.exec(await migration("202611110004_project_call_reporting"));

  await test("disabled and unconfigured links preserve enquiry delivery and ordinary email receipt", async () => {
    await readyMail(); const p = fixture();
    assert.deepEqual(await submit(p), { result: "received", bookingUrl: null });
    const body = await customer(p);
    assert.ok(!body.text.includes("Book a project call"));
    assert.ok(!body.html.includes("OPTIONAL · 30 MINUTES"));
    assert.ok(body.html.includes("supported-color-schemes:light;"));
    assert.equal(await scalar("select count(*)::int from private.halenn_project_call_invitations"), 0);
    await db.exec(`update private.halenn_project_call_config set enabled=true,booking_url='${bookingUrl}'`);
    assert.deepEqual(await submit(p), { result: "received", bookingUrl: null });
    await rejected(() => receive([]), "55000");
  });
  await test("optional receipt and premium customer email use one opaque link, no PII, identical envelope and fixed copy", async () => {
    await readyMail(); const before = fixture(); await submit(before); const baseline = await customer(before);
    await configure(); const p = fixture({ name: '<script>untrusted</script>', message: 'Visit https://untrusted.test {{booking_invitation}}' });
    const result = await submit(p);
    assert.equal(result.result, "received"); assert.match(result.bookingUrl, /^\/project-call\/[\da-f-]{36}$/);
    assert.deepEqual(await submit(p), result);
    const body = await customer(p); const full = `https://halenn.com${result.bookingUrl}`;
    for (const key of ["from", "to", "reply_to", "subject", "headers"]) if (key !== "to") assert.deepEqual(body[key], baseline[key]);
    assert.deepEqual(body.to, [p.email]);
    for (const wording of ["Thank you for considering Halenn for your next project.", "We’ll review your enquiry and follow up to discuss your requirements and the next steps.", "If there’s anything you’d like to add, simply reply to this email.", "The Halenn team"]) assert.ok(body.text.includes(wording));
    for (const content of [full, "OPTIONAL · 30 MINUTES", "Prefer email? We’ll follow up on your enquiry either way.", 'bgcolor="#ffffff"', "Manrope-Light.ttf", "Geist-Regular.ttf", "halenn-wordmark-navy-v1.png", "color:#ffffff;background-color:#111c29"]) assert.ok(body.html.includes(content), content);
    assert.ok(body.text.includes(full)); assert.ok(!body.html.includes(p.name)); assert.ok(!body.html.includes("untrusted.test")); assert.ok(!body.html.includes("{{"));
    assert.ok(body.html.indexOf("We’ll review") < body.html.indexOf("OPTIONAL")); assert.ok(body.html.indexOf("OPTIONAL") < body.html.indexOf("If there’s"));
    assert.ok(Buffer.byteLength(body.html) < 20000);
    assert.ok(!((await founderMail(p)).html.includes("Book a project call")));
    const token = result.bookingUrl.split("/").at(-1);
    await identity("anon"); assert.equal(await scalar("select public.halenn_project_call_destination($1)", [token]), bookingUrl);
    assert.equal(await scalar("select public.halenn_project_call_destination($1)", [id(9999)]), null); await identity();
    assert.equal(await scalar("select count(*)::int from private.halenn_project_call_invitations"), 1);
    await db.exec("update private.halenn_project_call_config set enabled=false");
    assert.equal(await scalar("select public.halenn_project_call_destination($1)", [token]), null);
    if (process.env.HALENN_PROJECT_CALL_EMAIL_PREVIEW) await writeFile(process.env.HALENN_PROJECT_CALL_EMAIL_PREVIEW, body.html);
  });
  await test("failed optional invitation never loses the saved enquiry or either notification", async () => {
    await readyMail(); await configure();
    await db.exec("create function private.test_invitation_failure() returns trigger language plpgsql as $$begin raise exception 'Synthetic optional failure';end$$;create trigger test_invitation_failure before insert on private.halenn_project_call_invitations for each row execute function private.test_invitation_failure()");
    const p = fixture(); assert.deepEqual(await submit(p), { result: "received", bookingUrl: null });
    assert.ok(await leadFor(p)); assert.ok(await customer(p)); assert.ok(await founderMail(p));
  });
  await test("original deduplication, conflict and rate limit remain intact", async () => {
    await configure(); const p = fixture(); const result = await submit(p);
    assert.deepEqual(await submit(p), result);
    assert.deepEqual(await submit({ ...p, message: "Conflicting content" }), { result: "conflict", bookingUrl: null });
    await submit(fixture({ email: p.email })); await submit(fixture({ email: p.email }));
    assert.deepEqual(await submit(fixture({ email: p.email })), { result: "limited", bookingUrl: null });
    assert.equal(await scalar("select count(*)::int from public.halenn_website_enquiries"), 3);
  });
  await test("real HMAC rejects forgery, changed bytes, old timestamps, oversized bytes and malformed signatures before writes", async () => {
    await configure(); const sentAt = String(Math.floor(Date.now() / 1000)), raw = JSON.stringify({ version: 1, calendarId, events: [] });
    await rejected(() => receiveRaw(raw, sentAt, "0".repeat(64)), "28000");
    await rejected(() => receiveRaw(raw + " ", sentAt, sign(raw, sentAt)), "28000");
    await rejected(() => receiveRaw("not JSON", sentAt, "0".repeat(64)), "28000");
    await rejected(() => receiveRaw(raw, String(Number(sentAt) - 301)), "28000");
    await rejected(() => receiveRaw(raw, String(Number(sentAt) + 301)), "28000");
    await rejected(() => receiveRaw(raw, sentAt, "invalid"), "28000");
    await rejected(() => receiveRaw("x".repeat(100001)), "28000");
    assert.equal(await scalar("select last_sync_at from private.halenn_project_call_config"), null);
    assert.equal(await scalar("select count(*)::int from private.halenn_project_call_bookings"), 0);
    assert.deepEqual(await receiveRaw(raw, sentAt, sign(raw, sentAt).toUpperCase()), { accepted: true, changed: 0, ignored: 0, activities: 0 });
    assert.ok(await scalar("select last_sync_at from private.halenn_project_call_config"));
  });
  await test("signed malformed and wrong-calendar batches are rejected atomically with safe errors", async () => {
    await configure(); const e = event("visitor@example.test");
    for (const payload of [null, [], {}, { version: 2, calendarId, events: [] }, { version: 1, calendarId: 'other@gmail.com', events: [] }, { version: 1, calendarId, events: [], extra: true }, { version: 1, calendarId, events: Array(51).fill(e) }])
      await rejected(() => receiveRaw(JSON.stringify(payload)), "22023");
    await rejected(() => receiveRaw("invalid JSON"), "22023");
    for (const invalid of [{ ...e, end: e.start }, { ...e, updated: null }, { ...e, created: "not-a-date" }, { ...e, attendeeEmail: "bad\naddress@example.test" }, { ...e, attendeeEmail: calendarId }, { ...e, preferredLanguage: "xx" }, { ...e, id: "bad/identifier" }, { ...e, id: "x".repeat(1025) }, { ...e, attendeeName: "line\nbreak" }, { ...e, unknown: "field" }])
      await rejected(() => receive([e, invalid]), "22023");
    assert.equal(await scalar("select count(*)::int from private.halenn_project_call_bookings"), 0);
    assert.equal(await scalar("select last_sync_at from private.halenn_project_call_config"), null);
    const longest = { ...e, id: "x".repeat(1024) }; assert.equal((await receive([longest])).changed, 1); assert.equal((await record(longest)).event_id.length, 1024);
  });
  await test("one exact normalized enquiry records one booked milestone, never a meeting held or changed lead stage", async () => {
    await configure(); const p = fixture(); await submit(p); const lead = await leadFor(p);
    const e = event(`  ${p.email.toUpperCase()}  `, { preferredLanguage: "nl" });
    assert.deepEqual(await receive([e]), { accepted: true, changed: 1, ignored: 0, activities: 1 });
    const b = await record(e); assert.equal(b.enquiry_id, p.id); assert.equal(b.lead_id, lead); assert.equal(b.attendee_email, p.email);
    assert.equal(await scalar("select status from public.halenn_leads where id=$1", [lead]), "New");
    assert.equal(await scalar("select count(*)::int from public.halenn_activity where kind='meeting_held'"), 0);
    assert.equal(await scalar("select count(*)::int from public.halenn_activity where kind='meeting_booked' and occurred_at<=now()"), 1);
    assert.deepEqual(await receive([e]), { accepted: true, changed: 0, ignored: 1, activities: 0 });
    const info = await status(); assert.equal(info.unmatched.length, 0); assert.equal(info.upcoming[0].preferredLanguage, "nl"); assert.equal(info.upcoming[0].leadId, lead);
    // Provider-created time is the milestone; the future appointment is not it.
    assert.equal(new Date(await scalar("select occurred_at from public.halenn_activity where kind='meeting_booked'")).toISOString(), e.created);
  });
  await test("reschedules, new provider IDs and manual pre-existing milestones do not inflate first-call conversions", async () => {
    await configure(); const p = fixture(); await submit(p); const lead = await leadFor(p), e = event(p.email);
    await receive([e]);
    await receive([{ ...e, updated: iso(-30), start: iso(172800), end: iso(172800 + 1800) }, event(p.email)]);
    assert.equal(await activityCount(lead), 1); assert.equal(await scalar("select count(*)::int from private.halenn_project_call_conversions"), 1);
    const other = fixture(); await submit(other); const otherLead = await leadFor(other);
    await query("insert into public.halenn_activity(lead_id,kind) values($1,'meeting_booked')", [otherLead]);
    assert.equal((await receive([event(other.email)])).activities, 0); assert.equal(await activityCount(otherLead), 1);
  });
  await test("id-only cancellations retain history, ignore unknown IDs and cannot be revived by stale confirmation", async () => {
    await configure(); const p = fixture(); await submit(p); const e = event(p.email); await receive([e]);
    const raw = JSON.stringify({ version: 1, calendarId, events: [{ id: e.id, status: "cancelled" }, { id: "unknown_deleted", status: "cancelled" }] });
    const sentAt = String(Math.floor(Date.now() / 1000));
    assert.equal((await receiveRaw(raw, sentAt)).changed, 1);
    const cancelled = await record(e); assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.provider_updated, null); assert.equal(new Date(cancelled.version_at).getTime(), Number(sentAt) * 1000);
    assert.equal((await receiveRaw(raw, sentAt)).changed, 0);
    assert.equal((await receive([{ ...e, updated: iso(-10) }])).changed, 0);
    assert.equal((await record(e)).status, "cancelled"); assert.equal(await activityCount(await leadFor(p)), 1);
    assert.equal((await status()).upcoming.length, 0);
    assert.equal(await scalar("select count(*)::int from private.halenn_project_call_bookings"), 1);
    // Only a genuinely newer provider version can restore a cancelled event.
    await receive([{ ...e, updated: iso(10) }]); assert.equal((await record(e)).status, "confirmed"); assert.equal(await activityCount(await leadFor(p)), 1);
  });
  await test("ambiguous, missing and absent guest identities stay unmatched, without Gmail alias guessing", async () => {
    await configure(); const p = fixture(); await submit(p); await submit(fixture({ email: p.email }));
    const first = event(p.email), missing = event("missing@example.test"), unknown = event(null, { attendeeName: null });
    const gmail = fixture({ email: "some.one@gmail.com" }); await submit(gmail); const alias = event("someone@gmail.com");
    const noEmail = event(undefined, { attendeeName: null, preferredLanguage: null });
    await receive([first, missing, unknown, alias, noEmail]);
    for (const e of [first, missing, unknown, alias, noEmail]) assert.equal((await record(e)).lead_id, null);
    assert.equal(await activityCount(), 0); const info = await status(); assert.equal(info.unmatched.length, 5); assert.equal(info.unmatched.filter(b => b.attendeeEmail === null).length, 2);
    const late = fixture(); await submit(late); await query("update public.halenn_website_enquiries set received_at=now()+interval '10 minutes' where id=$1", [late.id]);
    const early = event(late.email); await receive([early]); assert.equal((await record(early)).lead_id, null);
  });
  await test("changed guest identity becomes unmatched and cannot silently reassign an existing lead", async () => {
    await configure(); const a = fixture(), b = fixture(); await submit(a); await submit(b); const e = event(a.email); await receive([e]);
    await receive([{ ...e, updated: iso(-20), attendeeEmail: b.email }]);
    assert.equal((await record(e)).lead_id, null); assert.equal(await activityCount(await leadFor(a)), 1); assert.equal(await activityCount(await leadFor(b)), 0);
  });
  await test("founder manual matching is guarded, idempotent, does not reassign and does not log cancelled calls", async () => {
    await configure(); const p = fixture(); await submit(p); const lead = await leadFor(p), e = event(null); await receive([e]); const b = await record(e);
    await rejected(() => link(b.id, lead, "other"), "42501");
    assert.deepEqual(await link(b.id, lead), { linked: true, alreadyLinked: false });
    assert.deepEqual(await link(b.id, lead), { linked: true, alreadyLinked: true });
    assert.equal(await activityCount(lead), 1);
    const other = fixture(); await submit(other); const secondLead = await leadFor(other); await rejected(() => link(b.id, secondLead), "22023");
    const cancelled = event(null); await receive([cancelled]); await receive([{ id: cancelled.id, status: "cancelled" }]);
    const otherLead = await leadFor(other); await link((await record(cancelled)).id, otherLead); assert.equal(await activityCount(otherLead), 0);
  });
  await test("upcoming shows only the next five confirmed linked calls with correct language", async () => {
    await configure(); const bookings = [];
    for (let i = 0; i < 7; i++) {
      const p = fixture(); await submit(p);
      bookings.push(event(p.email, { start: iso(7200 + i * 3600), end: iso(9000 + i * 3600), preferredLanguage: i % 2 ? "nl" : "en" }));
    }
    const past = fixture(); await submit(past); bookings.push(event(past.email, { start: iso(-60), end: iso(1740) }));
    await receive(bookings);
    await receive([{ id: bookings[0].id, status: "cancelled" }]);
    await receive([event(null, { start: iso(3600), end: iso(5400) })]);
    const result = await status(); assert.equal(result.upcoming.length, 5); assert.equal(result.unmatched.length, 1);
    assert.equal(result.upcoming[0].preferredLanguage, "nl");
    assert.deepEqual(result.upcoming.map(b => b.startsAt), [...result.upcoming.map(b => b.startsAt)].sort());
    for (const b of result.upcoming) { assert.equal(b.status, "confirmed"); assert.ok(b.leadId); assert.ok(new Date(b.startsAt).getTime() > Date.now()); }
  });
  await test("private rows, secrets and helper RPCs stay inaccessible, founder password gate remains required", async () => {
    await configure(); await identity("anon");
    for (const table of ["halenn_project_call_config", "halenn_project_call_invitations", "halenn_project_call_bookings", "halenn_project_call_conversions"])
      await rejected(async () => { await identity("anon"); await db.query(`select * from private.${table}`); }, "42501");
    for (const fn of ["private.halenn_project_call_configured()", `private.halenn_project_call_link('${id(999)}')`, "public.halenn_project_call_status()"])
      await rejected(async () => { await identity("anon"); await db.query(`select ${fn}`); }, "42501");
    await db.exec("update private.halenn_founders set needs_password=true");
    await rejected(async () => { await identity("founder"); await db.query("select public.halenn_project_call_status()"); }, "42501");
    for (const url of ["https://evil.test/", "javascript:alert(1)", "https://calendar.app.google.evil.test/x", "https://calendar.app.google/a#fragment", "https://calendar.google.com/calendar/appointments/schedules/test?next=https://evil.test"])
      await rejected(() => db.query("update private.halenn_project_call_config set booking_url=$1", [url]), "23514");
  });
  await test("consented acquisition source and test exclusions carry through booked calls; declined consent adds no visitor events", async () => {
    await configure(); const session = id(sequence++), visitor = id(sequence++);
    await identity("anon"); await scalar("select public.halenn_record_website_events($1::jsonb)", [JSON.stringify({ visit: { session_id: session, visitor_id: visitor, source: "Instagram", medium: "social", campaign: "project-calls", referrer: "instagram.com", landing_path: "/", device: "mobile" }, events: [{ id: id(sequence++), kind: "page_view", path: "/" }] })]);
    await identity(); const attributed = fixture({ tracking: { session_id: session, visitor_id: visitor } }); await submit(attributed);
    const declined = fixture(); await submit(declined); const testLead = fixture(); await submit(testLead, "founder");
    const visitsBefore = await query("select * from public.halenn_website_visits"), eventsBefore = await query("select * from public.halenn_website_events");
    await receive([event(attributed.email), event(declined.email), event(testLead.email)]);
    assert.deepEqual(await query("select * from public.halenn_website_visits"), visitsBefore); assert.deepEqual(await query("select * from public.halenn_website_events"), eventsBefore);
    assert.equal(await scalar("select acquisition_source from public.halenn_leads where id=$1", [await leadFor(attributed)]), "Instagram");
    assert.equal(await scalar("select acquisition_source from public.halenn_leads where id=$1", [await leadFor(declined)]), "");
    assert.equal(await scalar("select is_test from public.halenn_leads where id=$1", [await leadFor(testLead)]), true);
    await identity("founder"); const report = await scalar("select public.halenn_website_report_v2(current_date-1,current_date,'','',false)");
    assert.equal(report.sources.find(r => r.source === "Instagram").bookedCalls, 1);
    await identity(); await query("update public.halenn_leads set is_test=true where id=$1", [await leadFor(attributed)]);
    await identity("founder"); const excluded = await scalar("select public.halenn_website_report_v2(current_date-1,current_date,'','',false)"); assert.equal(excluded.sources.length, 0);
    const included = await scalar("select public.halenn_website_report_v2(current_date-1,current_date,'','',true)"); assert.equal(included.sources[0].bookedCalls, 1);
  });
  console.log(`\n${checks} project-call database checks passed; no network calls made.`);
} catch (error) { console.error(`FAIL ${error.code || error.name}: ${error.message}`); if (error.where) console.error(error.where); process.exitCode = 1; } finally { await db.close(); }
