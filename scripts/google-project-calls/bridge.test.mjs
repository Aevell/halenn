import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./Code.gs', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context);
const bridge = vm.runInContext('HalennProjectCalls', context);
const plain = (value) => JSON.parse(JSON.stringify(value));
const calendarId = 'aevellgroup@gmail.com';
const now = Date.parse('2026-11-11T12:00:00.000Z');
const secret = 'a-local-test-secret-that-is-never-used-outside-these-tests';

function event(overrides = {}) {
  return {
    id: 'halenncall123', status: 'confirmed',
    created: '2026-11-10T10:00:00.000Z', updated: '2026-11-10T10:00:00.000Z',
    summary: 'Halenn · Project call (Example guest)',
    description: '<p>A 30-minute conversation about your business, what you’d like to achieve and how Halenn could help.</p>',
    organizer: { email: calendarId },
    start: { dateTime: '2026-11-13T10:00:00+01:00' },
    end: { dateTime: '2026-11-13T10:30:00+01:00' },
    attendees: [{ email: calendarId, self: true }, { email: '  Guest@Example.com  ', displayName: ' Example Guest ' }],
    ...overrides,
  };
}

function harness(overrides = {}) {
  const calls = []; const saved = []; const delays = [];
  const deps = {
    now: () => now,
    list: () => ({ items: [], nextSyncToken: 'next-token' }),
    get: () => { throw new Error('404 Not Found'); },
    fetch: (url, options) => { calls.push({ url, ...plain(options) }); return { getResponseCode: () => 200 }; },
    hmac: (value, key) => [...createHmac('sha256', key).update(value).digest()],
    secret,
    sleep: (delay) => delays.push(delay),
    save: (state) => saved.push(plain(state)),
    ...overrides,
  };
  return { deps, calls, saved, delays };
}

test('only a verified 30-minute owner-created project call leaves the filter', () => {
  const selected = plain(bridge.selectEvent(event(), {}));
  assert.deepEqual(Object.keys(selected).sort(), ['attendeeEmail', 'attendeeName', 'created', 'end', 'id', 'start', 'status', 'updated']);
  assert.equal(selected.attendeeEmail, 'guest@example.com');
  assert.equal(selected.attendeeName, 'Example Guest');
  assert.equal(selected.start, '2026-11-13T09:00:00.000Z');
  assert.equal('description' in selected, false);
  assert.equal('organizer' in selected, false);
  assert.equal('summary' in selected, false);

  for (const other of [
    { organizer: { email: 'stranger@example.com' } },
    { summary: 'Halenn · Project callback' },
    { summary: 'Personal appointment' },
    { description: 'Unrelated private notes' },
    { end: { dateTime: '2026-11-13T10:45:00+01:00' } },
    { start: { date: '2026-11-13' } },
    { status: 'tentative' },
    { created: 'invalid' },
  ]) assert.equal(bridge.selectEvent(event(other), {}), null);
});

test('verified bookings with missing or ambiguous guests are retained without guessing identity', () => {
  for (const attendees of [[], [{ email: calendarId, self: true }], [{ email: 'a@example.com' }, { email: 'b@example.com' }], [{ email: 'a..b@example.com' }], [{ email: 'guest@example.com' }, { email: 'unknown-address' }]]) {
    const selected = bridge.selectEvent(event({ attendees }), {});
    assert.equal(selected.status, 'confirmed');
    assert.equal(selected.attendeeEmail, null);
    assert.equal(selected.attendeeName, null);
  }
});

test('guest names obey the database bound without control characters or split surrogate pairs', () => {
  const selected = bridge.selectEvent(event({ attendees: [{ email: 'guest@example.com', displayName: `\u0000${'😀'.repeat(179)}☕extra` }] }), {});
  assert.equal(Array.from(selected.attendeeName).length, 180);
  assert.equal(selected.attendeeName.includes('\u0000'), false);
  assert.equal(selected.attendeeName.endsWith('☕'), true);
});

test('optional language is narrow; unrelated free text is not sent', () => {
  assert.equal(bridge.selectEvent(event(), {}).preferredLanguage, undefined);
  assert.equal(bridge.selectEvent(event({ description: `${event().description}<p>Preferred language: Dutch</p>` }), {}).preferredLanguage, 'nl');
  assert.equal(bridge.selectEvent(event({ description: `${event().description}<b>Preferred language</b><br>English` }), {}).preferredLanguage, 'en');
  assert.equal(bridge.selectEvent(event({ description: `${event().description}<b>Preferred language (Dutch or English)</b><br>English` }), {}).preferredLanguage, 'en');
  assert.equal(bridge.selectEvent(event({ description: `${event().description}<b>Preferred language (Dutch or English)</b><br>Dutch` }), {}).preferredLanguage, 'nl');
  assert.equal(bridge.selectEvent(event({ description: `${event().description} Preferred language: Dutch Preferred language: English` }), {}).preferredLanguage, undefined);
});

