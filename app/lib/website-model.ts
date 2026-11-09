export const publicPaths = [
  "/",
  "/pricing",
  "/about",
  "/privacy",
  "/cookies",
  "/terms",
  "/business",
] as const;
export const websiteKinds = [
  "page_view",
  "quiz_view",
  "quiz_start",
  "quiz_question",
  "quiz_answer",
  "quiz_complete",
  "quiz_restart",
  "quiz_pricing",
  "enquiry_open",
  "enquiry_start",
  "enquiry_attempt",
  "enquiry_error",
  "enquiry_close",
] as const;
export const questions = [
  "goal",
  "presence",
  "visitorAction",
  "salesStage",
  "sellType",
  "task",
  "behaviour",
  "tools",
  "channel",
  "reminder",
  "users",
  "toolTask",
  "platform",
  "existing",
  "priority",
  "current",
] as const;
export const goals = ["leads", "sell", "time", "tool", "unsure"] as const;
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type WebsiteKind = (typeof websiteKinds)[number];
export type EventDetails = {
  quiz_id?: string;
  form_id?: string;
  goal?: string;
  question?: string;
  step?: number;
  origin?: "homepage" | "quiz" | "pricing";
  code?: "validation" | "network" | "server";
};
export type WebsiteEvent = EventDetails & {
  id: string;
  kind: WebsiteKind;
  path: string;
};
export type Visit = {
  visitor_id: string;
  session_id: string;
  source: string;
  medium: string;
  campaign: string;
  referrer: string;
  landing_path: string;
  device: "desktop" | "tablet" | "mobile";
};
export type WebsiteBatch = { visit: Visit; events: WebsiteEvent[] };
const isUuid = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value);
const safeTag = (value: unknown) =>
  typeof value === "string" && /^[a-zA-Z0-9 _.-]{1,64}$/.test(value)
    ? value.trim()
    : "";
