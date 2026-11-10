// Standalone PostgreSQL checks with local pg_net/Vault stubs. No email is sent.
// HALENN_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node scripts/verify-enquiry-notifications.mjs
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { PGlite } = await import(
  process.env.HALENN_PGLITE_MODULE || "@electric-sql/pglite"
).catch((cause) => {
  throw new Error("Provide HALENN_PGLITE_MODULE pointing to a local PGlite dist/index.js file.", { cause });
});
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
const submit = async (payload) => {
  await db.exec("set local role anon");
  const rows = await query("select public.halenn_submit_website_enquiry($1::jsonb) as result", [JSON.stringify(payload)]);
  await db.exec("reset role");
  return rows[0].result;
};
const outbox = async (p) => (await query("select * from private.halenn_enquiry_notifications where enquiry_id=$1", [p.id]))[0];
const request = async (p) => (await query("select * from net.test_requests where headers->>'Idempotency-Key'=$1 order by id desc limit 1", ["halenn-enquiry/" + p.id]))[0];
const requestCount = async (p) => (await query("select count(*)::int as n from net.test_requests where headers->>'Idempotency-Key'=$1", ["halenn-enquiry/" + p.id]))[0].n;
const worker = () => db.exec("select private.halenn_process_enquiry_notifications()");
const ready = async () => {
  await db.exec("update private.halenn_enquiry_notification_config set enabled=true;insert into vault.decrypted_secrets(name,decrypted_secret) values('halenn_resend_api_key','re_local_test_placeholder') on conflict(name) do nothing");
};
const switchRecipient = async (recipient) => {
  await db.exec(`set local role authenticated;select set_config('request.jwt.claim.sub','${id(1)}',true)`);
  const result = (await query("select public.halenn_set_enquiry_notification_recipient(recipient := $1) as recipient", [recipient]))[0].recipient;
  await db.exec("reset role");
  return result;
};
const due = (p) => query("update private.halenn_enquiry_notifications set next_attempt_at=clock_timestamp()-interval '1 second' where enquiry_id=$1", [p.id]);
const respond = async (p, status = 200, content = JSON.stringify({ id: id(999) }), extras = {}) => {
  const n = await outbox(p);
  await query("insert into net._http_response(id,status_code,content,timed_out,error_msg) values($1,$2,$3,$4,$5)", [n.request_id, status, content, extras.timed_out ?? false, extras.error_msg ?? null]);
};
const denied = async (sql, params = []) => {
  await db.exec("savepoint denial_check");
  await assert.rejects(db.query(sql, params));
  await db.exec("rollback to savepoint denial_check;release savepoint denial_check");
};
const test = async (name, fn) => {
  await db.exec("begin");
  try {
    await fn();
    checks++;
    console.log(`PASS ${name}`);
  } finally {
    await db.exec("rollback");
  }
};