test('known tombstones omit missing provider timestamps and unknown deletions are ignored', () => {
  const known = { halenncall123: { status: 'confirmed', updated: event().updated } };
  assert.deepEqual(plain(bridge.selectEvent({ id: 'halenncall123', status: 'cancelled' }, known)), { id: 'halenncall123', status: 'cancelled' });
  assert.equal(bridge.selectEvent({ id: 'unknown', status: 'cancelled' }, known), null);
  assert.equal(bridge.selectEvent({ id: 'constructor', status: 'cancelled' }, known), null);
  assert.equal(bridge.selectEvent({ id: 'halenncall123', status: 'cancelled', updated: '2026-11-01T10:00:00Z' }, known), null);
  assert.equal(bridge.selectEvent({ id: 'halenncall123', status: 'cancelled', updated: event().updated }, known).status, 'cancelled');
  const cancelled = { halenncall123: { status: 'cancelled', updated: '2026-11-11T10:00:00Z' } };
  assert.equal(bridge.selectEvent(event(), cancelled), null);
  assert.equal(bridge.selectEvent({ id: 'halenncall123', status: 'cancelled' }, cancelled), null);
});

test('paginates incremental results and signs exact minimal batches of 50', () => {
  const requests = [];
  const { deps, calls, saved } = harness({ list: (id, options) => {
    requests.push({ id, ...plain(options) });
    if (!options.pageToken) return { items: Array.from({ length: 51 }, (_, i) => event({ id: `call${i}` })), nextPageToken: 'page-2' };
    return { items: [event({ id: 'private-event', summary: 'Private dentist appointment' })], nextSyncToken: 'complete-token' };
  } });
  const result = bridge.runSync({ syncToken: 'old-token', known: {} }, deps);
  assert.equal(result.sent, 51);
  assert.deepEqual(calls.map((call) => JSON.parse(call.payload).events.length), [50, 1]);
  assert.equal(requests[0].syncToken, 'old-token');
  assert.equal(requests[1].pageToken, 'page-2');
  assert.equal(saved[0].syncToken, 'complete-token');
  assert.equal(saved[0].known['private-event'], undefined);
  for (const call of calls) {
    assert.equal(call.url, 'https://halenn.com/api/project-call-events');
    assert.equal(call.headers['X-Halenn-Timestamp'], String(now / 1000));
    assert.equal(call.headers['X-Halenn-Signature'], createHmac('sha256', secret).update(`${call.headers['X-Halenn-Timestamp']}.${call.payload}`).digest('hex'));
    assert.deepEqual(Object.keys(JSON.parse(call.payload)).sort(), ['calendarId', 'events', 'version']);
    assert.equal(call.followRedirects, false);
  }
});

test('transport and transient retries reuse identical bytes, timestamp and signature', () => {
  const sent = []; let clock = now;
  const { deps, saved, delays } = harness({
    now: () => { clock += 1000; return clock; },
    list: () => ({ items: [event()], nextSyncToken: 'next' }),
    fetch: (_url, options) => {
      sent.push(plain(options));
      if (sent.length === 1) throw new Error('Network unavailable');
      return { getResponseCode: () => sent.length === 2 ? 429 : 200 };
    },
  });
  bridge.runSync({ known: {} }, deps);
  assert.equal(sent.length, 3);
  assert.deepEqual(sent[0], sent[1]); assert.deepEqual(sent[1], sent[2]);
  assert.deepEqual(delays, [500, 1000]);
  assert.equal(saved.length, 1);
});

test('large Unicode payloads respect the byte bound as well as the 50-event bound', () => {
  const attendee = { email: `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.com`, displayName: '😀'.repeat(180) };
  const items = Array.from({ length: 50 }, (_, index) => event({ id: String(index).padStart(5, '0') + 'a'.repeat(1019), attendees: [attendee] }));
  const { deps, calls } = harness({ list: () => ({ items, nextSyncToken: 'next' }) });
  bridge.runSync({ syncToken: 'old', known: {} }, deps);
  assert.ok(calls.length > 1);
  assert.equal(calls.reduce((sum, call) => sum + JSON.parse(call.payload).events.length, 0), 50);
  for (const call of calls) {
    assert.ok(Buffer.byteLength(call.payload, 'utf8') <= 80000);
    assert.ok(JSON.parse(call.payload).events.length <= 50);
  }
});

test('empty and filtered-only successful scans send a signed empty heartbeat before saving state', () => {
  for (const items of [[], [event({ summary: 'Private dentist appointment' })]]) {
    const order = [];
    const { deps, calls } = harness({
      list: () => ({ items, nextSyncToken: 'heartbeat-token' }),
      save: () => order.push('save'),
    });
    const originalFetch = deps.fetch;
    deps.fetch = (url, options) => { order.push('post'); return originalFetch(url, options); };
    const result = bridge.runSync({ syncToken: 'previous-token', known: {} }, deps);
    assert.equal(result.sent, 0);
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(calls[0].payload), { version: 1, calendarId, events: [] });
    assert.equal(calls[0].headers['X-Halenn-Signature'], createHmac('sha256', secret)
      .update(`${calls[0].headers['X-Halenn-Timestamp']}.${calls[0].payload}`).digest('hex'));
    assert.deepEqual(order, ['post', 'save']);
  }
});

