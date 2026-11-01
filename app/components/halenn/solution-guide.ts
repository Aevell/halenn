export type QuestionId = "goal" | "presence" | "visitorAction" | "salesStage" | "sellType" | "task" | "behaviour" | "tools" | "channel" | "reminder" | "users" | "toolTask" | "platform" | "existing" | "priority" | "current";
export type GuideAnswers = Partial<Record<QuestionId, string>>;
type Option = { value: string; label: string; detail?: string };
type Question = { id: QuestionId; title: string; hint: string; options: Option[] };
const option = (value: string, label: string, detail?: string): Option => ({ value, label, detail });
const unsure = option("unsure", "I’m not sure yet", "We can work this out together.");

const questions: Record<QuestionId, Omit<Question, "id">> = {
  goal: {
    title: "What would make the biggest difference?",
    hint: "Choose your main goal. Your solution can combine more than one service.",
    options: [
      option("leads", "Get more enquiries or bookings", "Help people find your business and take the next step."),
      option("sell", "Sell products or services online", "Give customers a clear way to browse, book or buy."),
      option("time", "Reduce repetitive work", "Connect tools, handle questions and follow up automatically."),
      option("tool", "Build a tool for customers or staff", "Create an app, portal or a simpler way to get things done."),
      unsure,
    ],
  },
  presence: {
    title: "What is your website situation?", hint: "We can build something new or work with what you already have.",
    options: [option("new", "I don’t have a website"), option("refresh", "My website needs improving"), option("happy", "My website works well"), unsure],
  },
  visitorAction: {
    title: "What should customers be able to do?", hint: "Think about the next step you want them to take.",
    options: [option("enquiries", "Send an enquiry or request a quote"), option("bookings", "Book an appointment"), option("both", "Both enquiries and bookings"), unsure],
  },
  salesStage: {
    title: "Are you already selling online?", hint: "An existing shop may need improvements or connections rather than a new build.",
    options: [option("new", "I’m starting online"), option("existing", "I already have an online shop or booking service"), unsure],
  },
  sellType: {
    title: "What would customers buy?", hint: "This helps us suggest the right ordering or booking experience.",
    options: [option("products", "Products"), option("services", "Appointments or bookable services"), option("both", "Products and bookable services"), unsure],
  },
  task: {
    title: "Which task takes too much time?", hint: "Pick the main job you want help with first.",
    options: [option("enquiries", "Responding to enquiries"), option("reminders", "Sending reminders or follow-ups"), option("connections", "Moving information between tools"), option("questions", "Answering the same questions"), option("other", "Another task or a combination"), unsure],
  },
  behaviour: {
    title: "How should that job be handled?", hint: "You don’t need to know whether it needs automation or AI.",
    options: [option("rules", "Follow a set of agreed steps", "For example, send a reminder when an invoice is overdue."), option("answers", "Understand and answer questions", "Use approved information to help customers or staff."), option("actions", "Understand a request and carry out tasks", "For example, look up information and update a connected tool."), option("mixed", "A combination of these"), unsure],
  },
  tools: {
    title: "What would it need to work with?", hint: "We’ll confirm the exact tools and compatibility when we discuss your project.",
    options: [option("booking", "A booking system"), option("crm", "Customer records or accounting software"), option("shop", "A website or webshop"), option("several", "Several tools or spreadsheets"), option("none", "Nothing yet"), unsure],
  },
  channel: {
    title: "Where would people use it?", hint: "The right starting point depends on where the conversation or task happens.",
    options: [option("website", "On my website"), option("phone", "Over the phone"), option("team", "Inside my team’s tools"), option("several", "In more than one place"), unsure],
  },
  reminder: {
    title: "What would you like to follow up?", hint: "These can often start as a focused workflow.",
    options: [option("appointments", "Upcoming appointments"), option("invoices", "Overdue invoices"), option("quotes", "Unanswered quotes"), option("other", "Something else"), unsure],
  },
  users: {
    title: "Who would use the tool?", hint: "We’ll shape the experience around the people using it.",
    options: [option("customers", "My customers"), option("staff", "My team"), option("both", "Customers and staff"), unsure],
  },
  toolTask: {
    title: "What is the main thing it should help them do?", hint: "Start with one important task. We can discuss additional features later.",
    options: [option("bookings", "Manage bookings or requests"), option("portal", "Access or share information"), option("internal", "Run an internal process"), option("other", "Another task or a combination"), unsure],
  },
  platform: {
    title: "Where should the tool work?", hint: "A browser-based portal may be enough. A mobile app can be useful for a dedicated phone experience.",
    options: [option("browser", "In a web browser"), option("android", "On Android phones"), option("ios", "On iPhones"), option("both", "On iPhones and Android phones"), unsure],
  },
  existing: {
    title: "What do you already have?", hint: "This helps us understand whether to build, extend or connect.",
    options: [option("none", "An idea, but nothing built yet"), option("website", "An existing website"), option("tools", "Software or spreadsheets we already use"), option("app", "An app that needs improving"), unsure],
  },
  priority: {
    title: "Which sounds closest to your situation?", hint: "A rough direction is enough to start a useful conversation.",
    options: [option("customers", "I want more customers"), option("sales", "I want a simpler way to sell"), option("admin", "Admin takes too much time"), option("experience", "Customers or staff need a better experience"), unsure],
  },
  current: {
    title: "What are you working with today?", hint: "We can help you explore the next step from here.",
    options: [option("website", "A website or webshop"), option("tools", "Software, spreadsheets or manual processes"), option("none", "I’m starting from scratch"), unsure],
  },
};