try {
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
  `);
  for (const name of ["202611060001_founder_leads.sql", "202611060002_founder_passwords.sql", "202611090001_sales_analytics.sql", "202611090002_website_analytics.sql"])
    await db.exec(await migration(name));
  // A pre-install enquiry must never be backfilled into the notification queue.
  const historical = enquiry();
  assert.equal((await query("select public.halenn_submit_website_enquiry($1::jsonb) as result", [JSON.stringify(historical)]))[0].result, "received");
  await db.exec(`
    create schema vault;
    create table vault.decrypted_secrets(name text primary key,decrypted_secret text not null);
    create schema net;
    create table net.test_requests(id bigserial primary key,url text,body jsonb,params jsonb,headers jsonb,timeout_milliseconds integer);
    create table net._http_response(id bigint primary key,status_code integer,content_type text,headers jsonb,content text,timed_out boolean,error_msg text,created timestamptz default now());
    create function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,headers jsonb default '{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds integer default 2000)
    returns bigint language plpgsql as $$declare queued bigint;begin
      if current_setting('halenn.test_queue_error',true)='yes' then raise exception 'Synthetic private provider detail';end if;
      insert into net.test_requests(url,body,params,headers,timeout_milliseconds) values(url,body,params,headers,timeout_milliseconds) returning id into queued;
      return queued;end$$;
    insert into auth.users values('${id(1)}','founder@example.test',now(),'test'),('${id(2)}','other@example.test',now(),'test');
    insert into private.halenn_founders(email,needs_password) values('founder@example.test',false);
  `);
  const notificationSql = await migration("202611090005_enquiry_notifications.sql");
  const extension = "create extension if not exists pg_net with schema extensions;";
  assert.equal(notificationSql.split(extension).length, 2, "Stub only the exact extension DDL");
  await db.exec(notificationSql.replace(extension, "-- pg_net is stubbed for this local verification."));

  const brandedSql = await migration("202611100003_branded_enquiry_notification.sql");
  assert.ok(brandedSql.startsWith("begin;\n") && /commit;\s*$/.test(brandedSql));
  const brandedInTransaction = brandedSql.replace(/^begin;\n/, "").replace(/commit;\s*$/, "");
  await test("internal brand upgrade preserves frozen retries, accepted records, envelope and helper permissions", async () => {
    await ready();
    const pending = enquiry(); const accepted = enquiry();
    await submit(pending); await submit(accepted); await respond(accepted); await worker();
    const originalPending = await outbox(pending); const originalAccepted = await outbox(accepted);
    const originalConfig = (await query("select * from private.halenn_enquiry_notification_config"))[0];
    assert.ok(originalPending.payload.html.includes("#f4f1eb"));
    assert.equal(originalAccepted.status, "accepted");
    await db.exec(brandedInTransaction);
    assert.deepEqual(await outbox(pending), originalPending);
    assert.deepEqual(await outbox(accepted), originalAccepted);
    assert.deepEqual((await query("select * from private.halenn_enquiry_notification_config"))[0], originalConfig);
    assert.equal((await query("select count(*)::int as n from private.halenn_enquiry_notifications"))[0].n, 2);
    const updated = (await query("select private.halenn_notification_payload($1) as p", [pending.id]))[0].p;
    const omitHtml = (payload) => Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "html"));
    assert.notEqual(updated.html, originalPending.payload.html);
    assert.deepEqual(omitHtml(updated), omitHtml(originalPending.payload));
    await respond(pending, 503, '{}'); await worker(); await due(pending); await worker();
    assert.deepEqual((await request(pending)).body, originalPending.payload);
    assert.equal(await requestCount(accepted), 1);
    const next = enquiry(); await submit(next);
    assert.ok((await request(next)).body.html.includes("#07090d"));
    for (const role of ["anon", "authenticated"])
      assert.equal((await query("select has_function_privilege($1, 'private.halenn_notification_payload(uuid)', 'execute') as allowed", [role]))[0].allowed, false);
  });
  await db.exec(brandedSql);

  await test("internal email escapes all visitor fields once, preserving literal template markers, newlines and long content", async () => {
    await ready();
    const message = '{{received}} {{reference}} %s %1$s <img src=x onerror="bad()"> & \'quoted\'\n\n' + 'LongToken'.repeat(2000) + '\r\nFinal line';
    const p = enquiry({ name: 'A {{received}} %s <B> & "C"', email: "o'connor&team@example.test", company: '{{reference}} <Company> & ' + 'C'.repeat(150), message });
    assert.ok(message.length < 20000);
    assert.equal(await submit(p), "received");
    const html = (await request(p)).body.html;
    const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
    for (const value of [p.name, p.email, p.company]) assert.ok(html.includes(escape(value)));
    assert.ok(html.includes(escape(message).replaceAll('\r\n', '\n').replaceAll('\r', '\n').replaceAll('\n', '<br>')));
    assert.ok(html.includes('{{received}} {{reference}} %s %1$s'));
    assert.ok(!html.includes('<img src=x')); assert.ok(!html.includes('<Company>')); assert.ok(!html.includes('<B>'));
    assert.match(html, /overflow-wrap:anywhere;word-wrap:break-word;/);
    assert.match(html, /class="halenn-message"[^>]*white-space:pre-wrap;[^>]*word-break:normal;/);
    assert.match(html, /class="halenn-value"[^>]*word-break:normal;/);
    assert.ok(html.indexOf('>View this lead</a>') < html.indexOf('>MESSAGE</h2>'), "The lead action precedes potentially long message content");
    assert.equal((await request(p)).body.text.includes(message), true, "Plain text keeps the exact original message");
    const noCompany = enquiry({ company: '' }); await submit(noCompany);
    assert.ok(!(await request(noCompany)).body.html.includes('>BUSINESS</p>'));
  });

  await test("internal branded layout matches customer assets and offers fluid accessible tables with font fallbacks", async () => {
    await ready(); const p = enquiry({ name: 'Sophie van Dijk (synthetic example)', email: 'sophie@example.test', company: 'Studio Lune Nails — synthetic example', message: 'I run a nail studio and currently take appointments through Instagram.\n\nI’d like a refined website with online booking, appointment reminders and a simple way to follow up with new enquiries.\n\nCould you help me understand the best starting point and the monthly costs?', origin: 'quiz' });
    await submit(p); const html = (await request(p)).body.html;
    assert.match(html, /<h1[^>]*>New website<br>enquiry\.<\/h1>/);
    assert.ok(!/<script|javascript:|display\s*:\s*(?:flex|grid)/i.test(html));
    const tables = html.match(/<table\b[^>]*>/g);
    assert.ok(tables.length >= 4 && tables.every((table) => table.includes('role="presentation"')));
    assert.match(html, /src="https:\/\/halenn\.com\/brand\/email\/halenn-wordmark-v1\.png" alt="Halenn" width="167" height="24"/);
    assert.match(html, /src="https:\/\/halenn\.com\/brand\/halenn-mark-v2-180\.png" alt="" width="48" height="48"/);
    for (const font of ["Manrope-Light.ttf", "Geist-Regular.ttf"]) assert.ok(html.includes("https://halenn.com/brand/email/" + font));
    assert.ok(html.includes("<!--[if !mso]><!-->") && html.includes("<!--[if mso]><style>"));
    assert.match(html, /font-family:Arial,sans-serif !important/);
    assert.ok(html.includes("font-family:'Helvetica Neue',Helvetica,Arial,sans-serif"));
    assert.match(html, /width:100%;max-width:600px;table-layout:fixed/);
    assert.match(html, /max-width:480px/); assert.match(html, /font-size:32px !important/);
    for (const colour of ["#07090d", "#0a1018", "#f2f1ed", "#b8c7d9", "#263347"]) assert.ok(html.includes(colour));
    assert.match(html, /href="https:\/\/halenn\.com\/admin\/leads\?lead=[0-9a-f-]+"/);
    assert.ok(html.includes('Reply to this email to respond directly to the sender.'));
    if (process.env.HALENN_NOTIFICATION_PREVIEW) await writeFile(process.env.HALENN_NOTIFICATION_PREVIEW, html);
  });

  await test("disabled setup saves new enquiries without sending or backfilling history", async () => {
    assert.equal((await query("select count(*)::int as n from private.halenn_enquiry_notifications"))[0].n, 0);
    const p = enquiry();
    assert.equal(await submit(p), "received");
    const n = await outbox(p);
    assert.equal(n.status, "pending");
    assert.equal(n.attempts, 0);
    assert.equal(n.payload, null);
    assert.equal(n.last_error, "notifications_disabled");
    assert.equal(await requestCount(p), 0);
    assert.equal(await outbox(historical), undefined);
  });

  await test("missing key preserves saved lead and starts no retry window", async () => {
    await db.exec("update private.halenn_enquiry_notification_config set enabled=true");
    const p = enquiry();
    assert.equal(await submit(p), "received");
    const n = await outbox(p);
    assert.equal(n.last_error, "sending_key_missing");
    assert.equal(n.first_attempt_at, null);
    assert.equal(n.attempts, 0);
    assert.equal((await query("select count(*)::int as n from public.halenn_leads where id=(select lead_id from public.halenn_website_enquiries where id=$1)", [p.id]))[0].n, 1);
    await query("update private.halenn_enquiry_notifications set created_at=now()-interval '30 days' where enquiry_id=$1", [p.id]);
    await ready(); await due(p); await worker();
    assert.equal((await outbox(p)).status, "queued");
  });

  await test("public intake immediately queues one escaped, fixed-address message and deduplicates browser retries", async () => {
    await ready();
    const p = enquiry({ name: `A & <B> "C" 'D'`, email: "CLIENT@EXAMPLE.TEST", company: "Business\r\nInjected subject", message: `<script>alert("bad")</script> & 'quote'\nA second line.`, origin: "quiz" });
    assert.equal(await submit(p), "received");
    const n = await outbox(p);
    assert.equal(n.status, "queued");
    assert.ok(n.request_id);
    assert.equal(n.attempts, 1);
    const r = await request(p);
    assert.equal(r.url, "https://api.resend.com/emails");
    assert.equal(r.timeout_milliseconds, 10000);
    assert.equal(r.headers["Idempotency-Key"], "halenn-enquiry/" + p.id);
    assert.equal(r.headers.Authorization, "Bearer re_local_test_placeholder");
    assert.equal(r.body.from, "Halenn <enquiries@notifications.halenn.com>");
    assert.deepEqual(r.body.to, ["aevellgroup@gmail.com"]);
    assert.equal(r.body.reply_to, "client@example.test");
    assert.match(r.body.html, /A &amp; &lt;B&gt; &quot;C&quot; &#39;D&#39;/);
    assert.ok(!r.body.html.includes("<script>"));
    assert.ok(r.body.html.includes("&lt;script&gt;alert(&quot;bad&quot;)&lt;/script&gt; &amp; &#39;quote&#39;"));
    assert.match(r.body.html, /https:\/\/halenn.com\/admin\/leads\?lead=[0-9a-f-]+/);
    assert.match(r.body.text, /Website quiz/);
    assert.ok(r.body.text.includes(p.message));
    assert.ok(!/[\r\n]/.test(r.body.subject));
    assert.equal(await submit(p), "received");
    assert.equal(await submit({ ...p, tracking: null }), "received");
    assert.equal(await submit({ ...p, message: "Changed content" }), "conflict");
    assert.equal(await requestCount(p), 1);
  });

  await test("queue exceptions leave enquiry and bounded retry state durable without private error text", async () => {
    await ready();
    await db.exec("select set_config('halenn.test_queue_error','yes',true)");
    const p = enquiry();
    assert.equal(await submit(p), "received");
    let n = await outbox(p);
    assert.equal(n.status, "pending");
    assert.equal(n.last_error, "queue_error");
    assert.equal(n.attempts, 1);
    assert.ok(n.first_attempt_at);
    assert.equal(await requestCount(p), 0);
    await worker();
    assert.equal((await outbox(p)).attempts, 1, "Do not spin before the retry delay");
    await db.exec("select set_config('halenn.test_queue_error','no',true)");
    await due(p); await worker();
    n = await outbox(p);
    assert.equal(n.status, "queued");
    assert.equal(n.attempts, 2);
  });

  await test("unanticipated dispatch failure also preserves enquiry and outbox", async () => {
    await ready();
    await db.exec("alter table vault.decrypted_secrets rename to temporarily_unavailable");
    const p = enquiry();
    assert.equal(await submit(p), "received");
    assert.equal((await outbox(p)).last_error, "dispatch_error");
    assert.equal((await outbox(p)).status, "attention");
    assert.equal(await requestCount(p), 0);
    await db.exec("alter table vault.temporarily_unavailable rename to decrypted_secrets");
    await db.exec(`set local role authenticated;select set_config('request.jwt.claim.sub','${id(1)}',true)`);
    assert.equal((await query("select public.halenn_enquiry_notification_status() as s"))[0].s.attention, 1);
    await db.exec("reset role");
    await due(p); await worker(); assert.equal(await requestCount(p), 0);
    // An operator can requeue after repairing a configuration/schema fault.
    await query("update private.halenn_enquiry_notifications set status='pending' where enquiry_id=$1", [p.id]);
    await worker();
    assert.equal((await outbox(p)).status, "queued");
  });

  await test("accepted responses permanently suppress retries, including after idempotency expiry", async () => {
    await ready(); const p = enquiry(); await submit(p);
    await respond(p);
    await query("update private.halenn_enquiry_notifications set first_attempt_at=clock_timestamp()-interval '2 days' where enquiry_id=$1", [p.id]);
    await worker();
    const n = await outbox(p);
    assert.equal(n.status, "accepted");
    assert.equal(n.provider_email_id, id(999));
    assert.ok(n.accepted_at);
    await db.exec("delete from net._http_response");
    await due(p); await worker(); await worker();
    assert.equal(await requestCount(p), 1);
    assert.equal((await outbox(p)).status, "accepted");
  });

  for (const [label, status, content, extras, expected] of [
    ["rate limit", 429, '{"name":"rate_limit_exceeded"}', {}, "rate_limited"],
    ["server failure", 503, '{}', {}, "provider_unavailable"],
    ["malformed success", 200, '<html>Unavailable</html>', {}, "invalid_response"],
    ["missing success id", 200, '{"message":"ok"}', {}, "invalid_response"],
    ["invalid success id", 200, '{"id":"not-a-uuid"}', {}, "invalid_response"],
    ["timeout", null, null, { timed_out: true }, "request_timeout"],
    ["network error", null, null, { error_msg: "DO NOT RETAIN THIS PRIVATE STRING" }, "request_error"],
    ["concurrent idempotent request", 409, '{"name":"concurrent_idempotent_requests"}', {}, "request_in_progress"],
  ]) {
    await test(`${label} retries only after backoff with identical payload and immutable first-attempt time`, async () => {
      await ready(); const p = enquiry(); await submit(p);
      const original = await outbox(p);
      const first = await request(p);
      await respond(p, status, content, extras); await worker();
      let n = await outbox(p);
      assert.equal(n.status, "pending");
      assert.equal(n.last_error, expected);
      assert.ok(new Date(n.next_attempt_at) > new Date(n.last_attempt_at));
      await worker(); assert.equal(await requestCount(p), 1);
      // Source edits must never change a provider idempotency payload.
      await query("update public.halenn_website_enquiries set message='A later edit',company='A later business name' where id=$1", [p.id]);
      await due(p); await worker();
      n = await outbox(p);
      const second = await request(p);
      assert.equal(n.status, "queued");
      assert.equal(n.attempts, 2);
      assert.deepEqual(n.first_attempt_at, original.first_attempt_at);
      assert.deepEqual(second.body, first.body);
      assert.equal(second.headers["Idempotency-Key"], first.headers["Idempotency-Key"]);
      await respond(p); await worker(); assert.equal((await outbox(p)).status, "accepted");
    });
  }

  for (const [status, content, expected] of [
    [400, '{}', "provider_rejected"], [401, '{}', "provider_configuration"],
    [403, '{}', "provider_configuration"], [422, '{"name":"validation_error"}', "provider_rejected"],
    [409, '{"name":"invalid_idempotent_request"}', "idempotency_conflict"],
    [409, 'malformed', "idempotency_conflict"],
  ]) {
    await test(`permanent ${status} response ${content} needs attention and never auto-resends`, async () => {
      await ready(); const p = enquiry(); await submit(p);
      await respond(p, status, content); await worker();
      assert.equal((await outbox(p)).status, "attention");
      assert.equal((await outbox(p)).last_error, expected);
      await due(p); await worker(); assert.equal(await requestCount(p), 1);
    });
  }

  await test("missing response waits two minutes then uses bounded recovery", async () => {
    await ready(); const p = enquiry(); await submit(p);
    await worker(); assert.equal((await outbox(p)).status, "queued");
    await due(p); await worker();
    assert.equal((await outbox(p)).last_error, "response_missing");
    assert.equal((await outbox(p)).status, "pending");
    assert.equal(await requestCount(p), 1);
    await due(p); await worker(); assert.equal(await requestCount(p), 2);
  });

  for (const state of ["pending", "queued"]) {
    await test(`${state} stops before the 24-hour provider window`, async () => {
      await ready(); const p = enquiry(); await submit(p);
      await query("update private.halenn_enquiry_notifications set status=$2,first_attempt_at=clock_timestamp()-interval '23 hours 1 second',next_attempt_at=now()-interval '1 second' where enquiry_id=$1", [p.id, state]);
      await worker();
      assert.equal((await outbox(p)).status, "attention");
      assert.equal((await outbox(p)).last_error, "retry_window_exhausted");
      assert.equal(await requestCount(p), 1);
    });
    await test(`${state} stops at the attempt cap`, async () => {
      await ready(); const p = enquiry(); await submit(p);
      await query("update private.halenn_enquiry_notifications set status=$2,attempts=20,next_attempt_at=now()-interval '1 second' where enquiry_id=$1", [p.id, state]);
      await worker(); assert.equal((await outbox(p)).status, "attention");
      assert.equal(await requestCount(p), 1);
    });
  }

  await test("backoff is capped, disabling pauses dispatch, and worker batches at most ten sends", async () => {
    const rows = await query("select a,extract(epoch from private.halenn_notification_backoff(a))::int as seconds from generate_series(1,7) a");
    assert.deepEqual(rows.map((r) => r.seconds), [300, 600, 1200, 2400, 3600, 3600, 3600]);
    const all = [];
    for (let i = 0; i < 12; i++) { const p = enquiry(); all.push(p); await submit(p); await due(p); }
    await worker();
    assert.equal((await query("select count(*)::int as n from net.test_requests"))[0].n, 0);
    await ready();
    for (const p of all) await due(p);
    await worker();
    assert.equal((await query("select count(*)::int as n from private.halenn_enquiry_notifications where status='queued'"))[0].n, 10);
    await worker();
    assert.equal((await query("select count(*)::int as n from private.halenn_enquiry_notifications where status='queued'"))[0].n, 12);
  });

  await test("rollback removes enquiry, outbox, and queued network work together", async () => {
    await ready(); const p = enquiry();
    await db.exec("savepoint intake");
    await submit(p); assert.equal(await requestCount(p), 1);
    await db.exec("rollback to savepoint intake;release savepoint intake");
    assert.equal(await outbox(p), undefined);
    assert.equal(await requestCount(p), 0);
    assert.equal((await query("select count(*)::int as n from public.halenn_website_enquiries where id=$1", [p.id]))[0].n, 0);
  });

  await test("private queue, configuration, helper functions, and status enforce founder/password boundaries", async () => {
    await ready();
    const accepted = enquiry(); await submit(accepted); await respond(accepted); await worker();
    const failed = enquiry(); await submit(failed); await respond(failed, 403, '{}'); await worker();
    const pending = enquiry(); await submit(pending);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set local role ${role}`);
      await denied("select * from private.halenn_enquiry_notifications");
      await denied("select * from private.halenn_enquiry_notification_config");
      await denied("select private.halenn_process_enquiry_notifications()");
      await denied(`select private.halenn_dispatch_enquiry_notification('${pending.id}')`);
      await denied("select * from vault.decrypted_secrets");
      await denied("select public.halenn_enquiry_notification_status()");
      await denied("select public.halenn_set_enquiry_notification_recipient('contact@halenn.com')");
      await db.exec("reset role");
    }
    await db.exec(`set local role authenticated;select set_config('request.jwt.claim.sub','${id(2)}',true)`);
    await denied("select public.halenn_enquiry_notification_status()");
    await denied("select public.halenn_set_enquiry_notification_recipient('contact@halenn.com')");
    await db.exec(`select set_config('request.jwt.claim.sub','${id(1)}',true)`);
    const status = (await query("select public.halenn_enquiry_notification_status() as s"))[0].s;
    assert.deepEqual(Object.keys(status).sort(), ["enabled", "configured", "keyExists", "recipient", "pending", "accepted", "attention", "lastAcceptedAt"].sort());
    assert.equal(status.enabled, true); assert.equal(status.configured, true); assert.equal(status.keyExists, true);
    assert.equal(status.recipient, "aevellgroup@gmail.com");
    assert.equal(status.pending, 1); assert.equal(status.accepted, 1); assert.equal(status.attention, 1);
    assert.ok(status.lastAcceptedAt);
    assert.ok(!JSON.stringify(status).includes("re_local_test_placeholder"));
    assert.ok(!JSON.stringify(status).includes(pending.email));
    await db.exec("reset role;update private.halenn_founders set needs_password=true;set local role authenticated");
    await denied("select public.halenn_enquiry_notification_status()");
    await denied("select public.halenn_set_enquiry_notification_recipient('contact@halenn.com')");
    await db.exec("reset role");
    const privateTables = await query("select relrowsecurity from pg_class where oid in ('private.halenn_enquiry_notifications'::regclass,'private.halenn_enquiry_notification_config'::regclass)");
    assert.ok(privateTables.every((t) => t.relrowsecurity));
  });

  await test("founder can switch between both approved recipients without enabling sending or changing other configuration", async () => {
    const before = (await query("select * from private.halenn_enquiry_notification_config"))[0];
    assert.equal(before.recipient, "aevellgroup@gmail.com");
    assert.equal(await switchRecipient(" CONTACT@HALENN.COM "), "contact@halenn.com");
    let after = (await query("select * from private.halenn_enquiry_notification_config"))[0];
    assert.deepEqual(after, { ...before, recipient: "contact@halenn.com" });
    assert.equal(await switchRecipient(" AEVELLGROUP@GMAIL.COM "), "aevellgroup@gmail.com");
    after = (await query("select * from private.halenn_enquiry_notification_config"))[0];
    assert.deepEqual(after, before);
    assert.equal((await query("select count(*)::int as n from vault.decrypted_secrets"))[0].n, 0);
    await db.exec(`set local role authenticated;select set_config('request.jwt.claim.sub','${id(1)}',true)`);
    const status = (await query("select public.halenn_enquiry_notification_status() as s"))[0].s;
    assert.equal(status.recipient, "aevellgroup@gmail.com");
    assert.equal(status.enabled, false);
    assert.equal(status.keyExists, false);
  });

  await test("recipient RPC rejects unsupported, multiple, array and null inputs without modifying configuration", async () => {
    await ready();
    const before = (await query("select * from private.halenn_enquiry_notification_config"))[0];
    await db.exec(`set local role authenticated;select set_config('request.jwt.claim.sub','${id(1)}',true)`);
    for (const invalid of [null, "", "   ", "other@example.test", "contact@halenn.com.evil.test",
      "aevellgroup@gmail.com,contact@halenn.com", '["aevellgroup@gmail.com"]', '{"recipient":"contact@halenn.com"}'])
      await denied("select public.halenn_set_enquiry_notification_recipient(recipient := $1)", [invalid]);
    await denied("select public.halenn_set_enquiry_notification_recipient(array['aevellgroup@gmail.com'])");
    await db.exec("reset role");
    assert.deepEqual((await query("select * from private.halenn_enquiry_notification_config"))[0], before);
    assert.deepEqual(await query("select * from vault.decrypted_secrets"), [{ name: "halenn_resend_api_key", decrypted_secret: "re_local_test_placeholder" }]);
    await denied("update private.halenn_enquiry_notification_config set recipient='unapproved@example.test'");
  });

  await test("recipient changes affect new payloads while queued retries retain their original approved recipient", async () => {
    await ready();
    const existing = enquiry(); await submit(existing);
    const frozen = await outbox(existing);
    assert.deepEqual(frozen.payload.to, ["aevellgroup@gmail.com"]);
    assert.equal(await switchRecipient("contact@halenn.com"), "contact@halenn.com");
    assert.deepEqual((await outbox(existing)).payload, frozen.payload);
    assert.equal((await query("select enabled from private.halenn_enquiry_notification_config"))[0].enabled, true);
    assert.deepEqual(await query("select * from vault.decrypted_secrets"), [{ name: "halenn_resend_api_key", decrypted_secret: "re_local_test_placeholder" }]);
    await respond(existing, 503, '{}'); await worker(); await due(existing); await worker();
    assert.deepEqual((await request(existing)).body, frozen.payload);
    assert.deepEqual((await outbox(existing)).first_attempt_at, frozen.first_attempt_at);
    const next = enquiry(); await submit(next);
    assert.deepEqual((await request(next)).body.to, ["contact@halenn.com"]);
    await db.exec(`set local role authenticated;select set_config('request.jwt.claim.sub','${id(1)}',true)`);
    assert.equal((await query("select public.halenn_enquiry_notification_status() as s"))[0].s.recipient, "contact@halenn.com");
  });

  await test("an enquiry not yet dispatched uses the approved recipient selected before its first attempt", async () => {
    const p = enquiry(); await submit(p);
    assert.equal((await outbox(p)).payload, null);
    await switchRecipient("contact@halenn.com");
    await ready(); await due(p); await worker();
    assert.deepEqual((await request(p)).body.to, ["contact@halenn.com"]);
  });

  await test("missing or blank Vault key is reported only as a setup boolean", async () => {
    await db.exec(`set local role authenticated;select set_config('request.jwt.claim.sub','${id(1)}',true)`);
    let s = (await query("select public.halenn_enquiry_notification_status() as s"))[0].s;
    assert.equal(s.enabled, false); assert.equal(s.configured, false); assert.equal(s.keyExists, false);
    await db.exec("reset role;insert into vault.decrypted_secrets values('halenn_resend_api_key','   ');set local role authenticated");
    s = (await query("select public.halenn_enquiry_notification_status() as s"))[0].s;
    assert.equal(s.configured, false); assert.equal(s.keyExists, false);
  });

  // Exercise the schedule SQL using an exact local stub of cron.schedule.
  await db.exec(`create schema cron;create table cron.test_jobs(name text primary key,schedule text,command text);
    create function cron.schedule(job_name text,job_schedule text,job_command text) returns bigint language plpgsql as $$begin
      insert into cron.test_jobs values(job_name,job_schedule,job_command) on conflict(name) do update set schedule=excluded.schedule,command=excluded.command;return 1;end$$;`);
  const scheduleSql = await migration("202611090006_notification_schedule.sql");
  const cronExtension = "create extension if not exists pg_cron with schema pg_catalog;";
  assert.equal(scheduleSql.split(cronExtension).length, 2);
  await db.exec(scheduleSql.replace(cronExtension, "-- pg_cron is stubbed locally."));
  await db.exec(scheduleSql.replace(cronExtension, "-- pg_cron is stubbed locally."));
  assert.deepEqual(await query("select * from cron.test_jobs"), [{ name: "halenn-enquiry-notifications", schedule: "*/5 * * * *", command: "select private.halenn_process_enquiry_notifications();" }]);
  console.log(`Verified ${checks} notification scenarios and the repeatable five-minute schedule. No network calls were made.`);
} catch (error) {
  console.error(error.message);
  if (error.detail) console.error(error.detail);
  process.exitCode = 1;
} finally {
  await db.close();
}
