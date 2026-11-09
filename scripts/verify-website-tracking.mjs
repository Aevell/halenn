import test from "node:test";
import assert from "node:assert/strict";
import {
  attribution,
  cleanWebsiteBatch,
  cleanEnquiry,
} from "../app/lib/website-model.ts";

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const visit = () => ({
  visitor_id: uuid(1),
  session_id: uuid(2),
  source: "Instagram",
  medium: "social",
  campaign: "Autumn launch",
  referrer: "l.instagram.com",
  landing_path: "/pricing",
  device: "mobile",
});
const event = (extra = {}) => ({
  id: uuid(3),
  kind: "page_view",
  path: "/pricing",
  ...extra,
});
const batch = (extra = {}) => ({ visit: visit(), events: [event()], ...extra });
const enquiry = (extra = {}) => ({
  id: uuid(4),
  form_id: uuid(5),
  name: "Alex Example",
  email: "alex@example.com",
  company: "Example Studio",
  message: "Please help connect our booking system.",
  origin: "homepage",
  tracking: null,
  ...extra,
});

test("campaign attribution wins over referral while preserving only bounded public metadata", () => {
  const result = attribution(
    "https://halenn.com/pricing?utm_source=Instagram&utm_medium=paid_social&utm_campaign=Autumn%202026&email=private%40example.com&guide=private-answers#private-fragment",
    "https://www.google.nl/search?q=private+customer",
  );
  assert.deepEqual(result, {
    source: "Instagram",
    medium: "paid_social",
    campaign: "Autumn 2026",
    referrer: "www.google.nl",
    landing_path: "/pricing",
  });
  assert.doesNotMatch(JSON.stringify(result), /private|email|guide|fragment/);
});

test("referral attribution retains host only, never credentials, route, query or fragment", () => {
  assert.deepEqual(
    attribution(
      "https://halenn.com/about",
      "https://username:password@l.instagram.com/private/messages?email=private%40example.com#secret",
    ),
    {
      source: "Instagram",
      medium: "",
      campaign: "",
      referrer: "l.instagram.com",
      landing_path: "/about",
    },
  );
});

test("self referrals, missing referrers and non-web schemes remain direct", () => {
  for (const referrer of [
    "",
    "not a URL",
    "https://halenn.com/pricing?guide=private",
    "https://www.halenn.com/about",
    "https://preview.halenn.com/a",
    "file:///private/customer-list.csv",
    "javascript:alert(1)",
    "mailto:person@example.com",
  ]) {
    const result = attribution("https://halenn.com/", referrer);
    assert.equal(result.source, "Direct", referrer);
    assert.equal(result.referrer, "", referrer);
  }
  assert.equal(
    attribution("https://halenn.com/", "https://evilhalenn.com/").source,
    "Other referral",
  );
});

for (const [referrer, expected] of [
  ["https://www.google.nl/search", "Google"],
  ["https://www.google.co.uk/search", "Google"],
  ["https://www.google.com.au/search", "Google"],
  ["https://www.google.com.ph/search", "Google"],
  ["https://news.google.nl/", "Google"],
  ["https://www.bing.com/search", "Bing"],
  ["https://m.facebook.com/", "Facebook"],
  ["https://www.linkedin.com/feed", "LinkedIn"],
  ["https://www.tiktok.com/", "TikTok"],
  ["https://google.attacker.test/", "Other referral"],
  ["https://google.nl.attacker.test/", "Other referral"],
  ["https://fakegoogle.nl/", "Other referral"],
  ["https://instagram.com.attacker.test/", "Other referral"],
]) {
  test(`referral ${referrer} is classified as ${expected}`, () => {
    assert.equal(
      attribution("https://halenn.com/", referrer).source,
      expected,
      referrer,
    );
  });
}

