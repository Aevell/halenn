"use client";

import { useEffect, useMemo, useState } from "react";
import { Bars, Empty, Panel, Stat, Trend } from "./Charts";
import { rate, shortDate } from "../../lib/analytics";

export type WebsiteReport = {
  from: string;
  to: string;
  availableFrom: string;
  updatedAt: string;
  totals: {
    visitors: number;
    visits: number;
    pageViews: number;
    quizStarts: number;
    quizCompletions: number;
    enquiries: number;
    quizEnquiries: number;
    formOpens: number;
    formStarts: number;
  };
  trend: { date: string; visits: number; enquiries: number }[];
  sources: {
    source: string;
    visits: number;
    visitors: number;
    quizStarts: number;
    enquiries: number;
    leads: number;
    bookedCalls?: number;
    customers: number;
  }[];
  devices: { device: string; visits: number; enquiries: number }[];
  pages: { path: string; views: number; entrances: number; exits: number }[];
  journey: { label: string; count: number }[];
  quiz: {
    started: number;
    completed: number;
    enquired: number;
    pending: number;
    abandoned: number;
    branches: {
      goal: string;
      started: number;
      completed: number;
      enquired: number;
      pending: number;
      abandoned: number;
    }[];
    questions: {
      goal: string;
      question: string;
      seen: number;
      continued: number;
      dropped: number;
      pending: number;
    }[];
  };
  forms: {
    origin: string;
    opened: number;
    started: number;
    received: number;
    errors: number;
    pending: number;
    abandoned: number;
  }[];
  coverage: { retentionDays: number; consentOnly: boolean; includesTests: boolean; excludedVisits: number };
};

type Result = { key: string; report?: WebsiteReport; error?: string };
const number = (value: number) => new Intl.NumberFormat("en-GB").format(value);
const percentage = (n: number, d: number) => rate(d ? (n / d) * 100 : null);
const goals: Record<string, string> = {
  leads: "More enquiries or bookings",
  sell: "Sell online",
  time: "Reduce repetitive work",
  tool: "Build an app or business tool",
  unsure: "Not sure yet",
  unknown: "Goal not chosen",
  "": "Goal not chosen",
};
const questions: Record<string, string> = {
  goal: "Main goal",
  presence: "Current website",
  visitorAction: "What customers should do",
  salesStage: "Current online sales",
  sellType: "What customers would buy",
  task: "The task to improve",
  behaviour: "How the task should work",
  tools: "Tools to connect",
  channel: "Where people would use it",
  reminder: "What to follow up",
  users: "Who would use the tool",
  toolTask: "The tool’s main job",
  platform: "Where the tool should work",
  existing: "What already exists",
  priority: "Main priority",
  current: "Current starting point",
};
const branchOrder: Record<string, string[]> = {
  leads: ["goal", "presence", "visitorAction"],
  sell: ["goal", "salesStage", "sellType"],
  time: ["goal", "task", "behaviour", "tools", "channel", "reminder"],
  tool: ["goal", "users", "toolTask", "platform", "existing"],
  unsure: ["goal", "priority", "current"],
};
const originLabel = (value: string) =>
  value === "quiz"
    ? "Homepage quiz"
    : value === "pricing"
      ? "Pricing page"
      : value === "homepage"
        ? "Homepage contact"
        : value;
const deviceLabel = (value: string) =>
  ({ desktop: "Desktop", tablet: "Tablet", mobile: "Mobile" })[value] || value;
const pageLabel = (value: string) =>
  value === "/"
    ? "Homepage"
    : value === "/pricing"
      ? "Pricing"
      : value === "/about"
        ? "About"
        : value;

