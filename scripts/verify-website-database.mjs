// Standalone PostgreSQL integration checks; no production dependency is required.
// Run with HALENN_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node scripts/verify-website-database.mjs.
// Without that variable, an already-installed @electric-sql/pglite package is used.
import { fileURLToPath } from "node:url";
const { PGlite } = await import(
  process.env.HALENN_PGLITE_MODULE || "@electric-sql/pglite"
).catch((cause) => {
  throw new Error(
    "Provide HALENN_PGLITE_MODULE pointing to a local PGlite dist/index.js file to run the database checks.",
    { cause },
  );
});
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
const root = fileURLToPath(new URL("../", import.meta.url));
try {
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,encrypted_password text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  for (const f of [
    "202611060001_founder_leads.sql",
    "202611060002_founder_passwords.sql",
    "202611090001_sales_analytics.sql",
    "202611090002_website_analytics.sql",
    "202611090003_website_reporting.sql",
  ])
    await db.exec(await readFile(root + "supabase/migrations/" + f, "utf8"));
  await db.exec(
    `insert into auth.users values('00000000-0000-4000-8000-000000000001','founder@example.test',now(),'test');insert into private.halenn_founders(email,needs_password) values('founder@example.test',false);`,
  );
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  let n = 100;
  const visit = (session, visitor = 10) => ({
    visitor_id: id(visitor),
    session_id: id(session),
    source: "Instagram",
    medium: "social",
    campaign: "launch",
    referrer: "instagram.com",
    landing_path: "/",
    device: "mobile",
  });
  const event = (kind, extras = {}) => ({
    id: id(n++),
    kind,
    path: "/",
    ...extras,
  });
  const ingest = async (v, events) =>
    (
      await db.query(
        "select public.halenn_record_website_events($1::jsonb) as ok",
        [JSON.stringify({ visit: v, events })],
      )
    ).rows[0].ok;
  await db.exec("set role anon");
  await assert.rejects(
    db.query(
      "select last_value from public.halenn_website_events_sequence_id_seq",
    ),
  );
  await assert.rejects(
    db.query("select nextval('public.halenn_website_events_sequence_id_seq')"),
  );
  const events = [
    event("page_view"),
    event("quiz_view"),
    event("quiz_start", { quiz_id: id(20), goal: "leads" }),
    event("quiz_question", {
      quiz_id: id(20),
      goal: "leads",
      question: "presence",
      step: 2,
    }),
    event("quiz_answer", {
      quiz_id: id(20),
      goal: "leads",
      question: "presence",
      step: 2,
    }),
    event("quiz_complete", { quiz_id: id(20), goal: "leads" }),
    event("enquiry_open", { quiz_id: id(20), form_id: id(30), origin: "quiz" }),
    event("enquiry_start", {
      quiz_id: id(20),
      form_id: id(30),
      origin: "quiz",
    }),
  ];
  assert.equal(await ingest(visit(11), events), true);
  assert.equal(await ingest(visit(11), events), true);
  await assert.rejects(
    ingest(visit(11), [event("enquiry_received", { form_id: id(30) })]),
  );
  const payload = {
    id: id(40),
    form_id: id(30),
    name: "Test person",
    email: "test@example.test",
    company: "Test company",
    message: "A website enquiry",
    origin: "quiz",
    tracking: { session_id: id(11), visitor_id: id(10), quiz_id: id(20) },
  };
  const submit = async (p) =>
    (
      await db.query(
        "select public.halenn_submit_website_enquiry($1::jsonb) as result",
        [JSON.stringify(p)],
      )
    ).rows[0].result;
  assert.equal(await submit(payload), "received");
  assert.equal(await submit({ ...payload, tracking: null }), "received");
  assert.equal(await submit({ ...payload, message: "Changed" }), "conflict");
  await assert.rejects(db.query("select * from public.halenn_website_events"));
  await assert.rejects(
    db.query(
      `select public.halenn_website_report(current_date-5,current_date,'','')`,
    ),
  );
  await ingest(visit(12, 12), [
    event("page_view"),
    event("quiz_view"),
    event("quiz_start", { quiz_id: id(21), goal: "tool" }),
    event("quiz_question", {
      quiz_id: id(21),
      goal: "tool",
      question: "users",
      step: 2,
    }),
  ]);
  await ingest(visit(13, 13), [
    event("page_view"),
    event("quiz_start", { quiz_id: id(22), goal: "sell" }),
    event("quiz_question", {
      quiz_id: id(22),
      goal: "sell",
      question: "sellType",
      step: 3,
    }),
  ]);
  await ingest(visit(14, 14), [
    event("page_view"),
    event("quiz_complete", { quiz_id: id(23), goal: "time" }),
  ]);
  await db.exec(
    `reset role;update public.halenn_website_visits set last_seen_at=now()-interval '31 minutes' where id='${id(12)}';set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);`,
  );
  const report = (
    await db.query(
      `select public.halenn_website_report(current_date-5,current_date,'','') as r`,
    )
  ).rows[0].r;
  assert.equal(report.totals.visits, 4);
  assert.equal(report.totals.pageViews, 4);
  assert.equal(report.totals.quizStarts, 3);
  assert.equal(report.totals.quizCompletions, 1);
  assert.equal(report.totals.enquiries, 1);
  assert.equal(report.quiz.pending, 1);
  assert.equal(report.quiz.abandoned, 1);
  assert.equal(report.sources[0].enquiries, 1);
  assert.equal(
    report.quiz.questions.find((q) => q.question === "users").dropped,
    1,
  );
  assert.equal(
    report.quiz.questions.find((q) => q.question === "sellType").pending,
    1,
  );
  assert.equal(report.journey.at(-1).count, 1);
  const no = (
    await db.query(
      `select public.halenn_website_report(current_date-5,current_date,'Google','') as r`,
    )
  ).rows[0].r;
  assert.equal(no.totals.visits, 0);
  assert.deepEqual(no.sources, []);
  assert.equal(
    (await db.query(`select count(*)::int as n from public.halenn_leads`))
      .rows[0].n,
    1,
  );
  await db.exec(
    `select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false)`,
  );
  assert.equal(
    (
      await db.query(
        `select count(*)::int as n from public.halenn_website_enquiries`,
      )
    ).rows[0].n,
    0,
  );
  await assert.rejects(
    db.query(
      `select public.halenn_website_report(current_date-5,current_date,'','')`,
    ),
  );
  await db.exec(
    `reset role;update public.halenn_website_visits set started_at=now()-interval '91 days' where id='${id(11)}';select private.halenn_prune_website_analytics();`,
  );
  assert.equal(
    (
      await db.query(
        `select count(*)::int as n from public.halenn_website_events where session_id='${id(11)}'`,
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        `select count(*)::int as n from public.halenn_website_enquiries`,
      )
    ).rows[0].n,
    1,
  );
  // Boundary coverage for direct-RPC validation and report accuracy.
  const rawIngest = async (p) =>
    (
      await db.query(
        "select public.halenn_record_website_events($1::jsonb) as ok",
        [JSON.stringify(p)],
      )
    ).rows[0].ok;
  await db.exec("set role anon");
  for (const invalid of [
    null,
    {},
    [],
    { visit: visit(800) },
    { visit: visit(800), events: null },
    { visit: visit(800), events: {} },
    { visit: visit(800), events: [] },
    { visit: null, events: [event("page_view")] },
    { visit: visit(800), events: [null] },
    { visit: visit(800), events: [[]] },
  ])
    await assert.rejects(rawIngest(invalid));
  for (const change of [
    { source: null },
    { source: {} },
    { source: "name@example.test" },
    { source: " ".repeat(5) },
    { medium: "a".repeat(65) },
    { campaign: "a@b" },
    { campaign: null },
    { referrer: "192.168.0.1" },
    { referrer: "[::1]" },
    { referrer: "https://google.com/path" },
    { referrer: null },
    { session_id: null },
    { visitor_id: [id(10)] },
    { device: ["mobile"] },
    { landing_path: null },
  ])
    await assert.rejects(
      ingest({ ...visit(800), ...change }, [event("page_view")]),
    );
  for (const change of [
    { id: null },
    { id: [id(800)] },
    { quiz_id: null },
    { goal: null },
    { question: [] },
    { step: 1.5 },
    { step: "1" },
    { origin: {} },
    { kind: null },
    { path: null },
  ])
    await assert.rejects(ingest(visit(800), [event("page_view", change)]));
  assert.equal(
    await ingest(
      {
        ...visit(800),
        source: " Campaign ",
        medium: " email ",
        campaign: " autumn ",
        referrer: "www.google.nl",
      },
      [event("page_view")],
    ),
    true,
  );
  await db.exec("reset role");
  const clean = (
    await db.query(
      `select source,medium,campaign from public.halenn_website_visits where id='${id(800)}'`,
    )
  ).rows[0];
  assert.deepEqual(clean, {
    source: "Campaign",
    medium: "email",
    campaign: "autumn",
  });
  await db.exec("set role anon");
  for (const change of [
    { name: [] },
    { email: {} },
    { company: null },
    { message: null },
    { tracking: {} },
    { tracking: { session_id: null, visitor_id: id(10) } },
    { tracking: { session_id: id(800), visitor_id: id(10), quiz_id: null } },
  ])
    await assert.rejects(
      submit({ ...payload, id: id(801), form_id: id(802), ...change }),
    );
  const normalized = {
    ...payload,
    id: id(801),
    form_id: id(802),
    email: " Case@Example.Test ",
    company: "Email normalization",
    tracking: null,
  };
  assert.equal(await submit(normalized), "received");
  assert.equal(
    await submit({ ...normalized, email: "case@example.test" }),
    "received",
  );
  assert.equal(
    await submit({
      ...normalized,
      id: id(803),
      company: "Email normalization 2",
      email: "CASE@EXAMPLE.TEST",
    }),
    "received",
  );
  assert.equal(
    await submit({
      ...normalized,
      id: id(804),
      company: "Email normalization 3",
      email: "case@EXAMPLE.test",
    }),
    "received",
  );
  assert.equal(
    await submit({ ...normalized, id: id(805), email: " CaSe@example.test " }),
    "limited",
  );
  await db.exec("reset role");
  assert.equal(
    (
      await db.query(
        `select count(*)::int as n from public.halenn_website_enquiries where email='case@example.test'`,
      )
    ).rows[0].n,
    3,
  );
  assert.ok(
    (
      await db.query(
        `select l.contact from public.halenn_leads l join public.halenn_website_enquiries e on e.lead_id=l.id where e.id='${id(801)}'`,
      )
    ).rows[0].contact.endsWith("case@example.test"),
  );
  await db.exec("set role anon");
  await ingest(visit(810, 810), [
    event("quiz_start", { quiz_id: id(811), goal: "leads" }),
    event("quiz_question", {
      quiz_id: id(811),
      goal: "leads",
      question: "presence",
      step: 2,
    }),
    event("quiz_question", {
      quiz_id: id(811),
      goal: "tool",
      question: "users",
      step: 2,
    }),
  ]);
  await db.exec(
    `reset role;update public.halenn_website_visits set last_seen_at=now()-interval '31 minutes' where id='${id(810)}';set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);`,
  );
  const changed = (
    await db.query(
      `select public.halenn_website_report(current_date,current_date,'','') as r`,
    )
  ).rows[0].r;
  assert.ok(
    !changed.quiz.questions.some(
      (q) => q.goal === "leads" && q.question === "presence",
    ),
  );
  assert.equal(
    changed.quiz.questions.find(
      (q) => q.goal === "tool" && q.question === "users",
    ).dropped,
    2,
  );
  for (const [from, to] of [
    ["2000-01-01", "2000-01-02"],
    ["2099-01-01", "2099-01-02"],
  ]) {
    const empty = (
      await db.query(
        `select public.halenn_website_report($1::date,$2::date,'','') as r`,
        [from, to],
      )
    ).rows[0].r;
    assert.equal(empty.from, from);
    assert.equal(empty.to, to);
    assert.equal(empty.totals.visits, 0);
    assert.deepEqual(empty.trend, []);
    assert.deepEqual(empty.sources, []);
  }
  await assert.rejects(
    db.query(
      `select public.halenn_website_report(current_date,current_date,null,'')`,
    ),
  );
  await assert.rejects(
    db.query(
      `select public.halenn_website_report(current_date,current_date,'',null)`,
    ),
  );
  await db.exec(
    `reset role;update private.halenn_founders set needs_password=true;set role authenticated;`,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from public.halenn_website_visits",
      )
    ).rows[0].n,
    0,
  );
  await assert.rejects(
    db.query(
      `select public.halenn_website_report(current_date,current_date,'','')`,
    ),
  );
  await db.exec(
    `reset role;update private.halenn_founders set needs_password=false;set role anon;`,
  );
  // A complete batch must fit; duplicate IDs never consume extra capacity.
  const capVisit = visit(820, 820);
  const capFirst = event("page_view");
  await ingest(capVisit, [capFirst]);
  await db.exec(
    `reset role;insert into public.halenn_website_events(id,session_id,kind,path) select gen_random_uuid(),'${id(820)}','page_view','/' from generate_series(1,198);set role anon;`,
  );
  assert.equal(
    await ingest(capVisit, [event("page_view"), event("page_view")]),
    false,
  );
  const finalEvent = event("page_view");
  assert.equal(await ingest(capVisit, [finalEvent, finalEvent]), true);
  assert.equal(await ingest(capVisit, [capFirst, finalEvent]), true);
  assert.equal(await ingest(capVisit, [event("page_view")]), false);
  await db.exec("reset role");
  assert.equal(
    (
      await db.query(
        `select count(*)::int as n from public.halenn_website_events where session_id='${id(820)}'`,
      )
    ).rows[0].n,
    200,
  );
  // Global telemetry cap uses the complete new batch as well.
  const dailyVisit = visit(830, 830);
  await db.exec("set role anon");
  const dailyFirst = event("page_view");
  await ingest(dailyVisit, [dailyFirst]);
  await db.exec(
    `reset role;insert into public.halenn_website_events(id,session_id,kind,path) select gen_random_uuid(),'${id(820)}','page_view','/' from generate_series(1,19999-(select count(*)::int from public.halenn_website_events where occurred_at>=date_trunc('day',now())));set role anon;`,
  );
  assert.equal(
    await ingest(dailyVisit, [event("page_view"), event("page_view")]),
    false,
  );
  const dailyLast = event("page_view");
  assert.equal(await ingest(dailyVisit, [dailyLast]), true);
  assert.equal(await ingest(dailyVisit, [dailyFirst, dailyLast]), true);
  assert.equal(await ingest(dailyVisit, [event("page_view")]), false);
  await db.exec("reset role");
  assert.equal(
    (
      await db.query(
        `select count(*)::int as n from public.halenn_website_events where occurred_at>=date_trunc('day',now())`,
      )
    ).rows[0].n,
    20000,
  );
  console.log(
    "PASS: direct-RPC missing/null/object/scalar validation; safe attribution metadata; normalized email persistence/idempotency/rate bounds; final-goal question alignment; historical/future empty ranges; password-required founder isolation; exact session/day batch caps and retries at capacity.",
  );
  console.log(
    "PASS: migrations, event retry dedup, server-only receipts, enquiry idempotency/conflicts, anonymous isolation, source filters, real receipts, partial consent, branch dropout vs active attempts, retention preserves enquiries.",
  );
  await db.close();
} catch (e) {
  console.error(e.stack);
  if (e.cause) console.error(e.cause);
  await db.close();
  process.exitCode = 1;
}
