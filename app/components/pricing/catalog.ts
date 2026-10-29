export type ServiceId = "web" | "app" | "automation";
export type WebType = "website" | "webshop";
export type ExtraId = "bookings" | "copywriting" | "custom";
export type CareId = "none" | "care" | "plus";
export type AppPlatformId = "android" | "ios" | "both";
export type AppCareId = "none" | "app";
export type Selection = {
  services: ServiceId[];
  webType: WebType;
  extras: ExtraId[];
  extraPages: number;
  visibility: VisibilityId[];
  automationPackages: AutomationPackageId[];
  customAutomation: boolean;
  care: CareId;
  appPlatform: AppPlatformId;
  appCare: AppCareId;
};
export type CustomNotes = { web: string; automation: string };
export const emptyNotes: CustomNotes = { web: "", automation: "" };
type Offer = { name: string; price: number; description: string; scope: string[] };
export const languageScope = "Translation writing and language setup for up to two additional languages across the scoped website pages, subject to your approval";
export const translationTerms = "Translations use your approved source copy or our optional copywriting. Product-catalogue translation is quoted separately.";
export const pagePrice = 100;
export const maxExtraPages = 20;
export const pageDescription = "An additional website page, including the same language allowance. Larger sites are scoped with you.";
export const projects: Record<"website" | "webshop" | "app", Offer> = {
  website: {
    name: "Website", price: 1490,
    description: "Show your business and bring in enquiries.",
    scope: ["Up to five pages with editable content", "Responsive design and an enquiry form", "Basic technical SEO", languageScope],
  },
  webshop: {
    name: "Webshop", price: 2990,
    description: "Sell your products online.",
    scope: ["Everything in the website foundation", "Up to 20 products", "Cart, checkout and one payment-provider integration"],
  },
  app: {
    name: "App", price: 2490,
    description: "A focused mobile experience for your customers.",
    scope: ["One core user journey, up to five screens", "Supplied content or one existing API", "Launch preparation and submission guidance"],
  },
};
export const extras: Record<ExtraId, { name: string; price: number | null; description: string }> = {
  bookings: { name: "Booking integration", price: 250, description: "Connect your booking service. Its subscription is separate." },
  copywriting: { name: "Website copywriting", price: 350, description: "Original-language copy for up to five website pages." },
  custom: { name: "Custom requirements", price: null, description: "An integration or feature specific to your business. We scope and price it with you." },
};
export const carePlans: Record<CareId, Offer> = {
  none: { name: "No care plan", price: 0, description: "Decide on support with your proposal.", scope: ["Hosting and subscriptions still need to be arranged separately"] },
  care: {
    name: "Website care", price: 79,
    description: "Maintenance, monitoring and 30 minutes of small changes each month.",
    scope: ["Routine maintenance and monitoring", "Up to 30 minutes of small content changes per month"],
  },
  plus: {
    name: "Care Plus", price: 149,
    description: "Maintenance, 90 minutes of small changes and a monthly performance report.",
    scope: ["Routine maintenance and monitoring", "Up to 90 minutes of small content changes per month", "Monthly report covering availability, loading performance, completed maintenance and recommended improvements", "Traffic and conversions where suitable analytics are configured and data is available"],
  },
};
export const appPlatforms: Record<AppPlatformId, Offer> = {
  android: { name: "Android app", price: 2490, description: "A native app for Android phones.", scope: ["Native Android development"] },
  ios: { name: "iOS app", price: 3490, description: "A native app for iPhone.", scope: ["Native iOS development using Swift"] },
  both: { name: "iOS and Android apps", price: 4990, description: "The same core experience on both platforms.", scope: ["Native Swift development for iOS and native Android development", "The same functionality on both platforms"] },
};
export const appCarePlans: Record<AppCareId, Offer> = {
  none: { name: "No app care", price: 0, description: "Decide on support with your proposal.", scope: [] },
  app: { name: "App Care", price: 99, description: "Compatibility checks and 30 minutes of fixes, small updates or release guidance each month.", scope: ["Monthly compatibility checks", "Up to 30 minutes per month of fixes, small updates and release guidance", "New features are quoted separately"] },
};
export const appLimitations = "Accounts, a new backend, payments and more complex features require a separate quote.";
export const appPublishing = "You own the store accounts and submit the app. We provide launch preparation and submission guidance. Store fees, review requirements and acceptance remain separate.";