export function guideQuestions(answers: GuideAnswers): Question[] {
  let ids: QuestionId[] = ["goal"];
  if (answers.goal === "leads") ids = [...ids, "presence", "visitorAction"];
  if (answers.goal === "sell") ids = [...ids, "salesStage", "sellType"];
  if (answers.goal === "time") {
    ids = [...ids, "task", "behaviour", "tools"];
    if (["answers", "actions", "mixed"].includes(answers.behaviour ?? "")) ids.push("channel");
    else if (answers.task === "reminders") ids.push("reminder");
  }
  if (answers.goal === "tool") ids = [...ids, "users", "toolTask", "platform", "existing"];
  if (answers.goal === "unsure") ids = [...ids, "priority", "current"];
  return ids.map(id => ({ id, ...questions[id] }));
}

export function chooseGuideAnswer(answers: GuideAnswers, id: QuestionId, value: string): GuideAnswers {
  const path = guideQuestions(answers), index = path.findIndex(q => q.id === id);
  if (index < 0 || !path[index].options.some(o => o.value === value)) return answers;
  if (answers[id] === value) return answers;
  // A changed answer invalidates everything after it, including hidden branches.
  const next: GuideAnswers = {};
  path.slice(0, index).forEach(q => { if (answers[q.id]) next[q.id] = answers[q.id]; });
  next[id] = value;
  return next;
}

export function guideComplete(answers: GuideAnswers) {
  return !!answers.goal && guideQuestions(answers).every(q => q.options.some(o => o.value === answers[q.id]));
}

export function parseGuideAnswers(raw: string | undefined): GuideAnswers | undefined {
  if (!raw || raw.length > 1200) return;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 5) return;
    const supplied = value as Record<string, unknown>;
    let answers: GuideAnswers = {};
    for (let index = 0; index < guideQuestions(answers).length; index++) {
      const question = guideQuestions(answers)[index], answer = supplied[question.id];
      if (typeof answer !== "string" || !question.options.some(o => o.value === answer)) return;
      answers = chooseGuideAnswer(answers, question.id, answer);
    }
    if (guideComplete(answers) && Object.keys(supplied).every(key => Object.hasOwn(answers, key))) return answers;
  } catch { /* Invalid or incomplete links fall back to normal pricing. */ }
}

