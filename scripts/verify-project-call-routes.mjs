import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as links from '../app/lib/project-call-links.ts';
import * as websiteModel from '../app/lib/website-model.ts';

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const code = {
  events: compile('../app/api/project-call-events/route.ts'),
  redirect: compile('../app/project-call/[token]/route.ts'),
  enquiry: compile('../app/api/enquiries/route.ts'),
  helpers: compile('../app/lib/website-server.ts'),
};
const now = 1_800_000_000_000;
const sentAt = String(now / 1000);
const signingSecret = 'offline-test-secret';
const token = '01234567-1234-4123-8123-0123456789ab';
const invitation = '/project-call/' + token;
const googleUrl = 'https://calendar.google.com/calendar/appointments/schedules/Example_123-abc?gv=true';
const sign = (body, timestamp = sentAt) => createHmac('sha256', signingSecret).update(timestamp + '.').update(body).digest('hex');

function harness(kind, { consent = false, rpc = async () => ({ data: null }) } = {}) {
  const calls = [];
  const db = { rpc: async (name, args) => { calls.push({ name, args }); return rpc(name, args, calls.length); } };
  const helpers = {};
  vm.runInNewContext(code.helpers, {
    exports: helpers, URL, TextDecoder,
    require(path) {
      if (path.includes('consent-model')) return { CONSENT_COOKIE: 'consent', parseConsent: () => ({ optional: consent }) };
      return { database: async () => db };
    },
  });
  const api = {};
  vm.runInNewContext(code[kind], {
    exports: api, URL, TextDecoder, Date: { now: () => now }, Error,
    require(path) {
      if (path === 'next/server') return { NextResponse: {
        json: (value, init = {}) => new Response(JSON.stringify(value), { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } }),
        redirect: (location, init = {}) => new Response(null, { ...init, headers: { ...init.headers, Location: String(location) } }),
      } };
      if (path.endsWith('/project-call-links')) return links;
      if (path.endsWith('/website-model')) return websiteModel;
      return helpers;
    },
  });
  return { api, calls };
}