export const visibilityPackages = {
  "google-business": { name: "Google Business setup", price: 190, description: "Make your business information easier to find on Google.", scope: ["Setup or optimisation of one eligible business profile", "Services, opening hours, contact details and client-supplied images", "Verification guidance; approval is controlled by Google"] },
  seo: { name: "Search optimisation (SEO)", price: 490, description: "Help the right people find your services through search.", scope: ["Search-intent research and on-page content optimisation for up to five pages", "Titles, descriptions and internal links beyond the basic technical SEO already included", "One-time setup, not an ongoing SEO campaign; no ranking guarantees"] },
  aeo: { name: "Answer optimisation (AEO)", price: 350, description: "Make your answers clearer for search and AI answer engines.", scope: ["Up to ten approved questions and answers across three existing pages", "Relevant structured data and clarity improvements", "No guarantee of inclusion or recommendation by an AI service"] },
  listings: { name: "Business listings", price: 150, description: "Keep your business details consistent across directories.", scope: ["Setup or correction of up to five directory listings", "One business location, using your approved details", "Google Business profile is separate; paid directory fees excluded"] },
} satisfies Record<string, Offer>;
export type VisibilityId = keyof typeof visibilityPackages;
export type PillarId = "respond" | "retain" | "time";
export const pillars: Record<PillarId, { name: string; description: string }> = {
  respond: { name: "Never miss a customer", description: "Give each enquiry a next step, even when you’re busy." },
  retain: { name: "Keep customers coming back", description: "Stay in touch before, after and between appointments." },
  time: { name: "Save time", description: "Optional help with the work behind the scenes." },
};
type AutomationPackage = Offer & { pillar: PillarId };
export const automationPackages = {
  "missed-call": { pillar: "respond", name: "Missed-call text-back", price: 350, description: "Miss a call? Send a text with your booking link.", scope: ["One compatible phone number and one approved SMS template", "Missed-call trigger, booking link and repeat-message suppression", "Phone setup and provider compatibility confirmed before work starts"] },
  "lead-response": { pillar: "respond", name: "Instant lead response", price: 450, description: "A new enquiry creates a contact and alerts your team.", scope: ["One enquiry source, up to three predefined actions and two connected tools", "An approved acknowledgement or team notification"] },
  receptionist: { pillar: "respond", name: "AI phone receptionist", price: 2490, description: "Answer common questions and capture callback requests.", scope: ["One incoming number, one language and approved business information", "Answers to common questions, contact capture and human transfer or callback fallback", "Direct booking, payments and additional systems quoted separately"] },
  chat: { pillar: "respond", name: "After-hours AI chat", price: 1750, description: "Answer website questions and hand over when a person is needed.", scope: ["One website chat assistant for one defined task", "Approved knowledge sources, enquiry capture and human handoff", "Custom actions and additional system integrations quoted separately"] },
  "quote-followup": { pillar: "respond", name: "Quote follow-up", price: 550, description: "Follow up an unanswered quote without another manual reminder.", scope: ["One quote source and up to two scheduled follow-ups through one channel", "Stop when the quote status changes or a reply is recorded by the connected system"] },
  "lead-routing": { pillar: "respond", name: "Lead routing & follow-up", price: 950, description: "Assign enquiries, create follow-up tasks and flag failed connections.", scope: ["A scoped process across several tools, including conditions and error handling", "Internal contact assignment, tasks and failure alerts; external quote chasing is separate"] },
  reminders: { pillar: "retain", name: "Appointment reminders", price: 350, description: "Send a reminder before a customer’s appointment.", scope: ["One booking source, one delivery channel and up to two reminder timings", "One approved message template with an existing booking-management link"] },
  "win-back": { pillar: "retain", name: "Win-back campaign", price: 550, description: "Invite customers back after, for example, two months without a booking.", scope: ["One customer source, one inactivity rule and one delivery channel", "One approved offer message and one follow-up, stopping when a new booking is recorded", "Offer value and discounts are supplied and funded by your business"] },
  reviews: { pillar: "retain", name: "Review requests", price: 290, description: "Ask customers for an honest review after their visit.", scope: ["One completed-appointment trigger and one approved message", "One public review link, sent without filtering by customer sentiment"] },
  referrals: { pillar: "retain", name: "Referral invitations", price: 490, description: "Invite happy customers to introduce a friend.", scope: ["One audience, one invitation and an existing referral link or code", "Reward tracking and fulfilment use your existing process; a referral platform is separate"] },
  feedback: { pillar: "retain", name: "Feedback check-ins", price: 290, description: "Check how a visit went and alert your team when a response arrives.", scope: ["One follow-up message, a short existing feedback form and a team notification", "One source and one delivery channel; public review requests are separate"] },
  invoices: { pillar: "time", name: "Invoice reminders", price: 350, description: "Follow up overdue invoices with a polite reminder.", scope: ["One accounting source, one channel and up to two reminder timings", "Stop once payment is recorded in the connected system"] },
  intake: { pillar: "time", name: "Intake forms", price: 450, description: "Collect the details you need before an appointment.", scope: ["One form with up to ten fields and one destination system", "Confirmation message and team notification; sensitive or complex data flows scoped separately"] },
  briefing: { pillar: "time", name: "Daily briefing", price: 450, description: "Start the day with appointments and outstanding tasks in one message.", scope: ["One scheduled summary from up to two existing tools", "One email or team-chat destination and an agreed summary format"] },
} satisfies Record<string, AutomationPackage>;
export type AutomationPackageId = keyof typeof automationPackages;
export const services: Record<ServiceId, { name: string; description: string; startingPrice: number }> = {
  web: { name: "Web", description: "Websites, webshops and a stronger online presence.", startingPrice: projects.website.price },
  app: { name: "App", description: "A native app for iOS, Android or both.", startingPrice: appPlatforms.android.price },
  automation: { name: "AI Automation", description: "Respond faster, bring customers back and save time.", startingPrice: Math.min(...Object.values(automationPackages).map(item => item.price)) },
};
export const serviceIds: ServiceId[] = ["web", "app", "automation"];
export const webTypeIds: WebType[] = ["website", "webshop"];
export const extraIds = Object.keys(extras) as ExtraId[];
export const visibilityIds = Object.keys(visibilityPackages) as VisibilityId[];
export const packageIds = Object.keys(automationPackages) as AutomationPackageId[];
export const pillarIds: PillarId[] = ["respond", "retain", "time"];
export const careIds = Object.keys(carePlans) as CareId[];
export const appPlatformIds = Object.keys(appPlatforms) as AppPlatformId[];
export const appCareIds = Object.keys(appCarePlans) as AppCareId[];
export const defaultSelection: Selection = { services: ["web"], webType: "website", extras: [], extraPages: 0, visibility: [], automationPackages: [], customAutomation: false, care: "none", appPlatform: "android", appCare: "none" };
export const exclusions = "Hosting, domains, payment fees, platform subscriptions and AI usage are separate. All prices exclude VAT.";
export const appExclusions = "App store-account fees, backend services and paid APIs are separate.";
export const automationExclusions = "Phone numbers, call minutes, SMS, email delivery, AI usage and platform subscriptions are separate. Ongoing automation support is quoted separately.";
export const automationTerms = "Each package covers the listed setup, subject to compatibility with your existing tools. Message audiences, approved content and opt-out handling are agreed before launch. Shared work across packages is reviewed in the proposal.";
export const disclaimer = "Indicative starting estimate, not a quote. Final scope and pricing are agreed in a proposal.";
export const proposalTerms = "Delivery dates, payment terms, ownership and cancellation terms are confirmed in the proposal.";
export const money = (amount: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);

