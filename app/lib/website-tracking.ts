"use client";

import {
  CONSENT_COOKIE,
  parseConsent,
} from "../components/legal/consent-model";
import {
  attribution,
  cleanWebsiteBatch,
  publicPaths,
  uuidPattern,
  type Visit,
  type WebsiteEvent,
  type WebsiteKind,
  type EventDetails,
} from "./website-model";

const VISITOR = "halenn_visitor",
  SESSION = "halenn_visit";
const TIMEOUT = 30 * 60 * 1000,
  MAX_VISIT = 24 * 60 * 60 * 1000;
type StoredVisit = Visit & { started: number; last: number; quiz_id?: string };
type QueuedEvent = { visit: Visit; event: WebsiteEvent };
let consent = false,
  generation = 0,
  visit: StoredVisit | null = null;
let queue: QueuedEvent[] = [],
  timer: ReturnType<typeof setTimeout> | undefined;
let inflight: Promise<void> | null = null,
  activeQuiz: string | undefined,
  lastPage = "";
const controllers = new Set<AbortController>();

function cookie(name: string) {
  try {
    return document.cookie
      .split("; ")
      .find((value) => value.startsWith(name + "="))
      ?.slice(name.length + 1);
  } catch {
    return undefined;
  }
}
const allowed = () =>
  consent &&
  parseConsent(cookie(CONSENT_COOKIE))?.optional === true &&
  (publicPaths as readonly string[]).includes(location.pathname);