export default function WebsiteAnalytics({
  from,
  to,
  previewData,
  includeTests = false,
}: {
  from: string;
  to: string;
  previewData?: WebsiteReport;
  includeTests?: boolean;
}) {
  const [source, setSource] = useState("");
  const [device, setDevice] = useState("");
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [knownSources, setKnownSources] = useState<string[]>([]);
  const query = useMemo(
    () => new URLSearchParams({ from, to, source, device, tests: includeTests ? "include" : "" }).toString(),
    [from, to, source, device, includeTests],
  );
  const requestKey = query + "&refresh=" + retry;
  useEffect(() => {
    if (previewData) return;
    const controller = new AbortController();
    fetch("/api/admin/website-analytics?" + query, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 401 || response.status === 403)
            throw new Error(
              "Your session needs refreshing. Sign in again to view website analytics.",
            );
          throw new Error(
            "Website analytics could not be loaded. Please try again.",
          );
        }
        const report = (await response.json()) as WebsiteReport;
        if (
          !report?.totals ||
          !Array.isArray(report.sources) ||
          !Array.isArray(report.journey) ||
          !report.quiz
        )
          throw new Error(
            "Website analytics could not be loaded. Please try again.",
          );
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, report });
        setKnownSources((previous) =>
          [
            ...new Set([
              ...previous,
              ...report.sources.map((row) => row.source),
            ]),
          ].sort(),
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({
            key: requestKey,
            error:
              error instanceof Error
                ? error.message
                : "Website analytics could not be loaded.",
          });
      });
    return () => controller.abort();
  }, [previewData, query, requestKey]);
  const current = result?.key === requestKey ? result : null;
  const data = previewData ?? current?.report;
  const sources = [
    ...new Set([
      ...knownSources,
      ...(data?.sources.map((row) => row.source) ?? []),
      ...(source ? [source] : []),
    ]),
  ].sort();
  const [allSources, setAllSources] = useState(false);
  const sortedSources = data
    ? [...data.sources].sort(
        (a, b) => b.visits - a.visits || a.source.localeCompare(b.source),
      )
    : [];
  const displaySources = allSources ? sortedSources : sortedSources.slice(0, 8);
  return (
    <div className="ha-website">
      <div className="ha-website-controls">
        <div className="ha-website-intro">
          <h2>From visit to customer.</h2>
          <p>See where visitors come from and which enquiries become sales.</p>
        </div>
        <div className="ha-website-filters">
          <label className="ha-field">
            <span>Visitor source</span>
            <select
              value={source}
              disabled={!!previewData}
              onChange={(event) => {
                setSource(event.target.value);
                setAllSources(false);
              }}
            >
              <option value="">All sources</option>
              {sources.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="ha-field">
            <span>Device</span>
            <select
              value={device}
              disabled={!!previewData}
              onChange={(event) => setDevice(event.target.value)}
            >
              <option value="">All devices</option>
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
              <option value="tablet">Tablet</option>
            </select>
          </label>
          {(source || device) && (
            <button
              className="ha-text-button"
              onClick={() => {
                setSource("");
                setDevice("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
      {!data ? (
        <div
          className="ha-website-state"
          aria-live="polite"
          aria-busy={!current?.error}
        >
          {current?.error ? (
            <>
              <h3>Website data is unavailable</h3>
              <p role="alert">{current.error}</p>
              <button
                className="hw-quiet"
                onClick={() => setRetry((value) => value + 1)}
              >
                Try again
              </button>
            </>
          ) : (
            <>
              <span className="ha-loading-line" aria-hidden="true" />
              <p>Loading visitor and quiz activity…</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="ha-reading-key">
            <span>Consented visits · {shortDate(data.from)} – {shortDate(data.to)}</span>
            <span>{data.coverage.includesTests ? "Test data included" : `${number(data.coverage.excludedVisits)} internal or test visits excluded`}</span>
            {data.totals.visits > 0 && data.totals.visits < 20 && <span className="ha-sample-note">Limited data · compare counts alongside rates</span>}
          </div>
          <div className="ha-stats">
            <Stat
              label="Visitors"
              value={number(data.totals.visitors)}
              detail="Recognised browsers with analytics consent"
            />
            <Stat
              label="Visits"
              value={number(data.totals.visits)}
              detail={`${number(data.totals.pageViews)} page views recorded`}
            />
            <Stat
              label="Quiz completion"
              value={percentage(data.quiz.completed, data.quiz.started)}
              detail={`${number(data.quiz.completed)} of ${number(data.quiz.started)} quiz attempts finished`}
            />
            <Stat
              label="All tracked enquiries"
              value={number(data.totals.enquiries)}
              detail={`${number(data.totals.quizEnquiries)} from quiz forms · ${number(data.totals.enquiries - data.totals.quizEnquiries)} from other forms`}
            />
          </div>
          {!data.totals.visits && (
            <div className="ha-onboarding">
              <div>
                <strong>
                  {source || device
                    ? "No visits match these filters yet."
                    : "Your visitor journey is ready to measure."}
                </strong>
                <p>
                  {source || device
                    ? "Try another source, device or date range."
                    : "Visits appear after someone accepts website analytics. Historical visits and quiz answers are not recreated."}
                </p>
              </div>
            </div>
          )}
          {data.totals.visits > 0 && (!data.quiz.started || !data.forms.length) && (
            <p className="ha-footnote">{!data.quiz.started && "Quiz drop-off details appear once someone starts the quiz. "}{!data.forms.length && "Form details appear after the first tracked enquiry form is opened."}</p>
          )}
          <div className="ha-grid ha-overview-grid">
            <Panel
              wide
              when={data.totals.visits > 0}
              title="Traffic & enquiries over time"
              description="The same dates, with a separate scale for each measure. Enquiries are grouped by the day their visit started."
            >
              <div className="ha-aligned-trends">
                <Trend compact showZero wholeNumbers
                  rows={data.trend.map((row) => ({
                    label: shortDate(row.date), fullLabel: shortDate(row.date), a: row.visits,
                  }))}
                  labels={["Visits"]}
                  format={number}
                />
                <Trend compact showZero wholeNumbers
                  rows={data.trend.map((row) => ({
                    label: shortDate(row.date), fullLabel: shortDate(row.date), a: row.enquiries,
                  }))}
                  labels={["Enquiries received"]}
                  format={number}
                />
              </div>
            </Panel>
            <Panel
              when={data.journey.some((row, i) => i > 0 && row.count > 0)}
              wide
              title="Enquiries through the quiz"
              description="Distinct visits with each preceding quiz milestone recorded. The last step counts enquiries after a recommendation."
            >
              <Bars
                max={data.totals.visits}
                rows={
                  data.totals.visits
                    ? data.journey.map((row, i) => ({
                        label: row.label,
                        value: row.count,
                        detail: i === 0 ? "All tracked visits in this period" : `${percentage(row.count, data.journey[i - 1].count)} of the previous step · ${percentage(row.count, data.totals.visits)} of visits`,
                      }))
                    : []
                }
                empty="The journey will show where visits progress from the homepage quiz to an enquiry."
              />
              <p className="ha-caption">
                Enquiries sent before completion or with a partial tracked history
                appear in All tracked enquiries, but not at the end of this full path.
              </p>
            </Panel>
            <Panel
              wide
              when={data.totals.visits > 0}
              basis="Visits started in this period · bookings and customer wins to date"
              title="Visitor sources → sales"
              description="Each consented enquiry keeps the source of its visit. Booked calls count enquiries with a recorded booking, once per lead. Customers are enquiries marked won, even when the booking or sale happens later."
            >
              {sortedSources.length ? (
                <>
                  <div className="ha-table-scroll">
                    <table className="ha-website-table">
                      <thead>
                        <tr>
                          <th>Source</th>
                          <th>Visits</th>
                          <th>Enquiries</th>
                          <th>Booked calls</th>
                          <th>Customers</th>
                          <th>Enquiry-to-customer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displaySources.map((row) => (
                          <tr key={row.source}>
                            <th>
                              <button
                                className="ha-text-button"
                                onClick={() => {
                                  if (!previewData) setSource(row.source);
                                }}
                              >
                                {row.source}
                                {!previewData && (
                                  <span aria-hidden="true"> ↗</span>
                                )}
                              </button>
                            </th>
                            <td>{number(row.visits)}</td>
                            <td>{number(row.leads)}</td>
                            <td>{row.bookedCalls === undefined ? "—" : number(row.bookedCalls)}</td>
                            <td>{number(row.customers)}</td>
                            <td>
                              {percentage(row.customers, row.leads)}
                              <span className="ha-conversion-track" aria-hidden="true">
                                <span style={{ width: `${row.leads ? row.customers / row.leads * 100 : 0}%` }} />
                              </span>
                              <small>{row.customers} of {row.leads} enquiries</small>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {sortedSources.length > 8 && (
                    <button
                      className="ha-text-button ha-table-toggle"
                      aria-expanded={allSources}
                      onClick={() => setAllSources((value) => !value)}
                    >
                      {allSources
                        ? "Show fewer sources"
                        : `View all ${sortedSources.length} sources`}
                    </button>
                  )}
                </>
              ) : (
                <Empty>No sources have been recorded for this period.</Empty>
              )}
            </Panel>
            <Panel
              wide
              when={data.quiz.started > 0}
              title="Where the quiz loses people"
              description="Follow each goal separately, so a completed three-question route is never mistaken for an unfinished five-question route."
            >
              <div className="ha-outcomes" aria-label="Quiz attempt outcomes">
                <div>
                  <strong>{number(data.quiz.completed)}</strong>
                  <span>Finished the quiz</span>
                </div>
                <div>
                  <strong>{number(data.quiz.enquired)}</strong>
                  <span>Enquired before finishing</span>
                </div>
                <div>
                  <strong>{number(data.quiz.pending)}</strong>
                  <span>Still active</span>
                </div>
                <div>
                  <strong>{number(data.quiz.abandoned)}</strong>
                  <span>Dropped off</span>
                </div>
              </div>
              <p className="ha-caption">
                Drop-off means no completion or received enquiry after at least
                30 minutes of inactivity. Still-active attempts stay separate.
                Restarting creates a new attempt.
              </p>
              {data.quiz.branches.length ? (
                <div className="ha-quiz-branches">
                  {data.quiz.branches.map((branch, branchIndex) => {
                    const order = branchOrder[branch.goal] ?? ["goal"];
                    const rows = data.quiz.questions
                      .filter((row) => row.goal === branch.goal)
                      .sort(
                        (a, b) =>
                          order.indexOf(a.question) - order.indexOf(b.question),
                      );
                    return (
                      <details className="ha-quiz-branch" key={branch.goal} open={branchIndex === 0}>
                        <summary>
                          <span>
                            <b>{goals[branch.goal] || branch.goal}</b>
                            <small>
                              {number(branch.started)} starts ·{" "}
                              {number(branch.completed)} finished ·{" "}
                              {number(branch.abandoned)} dropped off
                            </small>
                          </span>
                          <span>
                            {percentage(branch.completed, branch.started)}
                            <small>completion</small>
                          </span>
                        </summary>
                        <div className="ha-branch-content">
                          <p>
                            {branch.enquired} enquired before finishing.{" "}
                            {branch.pending} attempts are still active.
                          </p>
                          {rows.length ? (
                            <>
                            <div className="ha-dropoff-bars">
                              <Bars max={100} format={(value) => rate(value)} rows={rows.filter((row) => row.seen > 0).map((row) => ({
                                label: questions[row.question] || row.question,
                                value: row.dropped / row.seen * 100,
                                detail: `${number(row.dropped)} of ${number(row.seen)} attempts left here · ${number(row.pending)} still active here`,
                              }))} />
                            </div>
                            <p className="ha-caption">Bar length shows the share of attempts that reached this question and then dropped off. A longer bar means more drop-off.</p>
                            <details className="ha-details">
                              <summary>View question counts</summary>
                            <div className="ha-table-scroll">
                              <table className="ha-website-table">
                                <thead>
                                  <tr>
                                    <th>Question</th>
                                    <th>Reached</th>
                                    <th>Continued</th>
                                    <th>Left here</th>
                                    <th>Still active here</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((row) => (
                                    <tr key={row.question}>
                                      <th>
                                        {questions[row.question] ||
                                          row.question}
                                      </th>
                                      <td>{number(row.seen)}</td>
                                      <td>{number(row.continued)}</td>
                                      <td>
                                        {number(row.dropped)}
                                        <small>
                                          {percentage(row.dropped, row.seen)} of
                                          reached
                                        </small>
                                      </td>
                                      <td>{number(row.pending)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            </details>
                            </>
                          ) : (
                            <p>
                              No question-level records are available for this
                              goal yet.
                            </p>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
              ) : (
                <Empty>
                  Question-by-question results appear after the first quiz
                  start.
                </Empty>
              )}
            </Panel>
            <Panel
              wide
              when={data.forms.length > 0}
              title="Enquiry forms"
              description="Confirmed enquiries are counted only after the website has saved the submission. Failed attempts are not conversions."
            >
              {data.forms.length ? (
                <div className="ha-table-scroll">
                  <table className="ha-website-table">
                    <thead>
                      <tr>
                        <th>Form opened from</th>
                        <th>Opened</th>
                        <th>Started</th>
                        <th>Received</th>
                        <th>Still active</th>
                        <th>Left without sending</th>
                        <th>Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.forms.map((row) => (
                        <tr key={row.origin}>
                          <th>{originLabel(row.origin)}</th>
                          <td>{number(row.opened)}</td>
                          <td>{number(row.started)}</td>
                          <td>{number(row.received)}</td>
                          <td>{number(row.pending)}</td>
                          <td>{number(row.abandoned)}</td>
                          <td>{number(row.errors)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty>
                  Form activity appears when a tracked visitor opens an enquiry.
                </Empty>
              )}
              <p className="ha-caption">
                Forms with no successful submission are considered abandoned
                after 30 minutes of inactivity. Errors are attempts; one form
                can have more than one.
              </p>
            </Panel>
          </div>
          {data.totals.visits > 0 && <details className="ha-website-detail ha-quality">
            <summary>
              <span>Pages & devices</span>
              <span>Explore where visits begin and end</span>
            </summary>
            <div className="ha-grid ha-website-detail-body">
              <Panel
                title="Pages in the journey"
                description="Page views can repeat within a visit. An exit is the last recorded page of an inactive visit."
              >
                {data.pages.length ? (
                  <div className="ha-table-scroll">
                    <table className="ha-website-table">
                      <thead>
                        <tr>
                          <th>Page</th>
                          <th>Views</th>
                          <th>Entries</th>
                          <th>Exits</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.pages.map((row) => (
                          <tr key={row.path}>
                            <th>{pageLabel(row.path)}</th>
                            <td>{number(row.views)}</td>
                            <td>{number(row.entrances)}</td>
                            <td>{number(row.exits)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty>No page views are recorded in this period.</Empty>
                )}
              </Panel>
              <Panel
                title="Visits by device"
                description="Device groups use the visitor’s screen size when the visit starts."
              >
                <Bars
                  rows={data.devices.map((row) => ({
                    label: deviceLabel(row.device),
                    value: row.visits,
                    detail: `${row.enquiries} enquiring visits · ${percentage(row.enquiries, row.visits)} of visits`,
                  }))}
                  empty="Device comparisons appear with the first tracked visits."
                />
              </Panel>
            </div>
          </details>}
          <div className="ha-website-updated">
            <span>
              {data.updatedAt &&
                `Updated ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(data.updatedAt))} · Europe/Amsterdam`}
            </span>
            {!previewData && (
              <button
                className="ha-text-button"
                onClick={() => setRetry((value) => value + 1)}
              >
                Refresh website data
              </button>
            )}
          </div>
          <details className="ha-quality">
            <summary>
              <span>Website data coverage & definitions</span>
              <span>Consent, dates and drop-off rules</span>
            </summary>
            <div className="ha-quality-grid">
              <div>
                <h3>Who is included</h3>
                <p>
                  Only visits with current analytics consent are included.
                  Visitors are recognised browsers, not identified people.
                  Blocked tracking, cleared cookies and other devices affect
                  these counts.
                </p>
                <p>
                  Enquiries without analytics consent still reach the leads
                  workspace; they are not added to this visitor funnel. Quiz
                  attempts already in progress when consent is given are
                  excluded from full-quiz completion rates.
                </p>
              </div>
              <div>
                <h3>Dates & retention</h3>
                <p>
                  Reports include visits that started in the selected period and
                  their recorded outcomes. Events are retained for{" "}
                  {data.coverage.retentionDays} days. Available records begin{" "}
                  {data.availableFrom
                    ? shortDate(data.availableFrom.slice(0, 10)) +
                      " " +
                      data.availableFrom.slice(0, 4)
                    : "when tracking starts"}
                  .
                </p>
                <p>
                  Source and campaign labels saved with an enquiry remain in Sales leads
                  after visit events expire. Enquiries without consent show Website as
                  their intake channel; their visitor source is unknown. Earlier visits are not reconstructed.{" "}
                  {data.from !== from || data.to !== to
                    ? `This report uses ${shortDate(data.from)} to ${shortDate(data.to)}, within the available range.`
                    : "Report dates use Europe/Amsterdam."}
                </p>
              </div>
              <div>
                <h3>Reading drop-offs</h3>
                <p>
                  Attempts still active within the last 30 minutes are shown
                  separately. A question’s “Left here” count identifies the last
                  recorded question of an abandoned attempt.
                </p>
                <p>
                  Sources use campaign tags or the referring website when
                  available. Direct includes visits with no available referral
                  source.
                </p>
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
