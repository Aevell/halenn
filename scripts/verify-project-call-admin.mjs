import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as model from '../app/admin/lib/project-calls.ts';

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const code = compile('../app/api/admin/project-calls/route.ts');
const helpersCode = compile('../app/lib/website-server.ts');
const bookingId = '01234567-1234-4123-8123-0123456789ab';
const leadId = '01234567-1234-4123-8123-0123456789ac';
const call = {
  id: bookingId, attendeeName: 'Example customer', attendeeEmail: 'customer@example.com',
  startsAt: '2026-11-15T14:00:00Z', endsAt: '2026-11-15T14:30:00Z',
  status: 'confirmed', bookedAt: '2026-11-11T12:00:00Z', preferredLanguage: 'nl',
};
const status = { enabled: true, configured: true, lastSyncAt: '2026-11-11T12:00:00Z', unmatched: [call], upcoming: [] };

function harness({ signedIn = true, founder = true, password = false, rpcError, payload = status } = {}) {
  const calls = [];
  const db = {
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'founder' } : null } }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'halenn_is_founder') return { data: founder };
      if (name === 'halenn_needs_password') return { data: password };
      return rpcError ? { error: rpcError } : { data: name === 'halenn_link_project_call' ? { linked: true } : payload };
    },
  };
  const helpers = {};
  vm.runInNewContext(helpersCode, { exports: helpers, URL, TextDecoder, require: () => ({ database: async () => db }) });
  const api = {};
  vm.runInNewContext(code, {
    exports: api,
    require(path) {
      if (path === 'next/server') return { NextResponse: { json: (value, init) => new Response(JSON.stringify(value), { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } }) } };
      if (path.endsWith('/db')) return { database: async () => db };
      if (path.endsWith('/project-calls')) return model;
      return helpers;
    },
  });
  return { api, calls };
}
function request(body, origin = 'https://halenn.com') {
  const req = new Request('https://halenn.com/api/admin/project-calls', {
    method: 'POST', headers: { origin, host: 'halenn.com', 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  req.nextUrl = new URL(req.url);
  return req;
}

test('appointment status requires a signed-in founder with completed account setup', async () => {
  for (const [options, expected] of [[{ signedIn: false }, 401], [{ founder: false }, 403], [{ password: true }, 403]]) {
    const h = harness(options), result = await h.api.GET();
    assert.equal(result.status, expected);
    assert.equal(h.calls.some(c => c.name === 'halenn_project_call_status'), false);
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
    assert.equal((await result.text()).includes(call.attendeeEmail), false);
  }
});

test('status whitelists appointment fields and tolerates staged RPC rollout', async () => {
  const h = harness({ payload: { ...status, secret: 'private', unmatched: [{ ...call, event_id: 'private-event' }] } });
  const result = await h.api.GET(), data = await result.json();
  assert.equal(data.available, true);
  assert.equal(data.unmatched[0].attendeeEmail, call.attendeeEmail);
  assert.equal('secret' in data, false);
  assert.equal('event_id' in data.unmatched[0], false);
  for (const code of ['PGRST202', '42883']) {
    const unavailable = await harness({ rpcError: { code } }).api.GET();
    assert.equal(unavailable.status, 200);
    assert.deepEqual(await unavailable.json(), { available: false });
  }
  const failed = await harness({ rpcError: { code: 'XX000', message: 'private provider detail' } }).api.GET();
  assert.equal(failed.status, 503);
  assert.equal((await failed.text()).includes('private provider detail'), false);
});

test('manual linking rejects cross-origin, unauthorised, malformed and oversized requests without mutation', async () => {
  for (const [options, req, expected] of [
    [{}, request({ bookingId, leadId }, 'https://other.example'), 403],
    [{ signedIn: false }, request({ bookingId, leadId }), 401],
    [{ founder: false }, request({ bookingId, leadId }), 403],
    [{ password: true }, request({ bookingId, leadId }), 403],
    [{}, request({ bookingId, leadId: '' }), 400],
    [{}, request({ bookingId, leadId, attendeeEmail: 'forged@example.com' }), 400],
    [{}, request('{malformed'), 400],
    [{}, request({ bookingId, leadId, extra: 'x'.repeat(2000) }), 400],
  ]) {
    const h = harness(options), result = await h.api.POST(req);
    assert.equal(result.status, expected);
    assert.equal(h.calls.some(c => c.name === 'halenn_link_project_call'), false);
  }
});

test('valid linking delegates only the two IDs and conflicting links get a recoverable response', async () => {
  const h = harness(), result = await h.api.POST(request({ bookingId, leadId }));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { linked: true });
  const write = h.calls.find(c => c.name === 'halenn_link_project_call');
  assert.deepEqual(JSON.parse(JSON.stringify(write.args)), { booking_id: bookingId, lead_id: leadId });
  for (const code of ['P0001', 'P0002', '23505']) {
    const result = await harness({ rpcError: { code } }).api.POST(request({ bookingId, leadId }));
    assert.equal(result.status, 409);
    assert.match((await result.json()).error, /Refresh/);
  }
});

test('unknown languages require review and upcoming calls exclude cancelled and past appointments', () => {
  const parsed = model.parseProjectCallStatus({ ...status, unmatched: [{ ...call, preferredLanguage: 'fr' }] });
  assert.equal(parsed.unmatched[0].preferredLanguage, null);
  assert.match(model.projectCallLanguage(null), /Check language/);
  assert.equal(model.projectCallLanguage('nl'), 'Dutch · Dave');
  assert.equal(model.projectCallLanguage('en'), 'English · Dave or Terence');
  const rows = Array.from({ length: 7 }, (_, index) => ({ ...call, leadId, startsAt: `2026-11-${15 + index}T14:00:00Z` }));
  const upcoming = model.upcomingProjectCalls({ ...status, upcoming: [
    ...rows.reverse(), { ...call, leadId, status: 'cancelled' }, { ...call, leadId, startsAt: '2026-11-01T12:00:00Z' },
  ] }, Date.parse('2026-11-11T12:00:00Z'));
  assert.equal(upcoming.length, 5);
  assert.equal(upcoming[0].startsAt, '2026-11-15T14:00:00Z');
  assert.ok(upcoming.every(row => row.status === 'confirmed'));
  assert.equal(model.parseProjectCallStatus({ ...status, unmatched: [{ ...call, startsAt: 'invalid' }] }), null);
  assert.equal(model.parseProjectCallStatus({ ...status, unmatched: [{ ...call, attendeeName: null, attendeeEmail: null }] }).unmatched[0].attendeeEmail, '');
  assert.deepEqual(model.parseProjectCallStatus({ ...status, upcoming: undefined }).upcoming, []);
});