function eventRequest(body = '{}', overrides = {}, chunkBytes) {
  const bytes = body === null ? null : typeof body === 'string' ? Buffer.from(body) : body;
  const headers = new Headers({
    'x-halenn-signature': sign(bytes ?? ''), 'x-halenn-timestamp': sentAt, 'content-type': 'application/json',
  });
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) headers.delete(key);
    else headers.set(key, value);
  }
  let content = bytes;
  if (chunkBytes && bytes) content = new ReadableStream({
    start(controller) {
      for (let index = 0; index < bytes.length; index += chunkBytes) controller.enqueue(bytes.subarray(index, index + chunkBytes));
      controller.close();
    },
  });
  return new Request('https://halenn.com/api/project-call-events', { method: 'POST', headers, body: content, duplex: 'half' });
}
const payload = {
  id: token, form_id: '01234567-1234-4123-8123-0123456789ac',
  name: 'Example customer', email: 'customer@example.com', company: 'Example business', message: 'Please discuss our website.', origin: 'homepage',
  tracking: { visitor_id: '01234567-1234-4123-8123-0123456789ad', session_id: '01234567-1234-4123-8123-0123456789ae' },
};
function enquiryRequest(body = payload, origin = 'https://halenn.com') {
  const request = new Request('https://halenn.com/api/enquiries', {
    method: 'POST', headers: { origin, host: 'halenn.com', 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  request.nextUrl = new URL(request.url);
  request.cookies = { get: () => ({ value: 'stubbed-consent' }) };
  return request;
}

test('webhook forwards exact signed UTF-8, whitespace and BOM across split multibyte chunks', async () => {
  for (const raw of [' { "name": "Zoë 💬", "note":"café\\nline" }\r\n', '\uFEFF{"events":[]}']) {
    const h = harness('events', { rpc: async (name, args) => {
      assert.equal(name, 'halenn_receive_project_call_events');
      assert.equal(args.raw_body, raw);
      assert.equal(args.signature, sign(raw));
      assert.equal(args.sent_at, sentAt);
      assert.equal(sign(args.raw_body, args.sent_at), args.signature);
      return { data: { accepted: true, providerPrivate: 'not returned' } };
    } });
    const result = await h.api.POST(eventRequest(raw, {}, 1));
    assert.equal(result.status, 200);
    assert.equal(h.calls.length, 1);
    assert.deepEqual(await result.json(), { accepted: true });
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
  }
});

test('webhook validates header freshness, signature syntax and content type before database access', async () => {
  for (const [headers, status] of [
    [{ 'x-halenn-signature': null }, 401],
    [{ 'x-halenn-signature': 'a'.repeat(65) }, 401],
    [{ 'x-halenn-signature': 'A'.repeat(64) }, 401],
    [{ 'x-halenn-timestamp': 'invalid' }, 401],
    [{ 'x-halenn-timestamp': String(Number(sentAt) - 301) }, 401],
    [{ 'x-halenn-timestamp': String(Number(sentAt) + 301) }, 401],
    [{ 'content-type': null }, 415],
    [{ 'content-type': 'text/plain' }, 415],
    [{ 'content-length': String(100_001) }, 413],
  ]) {
    const h = harness('events'), result = await h.api.POST(eventRequest('{}', headers));
    assert.equal(result.status, status);
    assert.equal(h.calls.length, 0);
  }
  const h = harness('events', { rpc: async () => ({ data: { accepted: true } }) });
  assert.equal((await h.api.POST(eventRequest('{}', { 'content-type': 'Application/JSON; charset=UTF-8' }))).status, 200);
});

test('webhook bounds streamed bytes, rejects malformed UTF-8 and missing bodies', async () => {
  for (const [body, status, chunkSize] of [
    [Buffer.alloc(100_001, 'a'), 413, 1024],
    ['💬'.repeat(25001), 413, 4096],
    [Buffer.from([0xc3, 0x28]), 400, 1],
    [null, 400, undefined],
  ]) {
    const h = harness('events'), result = await h.api.POST(eventRequest(body, {}, chunkSize));
    assert.equal(result.status, status);
    assert.equal(h.calls.length, 0);
  }
  const h = harness('events', { rpc: async () => ({ data: { accepted: true } }) });
  assert.equal((await h.api.POST(eventRequest(Buffer.alloc(100_000, 'a'), {}, 1024))).status, 200);
});

test('webhook maps database authentication, validation and availability failures without leaking details', async () => {
  for (const [code, status] of [['28000', 401], ['22023', 400], ['55000', 503], ['PGRST202', 503], ['XX000', 503]]) {
    const h = harness('events', { rpc: async () => ({ error: { code, message: 'secret provider diagnostic' } }) });
    const result = await h.api.POST(eventRequest());
    assert.equal(result.status, status);
    assert.equal((await result.text()).includes('secret provider diagnostic'), false);
    assert.equal(h.calls.length, 1);
  }
  for (const rpc of [async () => ({ data: { accepted: false } }), async () => ({ data: null }), async () => { throw Error('private transport error'); }]) {
    const result = await harness('events', { rpc }).api.POST(eventRequest());
    assert.equal(result.status, 503);
  }
});

test('booking URL and token allowlists reject open redirects, contact data, whitespace and path decoration', () => {
  for (const url of [googleUrl, 'https://calendar.app.google/Example_123-abc']) assert.equal(links.googleProjectCallUrl(url), url);
  for (const url of [
    'http://calendar.app.google/example', '//calendar.app.google/example', 'https://calendar.app.google.evil.example/example',
    'https://calendar.app.google@example.com/example', 'https://calendar.app.google/example?email=customer@example.com',
    'https://calendar.app.google/example#contact', googleUrl + '\n', ' ' + googleUrl, null, { url: googleUrl },
  ]) assert.equal(links.googleProjectCallUrl(url), null);
  assert.equal(links.projectCallPath(invitation), invitation);
  assert.equal(links.projectCallToken(token.toUpperCase()), true);
  for (const value of [invitation + '\n', invitation + '?email=customer@example.com', 'https://halenn.com' + invitation, '//evil.example' + invitation, invitation + '/extra'])
    assert.equal(links.projectCallPath(value), null);
  for (const value of [token + '\n', token + '?next=https://evil.example', '../' + token, '']) assert.equal(links.projectCallToken(value), false);
});

test('invitation redirect sends only the allowed calendar URL and no enquiry identity or incoming query', async () => {
  const h = harness('redirect', { rpc: async () => ({ data: googleUrl }) });
  const request = new Request('https://halenn.com' + invitation + '?email=customer@example.com&next=https://evil.example');
  const result = await h.api.GET(request, { params: Promise.resolve({ token }) });
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('location'), googleUrl);
  assert.equal(result.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.equal(result.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)), [{ name: 'halenn_project_call_destination', args: { token } }]);
  assert.equal((await result.text()).includes('customer@example.com'), false);
});

test('missing, invalid or unavailable invitations safely fall back without carrying token or query', async () => {
  for (const [candidate, rpc] of [
    ['not-a-token', async () => { throw Error('must not be called'); }],
    [token + '\n', async () => { throw Error('must not be called'); }],
    [token, async () => ({ data: null })],
    [token, async () => ({ data: 'https://evil.example/?email=customer@example.com' })],
    [token, async () => ({ error: { code: 'PGRST202', message: 'private' } })],
    [token, async () => { throw Error('private transport'); }],
  ]) {
    const h = harness('redirect', { rpc });
    const result = await h.api.GET(new Request('https://halenn.com' + invitation + '?email=customer@example.com'), { params: Promise.resolve({ token: candidate }) });
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), 'https://halenn.com/project-call');
    if (!links.projectCallToken(candidate)) assert.equal(h.calls.length, 0);
  }
});