export function normalizeSelection(value: Selection): Selection {
  const selected = serviceIds.filter(id => (value.services ?? []).includes(id));
  const web = selected.includes("web"), app = selected.includes("app"), ai = selected.includes("automation");
  return {
    services: selected,
    webType: web && webTypeIds.includes(value.webType) ? value.webType : "website",
    extras: web ? extraIds.filter(id => (value.extras ?? []).includes(id)) : [],
    extraPages: web && Number.isInteger(value.extraPages) && value.extraPages >= 0 && value.extraPages <= maxExtraPages ? value.extraPages : 0,
    visibility: web ? visibilityIds.filter(id => (value.visibility ?? []).includes(id)) : [],
    automationPackages: ai ? packageIds.filter(id => (value.automationPackages ?? []).includes(id)) : [],
    customAutomation: ai && value.customAutomation === true,
    care: web && careIds.includes(value.care) ? value.care : "none",
    appPlatform: app && appPlatformIds.includes(value.appPlatform) ? value.appPlatform : "android",
    appCare: app && appCareIds.includes(value.appCare) ? value.appCare : "none",
  };
}
// Retain answers in component memory when a service is deselected. Only the active
// services enter the calculator, shared URL, email and export.
export function toggleService(value: Selection, id: ServiceId) {
  const removing = value.services.includes(id);
  return { selection: { ...value, services: removing ? value.services.filter(service => service !== id) : serviceIds.filter(service => service === id || value.services.includes(service)) }, removed: removing ? services[id].name : null };
}
export type Stage = "project" | "webType" | "extras" | "platform" | "automation" | "care" | "review";
export function stagesFor(value: Selection): Stage[] {
  const { services: selected } = normalizeSelection(value);
  return ["project", ...(selected.includes("web") ? ["webType", "extras"] as Stage[] : []), ...(selected.includes("app") ? ["platform"] as Stage[] : []), ...(selected.includes("automation") ? ["automation"] as Stage[] : []), ...(selected.includes("web") || selected.includes("app") ? ["care"] as Stage[] : []), "review"];
}
export function selectionError(value: Selection, stage: Stage) {
  const s = normalizeSelection(value);
  if (stage === "project" && !s.services.length) return "Choose at least one service to continue. You can select more than one.";
  if (stage === "automation" && !s.automationPackages.length && !s.customAutomation) return "Choose a package or Custom automation. If you’re unsure, use Custom automation and we’ll help you scope it.";
  return "";
}
export type EstimateLine = { id: string; service: ServiceId; name: string; price: number | null; scope: string[] };
export function estimate(value: Selection) {
  const selection = normalizeSelection(value);
  const lines: EstimateLine[] = [], monthlyLines: EstimateLine[] = [];
  if (selection.services.includes("web")) {
    const project = projects[selection.webType];
    lines.push({ id: selection.webType, service: "web", ...project, scope: selection.webType === "webshop" ? [...projects.website.scope, ...project.scope.slice(1)] : project.scope });
    if (selection.extraPages) lines.push({ id: "pages", service: "web", name: `${selection.extraPages} extra ${selection.extraPages === 1 ? "page" : "pages"}`, price: selection.extraPages * pagePrice, scope: [`${money(pagePrice)} per extra page`, pageDescription.replace(/\.$/, "")] });
    selection.extras.forEach(id => lines.push({ id, service: "web", ...extras[id], scope: [extras[id].description.replace(/\.$/, "")] }));
    selection.visibility.forEach(id => lines.push({ id, service: "web", ...visibilityPackages[id] }));
    if (selection.care !== "none") monthlyLines.push({ id: selection.care, service: "web", ...carePlans[selection.care] });
  }
  if (selection.services.includes("app")) {
    const platform = appPlatforms[selection.appPlatform];
    lines.push({ id: `app-${selection.appPlatform}`, service: "app", ...platform, scope: [...projects.app.scope, ...platform.scope] });
    if (selection.appCare !== "none") monthlyLines.push({ id: "app-care", service: "app", ...appCarePlans.app });
  }
  if (selection.services.includes("automation")) {
    selection.automationPackages.forEach(id => lines.push({ id, service: "automation", ...automationPackages[id] }));
    if (selection.customAutomation) lines.push({ id: "custom-automation", service: "automation", name: "Custom automation", price: null, scope: ["A workflow, AI task or connected process scoped around your requirements"] });
  }
  return { selection, lines, monthlyLines, oneTime: lines.reduce((sum, line) => sum + (line.price ?? 0), 0), monthly: monthlyLines.reduce((sum, line) => sum + (line.price ?? 0), 0), quoteRequired: lines.some(line => line.price === null) };
}
export function investmentLabel(value: ReturnType<typeof estimate>) {
  return value.oneTime > 0 ? `From ${money(value.oneTime)}` : value.quoteRequired ? "Quote required" : "Choose your services";
}
export function parseSelection(query: Record<string, string | string[] | undefined>): Selection {
  const get = (key: string) => typeof query[key] === "string" ? query[key] : "";
  const list = (key: string) => get(key).split(",");
  const legacy = query.services === undefined;
  const project = get("project");
  const legacyExtras = list("extras");
  const legacyMap: Record<string, AutomationPackageId> = { simple: "lead-response", advanced: "lead-routing", assistant: "chat" };
  const oldAutomation = Object.hasOwn(legacyMap, get("automation")) ? legacyMap[get("automation")] : undefined;
  const selected: ServiceId[] = legacy
    ? project === "app" ? ["app"] : project === "automation" ? ["automation"] : oldAutomation ? ["web", "automation"] : ["web"]
    : serviceIds.filter(id => list("services").includes(id));
  const selectedPackages = legacy
    ? selected.includes("automation") ? [oldAutomation ?? "lead-response"] : []
    : packageIds.filter(id => list("packages").includes(id));
  const extraPages = query.pages === undefined ? legacyExtras.includes("pages") ? 3 : 0 : /^\d{1,2}$/.test(get("pages")) ? Number(get("pages")) : 0;
  return normalizeSelection({
    services: selected,
    webType: (legacy ? project : get("web")) as WebType,
    extras: legacyExtras.filter(id => extraIds.includes(id as ExtraId)) as ExtraId[], extraPages,
    visibility: list("visibility") as VisibilityId[], automationPackages: selectedPackages,
    customAutomation: legacy ? project === "automation" && legacyExtras.includes("custom") : get("customAutomation") === "yes",
    care: get("care") as CareId, appPlatform: get("platform") as AppPlatformId, appCare: get("appCare") as AppCareId,
  });
}
export function serializeSelection(value: Selection) {
  const s = normalizeSelection(value);
  const params = new URLSearchParams({ services: s.services.join(",") });
  if (s.services.includes("web")) {
    params.set("web", s.webType); params.set("care", s.care);
    if (s.extras.length) params.set("extras", s.extras.join(","));
    if (s.extraPages) params.set("pages", String(s.extraPages));
    if (s.visibility.length) params.set("visibility", s.visibility.join(","));
  }
  if (s.services.includes("app")) { params.set("platform", s.appPlatform); params.set("appCare", s.appCare); }
  if (s.services.includes("automation")) {
    if (s.automationPackages.length) params.set("packages", s.automationPackages.join(","));
    if (s.customAutomation) params.set("customAutomation", "yes");
  }
  return params.toString();
}
export function createBriefModel(value: Selection, notes: CustomNotes = emptyNotes) {
  const e = estimate(value);
  const web = e.selection.services.includes("web"), app = e.selection.services.includes("app"), ai = e.selection.services.includes("automation");
  const customNotes = { web: web && e.selection.extras.includes("custom") ? notes.web.slice(0, 500).trim() : "", automation: ai && e.selection.customAutomation ? notes.automation.slice(0, 500).trim() : "" };
  return {
    ...e, customNotes,
    projectName: e.selection.services.map(id => services[id].name).join(" + ") || "Project",
    notes: [
      ...(e.quoteRequired ? ["Custom requirements: additional quote required, not included in the known amount."] : []),
      ...(web ? [translationTerms] : []),
      ...(app ? [appLimitations, appPublishing] : []),
      ...(ai ? [automationTerms] : []),
    ],
    exclusions: [exclusions, ...(app ? [appExclusions] : []), ...(ai ? [automationExclusions] : [])].join(" "),
    disclaimer, proposalTerms,
  };
}
export type BriefModel = ReturnType<typeof createBriefModel>;
export function buildBrief(value: Selection, notes: CustomNotes = emptyNotes) {
  const e = createBriefModel(value, notes);
  return [
    "HALENN: YOUR PROJECT STARTING POINT", "Starting estimate / Prepared for discussion", e.projectName, "",
    ...e.lines.flatMap(line => [`${line.name}: ${line.price === null ? "Quote required" : `from ${money(line.price)} one-time`}`, ...line.scope.map(scope => `  ${scope}`)]), "",
    e.oneTime > 0 ? `Known one-time starting investment: ${money(e.oneTime)}` : investmentLabel(e), ...e.notes,
    ...Object.entries(e.customNotes).flatMap(([key, note]) => note ? ["", `Your ${key === "web" ? "web" : "automation"} requirements:`, note, ""] : []),
    ...(e.monthlyLines.length ? [`Optional monthly care total: ${money(e.monthly)}`, ...e.monthlyLines.flatMap(line => [`${line.name}: ${money(line.price ?? 0)} per month`, ...line.scope])] : ["No monthly care selected."]),
    "", e.exclusions, disclaimer, proposalTerms, "", "Contact: contact@halenn.com",
  ].join("\n");
}
export function enquiryHref(value: Selection, name: string, email: string, message: string, notes: CustomNotes = emptyNotes) {
  const body = `Name: ${name}\nEmail: ${email}\n\n${message}\n\n${buildBrief(value, notes)}`;
  return `mailto:contact@halenn.com?subject=${encodeURIComponent("My project with Halenn")}&body=${encodeURIComponent(body)}`;
}
export const examples: { name: string; description: string; breakdown: string; selection: Selection }[] = [
  { name: "Local salon", description: "Home, treatments, prices, about and contact pages, with a booking service so visitors can choose an appointment.", breakdown: "Website €1,490 + booking integration €250. Booking subscription separate.", selection: { ...defaultSelection, extras: ["bookings"], care: "care" } },
  { name: "Small candle shop", description: "Sell up to 20 candles online with product pages, a cart, checkout and one payment-provider integration.", breakdown: "Webshop €2,990. Optional Care Plus includes a monthly performance report.", selection: { ...defaultSelection, webType: "webshop", care: "plus" } },
  { name: "A busier studio, less chasing", description: "A missed caller receives a booking link. Customers without a booking for two months receive an approved invitation to return.", breakdown: "Missed-call text-back €350 + win-back campaign €550. Messaging and platform costs are separate.", selection: { ...defaultSelection, services: ["automation"], automationPackages: ["missed-call", "win-back"] } },
  { name: "Studio companion app", description: "An Android app with a welcome screen, timetable, class details, instructors and studio information. A booking link opens the studio’s existing service.", breakdown: "Android app from €2,490, using the studio’s existing API. No new booking backend included.", selection: { ...defaultSelection, services: ["app"], appCare: "app" } },
];