test('failed empty heartbeat cannot advance the sync token or claim local success', () => {
  const { deps, saved, delays } = harness({ fetch: () => ({ getResponseCode: () => 503 }) });
  assert.throws(() => bridge.runSync({ syncToken: 'old', known: {} }, deps), /not accept/);
  assert.equal(saved.length, 0);
  assert.deepEqual(delays, [500, 1000]);
});

test('rejected or incomplete batches never advance state; permanent rejection is not retried', () => {
  for (const code of [400, 401, 403, 302, 500]) {
    let attempts = 0;
    const { deps, saved } = harness({
      list: () => ({ items: [event()], nextSyncToken: 'next' }),
      fetch: () => { attempts += 1; return { getResponseCode: () => code }; },
    });
    assert.throws(() => bridge.runSync({ syncToken: 'old', known: {} }, deps), /not accept/);
    assert.equal(saved.length, 0);
    assert.equal(attempts, code === 500 ? 3 : 1);
  }
  const { deps, calls, saved } = harness({ list: () => ({ items: [event()] }) });
  assert.throws(() => bridge.runSync({ known: {} }, deps), /complete sync token/);
  assert.equal(calls.length, 0); assert.equal(saved.length, 0);
});

test('partial batch acceptance remains safely replayable', () => {
  let request = 0;
  const state = { syncToken: 'old', known: {} };
  const { deps, saved } = harness({
    list: () => ({ items: Array.from({ length: 51 }, (_, i) => event({ id: `call${i}` })), nextSyncToken: 'next' }),
    fetch: () => { request += 1; return { getResponseCode: () => request === 1 ? 200 : 503 }; },
  });
  assert.throws(() => bridge.runSync(state, deps), /not accept/);
  assert.equal(request, 4); assert.equal(saved.length, 0);
  assert.deepEqual(state, { syncToken: 'old', known: {} });
});

test('expired token triggers full resync and resolves a known missing booking by ID', () => {
  const requests = []; const getIds = [];
  const { deps, calls, saved } = harness({
    list: (_id, options) => {
      requests.push(plain(options));
      if (options.syncToken) throw new Error('410 Sync token is no longer valid');
      return { items: [event({ id: 'newcall' })], nextSyncToken: 'reset-token' };
    },
    get: (_id, id) => { getIds.push(id); throw new Error('404 Not Found'); },
  });
  const known = { vanished: { status: 'confirmed', updated: '2024-01-01T00:00:00.000Z' } };
  const result = bridge.runSync({ syncToken: 'expired', known }, deps);
  assert.equal(result.recovered, true);
  assert.equal(requests[1].syncToken, undefined);
  assert.deepEqual(getIds, ['vanished']);
  assert.deepEqual(JSON.parse(calls[0].payload).events.find((row) => row.id === 'vanished'), { id: 'vanished', status: 'cancelled' });
  assert.equal(saved[0].known.vanished.updated, known.vanished.updated);
  assert.equal(saved[0].known.vanished.cancelledAt, new Date(now).toISOString());
});

test('API failure during full reconciliation does not guess cancellation or send anything', () => {
  const { deps, calls, saved } = harness({ get: () => { throw new Error('403 Forbidden'); } });
  assert.throws(() => bridge.runSync({ known: { call123: { status: 'confirmed', updated: event().updated } } }, deps), /403/);
  assert.equal(calls.length, 0); assert.equal(saved.length, 0);
});

test('cache capacity is bounded before posting; active IDs are never silently evicted', () => {
  const known = Object.fromEntries(Array.from({ length: 1501 }, (_, i) => [`call${i}`, { status: 'confirmed', updated: event().updated }]));
  const { deps, calls, saved } = harness();
  assert.throws(() => bridge.runSync({ syncToken: 'old', known }, deps), /safe capacity/);
  assert.equal(calls.length, 0); assert.equal(saved.length, 0);
});

test('chunked storage publishes a complete snapshot and preserves the old one on failure', () => {
  const data = new Map(); let fail = false;
  const properties = {
    getProperty: (key) => data.get(key) ?? null,
    setProperty: (key, value) => { if (fail && key.includes('generation2')) throw new Error('Storage unavailable'); data.set(key, value); },
    getProperties: () => Object.fromEntries(data),
    deleteProperty: (key) => data.delete(key),
  };
  const first = { version: 1, syncToken: 'first', known: { example: { status: 'confirmed', updated: event().updated } } };
  bridge.saveState(properties, first, () => 'generation1');
  assert.deepEqual(plain(bridge.loadState(properties)), first);
  fail = true;
  assert.throws(() => bridge.saveState(properties, { ...first, syncToken: 'second' }, () => 'generation2'), /Storage unavailable/);
  assert.deepEqual(plain(bridge.loadState(properties)), first);
  fail = false;
  bridge.saveState(properties, { ...first, syncToken: 'second' }, () => 'generation3');
  assert.equal(bridge.loadState(properties).syncToken, 'second');
  assert.equal([...data.keys()].some((key) => key.includes('generation1')), false);
});