test('enquiry receipt exposes only a local invitation and respects consent before the new RPC', async () => {
  for (const consent of [false, true]) {
    const h = harness('enquiry', { consent, rpc: async (name, args) => {
      assert.equal(name, 'halenn_submit_website_enquiry_with_booking');
      assert.equal(args.payload.email, payload.email);
      assert.deepEqual(JSON.parse(JSON.stringify(args.payload.tracking)), consent ? payload.tracking : null);
      return { data: { result: 'received', bookingUrl: invitation, email: payload.email } };
    } });
    const result = await h.api.POST(enquiryRequest());
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { ok: true, bookingUrl: invitation });
    assert.equal(h.calls.length, 1);
  }
  const h = harness('enquiry', { rpc: async () => ({ data: { result: 'received', bookingUrl: 'https://evil.example/?email=customer@example.com' } }) });
  assert.deepEqual(await (await h.api.POST(enquiryRequest())).json(), { ok: true, bookingUrl: null });
});

test('enquiries fall back to the existing RPC only when the new function is missing', async () => {
  for (const code of ['PGRST202', '42883']) {
    const h = harness('enquiry', { rpc: async (_name, _args, count) => count === 1 ? { error: { code } } : { data: 'received' } });
    const result = await h.api.POST(enquiryRequest());
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { ok: true, bookingUrl: null });
    assert.deepEqual(h.calls.map(call => call.name), ['halenn_submit_website_enquiry_with_booking', 'halenn_submit_website_enquiry']);
    assert.deepEqual(h.calls[0].args, h.calls[1].args);
  }
  for (const code of ['57014', '08006', '42501', 'P0001', 'XX000']) {
    const h = harness('enquiry', { rpc: async () => ({ error: { code, message: 'private failure detail' } }) });
    const result = await h.api.POST(enquiryRequest());
    assert.equal(result.status, 503);
    assert.equal(h.calls.length, 1);
    assert.equal((await result.text()).includes('private failure detail'), false);
  }
  const h = harness('enquiry', { rpc: async () => { throw Error('private transport error'); } });
  const result = await h.api.POST(enquiryRequest());
  assert.equal(result.status, 503);
  assert.equal(h.calls.length, 1);
  const body = await result.json();
  assert.match(body.error, /couldn’t confirm receipt/);
  assert.equal(body.error.includes('private transport error'), false);
});

test('enquiry outcomes, validation and honeypot never manufacture a booking invitation', async () => {
  for (const [outcome, expected] of [['limited', 429], ['conflict', 409], ['unknown', 503]]) {
    const h = harness('enquiry', { rpc: async () => ({ data: { result: outcome, bookingUrl: invitation } }) });
    const result = await h.api.POST(enquiryRequest());
    assert.equal(result.status, expected);
    assert.equal('bookingUrl' in await result.json(), false);
    assert.equal(h.calls.length, 1);
  }
  for (const [body, origin, expected] of [[payload, 'https://evil.example', 403], [{ ...payload, email: 'invalid' }, 'https://halenn.com', 400], [{ ...payload, website: 'bot trap' }, 'https://halenn.com', 200]]) {
    const h = harness('enquiry'), result = await h.api.POST(enquiryRequest(body, origin));
    assert.equal(result.status, expected);
    assert.equal(h.calls.length, 0);
    assert.equal('bookingUrl' in await result.json(), false);
  }
});