export type GuideRecommendation = {
  id: string; title: string; description: string; includes: string[]; note: string; pricingQuery?: string;
};
const query = (values: Record<string, string>) => new URLSearchParams(values).toString();
const automation = (id: string, title: string, description: string, includes: string[], packageId?: string): GuideRecommendation => ({
  id, title, description, includes,
  note: "We’ll confirm your tools, agreed scope and any ongoing platform or usage costs before work starts.",
  ...(packageId ? { pricingQuery: query({ services: "automation", packages: packageId }) } : {}),
});

export function guideRecommendation(a: GuideAnswers): GuideRecommendation {
  if (!guideComplete(a)) throw new Error("Complete the guide before requesting a recommendation.");
  if (a.goal === "leads") {
    if (a.presence === "happy") {
      if (a.visitorAction === "enquiries") return automation("lead-response", "Enquiry follow-up automation", "Your website already works well. A focused workflow could help give each new enquiry a timely next step.", ["Capture an incoming enquiry", "Create a contact and alert your team", "An agreed acknowledgement or follow-up action"], "lead-response");
      return automation("booking-connections", "Booking and enquiry connections", "Build on your current website with the booking or enquiry journey your customers need.", ["Review your current customer journey", "Connect your booking or enquiry tools", "Scope any reminders or follow-ups with you"]);
    }
    if (a.presence === "unsure") return automation("website-review", "A website and enquiry review", "Let’s look at your current starting point and work out what would make it easier for customers to contact or book with you.", ["Review what you already have", "Identify the most useful improvements", "Agree the right website or connection work"]);
    const bookings = ["bookings", "both"].includes(a.visitorAction ?? "");
    return {
      id: "website", title: bookings ? "A website with booking integration" : a.presence === "refresh" ? "A website refresh" : "A website built around enquiries",
      description: "Give people a clear picture of your business and an easy way to take the next step.",
      includes: ["A responsive website and clear service information", bookings ? "Connect an existing booking service" : "A clear enquiry form and contact journey", "A scoped launch and handover"],
      note: "Website prices are starting points. We’ll review your existing site, content and any booking subscription before confirming a quote.",
      pricingQuery: query({ services: "web", web: "website", ...(bookings ? { extras: "bookings" } : {}) }),
    };
  }
  if (a.goal === "sell") {
    if (a.salesStage !== "new" || a.sellType === "unsure") return automation("shop-review", "Improve your online sales journey", "We’ll review how customers browse, buy or book today and identify the changes or connections that would help.", ["Review the current store or booking setup", "Scope checkout, booking or order improvements", "Confirm what can be reused"]);
    const website = a.sellType === "services", bookings = a.sellType !== "products";
    return {
      id: "commerce", title: website ? "A website for bookings" : bookings ? "A webshop with booking integration" : "A webshop for your products",
      description: website ? "Help customers understand your services and book through a connected booking service." : "Give customers a clear path from finding your products to placing an order.",
      includes: [website ? "Service information and a responsive website" : "Product pages and a focused catalogue", website ? "Connection to your booking service" : "Cart, checkout and a payment connection", bookings && !website ? "A scoped booking-service integration" : "Launch checks and handover"],
      note: "Starting prices cover the listed package scope. Product content, payment fees and booking or platform subscriptions are confirmed separately.",
      pricingQuery: query({ services: "web", web: website ? "website" : "webshop", ...(bookings ? { extras: "bookings" } : {}) }),
    };
  }
  if (a.goal === "time") {
    if (a.behaviour === "actions" || a.behaviour === "mixed") return automation("agent", a.behaviour === "mixed" ? "An AI agent with connected workflows" : "A custom AI agent", "An assistant that understands a request and carries out agreed tasks across your tools could fit this goal.", ["Approved information and a defined task", "Connections for the actions you agree", "A clear handover when a person is needed"]);
    if (a.behaviour === "answers") {
      if (!["enquiries", "questions"].includes(a.task ?? "")) return automation("assistant-workflow", "An AI assistant with a scoped workflow", "We’ll map how answering questions fits the job you want handled, including any connections or follow-up actions.", ["Define the questions and approved information", "Scope any workflow around the conversation", "Confirm where your team takes over"]);
      if (a.channel === "phone") return automation("phone", "An AI phone assistant", "Help callers with common questions and capture callback requests when your team is busy.", ["One defined phone-assistant task", "Approved business information", "Human transfer or callback fallback"], "receptionist");
      if (a.channel === "website") return automation("chat", "A website AI assistant", "Help website visitors find answers using approved information, with a clear route to your team.", ["Answers for one defined task", "Enquiry capture where useful", "Human handoff for questions outside its scope"], "chat");
      return automation("assistant", "A custom AI assistant", "An assistant using your approved information could help your team or customers find useful answers.", ["A defined audience and knowledge sources", "The right place to ask questions", "A clear route to a person when needed"]);
    }
    if (a.behaviour === "rules") {
      if (a.task === "enquiries") return automation("lead-response", "Enquiry follow-up automation", "Give each new enquiry a next step using a repeatable workflow.", ["Capture the enquiry", "Create a contact and alert your team", "Send an agreed acknowledgement"], "lead-response");
      if (a.task === "reminders") {
        const packages: Record<string, [string, string]> = { appointments: ["Appointment reminders", "reminders"], invoices: ["Invoice reminders", "invoices"], quotes: ["Quote follow-up", "quote-followup"] };
        const match = packages[a.reminder ?? ""];
        if (match) return automation(match[1], match[0], "A focused workflow could send the right follow-up at the agreed time, using information from your existing tools.", ["One agreed source and trigger", "Approved messages and reminder timings", "Stop or update the workflow when the status changes"], match[1]);
      }
      return automation("workflow", "A connected automation workflow", "Connect your tools and handle an agreed sequence of steps so your team does less work by hand.", ["Map the task and its triggers", "Connect the relevant tools", "Test the workflow and explain how it runs"]);
    }
    return automation("automation-review", "A practical automation and AI plan", "We’ll map the job with you and decide where a straightforward workflow, an AI assistant or a combination would help.", ["Understand the task and existing tools", "Choose the simplest useful approach", "Agree a focused first piece of work"]);
  }
  if (a.goal === "tool") {
    const knownMobile = ["android", "ios", "both"].includes(a.platform ?? "");
    return {
      id: knownMobile ? "mobile-app" : "portal",
      title: knownMobile ? "A focused mobile app" : a.platform === "browser" ? a.users === "staff" ? "An internal web app" : "A customer or team portal" : "An app or portal plan",
      description: "Build around the main task your customers or staff need to complete, using your existing systems where they fit.",
      includes: ["Map the main user journey", "Scope the screens, information and connections", "Test, prepare the launch and hand over clearly"],
      note: knownMobile ? "App starting prices cover one focused journey. Accounts, a new backend, payments and complex connections need a separate quote." : "Web apps and portals are scoped individually. We’ll agree the features, connections and running costs in a proposal.",
      ...(knownMobile && a.existing !== "app" ? { pricingQuery: query({ services: "app", platform: a.platform! }) } : {}),
    };
  }
  return {
    id: "conversation", title: "Let’s find your starting point", description: "You don’t need to choose the technology. We can turn your business goal into a focused plan together.",
    includes: ["Talk through what you want to improve", "Review what you already have", "Recommend a website, app, automation or AI solution where it fits"],
    note: "Your answers give us a useful starting point. We’ll confirm the scope and price together.",
  };
}

export function guideSummary(answers: GuideAnswers) {
  return guideQuestions(answers).map(q => ({ question: q.title, answer: q.options.find(o => o.value === answers[q.id])?.label ?? "Not answered" }));
}
export function guideBrief(answers: GuideAnswers) {
  return ["Your Halenn solution guide", `Suggested starting point: ${guideRecommendation(answers).title}`, "", ...guideSummary(answers).map(row => `${row.question}\n${row.answer}`)].join("\n");
}
export function guidePricingHref(answers: GuideAnswers) {
  const recommendation = guideRecommendation(answers);
  if (!recommendation.pricingQuery) return;
  const params = new URLSearchParams(recommendation.pricingQuery);
  params.set("guide", JSON.stringify(answers));
  return `/pricing?${params}#builder`;
}
