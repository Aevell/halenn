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
  coverage: { retentionDays: number; consentOnly: boolean };
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
}: {
  from: string;
  to: string;
  previewData?: WebsiteReport;
}) {
  const [source, setSource] = useState("");
  const [device, setDevice] = useState("");
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [knownSources, setKnownSources] = useState<string[]>([]);
  const query = useMemo(
    () => new URLSearchParams({ from, to, source, device }).toString(),
    [from, to, source, device],
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
          <h2>Before the enquiry.</h2>
          <p>See how people find Halenn and where their journey stops.</p>
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
              label="Enquiries received"
              value={number(data.totals.enquiries)}
              detail="Confirmed submissions from tracked visits"
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
          <div className="ha-grid ha-overview-grid">
            <Panel
              title="Visits & enquiries"
              description="Daily activity from visits that began in the selected period."
            >
              <Trend
                rows={data.trend.map((row) => ({
                  label: shortDate(row.date),
                  fullLabel: shortDate(row.date),
                  a: row.visits,
                  b: row.enquiries,
                }))}
                labels={["Visits", "Enquiries received"]}
                empty="The chart fills in as visitors accept analytics and explore the website."
              />
            </Panel>
            <Panel
              title="The quiz journey"
              description="Distinct visits reaching each set of milestones. Direct enquiries are counted separately from this quiz path."
            >
              <Bars
                max={data.totals.visits}
                rows={
                  data.totals.visits
                    ? data.journey.map((row) => ({
                        label: row.label,
                        value: row.count,
                        detail: `${percentage(row.count, data.totals.visits)} of tracked visits`,
                      }))
                    : []
                }
                empty="The journey will show where visits progress from the homepage quiz to an enquiry."
              />
              <p className="ha-caption">
                A visit can include more than one quiz attempt. The attempt
                detail below explains individual drop-offs.
              </p>
            </Panel>
            <Panel
              wide
              title="Where visitors come from"
              description="The source recorded when a visit begins. Enquiry rates use tracked visits as the denominator."
            >
              {sortedSources.length ? (
                <>
                  <div className="ha-table-scroll">
                    <table className="ha-website-table">
                      <thead>
                        <tr>
                          <th>Source</th>
                          <th>Visits</th>
                          <th>Visitors</th>
                          <th>Quiz starts</th>
                          <th>Enquiring visits</th>
                          <th>Enquiry rate</th>
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
                            <td>{number(row.visitors)}</td>
                            <td>{number(row.quizStarts)}</td>
                            <td>{number(row.enquiries)}</td>
                            <td>
                              {percentage(row.enquiries, row.visits)}
                              <small>
                                {row.enquiries} of {row.visits} visits
                              </small>
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
                  {data.quiz.branches.map((branch) => {
                    const order = branchOrder[branch.goal] ?? ["goal"];
                    const rows = data.quiz.questions
                      .filter((row) => row.goal === branch.goal)
                      .sort(
                        (a, b) =>
                          order.indexOf(a.question) - order.indexOf(b.question),
                      );
                    return (
                      <details className="ha-quiz-branch" key={branch.goal}>
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
              title="From opening the form to sending an enquiry"
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
          <details className="ha-website-detail ha-quality">
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
          </details>
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
                  Earlier visits are not reconstructed.{" "}
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
