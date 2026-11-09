// Local PostgreSQL verification with Vault/pg_net/cron stubs. No email is sent.
// HALENN_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node scripts/verify-customer-confirmations.mjs
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const { PGlite } = await import(process.env.HALENN_PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const root = fileURLToPath(new URL("../", import.meta.url));
const migration = (name) => readFile(root + "supabase/migrations/" + name, "utf8");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let nextId = 100;
let checks = 0;
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const enquiry = (extra = {}) => {
  const n = nextId++;
  return { id: id(n), form_id: id(n + 10000), name: `Visitor ${n}`, email: `visitor${n}@example.test`,
    company: `Business ${n}`, message: "Please help with our website.", origin: "homepage", ...extra };
};
const submit = async (p) => {
  await db.exec("set local role anon");
  const rows = await query("select public.halenn_submit_website_enquiry($1::jsonb) as result", [JSON.stringify(p)]);
  await db.exec("reset role");
  return rows[0].result;
};
const outbox = async (p) => (await query("select * from private.halenn_customer_confirmations where enquiry_id=$1", [p.id]))[0];
const admin = async (p) => (await query("select * from private.halenn_enquiry_notifications where enquiry_id=$1", [p.id]))[0];
const request = async (p, customer = true) => (await query("select * from net.test_requests where headers->>'Idempotency-Key'=$1 order by id desc limit 1", [(customer ? "halenn-customer-confirmation/" : "halenn-enquiry/") + p.id]))[0];
const requestCount = async (p, customer = true) => (await query("select count(*)::int as n from net.test_requests where headers->>'Idempotency-Key'=$1", [(customer ? "halenn-customer-confirmation/" : "halenn-enquiry/") + p.id]))[0].n;
const worker = () => db.exec("select private.halenn_process_enquiry_notifications()");
const ready = () => db.exec("update private.halenn_enquiry_notification_config set enabled=true,customer_confirmations_enabled=true;insert into vault.decrypted_secrets(name,decrypted_secret) values('halenn_resend_api_key','re_local_test_placeholder') on conflict(name) do nothing");
const due = (p) => query("update private.halenn_customer_confirmations set next_attempt_at=clock_timestamp()-interval '1 second' where enquiry_id=$1", [p.id]);
const respond = async (p, status = 200, content = JSON.stringify({ id: id(999) }), extras = {}, customer = true) => {
  const n = customer ? await outbox(p) : await admin(p);
  await query("insert into net._http_response(id,status_code,content,timed_out,error_msg) values($1,$2,$3,$4,$5)", [n.request_id, status, content, extras.timed_out ?? false, extras.error_msg ?? null]);
};
const denied = async (sql, params = []) => {
  await db.exec("savepoint denial_check");
  await assert.rejects(db.query(sql, params));
  await db.exec("rollback to savepoint denial_check;release savepoint denial_check");
};
const status = async () => {
  await db.exec(`set local role authenticated;select set_config('request.jwt.claim.sub','${id(1)}',true)`);
  const s = (await query("select public.halenn_enquiry_notification_status() as s"))[0].s;
  await db.exec("reset role");
  return s;
};
const test = async (name, fn) => {
  await db.exec("begin");
  try { await fn(); checks++; console.log(`PASS ${name}`); }
  finally { await db.exec("rollback"); }
};
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for (const name of ["202611060001_founder_leads.sql", "202611060002_founder_passwords.sql", "202611090001_sales_analytics.sql", "202611090002_website_analytics.sql"])
    await db.exec(await migration(name));
  await db.exec(`create schema vault;create table vault.decrypted_secrets(name text primary key,decrypted_secret text not null);
    create schema net;
    create table net.test_requests(id bigserial primary key,url text,body jsonb,params jsonb,headers jsonb,timeout_milliseconds integer);
    create table net._http_response(id bigint primary key,status_code integer,content_type text,headers jsonb,content text,timed_out boolean,error_msg text,created timestamptz default now());
    create function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,headers jsonb default '{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds integer default 2000)
    returns bigint language plpgsql as $$declare queued bigint;begin
      if current_setting('halenn.test_customer_queue_error',true)='yes' and headers->>'Idempotency-Key' like 'halenn-customer-confirmation/%' then raise exception 'Synthetic private provider detail';end if;
      insert into net.test_requests(url,body,params,headers,timeout_milliseconds) values(url,body,params,headers,timeout_milliseconds) returning id into queued;return queued;end$$;
    insert into auth.users values('${id(1)}','founder@example.test',now(),'test'),('${id(2)}','other@example.test',now(),'test');
    insert into private.halenn_founders(email,needs_password) values('founder@example.test',false);`);
  const oldSql = await migration("202611090005_enquiry_notifications.sql");
  const ext = "create extension if not exists pg_net with schema extensions;";
  assert.equal(oldSql.split(ext).length, 2);
  await db.exec(oldSql.replace(ext, "-- pg_net stubbed locally."));
  await db.exec("update private.halenn_enquiry_notification_config set enabled=true;insert into vault.decrypted_secrets values('halenn_resend_api_key','re_local_test_placeholder')");
  const historical = enquiry();
  await query("select public.halenn_submit_website_enquiry($1::jsonb)", [JSON.stringify(historical)]);
  await respond(historical, 200, JSON.stringify({ id: id(998) }), {}, false);
  await worker();
  const oldAccepted = await admin(historical);
  assert.equal(oldAccepted.status, "accepted");
  await db.exec(`create schema cron;create table cron.test_jobs(name text primary key,schedule text,command text);
    create function cron.schedule(job_name text,job_schedule text,job_command text) returns bigint language plpgsql as $$begin
      insert into cron.test_jobs values(job_name,job_schedule,job_command) on conflict(name) do update set schedule=excluded.schedule,command=excluded.command;return 1;end$$;`);
  const schedule = await migration("202611090006_notification_schedule.sql");
  await db.exec(schedule.replace("create extension if not exists pg_cron with schema pg_catalog;", "-- cron stubbed locally."));
  await db.exec(await migration("202611100001_customer_confirmations.sql"));

  await test("migration preserves active founder configuration, accepted payloads and the existing cron without backfill", async () => {
    const config = (await query("select * from private.halenn_enquiry_notification_config"))[0];
    assert.equal(config.enabled, true); assert.equal(config.customer_confirmations_enabled, false);
    assert.equal(config.recipient, "aevellgroup@gmail.com");
    assert.deepEqual(await admin(historical), oldAccepted);
    assert.equal(await outbox(historical), undefined);
    assert.equal((await query("select count(*)::int as n from private.halenn_customer_confirmations"))[0].n, 0);
    assert.deepEqual(await query("select * from cron.test_jobs"), [{ name: "halenn-enquiry-notifications", schedule: "*/5 * * * *", command: "select private.halenn_process_enquiry_notifications();" }]);
    await worker(); assert.deepEqual(await admin(historical), oldAccepted);
  });

  await test("paused confirmations are skipped permanently while founder alerts still queue", async () => {
    const p = enquiry(); assert.equal(await submit(p), "received");
    assert.equal((await outbox(p)).status, "skipped");
    assert.equal((await outbox(p)).last_error, "confirmations_disabled");
    assert.equal((await admin(p)).status, "queued");
    await ready(); await due(p); await worker();
    assert.equal(await requestCount(p), 0); assert.equal(await requestCount(p, false), 1);
    assert.equal((await status()).customer.skipped, 1);
  });

  await test("all enquiry origins receive a branded fixed-content confirmation and independent founder alert", async () => {
    await ready();
    for (const origin of ["homepage", "quiz", "pricing"]) {
      const p = enquiry({ origin, name: 'Injected <b>name</b>', company: 'https://evil.example/company/' + origin, message: 'Visit https://evil.example <script>steal()</script>', email: 'CLIENT' + nextId + '@EXAMPLE.TEST' });
      assert.equal(await submit(p), "received");
      const n = await outbox(p); const r = await request(p);
      assert.equal(n.status, "queued"); assert.equal(n.attempts, 1);
      assert.equal(r.url, "https://api.resend.com/emails");
      assert.equal(r.timeout_milliseconds, 10000);
      assert.equal(r.headers["Idempotency-Key"], "halenn-customer-confirmation/" + p.id);
      assert.equal(r.body.from, "Halenn <enquiries@notifications.halenn.com>");
      assert.deepEqual(r.body.to, [p.email.toLowerCase()]);
      assert.equal(r.body.reply_to, "aevellgroup@gmail.com");
      assert.equal(r.body.subject, "We’ve received your enquiry | Halenn");
      assert.deepEqual(r.body.headers, { "Auto-Submitted": "auto-replied", "X-Auto-Response-Suppress": "All" });
      for (const body of [r.body.html, r.body.text]) {
        assert.ok(body.includes(p.id)); assert.ok(body.includes("(Amsterdam)"));
        assert.ok(!body.includes("evil.example")); assert.ok(!body.includes(p.name));
        assert.ok(!body.includes(p.company)); assert.ok(!body.includes(p.message));
        assert.ok(!body.includes("/admin/")); assert.ok(!body.includes("24 hours"));
      }
      assert.equal(await requestCount(p, false), 1);
      if (origin === "homepage" && process.env.HALENN_CONFIRMATION_PREVIEW)
        await writeFile(process.env.HALENN_CONFIRMATION_PREVIEW, r.body.html);
    }
  });

  await test("browser retries, conflicts and consent-free resubmission cannot duplicate either notification", async () => {
    await ready(); const p = enquiry(); assert.equal(await submit(p), "received");
    assert.equal(await submit(p), "received");
    assert.equal(await submit({ ...p, tracking: null }), "received");
    assert.equal(await submit({ ...p, message: "Changed" }), "conflict");
    assert.equal(await requestCount(p), 1); assert.equal(await requestCount(p, false), 1);
  });

  await test("strict single-address validation skips malformed addresses without losing enquiries or founder alerts", async () => {
    await ready();
    for (const email of ["a,b@example.test", "<a>@example.test", "a..b@example.test", ".a@example.test", "a.@example.test", "a@-example.test", "a@example-.test", "a@" + "x".repeat(64) + ".test", "x".repeat(65) + "@example.test"]) {
      const p = enquiry({ email });
      assert.equal(await submit(p), "received", email);
      assert.equal((await outbox(p)).status, "skipped", email);
      assert.equal((await outbox(p)).last_error, "invalid_recipient", email);
      assert.equal(await requestCount(p), 0); assert.equal(await requestCount(p, false), 1);
    }
    for (const email of ["person+project@example.test", "o'connor@example.test", "a.b@sub.example.test"])
      assert.equal((await query("select private.halenn_confirmation_email_valid($1) as valid", [email]))[0].valid, true);
  });

  await test("the same address and Gmail/Googlemail dot-plus aliases share one hourly reservation", async () => {
    await ready();
    for (const [firstEmail, secondEmail] of [["customer@example.test", "CUSTOMER@EXAMPLE.TEST"], ["customer@example.test", "customer+tag@example.test"], ["a.test+one@gmail.com", "at.est+two@googlemail.com"]]) {
      const a = enquiry({ email: firstEmail }); const b = enquiry({ email: secondEmail });
      // Keep scenarios independent while retaining pending reservations.
      await db.exec("savepoint pair");
      assert.equal(await submit(a), "received"); assert.equal(await submit(b), "received");
      assert.equal((await outbox(a)).status, "queued");
      assert.equal((await outbox(b)).status, "skipped"); assert.equal((await outbox(b)).last_error, "recipient_limit");
      assert.equal(await requestCount(b), 0); assert.equal(await requestCount(b, false), 1);
      await db.exec("rollback to savepoint pair;release savepoint pair");
    }
  });

  await test("three first-send reservations in rolling 24 hours block a fourth even outside the hourly window", async () => {
    await ready(); const email = "daily-recipient@example.test";
    for (let i = 0; i < 3; i++) {
      const p = enquiry({ email }); assert.equal(await submit(p), "received");
      await query("update private.halenn_customer_confirmations set first_attempt_at=clock_timestamp()-($2::text||' hours')::interval where enquiry_id=$1", [p.id, 4-i]);
      await query("update public.halenn_website_enquiries set received_at=clock_timestamp()-interval '4 hours' where id=$1", [p.id]);
    }
    const p = enquiry({ email }); assert.equal(await submit(p), "received");
    assert.equal((await outbox(p)).status, "skipped"); assert.equal((await outbox(p)).last_error, "recipient_limit");
    assert.equal(await requestCount(p), 0); assert.equal(await requestCount(p, false), 1);
  });

  await test("global cap reserves at most 40 customer first sends across all addresses without suppressing founder alerts", async () => {
    await ready();
    for (let i = 0; i < 41; i++) {
      const p = enquiry(); assert.equal(await submit(p), "received");
      assert.equal(await requestCount(p, false), 1);
      assert.equal((await outbox(p)).status, i < 40 ? "queued" : "skipped");
      if (i === 40) assert.equal((await outbox(p)).last_error, "daily_limit");
    }
    assert.equal((await query("select count(*)::int as n from private.halenn_customer_confirmations where first_attempt_at is not null"))[0].n, 40);
    const definition = (await query("select pg_get_functiondef('private.halenn_dispatch_customer_confirmation(uuid)'::regprocedure) as definition"))[0].definition;
    assert.ok(definition.indexOf("pg_advisory_xact_lock(73904105)") < definition.indexOf("last_error = 'daily_limit'"), "Shared transaction lock protects recipient and global reservation checks");
  });

  await test("customer queue failure preserves the lead, customer outbox, first-send reservation and founder request", async () => {
    await ready(); await db.exec("select set_config('halenn.test_customer_queue_error','yes',true)");
    const p = enquiry(); assert.equal(await submit(p), "received");
    let n = await outbox(p); assert.equal(n.status, "pending"); assert.equal(n.last_error, "queue_error");
    assert.equal(n.attempts, 1); assert.ok(n.first_attempt_at); assert.ok(n.payload);
    assert.equal(await requestCount(p), 0); assert.equal(await requestCount(p, false), 1);
    const another = enquiry({ email: p.email }); assert.equal(await submit(another), "received");
    assert.equal((await outbox(another)).last_error, "recipient_limit");
    await db.exec("select set_config('halenn.test_customer_queue_error','no',true)");
    await due(p); await worker(); n = await outbox(p); assert.equal(n.status, "queued"); assert.equal(n.attempts, 2);
    assert.equal(await requestCount(p), 1); assert.equal(await requestCount(p, false), 1);
  });

  await test("unexpected customer dispatch failure retains an attention row without losing the founder notification", async () => {
    await ready();
    await db.exec("create or replace function private.halenn_customer_confirmation_payload(enquiry uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin raise exception 'Synthetic private detail';end$$");
    const p = enquiry(); assert.equal(await submit(p), "received");
    assert.equal((await outbox(p)).status, "attention"); assert.equal((await outbox(p)).last_error, "dispatch_error");
    assert.equal((await admin(p)).status, "queued");
    await worker(); assert.equal((await outbox(p)).status, "attention"); assert.equal((await status()).customer.attention, 1);
  });

  await test("customer row creation failure preserves the saved enquiry and leaves a sticky warning after healthy workers", async () => {
    await ready(); await db.exec("alter table private.halenn_customer_confirmations add constraint synthetic_insert_failure check(false)");
    const p = enquiry(); assert.equal(await submit(p), "received"); assert.equal(await outbox(p), undefined);
    assert.equal((await admin(p)).status, "queued");
    await db.exec("alter table private.halenn_customer_confirmations drop constraint synthetic_insert_failure");
    await worker(); assert.equal((await status()).customer.attention, 1);
    assert.equal((await query("select customer_queue_error from private.halenn_enquiry_notification_config"))[0].customer_queue_error, true);
  });

  await test("founder and customer workers fail independently with visible health warnings", async () => {
    await ready(); const p = enquiry(); await submit(p); await respond(p);
    await db.exec("create or replace function private.halenn_process_admin_enquiry_notifications() returns void language plpgsql security definer set search_path='' as $$begin raise exception 'Synthetic private detail';end$$");
    await worker(); assert.equal((await outbox(p)).status, "accepted");
    assert.equal((await status()).attention, 1);
  });

  await test("missing key delays the customer first send without consuming a throttle slot", async () => {
    await ready(); await db.exec("delete from vault.decrypted_secrets"); const p = enquiry(); await submit(p);
    assert.equal((await outbox(p)).last_error, "sending_key_missing");
    assert.equal((await outbox(p)).first_attempt_at, null); assert.equal((await outbox(p)).payload, null);
    await ready(); await due(p); await worker(); assert.equal((await outbox(p)).status, "queued");
  });

  await test("unattempted confirmations older than 24 hours expire without sending or affecting founder records", async () => {
    await ready(); await db.exec("delete from vault.decrypted_secrets"); const p = enquiry(); await submit(p);
    await query("update private.halenn_customer_confirmations set created_at=clock_timestamp()-interval '25 hours' where enquiry_id=$1", [p.id]);
    await ready(); await due(p); await worker();
    assert.equal((await outbox(p)).status, "skipped"); assert.equal((await outbox(p)).last_error, "confirmation_expired");
    assert.equal(await requestCount(p), 0);
  });

  for (const [label, code, body, extras, expected] of [
    ["rate limited", 429, '{}', {}, "rate_limited"],
    ["provider unavailable", 503, '{}', {}, "provider_unavailable"],
    ["timed out", null, null, { timed_out: true }, "request_timeout"],
    ["network error", null, null, { error_msg: "Private provider detail" }, "request_error"],
    ["invalid success", 200, '{}', {}, "invalid_response"],
    ["concurrent request", 409, '{"name":"concurrent_idempotent_requests"}', {}, "request_in_progress"],
  ]) await test(`${label} retries with immutable customer body, destination, reply-to and idempotency`, async () => {
    await ready(); const p = enquiry(); await submit(p); const first = await request(p); const n = await outbox(p);
    await respond(p, code, body, extras); await worker();
    assert.equal((await outbox(p)).status, "pending"); assert.equal((await outbox(p)).last_error, expected);
    await worker(); assert.equal(await requestCount(p), 1);
    await query("update public.halenn_website_enquiries set email='changed@example.test',message='Changed' where id=$1", [p.id]);
    await db.exec("update private.halenn_enquiry_notification_config set recipient='contact@halenn.com'");
    await due(p); await worker();
    const second = await request(p); assert.deepEqual(second.body, first.body);
    assert.equal(second.headers["Idempotency-Key"], first.headers["Idempotency-Key"]);
    assert.deepEqual((await outbox(p)).first_attempt_at, n.first_attempt_at);
    await respond(p); await worker(); assert.equal((await outbox(p)).status, "accepted");
    assert.equal(await requestCount(p, false), 1);
  });

  for (const [code, content, expected] of [[403, '{}', "provider_configuration"], [422, '{}', "provider_rejected"], [409, '{"name":"invalid_idempotent_request"}', "idempotency_conflict"]])
    await test(`permanent ${code} customer rejection never resends or changes founder outcome`, async () => {
      await ready(); const p = enquiry(); await submit(p); await respond(p, code, content); await respond(p, 200, JSON.stringify({ id: id(998) }), {}, false);
      await worker(); assert.equal((await outbox(p)).status, "attention"); assert.equal((await outbox(p)).last_error, expected);
      assert.equal((await admin(p)).status, "accepted"); await due(p); await worker(); assert.equal(await requestCount(p), 1);
    });

  await test("late success is permanent even beyond the retry window and after transient responses vanish", async () => {
    await ready(); const p = enquiry(); await submit(p); await respond(p);
    await query("update private.halenn_customer_confirmations set first_attempt_at=clock_timestamp()-interval '2 days' where enquiry_id=$1", [p.id]);
    await worker(); assert.equal((await outbox(p)).status, "accepted");
    await db.exec("delete from net._http_response"); await due(p); await worker();
    assert.equal(await requestCount(p), 1); assert.equal((await outbox(p)).provider_email_id, id(999));
  });

  await test("missing responses and attempt/time ceilings are bounded", async () => {
    await ready(); const p = enquiry(); await submit(p); await worker(); assert.equal((await outbox(p)).status, "queued");
    await due(p); await worker(); assert.equal((await outbox(p)).last_error, "response_missing");
    await due(p); await worker(); assert.equal(await requestCount(p), 2);
    await query("update private.halenn_customer_confirmations set first_attempt_at=clock_timestamp()-interval '23 hours 1 second' where enquiry_id=$1", [p.id]);
    await due(p); await worker(); assert.equal((await outbox(p)).last_error, "retry_window_exhausted");
    const cap = enquiry(); await submit(cap);
    await query("update private.halenn_customer_confirmations set status='pending',attempts=20 where enquiry_id=$1", [cap.id]);
    await due(cap); await worker(); assert.equal((await outbox(cap)).last_error, "retry_window_exhausted"); assert.equal(await requestCount(cap), 1);
  });

  await test("rollback removes both outboxes, lead and network work atomically", async () => {
    await ready(); const p = enquiry(); await db.exec("savepoint intake"); await submit(p);
    assert.equal(await requestCount(p), 1); assert.equal(await requestCount(p, false), 1);
    await db.exec("rollback to savepoint intake;release savepoint intake");
    assert.equal(await outbox(p), undefined); assert.equal(await admin(p), undefined);
    assert.equal(await requestCount(p), 0); assert.equal(await requestCount(p, false), 0);
  });

  await test("customer outbox and new helpers remain private; status stays founder/password guarded and aggregate-only", async () => {
    await ready(); const p = enquiry(); await submit(p); await respond(p); await worker();
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set local role ${role}`);
      await denied("select * from private.halenn_customer_confirmations");
      await denied("select private.halenn_customer_confirmation_payload($1)", [p.id]);
      await denied("select private.halenn_dispatch_customer_confirmation($1)", [p.id]);
      await denied("select private.halenn_process_customer_confirmations()");
      await denied("select private.halenn_process_admin_enquiry_notifications()");
      await denied("select private.halenn_process_enquiry_notifications()");
      await denied("select public.halenn_enquiry_notification_status()"); await db.exec("reset role");
    }
    await db.exec(`set local role authenticated;select set_config('request.jwt.claim.sub','${id(2)}',true)`);
    await denied("select public.halenn_enquiry_notification_status()"); await db.exec("reset role");
    const s = await status();
    assert.deepEqual(Object.keys(s).sort(), ["enabled", "configured", "keyExists", "recipient", "pending", "accepted", "attention", "lastAcceptedAt", "customer"].sort());
    assert.deepEqual(Object.keys(s.customer).sort(), ["enabled", "pending", "accepted", "attention", "skipped", "lastAcceptedAt"].sort());
    assert.equal(s.customer.enabled, true); assert.equal(s.customer.accepted, 1); assert.equal(s.customer.pending, 0);
    assert.ok(!JSON.stringify(s).includes(p.email)); assert.ok(!JSON.stringify(s).includes("re_local_test_placeholder"));
    await db.exec("update private.halenn_founders set needs_password=true;set local role authenticated");
    await denied("select public.halenn_enquiry_notification_status()"); await db.exec("reset role");
    assert.equal((await query("select relrowsecurity from pg_class where oid='private.halenn_customer_confirmations'::regclass"))[0].relrowsecurity, true);
  });

  console.log(`Verified ${checks} customer confirmation scenarios. No network calls were made.`);
} catch (error) { console.error(error.message); if (error.detail) console.error(error.detail); process.exitCode = 1; } finally { await db.close(); }