test("unsafe or excessive campaign tags cannot retain personal data or URLs", () => {
  for (const value of [
    "person@example.com",
    "https://example.com/customer/123",
    "private\nvalue",
    "<script>alert(1)</script>",
    "a".repeat(65),
  ]) {
    const query = new URLSearchParams({
      utm_source: value,
      utm_medium: value,
      utm_campaign: value,
    });
    const result = attribution(`https://halenn.com/?${query}`, "");
    assert.deepEqual(result, {
      source: "Direct",
      medium: "",
      campaign: "",
      referrer: "",
      landing_path: "/",
    });
  }
  const safe = "a".repeat(64);
  const result = attribution(
    `https://halenn.com/?utm_source=${safe}&utm_campaign=++Autumn_2026-v2.0++`,
    "",
  );
  assert.equal(result.source, safe);
  assert.equal(result.campaign, "Autumn_2026-v2.0");
});

test("private landing routes and arbitrary URL paths never enter stored attribution", () => {
  for (const route of [
    "/admin",
    "/admin/leads/123",
    "/customer/person@example.com",
    "/api/enquiries",
  ])
    assert.equal(
      attribution(`https://halenn.com${route}?secret=1`, "").landing_path,
      "/",
    );
});

test("referrer IP addresses are excluded from both attribution and untrusted event batches", () => {
  for (const referrer of [
    "https://192.0.2.1/private",
    "https://[2001:db8::1]/private",
  ]) {
    const result = attribution("https://halenn.com/", referrer);
    assert.equal(result.referrer, "");
    assert.equal(result.source, "Direct");
  }
  for (const referrer of ["192.0.2.1", "2001:db8::1"])
    assert.equal(
      cleanWebsiteBatch(batch({ visit: { ...visit(), referrer } })).visit
        .referrer,
      "",
    );
});

test("analytics cleans unknown metadata and all free-text form contents at every level", () => {
  const input = batch({
    email: "private@example.com",
    answers: { task: "private customer answer" },
    visit: {
      ...visit(),
      full_url: "https://halenn.com/?email=private@example.com",
      name: "Private Customer",
    },
    events: [
      event({
        kind: "enquiry_attempt",
        form_id: uuid(5),
        origin: "pricing",
        name: "Private Customer",
        email: "private@example.com",
        company: "Private Company",
        message: "Private enquiry contents",
        answer: "Private answer",
        answers: { goal: "private free text" },
        metadata: { secret: "private" },
      }),
    ],
  });
  const result = cleanWebsiteBatch(input);
  assert.deepEqual(
    result,
    batch({
      events: [
        event({ kind: "enquiry_attempt", form_id: uuid(5), origin: "pricing" }),
      ],
    }),
  );
  assert.doesNotMatch(
    JSON.stringify(result),
    /private|customer|company|message|answers|metadata|full_url/i,
  );
  assert.equal(
    input.events[0].message,
    "Private enquiry contents",
    "Cleaning must not mutate the request object",
  );
});

test("visitor batch refuses forged completion and private/admin page activity", () => {
  assert.throws(() =>
    cleanWebsiteBatch(
      batch({
        events: [event({ kind: "enquiry_received", form_id: uuid(5) })],
      }),
    ),
  );
  for (const path of [
    "/admin",
    "/api/enquiries",
    "/pricing?email=private@example.com",
    "https://halenn.com/pricing",
  ])
    assert.throws(
      () => cleanWebsiteBatch(batch({ events: [event({ path })] })),
      path,
    );
  assert.throws(() =>
    cleanWebsiteBatch(batch({ visit: { ...visit(), landing_path: "/admin" } })),
  );
});

test("batch boundaries reject empty, oversized and non-object requests", () => {
  for (const bad of [null, [], "request", 1])
    assert.throws(() => cleanWebsiteBatch(bad));
  for (const events of [
    [],
    null,
    {},
    "events",
    Array.from({ length: 21 }, () => event()),
  ])
    assert.throws(() => cleanWebsiteBatch(batch({ events })));
  assert.equal(
    cleanWebsiteBatch(
      batch({
        events: Array.from({ length: 20 }, (_, n) =>
          event({ id: uuid(n + 10) }),
        ),
      }),
    ).events.length,
    20,
  );
});