// Explicit regional domains avoid guessing from an arbitrary "google." prefix.
// Unrecognized referrals remain visible under Other referral.
const googleDomains = [
  "google.com",
  "google.nl",
  "google.be",
  "google.co.uk",
  "google.de",
  "google.fr",
  "google.es",
  "google.it",
  "google.pt",
  "google.ie",
  "google.ch",
  "google.at",
  "google.dk",
  "google.se",
  "google.no",
  "google.fi",
  "google.pl",
  "google.cz",
  "google.ca",
  "google.com.au",
  "google.co.nz",
  "google.co.in",
  "google.co.jp",
  "google.com.ph",
];
export function attribution(href: string, referrer: string) {
  const location = new URL(href);
  let host = "";
  try {
    const ref = new URL(referrer);
    if (
      ["http:", "https:"].includes(ref.protocol) &&
      ref.hostname !== location.hostname &&
      !ref.hostname.endsWith(".halenn.com") &&
      ref.hostname !== "halenn.com"
    )
      host = ref.hostname.toLowerCase().slice(0, 253);
  } catch {}
  if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(host) || host.includes(":"))
    host = "";
  const tag = safeTag(location.searchParams.get("utm_source")),
    medium = safeTag(location.searchParams.get("utm_medium")),
    campaign = safeTag(location.searchParams.get("utm_campaign"));
  const candidate = (tag || host).toLowerCase();
  const is = (brand: string) =>
    candidate === brand ||
    candidate === `www.${brand}.com` ||
    candidate === `${brand}.com` ||
    candidate.endsWith(`.${brand}.com`);
  const isGoogle =
    candidate === "google" ||
    googleDomains.some(
      (domain) => candidate === domain || candidate.endsWith("." + domain),
    );
  const source = isGoogle
    ? "Google"
    : is("bing")
      ? "Bing"
      : is("instagram")
        ? "Instagram"
        : is("facebook") || candidate === "fb"
          ? "Facebook"
          : is("linkedin")
            ? "LinkedIn"
            : is("tiktok")
              ? "TikTok"
              : tag || (host ? "Other referral" : "Direct");
  return {
    source,
    medium,
    campaign,
    referrer: host,
    landing_path: (publicPaths as readonly string[]).includes(location.pathname)
      ? location.pathname
      : "/",
  };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid request.");
  return value as Record<string, unknown>;
}
export function cleanWebsiteBatch(value: unknown): WebsiteBatch {
  const raw = object(value),
    v = object(raw.visit);
  if (!isUuid(v.visitor_id) || !isUuid(v.session_id))
    throw Error("Invalid visit.");
  if (
    !(publicPaths as readonly unknown[]).includes(v.landing_path) ||
    !["desktop", "tablet", "mobile"].includes(v.device as string)
  )
    throw Error("Invalid visit.");
  const referrer =
    typeof v.referrer === "string" &&
    !/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(v.referrer) &&
    /^(?:[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)?$/.test(v.referrer)
      ? v.referrer
      : "";
  const visit: Visit = {
    visitor_id: String(v.visitor_id),
    session_id: String(v.session_id),
    source: safeTag(v.source) || "Direct",
    medium: safeTag(v.medium),
    campaign: safeTag(v.campaign),
    referrer,
    landing_path: String(v.landing_path),
    device: v.device as Visit["device"],
  };
  if (
    !Array.isArray(raw.events) ||
    raw.events.length < 1 ||
    raw.events.length > 20
  )
    throw Error("Invalid events.");
  const events = raw.events.map((value) => {
    const e = object(value);
    if (
      !isUuid(e.id) ||
      !(websiteKinds as readonly unknown[]).includes(e.kind) ||
      !(publicPaths as readonly unknown[]).includes(e.path)
    )
      throw Error("Invalid event.");
    const item: WebsiteEvent = {
      id: String(e.id),
      kind: e.kind as WebsiteKind,
      path: String(e.path),
    };
    for (const key of ["quiz_id", "form_id"] as const)
      if (e[key] !== undefined) {
        if (!isUuid(e[key])) throw Error("Invalid event.");
        item[key] = String(e[key]);
      }
    if (e.goal !== undefined) {
      if (!(goals as readonly unknown[]).includes(e.goal))
        throw Error("Invalid goal.");
      item.goal = String(e.goal);
    }
    if (e.question !== undefined) {
      if (!(questions as readonly unknown[]).includes(e.question))
        throw Error("Invalid question.");
      item.question = String(e.question);
    }
    if (e.step !== undefined) {
      if (!Number.isInteger(e.step) || Number(e.step) < 1 || Number(e.step) > 5)
        throw Error("Invalid step.");
      item.step = Number(e.step);
    }
    if (e.origin !== undefined) {
      if (!["homepage", "quiz", "pricing"].includes(e.origin as string))
        throw Error("Invalid origin.");
      item.origin = e.origin as EventDetails["origin"];
    }
    if (e.code !== undefined) {
      if (!["validation", "network", "server"].includes(e.code as string))
        throw Error("Invalid error code.");
      item.code = e.code as EventDetails["code"];
    }
    if (
      [
        "quiz_start",
        "quiz_question",
        "quiz_answer",
        "quiz_complete",
        "quiz_restart",
        "quiz_pricing",
      ].includes(item.kind) &&
      !item.quiz_id
    )
      throw Error("Missing quiz attempt.");
    if (["quiz_question", "quiz_answer"].includes(item.kind) && !item.question)
      throw Error("Missing question.");
    if (item.kind.startsWith("enquiry_") && !item.form_id)
      throw Error("Missing form attempt.");
    return item;
  });
  return { visit, events };
}
export type EnquiryPayload = {
  id: string;
  name: string;
  email: string;
  company: string;
  message: string;
  origin: "homepage" | "quiz" | "pricing";
  form_id: string;
  tracking: { visitor_id: string; session_id: string; quiz_id?: string } | null;
};
export function cleanEnquiry(value: unknown): EnquiryPayload {
  const r = object(value);
  const text = (key: string, max: number, required = true) => {
    const v = r[key] ?? "";
    if (typeof v !== "string" || v.length > max || (required && !v.trim()))
      throw Error("Please check your " + key + ".");
    return v.trim();
  };
  if (!isUuid(r.id) || !isUuid(r.form_id))
    throw Error("Please reopen the form and try again.");
  const name = text("name", 120),
    email = text("email", 254).toLowerCase(),
    company = text("company", 180, false),
    message = text("message", 20000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email))
    throw Error("Please enter a valid email address.");
  if (!["homepage", "quiz", "pricing"].includes(r.origin as string))
    throw Error("Invalid enquiry source.");
  let tracking: EnquiryPayload["tracking"] = null;
  if (r.tracking) {
    const t = object(r.tracking);
    if (isUuid(t.visitor_id) && isUuid(t.session_id))
      tracking = {
        visitor_id: String(t.visitor_id),
        session_id: String(t.session_id),
        ...(isUuid(t.quiz_id) ? { quiz_id: String(t.quiz_id) } : {}),
      };
  }
  return {
    id: String(r.id),
    form_id: String(r.form_id),
    name,
    email,
    company,
    message,
    origin: r.origin as EnquiryPayload["origin"],
    tracking,
  };
}
