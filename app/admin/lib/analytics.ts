import { statuses, channels, type Lead } from "./leads.ts";

export const activityLabels = {
  contact_attempt: "Contact attempt",
  conversation: "Conversation",
  meeting_booked: "Meeting booked",
  meeting_held: "Meeting held",
  meeting_no_show: "Meeting no-show",
  proposal_sent: "Proposal sent",
  payment: "Payment received",
  refund: "Refund paid",
  acquisition_cost: "Acquisition cost",
  delivery_cost: "Delivery cost",
  support_cost: "Support cost",
  commission: "Commission paid",
  upsell: "Upsell agreed",
  referral: "Referral received",
  subscription_started: "Subscription started",
  subscription_changed: "Monthly subscription updated",
  subscription_cancelled: "Subscription cancelled",
} as const;
export type EntryKind = keyof typeof activityLabels;
export const currencies = ["EUR", "USD", "GBP"] as const;
export type Currency = (typeof currencies)[number];
export type Activity = {
  id: string;
  lead_id: string | null;
  kind: EntryKind | "stage" | "baseline";
  occurred_at: string;
  created_at: string;
  from_stage: string | null;
  to_stage: string | null;
  amount_cents: number | null;
  currency: Currency;
  channel: string;
  owner: string;
  note: string;
  voided_at: string | null;
  void_reason: string;
};
export type Entry = Pick<
  Activity,
  | "id"
  | "lead_id"
  | "occurred_at"
  | "amount_cents"
  | "currency"
  | "channel"
  | "owner"
  | "note"
