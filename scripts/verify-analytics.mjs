import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAnalytics,
  cleanEntry,
  cents,
  day,
  shift,
  previousPeriod,
  periodFor,
  percent,
  validDate,
} from "../app/admin/lib/analytics.ts";
import { empty } from "../app/admin/lib/leads.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const lead = (n, extras = {}) => ({
  ...empty,
  id: id(n),
  company: `Company ${n}`,
  created_at: "2026-10-01T12:00:00Z",
  revision: 1,
  ...extras,
});
let seq = 100;
const event = (l, kind, date, extras = {}) => ({
  id: id(seq++),
  lead_id: l?.id ?? null,
  kind,
  occurred_at: date + "T12:00:00Z",
  created_at: "2026-11-09T12:00:00Z",
  from_stage: null,
  to_stage: null,
  amount_cents: null,
  currency: "EUR",
  channel: l?.channel || "Not recorded",
  owner: "",
  note: "",
  voided_at: null,
  void_reason: "",
  ...extras,
});
const filters = {
  from: "2026-10-01",
  to: "2026-10-31",
  channel: "",
  service: "",
  offer: "",
  owner: "",
  currency: "EUR",
};
const model = (leads, events, extra = {}) =>
  buildAnalytics(leads, events, { ...filters, ...extra }, "2026-11-09");
