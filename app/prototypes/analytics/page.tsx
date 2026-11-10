import { Suspense } from "react";
import { notFound } from "next/navigation";
import Analytics from "../../admin/(private)/analytics/Analytics";
import { empty, type Lead } from "../../admin/lib/leads";
import { type Activity } from "../../admin/lib/analytics";
import { type WebsiteReport } from "../../admin/(private)/analytics/WebsiteAnalytics";
import "../../admin/workspace.css";
import "../../admin/(private)/analytics/analytics.css";

export const metadata = { title: "Analytics design preview", robots: { index: false, follow: false } };
export default async function AnalyticsPreview({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const blank = (await searchParams).sample === "empty";
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const now = "2026-11-10";
  const sources = ["Instagram", "Google", "Referral", "Direct"];
  const leads: Lead[] = blank ? [] : Array.from({ length: 38 }, (_, i) => ({
    ...empty, id: id(i + 1), revision: 1, company: `Sample business ${i + 1}`,
    created_at: `2026-10-${String(15 + i % 15).padStart(2, "0")}T10:00:00Z`,
    channel: "Website", acquisition_source: sources[i % 4], acquisition_medium: "social",
    service: ["Website", "AI & automation", "App"][i % 3], industry: ["Beauty", "Fitness", "Home services"][i % 3],
    status: i < 8 ? "Won" : i < 12 ? "Closed" : i < 20 ? "Proposal" : i < 28 ? "Contacted" : "New",
    follow_up: i % 3 === 0 ? "2026-11-09" : i % 3 === 1 ? "2026-11-10" : null,
    is_test: i > 35, owner: i % 2 ? "Partner one" : "Partner two", offer: "Website + lead response",
    lost_reason: "Timing",
  }));
  let seq = 100;
  const activity: Activity[] = leads.flatMap((l, i) => {
    const record = (kind: Activity["kind"], amount: number | null = null, stage: string | null = null): Activity => ({
      id: id(seq++), lead_id: l.id, kind, occurred_at: "2026-11-06T10:30:00Z", created_at: "2026-11-06T10:30:00Z",
      from_stage: null, to_stage: stage, amount_cents: amount, currency: "EUR", channel: "Website", owner: l.owner || "",
      note: "Fictional preview", voided_at: null, void_reason: "",
    });
    const entries = [record("stage", null, "New")];
    if (i < 28) entries.push(record("contact_attempt"), record("conversation"));
    if (i < 18) entries.push(record("meeting_held"));
    if (l.status === "Won") entries.push(record("stage", null, "Won"), record("payment", 65000), record("delivery_cost", 12500), record("subscription_started", 4700));
    return entries;
  });
  const website: WebsiteReport = {
    from: "2026-11-04", to: now, availableFrom: "2026-11-04", updatedAt: now + "T12:00:00Z",
    totals: { visitors: blank ? 0 : 63, visits: blank ? 0 : 80, pageViews: blank ? 0 : 234, quizStarts: blank ? 0 : 28, quizCompletions: blank ? 0 : 20, enquiries: blank ? 0 : 18, quizEnquiries: blank ? 0 : 9, formOpens: blank ? 0 : 27, formStarts: blank ? 0 : 23 },
    sources: blank ? [] : [
      { source: "Instagram", visits: 38, visitors: 31, quizStarts: 16, enquiries: 9, leads: 9, customers: 3 },
      { source: "Google", visits: 28, visitors: 23, quizStarts: 9, enquiries: 6, leads: 6, customers: 2 },
      { source: "Direct", visits: 14, visitors: 9, quizStarts: 3, enquiries: 3, leads: 3, customers: 0 },
    ],
    trend: blank ? [] : [8, 10, 7, 13, 10, 17, 15].map((visits, i) => ({ date: `2026-11-${String(i + 4).padStart(2, "0")}`, visits, enquiries: [1, 2, 1, 3, 2, 5, 4][i] })),
    journey: ["Website visits", "Quiz seen", "Quiz started", "Recommendation reached", "Enquiry form opened", "Enquiry after recommendation"].map((label, i) => ({ label, count: blank ? 0 : [80, 45, 28, 20, 12, 8][i] })),
    quiz: { started: blank ? 0 : 28, completed: blank ? 0 : 20, enquired: blank ? 0 : 1, pending: blank ? 0 : 2, abandoned: blank ? 0 : 5, branches: blank ? [] : [{ goal: "leads", started: 28, completed: 20, enquired: 1, pending: 2, abandoned: 5 }], questions: blank ? [] : [{ goal: "leads", question: "presence", seen: 28, continued: 22, dropped: 4, pending: 2 }, { goal: "leads", question: "visitorAction", seen: 22, continued: 20, dropped: 1, pending: 0 }] },
    forms: blank ? [] : [
      { origin: "quiz", opened: 12, started: 10, received: 9, errors: 1, pending: 1, abandoned: 2 },
      { origin: "homepage", opened: 15, started: 13, received: 9, errors: 0, pending: 2, abandoned: 4 },
    ],
    pages: blank ? [] : [{path: "/", views: 180, entrances: 64, exits: 47}, {path: "/pricing", views: 54, entrances: 16, exits: 25}],
    devices: blank ? [] : [{device: "mobile", visits: 59, enquiries: 13}, {device: "desktop", visits: 21, enquiries: 5}],
    coverage: { retentionDays: 90, consentOnly: true, includesTests: false, excludedVisits: 4 },
  };
  return <div className="hw"><div className="hw-bar"><div className="hw-bar-inner"><a href="/prototypes/analytics">halenn / Preview</a></div></div><main className="hw-main"><Suspense><Analytics leads={leads} activity={activity} now={now} preview websitePreview={website} /></Suspense></main></div>;
}