test("analytics requires UUIDv4 visit, event, quiz and form identifiers", () => {
  for (const invalid of [
    "",
    "visitor-1",
    "00000000-0000-1000-8000-000000000001",
    "00000000-0000-4000-0000-000000000001",
    null,
  ]) {
    for (const key of ["visitor_id", "session_id"])
      assert.throws(
        () =>
          cleanWebsiteBatch(batch({ visit: { ...visit(), [key]: invalid } })),
        `${key}: ${invalid}`,
      );
    for (const key of ["id", "quiz_id", "form_id"])
      assert.throws(
        () => cleanWebsiteBatch(batch({ events: [event({ [key]: invalid })] })),
        `${key}: ${invalid}`,
      );
  }
});

for (const key of ["visitor_id", "session_id"]) {
  test(`analytics requires scalar string ${key}, not a coercible array`, () => {
    assert.throws(() =>
      cleanWebsiteBatch(batch({ visit: { ...visit(), [key]: [uuid(1)] } })),
    );
  });
}
for (const key of ["id", "quiz_id", "form_id"]) {
  test(`analytics requires scalar string event ${key}, not a coercible array`, () => {
    assert.throws(() =>
      cleanWebsiteBatch(batch({ events: [event({ [key]: [uuid(1)] })] })),
    );
  });
}

test("analytics device must be a declared scalar category", () => {
  for (const device of ["phone", "", null, ["mobile"]])
    assert.throws(
      () => cleanWebsiteBatch(batch({ visit: { ...visit(), device } })),
      JSON.stringify(device),
    );
});

test("analytics origin and error code reject coercible arrays as well as unknown strings", () => {
  for (const origin of ["admin", ["pricing"]])
    assert.throws(
      () => cleanWebsiteBatch(batch({ events: [event({ origin })] })),
      JSON.stringify(origin),
    );
  for (const code of ["private error contents", ["network"]])
    assert.throws(
      () => cleanWebsiteBatch(batch({ events: [event({ code })] })),
      JSON.stringify(code),
    );
});

test("quiz steps and categories enforce finite metadata rather than free text", () => {
  const quiz = event({
    kind: "quiz_question",
    quiz_id: uuid(6),
    question: "goal",
    step: 1,
    goal: "leads",
    origin: "quiz",
  });
  assert.deepEqual(
    cleanWebsiteBatch(batch({ events: [quiz] })).events[0],
    quiz,
  );
  for (const step of [0, 6, 1.5, "1", null, [1]])
    assert.throws(
      () => cleanWebsiteBatch(batch({ events: [{ ...quiz, step }] })),
      JSON.stringify(step),
    );
  for (const key of ["question", "goal"])
    for (const value of [
      "Private customer response",
      [key === "question" ? "goal" : "leads"],
    ])
      assert.throws(
        () => cleanWebsiteBatch(batch({ events: [{ ...quiz, [key]: value }] })),
        `${key}: ${value}`,
      );
});

test("funnel events require their attempt identifiers and questions require stable IDs", () => {
  for (const kind of [
    "quiz_start",
    "quiz_question",
    "quiz_answer",
    "quiz_complete",
    "quiz_restart",
    "quiz_pricing",
  ])
    assert.throws(
      () =>
        cleanWebsiteBatch(
          batch({ events: [event({ kind, question: "goal" })] }),
        ),
      kind,
    );
  for (const kind of ["quiz_question", "quiz_answer"])
    assert.throws(
      () =>
        cleanWebsiteBatch(
          batch({ events: [event({ kind, quiz_id: uuid(6) })] }),
        ),
      kind,
    );
  for (const kind of [
    "enquiry_open",
    "enquiry_start",
    "enquiry_attempt",
    "enquiry_error",
    "enquiry_close",
  ])
    assert.throws(
      () => cleanWebsiteBatch(batch({ events: [event({ kind })] })),
      kind,
    );
});

test("batch sanitization independently rejects unsafe attribution supplied outside the client", () => {
  const result = cleanWebsiteBatch(
    batch({
      visit: {
        ...visit(),
        source: "person@example.com",
        medium: "<script>",
        campaign: "x".repeat(65),
        referrer: "https://example.com/private?email=person@example.com",
      },
    }),
  );
  assert.deepEqual(result.visit, {
    ...visit(),
    source: "Direct",
    medium: "",
    campaign: "",
    referrer: "",
  });
});