test("Amsterdam days and inclusive previous periods survive DST and month boundaries", () => {
  assert.equal(day("2026-10-24T22:30:00Z"), "2026-10-25");
  assert.equal(day("2026-10-25T23:30:00Z"), "2026-10-26");
  assert.equal(shift("2026-10-25", 1), "2026-10-26");
  assert.deepEqual(previousPeriod({ from: "2026-03-01", to: "2026-03-31" }), {
    from: "2026-01-29",
    to: "2026-02-28",
  });
  assert.deepEqual(periodFor("Last 7 days", "2026-11-09", "2026-10-01"), {
    from: "2026-11-03",
    to: "2026-11-09",
  });
  assert.equal(validDate("2026-02-30"), false);
});
test("acquisition cohorts and dated wins are separate, and a re-win never creates another customer", () => {
  const older = lead(1, { created_at: "2026-09-01T12:00:00Z", status: "Won" }),
    recent = lead(2, { status: "Won" });
  const m = model(
    [older, recent],
    [
      event(older, "stage", "2026-10-02", { to_stage: "Won" }),
      event(recent, "stage", "2026-11-02", { to_stage: "Won" }),
      event(older, "stage", "2026-11-03", { to_stage: "Won" }),
    ],
  );
  assert.equal(m.cohort.length, 1);
  assert.equal(m.cohortWon.length, 1);
  assert.equal(m.wins.length, 1);
  assert.equal(m.wins[0].lead.id, older.id);
  assert.equal(
    m.trend.reduce((n, r) => n + r.won, 0),
    1,
  );
});
test("legacy observations do not invent contact times, win dates or current stage ages", () => {
  const l = lead(3, { status: "Won" }),
    c = lead(4, { status: "Contacted" });
  const m = model(
    [l, c],
    [
      event(l, "baseline", "2026-10-05", { to_stage: "Won" }),
      event(l, "stage", "2026-10-10", { to_stage: "Won" }),
      event(c, "baseline", "2026-10-05", { to_stage: "Contacted" }),
      event(c, "contact_attempt", "2026-10-08"),
    ],
  );
  assert.equal(m.wins.length, 0);
  assert.equal(m.legacyWins, 1);
  assert.equal(m.firstContact, null);
  assert.equal(m.age(c), null);
});
test("cash, costs, upsells and recurring commitments do not double count; currencies remain separate", () => {
  const l = lead(5, { status: "Won" });
  const events = [
    event(l, "payment", "2026-10-05", { amount_cents: 10000 }),
    event(l, "refund", "2026-10-06", { amount_cents: 1000 }),
    event(l, "delivery_cost", "2026-10-06", { amount_cents: 2000 }),
    event(l, "commission", "2026-10-06", { amount_cents: 500 }),
    event(l, "upsell", "2026-10-06", { amount_cents: 8000 }),
    event(l, "subscription_started", "2026-10-06", { amount_cents: 4700 }),
    event(l, "payment", "2026-10-06", { amount_cents: 99900, currency: "USD" }),
    event(l, "payment", "2026-10-07", {
      amount_cents: 99000,
      voided_at: "2026-10-08T12:00:00Z",
    }),
  ];
  const m = model([l], events);
  assert.equal(m.revenue, 9000);
  assert.equal(m.costs, 2500);
  assert.equal(m.contribution, 6500);
  assert.equal(m.mrr, 4700);
  assert.equal(m.otherCurrency, 1);
  assert.equal(model([l], events, { currency: "USD" }).revenue, 99900);
});
test("MRR is the latest monthly total; churn measures opening subscribers still lost at the end", () => {
  const a = lead(6),
    b = lead(7),
    c = lead(8);
  const events = [
    event(a, "subscription_started", "2026-09-01", { amount_cents: 4700 }),
    event(b, "subscription_started", "2026-09-01", { amount_cents: 9900 }),
    event(a, "subscription_changed", "2026-10-05", { amount_cents: 7900 }),
    event(b, "subscription_cancelled", "2026-10-10"),
    event(c, "subscription_started", "2026-10-20", { amount_cents: 4700 }),
    event(a, "subscription_cancelled", "2026-10-25"),
    event(a, "subscription_started", "2026-10-29", { amount_cents: 7900 }),
  ];
  const m = model([a, b, c], events);
  assert.equal(m.openingMrr, 14600);
  assert.equal(m.mrr, 12600);
  assert.equal(m.activeSubscriptions, 2);
  assert.equal(m.newSubscriptions, 1);
  assert.deepEqual(m.churned, [b.id]);
  assert.equal(m.churn, 50);
  assert.equal(model([a, b, c], events, { to: "2026-10-15" }).mrr, 7900);
});
test("source filters include shared channel costs, but service filters exclude unallocated costs", () => {
  const a = lead(9, { channel: "Instagram", service: "Website" }),
    b = lead(10, { channel: "Cold calling", service: "App" });
  const events = [
    event(null, "acquisition_cost", "2026-10-03", {
      channel: "Instagram",
      amount_cents: 4000,
    }),
    event(a, "delivery_cost", "2026-10-03", { amount_cents: 1000 }),
    event(b, "delivery_cost", "2026-10-03", { amount_cents: 9000 }),
  ];
  assert.equal(model([a, b], events, { channel: "Instagram" }).costs, 5000);
  assert.equal(
    model([a, b], events, { channel: "Instagram", service: "Website" }).costs,
    1000,
  );
});
test("empty or missing inputs never manufacture rates, cash, subscription totals or historical stages", () => {
  const m = model([], []);
  assert.equal(m.conversion, null);
  assert.equal(m.revenue, null);
  assert.equal(m.costs, null);
  assert.equal(m.mrr, null);
  assert.equal(m.churn, null);
  assert.equal(percent(0, 0), null);
  const l = lead(11, { status: "Won" }),
    n = model([l], [event(l, "stage", "2026-10-10", { to_stage: "Won" })]);
  assert.equal(
    n.milestones.find((r) => r.label === "Meeting held").ids.length,
    0,
  );
  assert.equal(
    n.milestones.find((r) => r.label === "Became a customer").ids.length,
    1,
  );
});
test("entry validation rejects invalid amounts, timestamps, unsafe kinds and missing lead associations", () => {
  const good = {
    id: id(30),
    lead_id: id(1),
    kind: "payment",
    occurred_at: "2026-10-01T12:00:00Z",
    amount_cents: 4700,
    currency: "EUR",
    channel: "Instagram",
    owner: " A ",
    note: " note ",
  };
  assert.equal(cleanEntry(good, new Date("2026-11-09")).owner, "A");
  for (const bad of [
    { kind: "constructor" },
    { kind: "stage" },
    { amount_cents: -1 },
    { amount_cents: 1.5 },
    { amount_cents: 100000000001 },
    { currency: "XYZ" },
    { lead_id: null },
    { occurred_at: "2099-01-01" },
    { id: "bad" },
  ])
    assert.throws(() =>
      cleanEntry({ ...good, ...bad }, new Date("2026-11-09")),
    );
  assert.equal(cents("47.25"), 4725);
  assert.equal(cents("47.255"), null);
  assert.equal(cents("-1"), null);
  assert.equal(
    cleanEntry({ ...good, kind: "subscription_changed", amount_cents: 0 })
      .amount_cents,
    0,
  );
});
