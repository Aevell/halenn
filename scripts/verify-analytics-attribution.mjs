// Isolated PostgreSQL checks: no live enquiries, emails or customer records are changed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.HALENN_PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const migration = (name) => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let seq = 1000;
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
const identity = async (founder = false) => {
  await db.exec(`reset role;select set_config('request.jwt.claim.sub','${founder ? id(1) : ""}',false);set role ${founder ? "authenticated" : "anon"}`);
};
const visit = async (session, source = "Instagram", extra = {}) => {
  await scalar("select public.halenn_record_website_events($1::jsonb)", [JSON.stringify({
    visit: { session_id: id(session), visitor_id: id(session + 100), source, medium: "social", campaign: "autumn", referrer: "instagram.com", landing_path: "/", device: "mobile", ...extra },
    events: [{ id: id(seq++), kind: "page_view", path: "/" }],
  })]);
};
const enquiry = async (session, extra = {}) => {
  const n = seq++, payload = { id: id(n), form_id: id(n + 10000), name: "Fixture", email: `fixture-${n}@example.test`, company: `Fixture ${n}`, message: "An isolated test fixture", origin: "homepage", tracking: session ? { session_id: id(session), visitor_id: id(session + 100) } : null, ...extra };
  assert.equal(await scalar("select public.halenn_submit_website_enquiry($1::jsonb)", [JSON.stringify(payload)]), "received");
  return payload.id;
};
const report = async (include = false, source = "") => {
  await identity(true);
  return scalar("select public.halenn_website_report_v2(current_date-1,current_date,$1,'',$2)", [source, include]);
};
const leadFor = async (eid) => {
  await db.exec("reset role");
  return (await db.query("select l.* from public.halenn_leads l join public.halenn_website_enquiries q on q.lead_id=l.id where q.id=$1", [eid])).rows[0];
};
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,encrypted_password text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for (const name of ["202611060001_founder_leads", "202611060002_founder_passwords", "202611090001_sales_analytics", "202611090002_website_analytics", "202611090003_website_reporting"])
    await db.exec(await migration(name));
  await db.exec(`insert into auth.users values('${id(1)}','founder@example.test',now(),'test');insert into private.halenn_founders(email,needs_password) values('founder@example.test',false);`);
  // Existing records exercise the precise, non-destructive migration backfill.
  await identity();
  await visit(10, "Direct");
  const known1 = await enquiry(10, { id: "2f39b8d4-7759-44aa-bd0e-5f2351cf91cc" });
  await visit(11, "Direct", { visitor_id: id(110) });
  const known2 = await enquiry(11, { id: "af0cb8a4-d21f-4bc7-9b66-f50a66992a22", tracking: {session_id: id(11), visitor_id: id(110)} });
  await visit(12, "Google");
  const realBefore = await enquiry(12, { company: "Test Services Ltd" }); // A name is never evidence of internal testing.
  const noConsent = await enquiry(null);
  await db.exec("reset role");
  const historyBefore = await scalar("select count(*)::int from public.halenn_activity");
  await db.exec(await migration("202611100004_analytics_clarity"));
  assert.equal(await scalar("select count(*)::int from public.halenn_activity"), historyBefore, "backfill must not invent stages");
  assert.equal((await leadFor(known1)).is_test, true);
  assert.equal((await leadFor(known2)).is_test, true);
  assert.equal((await leadFor(realBefore)).is_test, false);
  assert.equal((await leadFor(realBefore)).acquisition_source, "Google");
  assert.equal((await leadFor(noConsent)).acquisition_source, "");
  const beforeCallReport = await report(true);
  await db.exec("reset role");
  const enquiriesBeforeReportUpgrade = await scalar("select count(*)::int from public.halenn_website_enquiries");
  const activitiesBeforeReportUpgrade = await scalar("select count(*)::int from public.halenn_activity");
  await db.exec(await migration("202611110004_project_call_reporting"));
  assert.equal(await scalar("select count(*)::int from public.halenn_website_enquiries"), enquiriesBeforeReportUpgrade);
  assert.equal(await scalar("select count(*)::int from public.halenn_activity"), activitiesBeforeReportUpgrade);
  const afterCallReport = await report(true);
  assert.ok(afterCallReport.sources.every((row) => row.bookedCalls === 0));
  const priorShape = (report) => {
    const copy = structuredClone(report);
    delete copy.updatedAt;
    for (const row of copy.sources) delete row.bookedCalls;
    return copy;
  };
  assert.deepEqual(priorShape(afterCallReport), priorShape(beforeCallReport), "new booking reporting preserves all existing report values");
  let r = await report();
  assert.equal(r.totals.visits, 1);
  assert.equal(r.totals.enquiries, 1);
  assert.equal(r.coverage.excludedVisits, 2);
  assert.equal((await report(true)).totals.enquiries, 3);
  assert.equal((await scalar("select public.halenn_website_report(current_date-1,current_date,'','')")).totals.enquiries, 1);
  // Public payload cannot classify tests; source comes from the recorded visit only.
  await identity();
  await visit(20, "Instagram", { is_internal: true });
  const real = await enquiry(20, { is_test: true, acquisition_source: "Forged" });
  let l = await leadFor(real);
  assert.equal(l.is_test, false);
  assert.equal(l.acquisition_source, "Instagram");
  assert.equal(l.acquisition_medium, "social");
  assert.equal(l.acquisition_campaign, "autumn");
  await identity();
  await assert.rejects(db.query("select * from public.halenn_leads"));
  await assert.rejects(db.query("update public.halenn_website_visits set is_internal=true"));
  await assert.rejects(db.query("select public.halenn_website_report_v2(current_date,current_date,'','',true)"));
  // Authenticated founders are automatically excluded, including enquiries without analytics consent.
  await identity(true);
  await visit(30, "Direct");
  const internal = await enquiry(30);
  const internalNoConsent = await enquiry(null);
  assert.equal((await leadFor(internal)).is_test, true);
  assert.equal((await leadFor(internalNoConsent)).is_test, true);
  assert.equal((await leadFor(internalNoConsent)).acquisition_source, "");
  assert.equal((await report()).coverage.excludedVisits, 3);
  // Sales may be won later, or closed after a previous win; voided wins do not count.
  await db.exec("reset role");
  await db.query("update public.halenn_leads set status='Won' where id=$1", [l.id]);
  r = await report(false, "Instagram");
  assert.equal(r.sources[0].leads, 1);
  assert.equal(r.sources[0].customers, 1);
  await db.exec("reset role");
  await db.query("update public.halenn_leads set status='Closed' where id=$1", [l.id]);
  assert.equal((await report(false, "Instagram")).sources[0].customers, 1);
  // Manual test classification is reversible and removes the linked activity from the visitor report.
  await db.query("update public.halenn_leads set is_test=true,revision=revision+1 where id=$1", [l.id]);
  assert.equal((await report(false, "Instagram")).totals.visits, 0);
  assert.equal((await report(true, "Instagram")).sources[0].customers, 1);
  await db.query("update public.halenn_leads set is_test=false,revision=revision+1 where id=$1", [l.id]);
  assert.equal((await report(false, "Instagram")).totals.visits, 1);
  await assert.rejects(db.query("update public.halenn_leads set acquisition_source='Forged' where id=$1", [l.id]));
  // A genuine and test enquiry in the same visit retain only the genuine conversion.
  await identity();
  const mixed = await enquiry(20, { origin: "quiz" });
  const mixedLead = await leadFor(mixed);
  await identity(true);
  await db.query("update public.halenn_leads set is_test=true where id=$1", [mixedLead.id]);
  r = await report(false, "Instagram");
  assert.equal(r.totals.visits, 1);
  assert.equal(r.totals.enquiries, 1);
  assert.equal(r.totals.quizEnquiries, 0);
  assert.equal(r.sources[0].leads, 1);
  assert.equal(r.sources[0].customers, 1);
  assert.equal((await report(true, "Instagram")).totals.quizEnquiries, 1);
  // A reused form ID still cannot leak a test receipt into the genuine submission count.
  await db.exec("reset role");
  await db.query("update public.halenn_website_enquiries set form_id=(select form_id from public.halenn_website_enquiries where id=$1) where id=$2", [real, mixed]);
  await db.query("update public.halenn_website_events set form_id=(select form_id from public.halenn_website_enquiries where id=$1) where id=$2", [real, mixed]);
  assert.equal((await report(false, "Instagram")).totals.enquiries, 1);
  // Source booking conversion counts each acquired lead once, excluding corrected and test activity.
  const bookedActivity = async (lead, voided = false) => {
    await db.exec("reset role");
    await db.query("insert into public.halenn_activity(lead_id,kind,channel,occurred_at,voided_at,void_reason) values($1,'meeting_booked','Website',now(),case when $2 then now() end,case when $2 then 'Fixture correction' else '' end)", [lead.id, voided]);
  };
  await bookedActivity(l); await bookedActivity(l);
  await bookedActivity(mixedLead);
  await bookedActivity(await leadFor(realBefore), true);
  await bookedActivity(await leadFor(noConsent));
  assert.equal((await report(false, "Instagram")).sources[0].bookedCalls, 1);
  assert.equal((await report(true, "Instagram")).sources[0].bookedCalls, 2);
  assert.equal((await report(false, "Google")).sources[0].bookedCalls, 0);
  await db.query("update public.halenn_leads set is_test=true where id=$1", [l.id]);
  assert.equal((await report(false, "Instagram")).sources.length, 0);
  await db.query("update public.halenn_leads set is_test=false where id=$1", [l.id]);
  assert.equal((await report(false, "Instagram")).sources[0].bookedCalls, 1);
  // A later booking still belongs to the earlier visit cohort; it is not a new visit.
  await identity(); await visit(40, "Referral");
  const laterBooking = await leadFor(await enquiry(40));
  await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");
  await db.query("update public.halenn_website_visits set started_at=(current_date-2)::timestamp at time zone 'Europe/Amsterdam' where id=$1", [id(40)]);
  await bookedActivity(laterBooking);
  await db.exec("update private.halenn_website_tracking set started_at=now()-interval '3 days'");
  await identity(true);
  const earlierCohort = await scalar("select public.halenn_website_report_v2(current_date-2,current_date-2,'Referral','',false)");
  assert.equal(earlierCohort.sources[0].bookedCalls, 1);
  assert.equal(earlierCohort.sources[0].leads, 1);
  assert.equal((await report(false, "Referral")).sources.length, 0);
  assert.equal((await scalar("select public.halenn_website_report(current_date-2,current_date-2,'Referral','')")).sources[0].bookedCalls, 1);
  // Retention removes detailed visits, while the consented acquisition snapshot remains on the lead.
  await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");
  await db.query("update public.halenn_website_visits set started_at=now()-interval '91 days' where id=$1", [id(20)]);
  await db.exec("select private.halenn_prune_website_analytics()");
  l = await leadFor(real);
  assert.equal(l.acquisition_source, "Instagram");
  assert.equal(l.acquisition_campaign, "autumn");
  assert.equal(await scalar("select count(*)::int from public.halenn_website_events where session_id=$1", [id(20)]), 0);
  assert.equal(await scalar("select count(*)::int from public.halenn_website_enquiries where id=$1", [real]), 1);
  await db.exec("update private.halenn_founders set needs_password=true");
  await identity(true);
  await assert.rejects(db.query("select public.halenn_website_report_v2(current_date,current_date,'','',true)"));
  console.log("PASS: precise setup backfill; no lost records or invented stages; consented source snapshot; no-consent fallback; founder tests; spoof resistance; anonymous isolation; reversible exclusion; mixed visits/forms; won-to-date attribution; booking activity deduplication and exclusions; later bookings in earlier cohorts; report upgrade preservation; retention; password gate.");
} finally { await db.close(); }