test("enquiries normalize contact fields and discard arbitrary metadata including tracking extras", () => {
  const result = cleanEnquiry(
    enquiry({
      name: "  Alex Example  ",
      email: "  Alex@EXAMPLE.COM  ",
      company: "  Example Studio  ",
      message: "  Please help connect our booking system.\nThank you.  ",
      origin: "quiz",
      tracking: {
        visitor_id: uuid(1),
        session_id: uuid(2),
        quiz_id: uuid(6),
        email: "private@example.com",
        source: "forged",
        answers: { customer: "private" },
      },
      status: "Won",
      amount_cents: 1000000,
      website: "",
      metadata: { secret: "private" },
    }),
  );
  assert.deepEqual(
    result,
    enquiry({
      email: "alex@example.com",
      message: "Please help connect our booking system.\nThank you.",
      origin: "quiz",
      tracking: { visitor_id: uuid(1), session_id: uuid(2), quiz_id: uuid(6) },
    }),
  );
});

test("enquiries work without analytics consent or optional company information", () => {
  const input = enquiry();
  delete input.tracking;
  delete input.company;
  assert.deepEqual(
    cleanEnquiry(input),
    enquiry({ company: "", tracking: null }),
  );
  assert.equal(
    cleanEnquiry(
      enquiry({ tracking: { visitor_id: "invalid", session_id: uuid(2) } }),
    ).tracking,
    null,
  );
  assert.deepEqual(
    cleanEnquiry(
      enquiry({
        tracking: {
          visitor_id: uuid(1),
          session_id: uuid(2),
          quiz_id: "invalid",
        },
      }),
    ).tracking,
    { visitor_id: uuid(1), session_id: uuid(2) },
  );
});

test("enquiry message permits the full combined brief but refuses empty and over-20000-character content", () => {
  assert.equal(
    cleanEnquiry(enquiry({ message: "m".repeat(20000) })).message.length,
    20000,
  );
  for (const message of ["m".repeat(20001), "", " \n\t ", null, 123, ["hello"]])
    assert.throws(
      () => cleanEnquiry(enquiry({ message })),
      typeof message === "string" ? `length ${message.length}` : typeof message,
    );
});

test("name, company and email limits reject excess input before persistence", () => {
  const email254 = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(57)}.com`;
  assert.equal(email254.length, 254);
  assert.equal(
    cleanEnquiry(
      enquiry({
        name: "n".repeat(120),
        company: "c".repeat(180),
        email: email254,
      }),
    ).email,
    email254,
  );
  for (const extra of [
    { name: "n".repeat(121) },
    { company: "c".repeat(181) },
    { email: "a" + email254 },
    { name: "  " },
    { name: 123 },
    { email: "missing-at.example.com" },
    { email: "person@example" },
    { email: "person@example.com\r\nBcc:other@example.com" },
  ])
    assert.throws(() => cleanEnquiry(enquiry(extra)), JSON.stringify(extra));
});

test("enquiry and form IDs require UUIDv4 and origins have no admin or arbitrary values", () => {
  for (const key of ["id", "form_id"])
    for (const value of [
      "invalid",
      null,
      "00000000-0000-1000-8000-000000000001",
    ])
      assert.throws(
        () => cleanEnquiry(enquiry({ [key]: value })),
        `${key}: ${value}`,
      );
  for (const origin of ["admin", "", null])
    assert.throws(() => cleanEnquiry(enquiry({ origin })));
});

for (const key of ["id", "form_id"]) {
  test(`enquiry ${key} refuses a coercible array`, () => {
    assert.throws(() => cleanEnquiry(enquiry({ [key]: [uuid(1)] })));
  });
}
test("enquiry origin refuses a coercible array", () => {
  assert.throws(() => cleanEnquiry(enquiry({ origin: ["homepage"] })));
});

test("invalid tracking identifier types cannot be promoted to a trusted attribution link", () => {
  const result = cleanEnquiry(
    enquiry({
      tracking: {
        visitor_id: [uuid(1)],
        session_id: [uuid(2)],
        quiz_id: [uuid(6)],
      },
    }),
  );
  assert.equal(result.tracking, null);
});
