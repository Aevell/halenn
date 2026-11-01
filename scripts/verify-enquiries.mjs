import test from "node:test";
import assert from "node:assert/strict";
import { handleEnquiry, createAttemptLimiter } from "../app/lib/enquiries.ts";
import { buildBrief, defaultSelection } from "../app/components/pricing/catalog.ts";

const configured = { RESEND_API_KEY: "test-key-not-a-real-credential", ENQUIRY_FROM_EMAIL: "enquiries@send.halenn.com" };
const payload = {
  name: "Example Customer", email: "customer@example.com", message: "I would like help with appointment reminders.",
  context: "No website purchase selected.", website: "", requestId: "fed80a55-e231-4c68-a2d0-2ca8c84b1d4b",
};
function request(data = payload, headers = {}, raw) {
  return new Request("https://halenn.com/api/enquiries", {
    method: "POST", headers: { origin: "https://halenn.com", "content-type": "application/json", ...headers },
    body: raw ?? JSON.stringify(data),
  });
}
const allow = () => true;
const forbiddenFetch = async () => { throw new Error("Delivery must not be attempted"); };

test("valid enquiries use a fixed recipient and a validated reply address", async () => {
  let sent;
  const response = await handleEnquiry(request({ ...payload, to: "attacker@example.com" }), configured, async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.headers.Authorization, `Bearer ${configured.RESEND_API_KEY}`);
    assert.equal(options.headers["Idempotency-Key"], `halenn-enquiry/${payload.requestId}`);
    sent = JSON.parse(options.body);
    return Response.json({ id: "simulated-provider-id" });
  }, allow);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(sent.to, ["contact@halenn.com"]);
  assert.equal(sent.reply_to, payload.email);
  assert.match(sent.text, /appointment reminders/);
  assert.match(sent.text, /No website purchase selected/);
  assert.equal(sent.html, undefined);
});

test("pricing enquiries retain services, custom requirements and estimated costs", async () => {
  const selection = { ...defaultSelection, services: ["web", "app", "automation"], webType: "webshop", appPlatform: "both", extras: ["custom"], customAutomation: true, automationPackages: ["reminders"], care: "plus" };
  const context = buildBrief(selection, { web: "A customer portal", automation: "Route incoming orders" });
  const response = await handleEnquiry(request({ ...payload, context }), configured, async (_, options) => {
    const sent = JSON.parse(options.body);
    assert.ok(sent.text.includes(context));
    for (const part of ["Webshop", "iOS", "Appointment reminders", "A customer portal", "Route incoming orders", "Care Plus"]) assert.ok(sent.text.includes(part), part);
    return Response.json({ id: "pricing-test" });
  }, allow);
  assert.equal(response.status, 200);
});

test("missing delivery configuration cannot report success", async () => {
  for (const environment of [{}, { RESEND_API_KEY: "unused" }, { ENQUIRY_FROM_EMAIL: "test@example.com" }]) {
    const result = await handleEnquiry(request(), environment, forbiddenFetch, allow);
    assert.equal(result.status, 503);
    assert.equal((await result.json()).ok, undefined);
  }
});

test("invalid inputs and filled honeypots do not reach the sending service", async () => {
  for (const patch of [
    { name: " " }, { name: "n".repeat(101) }, { name: "Name\r\nBcc: other@example.com" },
    { email: "not-an-address" }, { email: "a@example.com\nBcc: x@example.com" },
    { message: "short" }, { message: "x".repeat(3001) }, { context: "x".repeat(18001) },
    { requestId: "not-a-uuid" }, { website: "https://spam.invalid" }, { message: ["invalid"] },
  ]) {
    const response = await handleEnquiry(request({ ...payload, ...patch }), configured, forbiddenFetch, allow);
    assert.equal(response.status, 400, JSON.stringify(Object.keys(patch)));
  }
});

test("malformed JSON, wrong content types and foreign origins are rejected", async () => {
  assert.equal((await handleEnquiry(request(payload, {}, "{"), configured, forbiddenFetch, allow)).status, 400);
  assert.equal((await handleEnquiry(request(payload, { "content-type": "text/plain" }), configured, forbiddenFetch, allow)).status, 415);
  assert.equal((await handleEnquiry(request(payload, { origin: "https://unrelated.invalid" }), configured, forbiddenFetch, allow)).status, 403);
});

test("declared and streamed oversized requests are bounded", async () => {
  assert.equal((await handleEnquiry(request(payload, { "content-length": "30001" }), configured, forbiddenFetch, allow)).status, 413);
  assert.equal((await handleEnquiry(request(payload, {}, "x".repeat(30001)), configured, forbiddenFetch, allow)).status, 413);
});

test("provider rejection, outage, malformed acceptance and timeout do not report success or leak secrets", async () => {
  for (const send of [
    async () => Response.json({ message: "private provider error" }, { status: 403 }),
    async () => { throw new Error(configured.RESEND_API_KEY); },
    async () => Response.json({}),
    async () => new Response("upstream gateway"),
    async () => { throw new DOMException("timed out", "TimeoutError"); },
  ]) {
    const result = await handleEnquiry(request(), configured, send, allow);
    assert.equal(result.status, 502);
    const text = await result.text();
    assert.ok(!text.includes(configured.RESEND_API_KEY));
    assert.ok(!text.includes("private provider error"));
    assert.ok(!text.includes(payload.message));
  }
});

test("unchanged retries forward the same provider idempotency key", async () => {
  const keys = [];
  const send = async (_, options) => { keys.push(options.headers["Idempotency-Key"]); return Response.json({ id: "same-message" }); };
  await handleEnquiry(request(), configured, send, allow);
  await handleEnquiry(request(), configured, send, allow);
  assert.equal(keys[0], keys[1]);
});

test("attempt limit expires and rejects excess attempts before sending", async () => {
  const limited = createAttemptLimiter();
  for (let i = 0; i < 5; i++) assert.equal(limited("example-hash", 1000), true);
  assert.equal(limited("example-hash", 1001), false);
  assert.equal(limited("example-hash", 601001), true);
  const response = await handleEnquiry(request(), configured, forbiddenFetch, () => false);
  assert.equal(response.status, 429);
});

test("Unicode names and message text remain intact without HTML interpretation", async () => {
  const response = await handleEnquiry(request({ ...payload, name: "Zoë de Vries", message: "Een vraag over <script>alert('example')</script> & afspraken." }), configured, async (_, options) => {
    const data = JSON.parse(options.body);
    assert.ok(data.text.includes("Zoë de Vries"));
    assert.ok(data.text.includes("<script>"));
    assert.equal(data.html, undefined);
    return Response.json({ id: "unicode-test" });
  }, allow);
  assert.equal(response.status, 200);
});
