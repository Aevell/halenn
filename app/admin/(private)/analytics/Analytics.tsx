"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { channels, services, statuses, type Lead } from "../../lib/leads";
import {
  activityLabels,
  buildAnalytics,
  currencies,
  day,
  daysBetween,
  duration,
  money,
  periodFor,
  previousPeriod,
  rate,
  shortDate,
  validDate,
  within,
  type Activity,
  type Filters,
} from "../../lib/analytics";
import { Bars, Empty, Panel, Stat, Trend } from "./Charts";
import RecordActivity, {
  AnalyticsDialog,
  CorrectRecord,
} from "./RecordActivity";

const tabs = [
  ["overview", "Overview"],
  ["acquisition", "Acquisition"],
  ["sales", "Sales process"],
  ["revenue", "Offers & revenue"],
  ["growth", "Customer growth"],
] as const;
const presets = [
  "Last 7 days",
  "Last 30 days",
  "Last 90 days",
  "This month",
  "All time",
  "Custom dates",
];
type Drill = { title: string; ids: string[]; description?: string };
function delta(n: number, previous: number, compare: boolean) {
  if (!compare) return undefined;
  const change = n - previous;
  return change === 0
    ? `No change · previously ${previous}`
    : `${change > 0 ? "+" : ""}${change} · previously ${previous}`;
}
export default function Analytics({
  leads,
  activity,
  now,
  preview = false,
}: {
  leads: Lead[];
  activity: Activity[];
  now: string;
  preview?: boolean;
}) {
  const search = useSearchParams();
  const [params, setParams] = useState(
    () => new URLSearchParams(search.toString()),
  );
  const [more, setMore] = useState(false);
  const [record, setRecord] = useState(() =>
    leads.some((l) => l.id === search.get("record")),
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(30);
  const [correct, setCorrect] = useState<Activity | null>(null);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [drillSearch, setDrillSearch] = useState("");
  const [drillLimit, setDrillLimit] = useState(50);
  const [flash, setFlash] = useState("");
  useEffect(() => {
    const restore = () =>
      setParams(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  function change(values: Record<string, string>, push = false) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(values))
      if (v) next.set(k, v);
      else next.delete(k);
    setParams(next);
    window.history[push ? "pushState" : "replaceState"](
      null,
      "",
      window.location.pathname + (next.size ? "?" + next : ""),
    );
  }
  const selectedTab =
    tabs.find(([id]) => id === params.get("tab"))?.[0] ?? "overview";
  const preset = presets.includes(params.get("period") ?? "")
    ? params.get("period")!
    : "Last 30 days";
  const earliest = [
    ...leads.map((l) => day(l.created_at)),
    ...activity.map((a) => day(a.occurred_at)),
    now,
  ].sort()[0];
  const basePeriod = periodFor(preset, now, earliest);
  const customFrom = params.get("from") || basePeriod.from,
    customTo = params.get("to") || now;
  const customValid =
    validDate(customFrom) &&
    validDate(customTo) &&
    customFrom <= customTo &&
    customTo <= now &&
    daysBetween(customFrom, customTo) < 3660;
  const period =
    preset === "Custom dates" && customValid
      ? { from: customFrom, to: customTo }
      : basePeriod;
  const filters = useMemo<Filters>(
    () => ({
      from: period.from,
      to: period.to,
      channel: params.get("source") || "",
      service: params.get("service") || "",
      owner: params.get("owner") || "",
      offer: params.get("offer") || "",
      currency: currencies.find((c) => c === params.get("currency")) || "EUR",
    }),
    [period.from, period.to, params],
  );
  const compare = params.get("compare") !== "off";
  const model = useMemo(
    () => buildAnalytics(leads, activity, filters, now),
    [leads, activity, filters, now],
  );
  const fmt = (n: number | null) => money(n, filters.currency);
  const owners = [...new Set(leads.map((l) => l.owner || "Unassigned"))].sort();
  const offers = [
    ...new Set(leads.map((l) => l.offer || "Not recorded")),
  ].sort();
  const filterCount = [
    filters.channel,
    filters.service,
    filters.owner,
    filters.offer,
  ].filter(Boolean).length;
  const previous = previousPeriod(period);
  const periodLabel =
    shortDate(period.from) +
    " – " +
    shortDate(period.to) +
    " " +
    period.to.slice(0, 4);
  function inspect(title: string, ids: string[], description?: string) {
    setDrill({ title, ids, description });
    setDrillSearch("");
    setDrillLimit(50);
  }
  const sourceGroups = model.groups("channel");
  const tableRows = (
    key: "channel" | "service" | "offer" | "owner" | "industry",
    label: string,
  ) => (
    <div className="ha-table-scroll">
      <table>
        <thead>
          <tr>
            <th>{label}</th>
            <th>Leads</th>
            <th>Customers</th>
            <th>Conversion</th>
          </tr>
        </thead>
        <tbody>
          {model.groups(key).map((row) => (
            <tr key={row.label}>
              <th>
                <button
                  className="ha-text-button"
                  onClick={() =>
                    inspect(
                      row.label,
                      row.ids,
                      "Leads added in this period. Conversion is measured to date.",
                    )
                  }
                >
                  {row.label} ↗
                </button>
              </th>
              <td>{row.leads}</td>
              <td>{row.won}</td>
              <td>
                {rate(row.rate)}
                <small>
                  {row.won} of {row.leads}
                </small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const journey = (
    <Bars
      max={model.cohort.length}
      rows={model.milestones.map((row) => ({
        label: row.label,
        value: row.ids.length,
        detail:
          row.label === "Leads added"
            ? "Selected acquisition period"
            : `${rate(model.cohort.length ? (row.ids.length / model.cohort.length) * 100 : null)} of this lead group`,
        onClick: () =>
          inspect(
            row.label,
            row.ids,
            "Leads added in the selected period, with this recorded milestone to date.",
          ),
      }))}
    />
  );
  const trendRows = model.trend.map((row) => ({
    label: row.label,
    fullLabel:
      shortDate(row.from) +
      (row.from === row.to ? "" : " – " + shortDate(row.to)),
    a: row.leads,
    b: row.won,
    onClick: () =>
      inspect(
        "Leads added " + shortDate(row.from),
        model.cohort.filter((l) => within(l.created_at, row)).map((l) => l.id),
      ),
  }));
  const activeIds = new Set(model.scoped.map((l) => l.id));
  const log = activity
    .filter(
      (e) =>
        within(e.occurred_at, period) &&
        (e.lead_id
          ? activeIds.has(e.lead_id)
          : !filters.service &&
            !filters.offer &&
            (!filters.channel || e.channel === filters.channel) &&
            (!filters.owner || (e.owner || "Unassigned") === filters.owner)),
    )
    .sort(
      (a, b) =>
        b.occurred_at.localeCompare(a.occurred_at) ||
        b.created_at.localeCompare(a.created_at),
    );
  const people = [
    ...new Set(
      model.inPeriod
        .filter((e) => e.kind !== "stage" && e.kind !== "baseline")
        .map((e) => e.owner || "Unassigned"),
    ),
  ];
  const noManualRecords = !activity.some(
    (e) => e.kind !== "stage" && e.kind !== "baseline" && !e.voided_at,
  );
  const labelActivity = (e: Activity) =>
    e.kind === "stage"
      ? `${e.from_stage || "Added"} → ${e.to_stage}`
      : e.kind === "baseline"
        ? `Tracking started · ${e.to_stage}`
        : activityLabels[e.kind];
  return (
    <section className="ha hw-enter">
      <header className="ha-heading">
        <div>
          <span className="ha-eyebrow">YOUR BUSINESS, IN PERSPECTIVE</span>
          <h1>Analytics</h1>
          <p>
            See what brings customers in. Understand what moves them forward.
          </p>
        </div>
        <div className="ha-heading-actions">
          <button
            className="hw-quiet"
            onClick={() => {
              setHistoryOpen(true);
              setHistoryLimit(30);
            }}
          >
            Activity log
          </button>
          <button className="hw-primary" onClick={() => setRecord(true)}>
            <span aria-hidden="true">+</span> Record activity
          </button>
        </div>
      </header>
      {preview && (
        <p className="ha-preview-note">
          Design preview · Fictional sample records · Changes are not saved
        </p>
      )}
      <div className="ha-toolbar">
        <label className="ha-field">
          <span>Period</span>
          <select
            value={preset}
            onChange={(e) =>
              change({ period: e.target.value, from: "", to: "" })
            }
          >
            {presets.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="ha-field ha-currency">
          <span>Financial currency</span>
          <select
            value={filters.currency}
            onChange={(e) => change({ currency: e.target.value })}
          >
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {selectedTab === "overview" && (
          <label className="ha-compare">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) =>
                change({ compare: e.target.checked ? "" : "off" })
              }
            />
            Compare previous period
          </label>
        )}
        <button
          className={"hw-quiet ha-more" + (more ? " is-open" : "")}
          aria-expanded={more}
          aria-controls="ha-more-filters"
          onClick={() => setMore((v) => !v)}
        >
          More filters{filterCount ? ` · ${filterCount}` : ""}
          <span aria-hidden="true">{more ? "−" : "+"}</span>
        </button>
      </div>
      {preset === "Custom dates" && (
        <div className="ha-custom">
          <label className="ha-field">
            <span>From</span>
            <input
              type="date"
              value={customFrom}
              max={now}
              onChange={(e) => change({ from: e.target.value })}
            />
          </label>
          <label className="ha-field">
            <span>To</span>
            <input
              type="date"
              value={customTo}
              max={now}
              onChange={(e) => change({ to: e.target.value })}
            />
          </label>
          {!customValid && (
            <p role="alert">
              Choose a valid range ending no later than today, up to ten years.
            </p>
          )}
        </div>
      )}
      <div id="ha-more-filters" className="ha-filter-grid" hidden={!more}>
        {[
          {
            key: "source",
            label: "Lead source",
            value: filters.channel,
            options: channels,
          },
          {
            key: "service",
            label: "Service",
            value: filters.service,
            options: services,
          },
          {
            key: "owner",
            label: "Lead owner",
            value: filters.owner,
            options: owners,
          },
          {
            key: "offer",
            label: "Offer",
            value: filters.offer,
            options: offers,
          },
        ].map((f) => (
          <label className="ha-field" key={f.key}>
            <span>{f.label}</span>
            <select
              value={f.value}
              onChange={(e) => change({ [f.key]: e.target.value })}
            >
              <option value="">
                All{" "}
                {f.key === "source"
                  ? "sources"
                  : f.key === "service"
                    ? "services"
                    : f.key === "owner"
                      ? "owners"
                      : "offers"}
              </option>
              {f.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
        ))}
        {filterCount > 0 && (
          <button
            className="ha-text-button"
            onClick={() =>
              change({ source: "", service: "", owner: "", offer: "" })
            }
          >
            Clear filters
          </button>
        )}
      </div>
      <div className="ha-period-caption">
        <span>{periodLabel} · Europe/Amsterdam</span>
        {compare && selectedTab === "overview" && (
          <span>
            Compared with {shortDate(previous.from)} – {shortDate(previous.to)}{" "}
            {previous.to.slice(0, 4)}
          </span>
        )}
      </div>
      <nav
        className="ha-tabs"
        role="tablist"
        aria-label="Analytics sections"
        onKeyDown={(e) => {
          const current = tabs.findIndex(([id]) => id === selectedTab);
          const next =
            e.key === "ArrowRight"
              ? (current + 1) % tabs.length
              : e.key === "ArrowLeft"
                ? (current + tabs.length - 1) % tabs.length
                : e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? tabs.length - 1
                    : -1;
          if (next < 0) return;
          e.preventDefault();
          change({ tab: tabs[next][0] }, true);
          document.getElementById("ha-tab-" + tabs[next][0])?.focus();
        }}
      >
        {tabs.map(([id, name]) => (
          <button
            key={id}
            id={"ha-tab-" + id}
            type="button"
            role="tab"
            aria-selected={selectedTab === id}
            tabIndex={selectedTab === id ? 0 : -1}
            aria-controls="ha-tab-panel"
            onClick={() => change({ tab: id }, true)}
          >
            {name}
          </button>
        ))}
      </nav>
      <div role="status" className="hw-flash">
        {flash}
      </div>
      <div
        id="ha-tab-panel"
        role="tabpanel"
        aria-labelledby={"ha-tab-" + selectedTab}
      >
        {selectedTab === "overview" && (
          <>
            <div className="ha-stats">
              <Stat
                label="New leads"
                value={model.cohort.length}
                previous={delta(
                  model.cohort.length,
                  model.previous.leads,
                  compare,
                )}
                detail="Added in this period"
                onClick={() =>
                  inspect(
                    "New leads",
                    model.cohort.map((l) => l.id),
                  )
                }
              />
              <Stat
                label="Meetings held"
                value={model.meetingsHeld}
                previous={delta(
                  model.meetingsHeld,
                  model.previous.meetings,
                  compare,
                )}
                detail="Recorded meetings"
                onClick={() =>
                  inspect(
                    "Meetings held",
                    model.inPeriod
                      .filter((e) => e.kind === "meeting_held" && e.lead_id)
                      .map((e) => e.lead_id!),
                  )
                }
              />
              <Stat
                label="Customers won"
                value={model.wins.length}
                previous={delta(model.wins.length, model.previous.won, compare)}
                detail="First recorded win in period"
                onClick={() =>
                  inspect(
                    "Customers won",
                    model.wins.map((w) => w.lead.id),
                  )
                }
              />
              <Stat
                label="Net revenue collected"
                value={fmt(model.revenue)}
                previous={
                  compare &&
                  model.previous.revenue !== null &&
                  model.revenue !== null
                    ? `${fmt(model.revenue - model.previous.revenue)} change`
                    : undefined
                }
                detail="Payments received less refunds"
              />
            </div>
            {noManualRecords && (
              <div className="ha-onboarding">
                <div>
                  <strong>
                    Your lead data is ready. Start building the bigger picture.
                  </strong>
                  <p>
                    Assign sources and services to your leads. Record calls,
                    meetings and payments as they happen.
                  </p>
                </div>
                <button
                  className="ha-text-button"
                  onClick={() => setRecord(true)}
                >
                  Record your first activity ↗
                </button>
              </div>
            )}
            <div className="ha-grid ha-overview-grid">
              <Panel
                title="Activity over time"
                description="New leads and first recorded wins in each interval."
              >
                <Trend
                  rows={trendRows}
                  labels={["Leads added", "Customers won"]}
                />
              </Panel>
              <Panel
                title="The lead journey"
                description="Leads added in this period, with milestones recorded to date."
              >
                {journey}
                <p className="ha-caption">
                  Only recorded milestones are counted. Skipped stages are not
                  inferred.
                </p>
              </Panel>
              <Panel
                title="Where customers come from"
                description="Customers from leads added in this period, measured to date."
              >
                <Bars
                  rows={sourceGroups.slice(0, 6).map((r) => ({
                    label: r.label,
                    value: r.won,
                    detail: `${r.won} of ${r.leads} leads · ${rate(r.rate)}`,
                    onClick: () => inspect(r.label, r.ids),
                  }))}
                />
                <button
                  className="ha-section-link"
                  onClick={() => change({ tab: "acquisition" }, true)}
                >
                  Explore acquisition <span aria-hidden="true">↗</span>
                </button>
              </Panel>
              <Panel
                title="Needs attention"
                description="Open leads as of today, across the selected sources and owners."
              >
                <div className="ha-attention">
                  {[
                    {
                      title: "Overdue follow-ups",
                      rows: model.overdue,
                      hint: "Scheduled before today",
                    },
                    {
                      title: "Follow-ups due today",
                      rows: model.dueToday,
                      hint: "Keep today’s conversations moving",
                    },
                    {
                      title: "No first contact recorded",
                      rows: model.unanswered,
                      hint: "New leads added at least two days ago",
                    },
                    {
                      title: "No next follow-up",
                      rows: model.noFollowup,
                      hint: "Active conversations without a next date",
                    },
                    {
                      title: "Stalled for 14+ days",
                      rows: model.stalled,
                      hint: "Based on known stage-change dates",
                    },
                  ].map((item) => (
                    <button
                      key={item.title}
                      onClick={() =>
                        inspect(
                          item.title,
                          item.rows.map((l) => l.id),
                          item.hint,
                        )
                      }
                    >
                      <span>
                        <b>{item.title}</b>
                        <small>{item.hint}</small>
                      </span>
                      <strong>{item.rows.length}</strong>
                      <span aria-hidden="true">↗</span>
                    </button>
                  ))}
                </div>
              </Panel>
            </div>
          </>
        )}
        {selectedTab === "acquisition" && (
          <>
            <div className="ha-stats">
              <Stat
                label="Leads acquired"
                value={model.cohort.length}
                detail="Added in the selected period"
              />
              <Stat
                label="Lead-to-customer"
                value={rate(model.conversion)}
                detail={`${model.cohortWon.length} of ${model.cohort.length} leads · to date`}
              />
              <Stat
                label="Acquisition spend"
                value={fmt(model.acquisition)}
                detail="Recorded acquisition costs + commissions"
              />
              <Stat
                label="Spend per customer won"
                value={fmt(model.acquisitionPerWin)}
                detail={`${model.wins.length} dated wins · period-based ratio`}
              />
            </div>
            <div className="ha-grid">
              <Panel
                title="Source performance"
                description="Acquisition cohorts: leads added in this period, conversions to date."
              >
                {sourceGroups.length ? (
                  tableRows("channel", "Source")
                ) : (
                  <Empty>Add a lead source to start comparing channels.</Empty>
                )}
              </Panel>
              <Panel
                title="Customer conversion by source"
                description="Rates always include the number of leads behind them."
              >
                <Bars
                  max={100}
                  format={(n) => rate(n)}
                  rows={sourceGroups.map((r) => ({
                    label: r.label,
                    value: r.rate || 0,
                    detail: `${r.won} customers from ${r.leads} leads`,
                    onClick: () => inspect(r.label, r.ids),
                  }))}
                />
              </Panel>
              <Panel
                title="Which businesses respond"
                description="Compare industries using the same acquisition period."
              >
                {model.groups("industry").length ? (
                  tableRows("industry", "Business type")
                ) : (
                  <Empty>
                    Record a business type in each lead’s sales details.
                  </Empty>
                )}
              </Panel>
              <Panel
                title="Service interest"
                description="What the leads in this acquisition period are interested in."
              >
                <Bars
                  rows={model.groups("service").map((r) => ({
                    label: r.label,
                    value: r.leads,
                    detail: `${r.won} customers · ${rate(r.rate)} conversion`,
                    onClick: () => inspect(r.label, r.ids),
                  }))}
                />
                <p className="ha-caption">
                  Visitor sessions and website quiz drop-offs are not connected.
                  These reports begin when a lead is added.
                </p>
              </Panel>
            </div>
            <p className="ha-footnote">
              Acquisition spend per win compares costs and first wins recorded
              in the same period. It is not a lifetime customer acquisition
              cost. Shared costs are excluded when filtering by service or
              offer.
            </p>
          </>
        )}
        {selectedTab === "sales" && (
          <>
            <div className="ha-stats">
              <Stat
                label="Meetings held"
                value={model.meetingsHeld}
                detail={`${model.meetingsBooked} bookings recorded in period`}
              />
              <Stat
                label="Attendance rate"
                value={rate(model.attendance)}
                detail={`${model.meetingsHeld} held · ${model.noShows} no-shows recorded`}
              />
              <Stat
                label="First contact"
                value={duration(model.firstContact)}
                detail={`Median · ${model.firstContactSample} leads with known contact dates`}
              />
              <Stat
                label="Time to win"
                value={duration(model.cycle)}
                detail={`Median · ${model.cycleSample} dated wins in period`}
              />
            </div>
            <div className="ha-grid">
              <Panel
                title="Your current pipeline"
                description="Where open leads are now. This view is not limited by acquisition date."
              >
                <Bars
                  rows={statuses
                    .filter((s) => !["Won", "Closed"].includes(s))
                    .map((s) => ({
                      label: s,
                      value: model.open.filter((l) => l.status === s).length,
                      onClick: () =>
                        inspect(
                          s,
                          model.open
                            .filter((l) => l.status === s)
                            .map((l) => l.id),
                        ),
                    }))}
                />
              </Panel>
              <Panel
                title="Time in the current stage"
                description="Median days for open leads with a known stage-entry date."
              >
                <Bars
                  format={duration}
                  rows={model.stageAges
                    .filter((s) => s.value !== null)
                    .map((s) => ({
                      label: s.label,
                      value: s.value!,
                      detail: `${s.sample} of ${s.total} leads have a known entry date`,
                      onClick: () => inspect(s.label, s.ids),
                    }))}
                  empty="Stage timing starts with the first recorded change. Historical dates are not estimated."
                />
              </Panel>
              <Panel
                title="Outreach & meeting activity"
                description="Activities that happened in this period. One lead may have several attempts."
              >
                <Bars
                  rows={[
                    ["Contact attempts", "contact_attempt"],
                    ["Conversations", "conversation"],
                    ["Meetings booked", "meeting_booked"],
                    ["Meetings held", "meeting_held"],
                    ["Meeting no-shows", "meeting_no_show"],
                    ["Proposals sent", "proposal_sent"],
                  ].map(([label, kind]) => ({
                    label,
                    value: model.count(kind),
                    detail: `${model.uniqueLeads(kind)} distinct leads`,
                    onClick: () =>
                      inspect(
                        label,
                        model.inPeriod
                          .filter((e) => e.kind === kind && e.lead_id)
                          .map((e) => e.lead_id!),
                      ),
                  }))}
                />
              </Panel>
              <Panel
                title="Why opportunities were lost"
                description="Leads acquired in this period that are closed without a recorded win."
              >
                <Bars
                  rows={model.lossReasons.map((r) => ({
                    ...r,
                    onClick: () => inspect(r.label, r.ids),
                  }))}
                  empty="Record a lost reason when closing an opportunity."
                />
              </Panel>
              <Panel
                wide
                title="Activity by person"
                description="Based on the person recorded on each activity, separate from lead ownership."
              >
                {people.length ? (
                  <div className="ha-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Person</th>
                          <th>Attempts</th>
                          <th>Conversations</th>
                          <th>Meetings held</th>
                          <th>No-shows</th>
                        </tr>
                      </thead>
                      <tbody>
                        {people.sort().map((person) => {
                          const entries = model.inPeriod.filter(
                            (e) => (e.owner || "Unassigned") === person,
                          );
                          return (
                            <tr key={person}>
                              <th>{person}</th>
                              {[
                                "contact_attempt",
                                "conversation",
                                "meeting_held",
                                "meeting_no_show",
                              ].map((kind) => (
                                <td key={kind}>
                                  {
                                    entries.filter((e) => e.kind === kind)
                                      .length
                                  }
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty>
                    Record the person responsible when logging an activity.
                  </Empty>
                )}
              </Panel>
            </div>
          </>
        )}
        {selectedTab === "revenue" && (
          <>
            <div className="ha-stats">
              <Stat
                label="Net revenue collected"
                value={fmt(model.revenue)}
                detail="Payments received less refunds"
              />
              <Stat
                label="Recorded costs"
                value={fmt(model.costs)}
                detail="Acquisition, delivery, support & commission"
              />
              <Stat
                label="After recorded costs"
                value={fmt(model.contribution)}
                detail="Net collections minus recorded costs"
              />
              <Stat
                label="Recorded contribution"
                value={rate(model.contributionRate)}
                detail="After recorded costs ÷ net collections"
              />
            </div>
            <div className="ha-grid">
              <Panel
                title="Collections & costs"
                description={`Recorded amounts in ${filters.currency}, excluding VAT or sales tax.`}
              >
                <Trend
                  rows={model.trend.map((r) => ({
                    label: r.label,
                    fullLabel: shortDate(r.from) + " – " + shortDate(r.to),
                    a: r.revenue / 100,
                    b: r.costs / 100,
                  }))}
                  labels={["Net collections", "Recorded costs"]}
                  format={(n) => fmt(Math.round(n * 100))}
                  empty="Log payments and costs to build your revenue picture."
                />
              </Panel>
              <Panel
                title="Where the money goes"
                description="Recorded costs in the selected period."
              >
                <Bars
                  format={fmt}
                  rows={
                    model.costs === null
                      ? []
                      : [
                          {
                            label: "Acquisition",
                            value: model.monetary
                              .filter((e) => e.kind === "acquisition_cost")
                              .reduce((n, e) => n + (e.amount_cents || 0), 0),
                          },
                          { label: "Delivery", value: model.delivery },
                          { label: "Support", value: model.support },
                          { label: "Commission", value: model.commissions },
                        ]
                  }
                  empty="Add costs to understand what is left after delivery and acquisition."
                />
                <p className="ha-caption">
                  Refunds paid: {fmt(model.refunds)}. Refunds reduce collections
                  and are not counted twice as costs.
                </p>
              </Panel>
              <Panel
                wide
                title="Which offers convert"
                description="Leads added in this period, with customer conversion measured to date."
              >
                {model.groups("offer").length ? (
                  tableRows("offer", "Offer or package")
                ) : (
                  <Empty>
                    Add an offer name in the lead’s sales details to compare
                    packages.
                  </Empty>
                )}
              </Panel>
            </div>
            <p className="ha-footnote">
              This is a cash-based view using only recorded amounts. It is not
              accounting profit or gross margin. Unrecorded costs, future
              invoices and agreed upsells are not included. Shared costs are
              excluded by service and offer filters.
            </p>
          </>
        )}
        {selectedTab === "growth" && (
          <>
            <div className="ha-stats">
              <Stat
                label="Monthly recurring revenue"
                value={fmt(model.mrr)}
                detail={`Recorded monthly totals at ${shortDate(period.to)}`}
              />
              <Stat
                label="Active subscriptions"
                value={
                  model.subscriptionsRecorded ? model.activeSubscriptions : "—"
                }
                detail={`${model.newSubscriptions} additions versus the start of the period`}
              />
              <Stat
                label="Customers with an upsell"
                value={model.upsellCustomers}
                detail="Distinct customers with an upsell agreed in period"
              />
              <Stat
                label="Subscriber churn"
                value={rate(model.churn)}
                detail={`${model.churned.length} of ${model.openingSubscribers} opening subscribers inactive at period end`}
              />
            </div>
            <div className="ha-grid">
              <Panel
                title="Recurring revenue over time"
                description={`Monthly totals in ${filters.currency}, at the end of each interval.`}
              >
                <Trend
                  rows={model.subTrend.map((r) => ({
                    label: r.label,
                    fullLabel: shortDate(r.to),
                    a: r.mrr / 100,
                  }))}
                  labels={["Monthly recurring revenue"]}
                  format={(n) => fmt(Math.round(n * 100))}
                  empty="Record subscription starts, changes and cancellations to see recurring revenue."
                />
              </Panel>
              <Panel
                title="Retention & expansion"
                description="Recorded subscription and relationship activity in this period."
              >
                <Bars
                  rows={
                    model.subscriptionsRecorded ||
                    model.upsellCustomers ||
                    model.count("referral")
                      ? [
                          {
                            label: "Active at period start",
                            value: model.openingSubscribers,
                          },
                          {
                            label: "Active at period end",
                            value: model.activeSubscriptions,
                          },
                          {
                            label: "Opening subscribers lost",
                            value: model.churned.length,
                            onClick: () =>
                              inspect(
                                "Opening subscribers lost",
                                model.churned,
                              ),
                          },
                          {
                            label: "Customers with an upsell",
                            value: model.upsellCustomers,
                            onClick: () =>
                              inspect(
                                "Customers with an upsell",
                                model.inPeriod
                                  .filter(
                                    (e) => e.kind === "upsell" && e.lead_id,
                                  )
                                  .map((e) => e.lead_id!),
                              ),
                          },
                          {
                            label: "Referrals received",
                            value: model.count("referral"),
                          },
                        ]
                      : []
                  }
                  empty="Record customer activity to understand retention, referrals and upsells."
                />
              </Panel>
              <Panel
                wide
                title="Customer value"
                description={`Collections during this period and monthly totals at period end, in ${filters.currency}.`}
              >
                {model.lifecycle.length ? (
                  <div className="ha-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Net collected</th>
                          <th>Monthly total</th>
                          <th>Upsells agreed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {model.lifecycle.map((row) => (
                          <tr key={row.lead.id}>
                            <th>
                              <Link
                                className="ha-text-button"
                                href={"/admin/leads?lead=" + row.lead.id}
                              >
                                {row.lead.company} ↗
                              </Link>
                            </th>
                            <td>{fmt(row.collected)}</td>
                            <td>{fmt(row.mrr)}</td>
                            <td>{row.upsells}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty>Customers appear after a recorded win.</Empty>
                )}
              </Panel>
            </div>
            <p className="ha-footnote">
              Monthly totals come from subscription records, not payment
              receipts. Churn compares subscribers active at the start with
              those inactive at the end. Record a new monthly total when a
              package changes.
            </p>
          </>
        )}
      </div>
      <details className="ha-quality">
        <summary>
          <span>Data coverage & metric definitions</span>
          <span>
            {model.missingSource || model.missingService || model.legacyWins
              ? "Some details are not recorded"
              : "How these numbers are calculated"}
          </span>
        </summary>
        <div className="ha-quality-grid">
          <div>
            <h3>Lead coverage</h3>
            <p>
              {model.missingSource} of {model.scoped.length} leads have no
              recorded source. {model.missingService} have no recorded service.
            </p>
            <p>
              {model.legacyWins
                ? `${model.legacyWins} known customers have no dated first win and are excluded from period win totals.`
                : "Dated wins are counted once per lead, at the first recorded win."}
            </p>
            <Link className="ha-text-button" href="/admin/leads">
              Complete lead details ↗
            </Link>
          </div>
          <div>
            <h3>Reading the reports</h3>
            <p>
              Acquisition comparisons use leads added in the selected period and
              conversions to date. Activity and revenue use the date each event
              happened. Current-pipeline and attention views show today’s open
              leads.
            </p>
            <p>
              Small samples are shown as counts alongside percentages. A dash
              means the metric cannot yet be calculated.
            </p>
          </div>
          <div>
            <h3>Money & history</h3>
            <p>
              Financial figures use {filters.currency}. {model.otherCurrency}{" "}
              monetary entries in other currencies are excluded; no exchange
              rates are assumed.
            </p>
            <p>
              Stage history starts when tracking was introduced. Earlier stage
              dates are not reconstructed. Corrections remain in the activity
              log but are excluded from calculations.
            </p>
          </div>
        </div>
      </details>
      {record && (
        <AnalyticsDialog
          title="Record activity"
          onClose={() => {
            setRecord(false);
            change({ record: "" });
          }}
        >
          <RecordActivity
            leads={leads}
            initialLead={leads.find((l) => l.id === params.get("record"))?.id}
            preview={preview}
            done={(saved) => {
              setRecord(false);
              change({ record: "" });
              setFlash(saved ? "Activity recorded." : "");
            }}
          />
        </AnalyticsDialog>
      )}
      {drill && (
        <AnalyticsDialog
          title={drill.title}
          onClose={() => setDrill(null)}
          wide
        >
          {drill.description && (
            <p className="ha-dialog-intro">{drill.description}</p>
          )}
          <label className="ha-field">
            <span>Search these leads</span>
            <input
              type="search"
              value={drillSearch}
              onChange={(e) => {
                setDrillSearch(e.target.value);
                setDrillLimit(50);
              }}
              placeholder="Company name"
            />
          </label>
          <div className="ha-drill-list">
            {leads
              .filter(
                (l) =>
                  drill.ids.includes(l.id) &&
                  l.company.toLowerCase().includes(drillSearch.toLowerCase()),
              )
              .slice(0, drillLimit)
              .map((l) => (
                <Link key={l.id} href={"/admin/leads?lead=" + l.id}>
                  <span>
                    <b>{l.company}</b>
                    <small>
                      {l.channel || "Source not recorded"} ·{" "}
                      {l.service || "Service not recorded"}
                    </small>
                  </span>
                  <span>{l.status}</span>
                  <span aria-hidden="true">↗</span>
                </Link>
              ))}
            {!leads.some(
              (l) =>
                drill.ids.includes(l.id) &&
                l.company.toLowerCase().includes(drillSearch.toLowerCase()),
            ) && <Empty>No leads match this selection.</Empty>}
          </div>
          {leads.filter(
            (l) =>
              drill.ids.includes(l.id) &&
              l.company.toLowerCase().includes(drillSearch.toLowerCase()),
          ).length > drillLimit && (
            <button
              className="hw-quiet"
              onClick={() => setDrillLimit((n) => n + 50)}
            >
              Show more leads
            </button>
          )}
        </AnalyticsDialog>
      )}
      {historyOpen && !correct && (
        <AnalyticsDialog
          title="Activity log"
          onClose={() => setHistoryOpen(false)}
          wide
        >
          <p className="ha-dialog-intro">
            {periodLabel}. Corrections stay visible here and are excluded from
            your reports.
          </p>
          <div className="ha-history">
            {log.slice(0, historyLimit).map((e) => (
              <article key={e.id} className={e.voided_at ? "is-void" : ""}>
                <div>
                  <b>{labelActivity(e)}</b>
                  <span>
                    {leads.find((l) => l.id === e.lead_id)?.company ||
                      "Shared acquisition cost"}
                  </span>
                  <small>
                    {new Intl.DateTimeFormat("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Europe/Amsterdam",
                    }).format(new Date(e.occurred_at))}{" "}
                    · {e.owner || "Unassigned"}
                  </small>
                  {e.note && <p>{e.note}</p>}
                  {e.voided_at && <p>Excluded: {e.void_reason}</p>}
                </div>
                <div>
                  {e.amount_cents !== null && (
                    <strong>{money(e.amount_cents, e.currency)}</strong>
                  )}
                  {e.kind !== "stage" &&
                    e.kind !== "baseline" &&
                    !e.voided_at && (
                      <button
                        className="ha-text-button"
                        onClick={() => setCorrect(e)}
                      >
                        Correct entry
                      </button>
                    )}
                </div>
              </article>
            ))}
          </div>
          {!log.length && (
            <Empty>Activities in this period will appear here.</Empty>
          )}
          {log.length > historyLimit && (
            <button
              className="hw-quiet"
              onClick={() => setHistoryLimit((n) => n + 30)}
            >
              Show more activity
            </button>
          )}
        </AnalyticsDialog>
      )}
      {correct && (
        <AnalyticsDialog
          title="Correct an entry"
          onClose={() => setCorrect(null)}
        >
          <CorrectRecord
            record={correct}
            preview={preview}
            done={(saved) => {
              setCorrect(null);
              setFlash(saved ? "Activity log updated." : "");
            }}
          />
        </AnalyticsDialog>
      )}
    </section>
  );
}