const validId = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value);
function visitData(current: Visit): Visit {
  return {
    visitor_id: current.visitor_id,
    session_id: current.session_id,
    source: current.source,
    medium: current.medium,
    campaign: current.campaign,
    referrer: current.referrer,
    landing_path: current.landing_path,
    device: current.device,
  };
}
function persist() {
  try {
    if (visit)
      sessionStorage.setItem(
        SESSION,
        JSON.stringify({
          ...visitData(visit),
          started: visit.started,
          last: visit.last,
          ...(visit.quiz_id ? { quiz_id: visit.quiz_id } : {}),
        }),
      );
  } catch {
    /* A tab can still work without session storage. */
  }
}
function restore(now: number): StoredVisit | null {
  try {
    const old = JSON.parse(sessionStorage.getItem(SESSION) || "null");
    if (
      !old ||
      !validId(old.visitor_id) ||
      !validId(old.session_id) ||
      old.visitor_id !== cookie(VISITOR) ||
      !Number.isSafeInteger(old.started) ||
      !Number.isSafeInteger(old.last) ||
      old.started < 0 ||
      old.started > old.last ||
      old.last > now ||
      now - old.last >= TIMEOUT ||
      now - old.started >= MAX_VISIT
    )
      return null;
    // Use the same field validation as ingestion; never restore arbitrary stored keys.
    const clean = cleanWebsiteBatch({
      visit: old,
      events: [
        { id: old.session_id, kind: "page_view", path: old.landing_path },
      ],
    }).visit;
    return {
      ...clean,
      started: old.started,
      last: old.last,
      ...(validId(old.quiz_id) ? { quiz_id: old.quiz_id } : {}),
    };
  } catch {
    return null;
  }
}
function enqueue(
  current: StoredVisit,
  kind: WebsiteKind,
  details: EventDetails = {},
) {
  current.last = Date.now();
  persist();
  const picked: EventDetails = {};
  for (const key of [
    "quiz_id",
    "form_id",
    "goal",
    "question",
    "step",
    "origin",
    "code",
  ] as const)
    if (details[key] !== undefined)
      Object.assign(picked, { [key]: details[key] });
  queue.push({
    visit: visitData(current),
    event: {
      id: crypto.randomUUID(),
      kind,
      path: location.pathname,
      ...picked,
    },
  });
  if (queue.length > 100) queue = queue.slice(-100);
  clearTimeout(timer);
  timer = setTimeout(() => void flushWebsiteEvents(), 120);
}
function ensureVisit(): StoredVisit | null {
  if (!allowed()) return null;
  const now = Date.now();
  if (!visit) visit = restore(now);
  if (
    !visit ||
    now - visit.last >= TIMEOUT ||
    now - visit.started >= MAX_VISIT ||
    visit.last > now ||
    visit.visitor_id !== cookie(VISITOR)
  ) {
    let visitor = cookie(VISITOR);
    if (!validId(visitor)) {
      visitor = crypto.randomUUID();
      try {
        document.cookie = `${VISITOR}=${visitor}; Path=/; Max-Age=${30 * 86400}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      } catch {
        return null;
      }
    }
    if (cookie(VISITOR) !== visitor) return null;
    visit = {
      visitor_id: visitor,
      session_id: crypto.randomUUID(),
      ...attribution(location.href, document.referrer),
      device:
        innerWidth < 600 ? "mobile" : innerWidth < 1000 ? "tablet" : "desktop",
      started: now,
      last: now,
    };
    activeQuiz = undefined;
    persist();
  }
  const page = `${visit.session_id}:${location.pathname}`;
  if (lastPage !== page) {
    lastPage = page;
    enqueue(visit, "page_view");
  }
  return visit;
}
export function setWebsiteTrackingConsent(value: boolean) {
  consent = value;
  if (!value) {
    generation++;
    controllers.forEach((controller) => controller.abort());
    queue = [];
    visit = null;
    activeQuiz = undefined;
    lastPage = "";
    clearTimeout(timer);
    try {
      sessionStorage.removeItem(SESSION);
    } catch {
      /* Cookie removal must still be attempted. */
    }
    try {
      document.cookie = `${VISITOR}=; Path=/; Max-Age=0; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    } catch {
      /* Tracking remains disabled in memory. */
    }
  } else ensureVisit();
  window.dispatchEvent(new Event("halenn:analytics-consent"));
}
export function setActiveQuiz(id: string | null) {
  activeQuiz = validId(id) ? id : undefined;
  if (visit) {
    visit.quiz_id = activeQuiz;
    persist();
  }
}
export function trackingContext() {
  const current = ensureVisit();
  if (!current) return null;
  const quiz = activeQuiz || current.quiz_id;
  return {
    visitor_id: current.visitor_id,
    session_id: current.session_id,
    ...(quiz ? { quiz_id: quiz } : {}),
  };
}
export function trackWebsiteEvent(
  kind: WebsiteKind,
  details: EventDetails = {},
) {
  const current = ensureVisit();
  // ensureVisit records one view for this page, including on session rollover.
  if (!current || kind === "page_view") return;
  enqueue(current, kind, details);
}
async function postEvents(body: string) {
  const controller = new AbortController();
  controllers.add(controller);
  const deadline = setTimeout(() => controller.abort(), 2000);
  try {
    return await fetch("/api/website-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(deadline);
    controllers.delete(controller);
  }
}
export async function flushWebsiteEvents(): Promise<void> {
  if (inflight) {
    await inflight;
    if (queue.length && allowed()) await flushWebsiteEvents();
    return;
  }
  if (!queue.length || !allowed()) return;
  const first = queue[0];
  let count = 1;
  while (
    count < Math.min(20, queue.length) &&
    queue[count].visit.session_id === first.visit.session_id
  )
    count++;
  const body = JSON.stringify({
    visit: first.visit,
    events: queue.splice(0, count).map((item) => item.event),
  });
  const grant = generation;
  const mayRetry = () => generation === grant && allowed();
  const task = (async () => {
    try {
      const response = await postEvents(body);
      if (response.status >= 500 && mayRetry())
        await postEvents(body).catch(() => {});
    } catch {
      if (mayRetry()) await postEvents(body).catch(() => {});
    }
  })();
  inflight = task;
  await task;
  if (inflight === task) inflight = null;
  if (queue.length && allowed()) await flushWebsiteEvents();
}