> & { kind: EntryKind };
export const moneyKinds: readonly string[] = [
  "payment",
  "refund",
  "acquisition_cost",
  "delivery_cost",
  "support_cost",
  "commission",
  "upsell",
  "subscription_started",
  "subscription_changed",
];
export const costKinds: readonly string[] = [
  "acquisition_cost",
  "delivery_cost",
  "support_cost",
  "commission",
];
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function cleanEntry(input: Entry, now = new Date()): Entry {
  if (
    !input ||
    !uuid.test(input.id) ||
    !Object.hasOwn(activityLabels, input.kind)
  )
    throw new Error("Choose a valid activity.");
  if (
    (input.lead_id && !uuid.test(input.lead_id)) ||
    (!input.lead_id && input.kind !== "acquisition_cost")
  )
    throw new Error("Choose a lead for this activity.");
  const time = Date.parse(input.occurred_at);
  if (
    !Number.isFinite(time) ||
    time > now.getTime() + 60000 ||
    time < Date.UTC(2000, 0, 1)
  )
    throw new Error("Choose a valid date and time, no later than now.");
  if (!(currencies as readonly string[]).includes(input.currency))
    throw new Error("Choose a supported currency.");
  if (!(channels as readonly string[]).includes(input.channel))
    throw new Error("Choose a lead source.");
  if (
    typeof input.owner !== "string" ||
    input.owner.length > 120 ||
    typeof input.note !== "string" ||
    input.note.length > 2000
  )
    throw new Error("Check the length of your note and owner.");
  if (moneyKinds.includes(input.kind)) {
    if (
      !Number.isSafeInteger(input.amount_cents) ||
      input.amount_cents! < (input.kind === "subscription_changed" ? 0 : 1) ||
      input.amount_cents! > 100000000000
    )
      throw new Error(
        "Enter a valid amount with no more than two decimal places.",
      );
  } else if (input.amount_cents !== null)
    throw new Error("This activity does not need an amount.");
  return {
    id: input.id,
    lead_id: input.lead_id || null,
    kind: input.kind,
    occurred_at: new Date(time).toISOString(),
    amount_cents: input.amount_cents,
    currency: input.currency,
    channel: input.channel,
    owner: input.owner.trim(),
    note: input.note.trim(),
  };
}
export function cents(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const n = Math.round(Number(value) * 100);
  return Number.isSafeInteger(n) ? n : null;
}
const dayFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Amsterdam",
});
export function day(value: string | Date) {
  return dayFormat.format(new Date(value));
}
export function shift(date: string, days: number) {
  return new Date(Date.parse(date + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function daysBetween(start: string, end: string) {
  return Math.round(
    (Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) /
      86400000,
  );
}
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value
  );
}
export type Period = { from: string; to: string };
export type Filters = Period & {
  channel: string;
  service: string;
  owner: string;
  offer: string;
  currency: Currency;
  includeTests?: boolean;
};
export function periodFor(
  preset: string,
  now: string,
  earliest: string,
): Period {
  return {
    from:
      preset === "This month"
        ? now.slice(0, 7) + "-01"
        : preset === "All time"
          ? earliest
          : shift(
              now,
              -(preset === "Last 7 days"
                ? 6
                : preset === "Last 90 days"
                  ? 89
                  : 29),
            ),
    to: now,
  };
}
export function previousPeriod(p: Period): Period {
  const n = daysBetween(p.from, p.to) + 1;
  return { from: shift(p.from, -n), to: shift(p.from, -1) };
}
export function within(value: string, p: Period) {
  const d = value.length === 10 ? value : day(value);
  return d >= p.from && d <= p.to;
}
export function percent(n: number, d: number) {
  return d ? (n / d) * 100 : null;
}
export function median(values: number[]) {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
export function money(value: number | null, currency: Currency) {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
        maximumFractionDigits: value % 100 ? 2 : 0,
      }).format(value / 100);
}
export function rate(value: number | null) {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(
        value,
      ) + "%";
}
export function duration(value: number | null) {
  return value === null
    ? "—"
    : value < 1
      ? "< 1 day"
      : new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(
          value,
        ) + (value === 1 ? " day" : " days");
}
export function contactDuration(days: number | null) {
  if (days === null) return "—";
  if (days < 1 / 1440) return "< 1 min";
  if (days < 1 / 24) return `${Math.floor(days * 1440)} min`;
  if (days < 1) return `${Number((days * 24).toFixed(1))} hr`;
  return duration(days);
}
// Keep the intake channel separate from the consented acquisition source.
export function leadSource(lead: Lead) {
  return lead.channel === "Website" && lead.acquisition_source
    ? lead.acquisition_source
    : lead.channel || "Not recorded";
}
export function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value + "T12:00:00Z"));
}
export function leadMatches(
  l: Lead,
  f: Pick<Filters, "channel" | "service" | "owner" | "offer">,
) {
  return (
    (!f.channel || leadSource(l) === f.channel) &&
    (!f.service || (l.service || "Not recorded") === f.service) &&
    (!f.owner || (l.owner || "Unassigned") === f.owner) &&
    (!f.offer || (l.offer || "Not recorded") === f.offer)
  );
}
function chronological(a: Activity, b: Activity) {
  return (
    a.occurred_at.localeCompare(b.occurred_at) ||
    a.created_at.localeCompare(b.created_at) ||
    a.id.localeCompare(b.id)
  );
}
export function buildAnalytics(
  leads: Lead[],
  activity: Activity[],
  filters: Filters,
  now: string,
) {
  const scoped = leads.filter((l) =>
    (filters.includeTests || !l.is_test) && leadMatches(l, filters),
  );
  const ids = new Set(scoped.map((l) => l.id));
  const events = activity
    .filter(
      (e) =>
        !e.voided_at &&
        (e.lead_id
          ? ids.has(e.lead_id)
          : !filters.service &&
            !filters.offer &&
            (!filters.channel || e.channel === filters.channel) &&
            (!filters.owner || (e.owner || "Unassigned") === filters.owner)),
    )
    .sort(chronological);
  const byLead = new Map<string, Activity[]>();
  for (const event of events)
    if (event.lead_id)
      byLead.set(event.lead_id, [...(byLead.get(event.lead_id) ?? []), event]);
  const history = (id: string) => byLead.get(id) ?? [];
  const converted = (l: Lead) =>
    l.status === "Won" ||
    history(l.id).some(
      (e) =>
        (e.kind === "stage" || e.kind === "baseline") && e.to_stage === "Won",
    );
  // A previously won legacy customer must not become a new customer on a later re-win.
  const wonAt = (l: Lead) =>
    history(l.id).some((e) => e.kind === "baseline" && e.to_stage === "Won")
      ? undefined
      : history(l.id).find((e) => e.kind === "stage" && e.to_stage === "Won")
          ?.occurred_at;
  const datedWins = scoped.flatMap((l) => {
    const at = wonAt(l);
    return at ? [{ lead: l, at }] : [];
  });
  const inPeriod = events.filter((e) => within(e.occurred_at, filters));
  const monetary = inPeriod.filter((e) => e.currency === filters.currency);
  const sum = (kinds: readonly string[], source = monetary) =>
    source
      .filter((e) => kinds.includes(e.kind))
      .reduce((n, e) => n + (e.amount_cents ?? 0), 0);
  const count = (kind: string, source = inPeriod) =>
    source.filter((e) => e.kind === kind).length;
  const uniqueLeads = (kind: string, source = inPeriod) =>
    new Set(source.filter((e) => e.kind === kind).map((e) => e.lead_id)).size;
  const cohort = scoped.filter((l) => within(l.created_at, filters));
  const wins = datedWins.filter((w) => within(w.at, filters));
  const prev = previousPeriod(filters);
  const beforeEvents = events.filter((e) => within(e.occurred_at, prev));
  const beforeMoney = beforeEvents.filter(
    (e) => e.currency === filters.currency,
  );
  const receiptsExist = events.some(
    (e) =>
      ["payment", "refund"].includes(e.kind) && e.currency === filters.currency,
  );
  const costsExist = events.some(
    (e) => costKinds.includes(e.kind) && e.currency === filters.currency,
  );
  const acquisitionExists = events.some(
    (e) =>
      ["acquisition_cost", "commission"].includes(e.kind) &&
      e.currency === filters.currency,
  );
  const revenue = receiptsExist ? sum(["payment"]) - sum(["refund"]) : null;
  const costs = costsExist ? sum(costKinds) : null;
  const acquisition = acquisitionExists
    ? sum(["acquisition_cost", "commission"])
    : null;
  const contribution =
    revenue !== null && costs !== null ? revenue - costs : null;
  const cohortWon = cohort.filter(converted);
  const open = scoped.filter((l) => !["Won", "Closed"].includes(l.status));
  const stageEntered = (l: Lead) =>
    history(l.id)
      .filter((e) => e.kind === "stage" || e.kind === "baseline")
      .at(-1);
  const age = (l: Lead) => {
    const e = stageEntered(l);
    return e?.kind === "stage" && e.to_stage === l.status
      ? Math.max(0, daysBetween(day(e.occurred_at), now))
      : null;
  };
  const overdue = open
    .filter((l) => l.follow_up && l.follow_up < now)
    .sort((a, b) => a.follow_up!.localeCompare(b.follow_up!));
  const dueToday = open.filter((l) => l.follow_up === now);
  const unanswered = open.filter(
    (l) =>
      l.status === "New" &&
      daysBetween(day(l.created_at), now) >= 2 &&
      !history(l.id).some((e) =>
        ["contact_attempt", "conversation"].includes(e.kind),
      ),
  );
  const noFollowup = open.filter(
    (l) =>
      ["Contacted", "Qualified", "Meeting booked", "Proposal"].includes(
        l.status,
      ) && !l.follow_up,
  );
  const stalled = open
    .filter((l) => (age(l) ?? 0) >= 14)
    .sort((a, b) => (age(b) ?? 0) - (age(a) ?? 0));
  const knownCycles = wins
    .map((w) => (Date.parse(w.at) - Date.parse(w.lead.created_at)) / 86400000)
    .filter((x) => x >= 0);
  const firstContact = cohort.flatMap((l) => {
    const records = history(l.id);
    // Legacy leads already beyond New have an unknown earlier first-contact date.
    if (records.some((e) => e.kind === "baseline" && e.to_stage !== "New"))
      return [];
    const first = records.find(
      (e) =>
        ["contact_attempt", "conversation"].includes(e.kind) ||
        (e.kind === "stage" && e.to_stage === "Contacted"),
    );
    const n = first
      ? (Date.parse(first.occurred_at) - Date.parse(l.created_at)) / 86400000
      : -1;
    return n >= 0 ? [n] : [];
  });
  const days = daysBetween(filters.from, filters.to) + 1;
  const size = Math.max(1, Math.ceil(days / 12));
  const trend = Array.from(
    { length: Math.min(12, Math.ceil(days / size)) },
    (_, i) => {
      const from = shift(filters.from, i * size),
        to = shift(filters.from, Math.min(days - 1, (i + 1) * size - 1));
      const slice = events.filter(
        (e) =>
          e.currency === filters.currency &&
          within(e.occurred_at, { from, to }),
      );
      return {
        from,
        to,
        label: shortDate(from),
        leads: cohort.filter((l) => within(l.created_at, { from, to })).length,
        won: datedWins.filter((w) => within(w.at, { from, to })).length,
        revenue: sum(["payment"], slice) - sum(["refund"], slice),
        costs: sum(costKinds, slice),
      };
    },
  );
  const groups = (
    key: "channel" | "service" | "offer" | "owner" | "industry",
  ) => {
    const names = [
      ...new Set(
        cohort.map(
          (l) => key === "channel" ? leadSource(l) : l[key] || (key === "owner" ? "Unassigned" : "Not recorded"),
        ),
      ),
    ];
    return names
      .map((label) => {
        const rows = cohort.filter(
          (l) =>
            (key === "channel" ? leadSource(l) : l[key] || (key === "owner" ? "Unassigned" : "Not recorded")) ===
            label,
        );
        const won = rows.filter(converted);
        return {
          label,
          leads: rows.length,
          won: won.length,
          rate: percent(won.length, rows.length),
          ids: rows.map((l) => l.id),
          wonIds: won.map((l) => l.id),
        };
      })
      .sort(
        (a, b) =>
          b.won - a.won || b.leads - a.leads || a.label.localeCompare(b.label),
      );
  };
  const milestones = [
    { label: "Leads added", ids: cohort.map((l) => l.id) },
    {
      label: "Contacted",
      ids: cohort
        .filter((l) =>
          history(l.id).some(
            (e) =>
              ["contact_attempt", "conversation"].includes(e.kind) ||
              (e.kind === "stage" && e.to_stage === "Contacted"),
          ),
        )
        .map((l) => l.id),
    },
    {
      label: "Qualified",
      ids: cohort
        .filter((l) =>
          history(l.id).some(
            (e) => e.kind === "stage" && e.to_stage === "Qualified",
          ),
        )
        .map((l) => l.id),
    },
    {
      label: "Meeting booked",
      ids: cohort
        .filter((l) => history(l.id).some((e) => e.kind === "meeting_booked"))
        .map((l) => l.id),
    },
    {
      label: "Meeting held",
      ids: cohort
        .filter((l) => history(l.id).some((e) => e.kind === "meeting_held"))
        .map((l) => l.id),
    },
    {
      label: "Proposal sent",
      ids: cohort
        .filter((l) =>
          history(l.id).some(
            (e) =>
              e.kind === "proposal_sent" ||
              (e.kind === "stage" && e.to_stage === "Proposal"),
          ),
        )
        .map((l) => l.id),
    },
    { label: "Became a customer", ids: cohortWon.map((l) => l.id) },
  ];
  const stageAges = statuses
    .filter((s) => !["Won", "Closed"].includes(s))
    .map((label) => {
      const rows = open.filter((l) => l.status === label);
      const known = rows.flatMap((l) => (age(l) === null ? [] : [age(l)!]));
      return {
        label,
        value: median(known),
        sample: known.length,
        total: rows.length,
        ids: rows.map((l) => l.id),
      };
    });
  const losses = cohort.filter((l) => l.status === "Closed" && !converted(l));
  const lossReasons = [
    ...new Set(losses.map((l) => l.lost_reason || "Not recorded")),
  ]
    .map((label) => ({
      label,
      value: losses.filter((l) => (l.lost_reason || "Not recorded") === label)
        .length,
      ids: losses
        .filter((l) => (l.lost_reason || "Not recorded") === label)
        .map((l) => l.id),
    }))
    .sort((a, b) => b.value - a.value);
  const customerRows = scoped.filter(converted);
  const subs = events.filter(
    (e) =>
      e.kind.startsWith("subscription_") && e.currency === filters.currency,
  );
  const subscriptionState = (end: string) => {
    const state = new Map<string, number>();
    for (const e of subs)
      if (day(e.occurred_at) <= end && e.lead_id)
        state.set(
          e.lead_id,
          e.kind === "subscription_cancelled" ? 0 : (e.amount_cents ?? 0),
        );
    return state;
  };
  const opening = subscriptionState(shift(filters.from, -1)),
    ending = subscriptionState(filters.to);
  const activeStart = [...opening].filter(([, amount]) => amount > 0),
    activeEnd = [...ending].filter(([, amount]) => amount > 0);
  const startIds = new Set(activeStart.map(([id]) => id));
  const churned = activeStart.filter(([id]) => (ending.get(id) ?? 0) === 0);
  const subTrend = trend.map((b) => ({
    ...b,
    mrr: [...subscriptionState(b.to).values()].reduce((a, b) => a + b, 0),
  }));
  const upsellIds = new Set(
    inPeriod
      .filter((e) => e.kind === "upsell" && e.lead_id)
      .map((e) => e.lead_id!),
  );
  const paidIds = new Set(
    monetary
      .filter((e) => e.kind === "payment" && e.lead_id)
      .map((e) => e.lead_id!),
  );
  const lifecycle = customerRows
    .map((l) => {
      const records = history(l.id).filter(
        (e) =>
          e.currency === filters.currency && within(e.occurred_at, filters),
      );
      return {
        lead: l,
        collected: sum(["payment"], records) - sum(["refund"], records),
        mrr: ending.get(l.id) ?? 0,
        upsells: records.filter((e) => e.kind === "upsell").length,
      };
    })
    .sort(
      (a, b) =>
        b.collected - a.collected ||
        b.mrr - a.mrr ||
        a.lead.company.localeCompare(b.lead.company),
    );
  return {
    scoped,
    events,
    cohort,
    cohortWon,
    wins,
    inPeriod,
    monetary,
    trend,
    groups,
    milestones,
    stageAges,
    lossReasons,
    open,
    history,
    age,
    overdue,
    dueToday,
    unanswered,
    noFollowup,
    stalled,
    revenue,
    costs,
    contribution,
    acquisition,
    acquisitionPerWin:
      acquisition !== null && wins.length ? acquisition / wins.length : null,
    contributionRate:
      revenue !== null && revenue > 0 && contribution !== null
        ? (contribution / revenue) * 100
        : null,
    payments: sum(["payment"]),
    refunds: sum(["refund"]),
    delivery: sum(["delivery_cost"]),
    support: sum(["support_cost"]),
    commissions: sum(["commission"]),
    count,
    uniqueLeads,
    cycle: median(knownCycles),
    cycleSample: knownCycles.length,
    firstContact: median(firstContact),
    firstContactSample: firstContact.length,
    conversion: percent(cohortWon.length, cohort.length),
    meetingsHeld: count("meeting_held"),
    meetingsBooked: count("meeting_booked"),
    noShows: count("meeting_no_show"),
    attendance: percent(
      count("meeting_held"),
      count("meeting_held") + count("meeting_no_show"),
    ),
    previous: {
      leads: scoped.filter((l) => within(l.created_at, prev)).length,
      won: datedWins.filter((w) => within(w.at, prev)).length,
      meetings: count("meeting_held", beforeEvents),
      revenue: receiptsExist
        ? sum(["payment"], beforeMoney) - sum(["refund"], beforeMoney)
        : null,
    },
    legacyWins: scoped.filter((l) => converted(l) && !wonAt(l)).length,
    missingSource: scoped.filter(
      (l) => !l.channel || l.channel === "Not recorded",
    ).length,
    missingService: scoped.filter(
      (l) => !l.service || l.service === "Not recorded",
    ).length,
    otherCurrency: inPeriod.filter(
      (e) =>
        (moneyKinds.includes(e.kind) || e.kind === "subscription_cancelled") &&
        e.currency !== filters.currency,
    ).length,
    customerRows,
    lifecycle,
    paidCustomers: paidIds.size,
    upsellCustomers: upsellIds.size,
    subscriptionsRecorded: subs.length > 0,
    mrr: subs.length
      ? activeEnd.reduce((n, [, amount]) => n + amount, 0)
      : null,
    openingMrr: subs.length
      ? activeStart.reduce((n, [, amount]) => n + amount, 0)
      : null,
    activeSubscriptions: activeEnd.length,
    newSubscriptions: activeEnd.filter(([id]) => !startIds.has(id)).length,
    churned: churned.map(([id]) => id),
    churn: percent(churned.length, activeStart.length),
    openingSubscribers: activeStart.length,
    subTrend,
  };
}
export type AnalyticsModel = ReturnType<typeof buildAnalytics>;
