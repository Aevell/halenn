import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as links from '../app/lib/project-call-links.ts';
import * as websiteModel from '../app/lib/website-model.ts';
import * as onlineCall from '../app/lib/online-call.ts';

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const code = {
  events: compile('../app/api/project-call-events/route.ts'),
  redirect: compile('../app/project-call/[token]/page.tsx'),
  enquiry: compile('../app/api/enquiries/route.ts'),
  helpers: compile('../app/lib/website-server.ts'),
  online: compile('../app/api/project-call/[token]/route.ts'),
  result: compile('../app/api/project-call-result/route.ts'),
  calendar: compile('../app/project-call/[token]/calendar/route.ts'),
};
const now = 1_800_000_000_000;
const sentAt = String(now / 1000);
const signingSecret = 'offline-test-secret';
const token = '01234567-1234-4123-8123-0123456789ab';
const invitation = '/project-call/' + token;
const googleUrl = 'https://calendar.google.com/calendar/appointments/schedules/Example_123-abc?gv=true';
const sign = (body, timestamp = sentAt) => createHmac('sha256', signingSecret).update(timestamp + '.').update(body).digest('hex');

function harness(kind, { consent = false, rpc = async () => ({ data: null }), fetch = async () => { throw Error('Unexpected provider request'); } } = {}) {
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
    exports: api, URL, TextDecoder, Date: class extends Date { static now() { return now; } }, Error, fetch, AbortSignal,
    require(path) {
      if (path === 'react/jsx-runtime') return { jsx: (type, props) => ({type,props}) };
      if (path === 'next/navigation') return { redirect: url => { throw Object.assign(Error('redirect'), {destination:url}); } };
      if (path.endsWith('/online-call')) return onlineCall;
      if (path === '../page') return { default: 'UnavailablePage' };
      if (path === '../CallBooking') return { default: 'CallBooking' };
      if (path === 'next/server') return { NextResponse: class extends Response {
        static json(value, init = {}) { return new Response(JSON.stringify(value), { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } }); }
        static redirect(location, init = {}) { return new Response(null, { ...init, headers: { ...init.headers, Location: String(location) } }); }
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

test('legacy invitation preserves its allowlisted Google destination until online booking is activated', async () => {
  const h=harness('redirect',{rpc:async name=>({data:name==='halenn_online_call_portal'?null:googleUrl})});
  await assert.rejects(()=>h.api.default({params:Promise.resolve({token})}),e=>e.destination===googleUrl);
  assert.equal(h.api.metadata.referrer,'no-referrer');assert.equal(h.api.metadata.robots.index,false);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)),[{name:'halenn_online_call_portal',args:{token}},{name:'halenn_project_call_destination',args:{token}}]);
});
test('activated invitation renders the Halenn booking flow without redirecting to Google', async()=>{
  const h=harness('redirect',{rpc:async()=>({data:{available:true,status:'new'}})});
  const rendered=await h.api.default({params:Promise.resolve({token})});assert.equal(rendered.type,'CallBooking');assert.equal(rendered.props.token,token);assert.equal(h.calls.length,1);
});
test('invalid invitations and failed database reads use the email fallback without a guessed redirect',async()=>{
  for(const [candidate,rpc] of [
    ['not-a-token',async()=>{throw Error('must not be called');}],
    [token,async()=>({data:null})],
    [token,async()=>({data:'https://evil.example/'})],
    [token,async()=>({error:{code:'XX000'}})],
    [token,async()=>{throw Error('private transport');}],
  ]){const h=harness('redirect',{rpc});const rendered=await h.api.default({params:Promise.resolve({token:candidate})});assert.equal(rendered.type,'UnavailablePage');if(!links.projectCallToken(candidate))assert.equal(h.calls.length,0);}
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

const context = { params: Promise.resolve({ token }) };
const confirmedPortal = { available: true, status: 'confirmed', startsAt: '2026-11-15T12:00:00Z', language: 'en', meetUrl: 'https://meet.google.com/abc-defg-hij' };
test('online booking rejects cross-origin and invalid requests before touching the calendar', async () => {
  for (const [body, origin, expected] of [[{operation:'book'}, 'https://evil.example',403], [{operation:'delete'},'https://halenn.com',400], [{operation:'book',language:12},'https://halenn.com',400], ['x'.repeat(2049),'https://halenn.com',400]]) {
    const h=harness('online'); const response=await h.api.POST(enquiryRequest(body,origin),context);
    assert.equal(response.status,expected); assert.equal(h.calls.length,0);
  }
});
test('online booking exposes only public portal fields and never redirects to an unapproved provider', async () => {
  const h=harness('online',{rpc:async()=>({data:{...confirmedPortal,email:'private@example.test',enquiry:'private message',secret:'private key'}})});
  const response=await h.api.GET(null,context), body=await response.json();
  assert.deepEqual(body,{portal:confirmedPortal}); assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  for(const endpoint of ['https://evil.example/exec','https://script.google.com.evil.example/macros/s/id/exec']) {
    const unsafe=harness('online',{rpc:async()=>({data:{endpoint,envelope:{body:'{}'}}})});
    const r=await unsafe.api.POST(enquiryRequest({operation:'book'}),context);
    assert.equal(r.status,503); assert.equal((await r.json()).checking,true);
  }
});
test('provider completion is signature-verified before returning the stored confirmed appointment', async () => {
  const raw=' { "requestId": "'+token+'", "name": "Zoë 💬" }\n';
  const h=harness('online',{rpc:async(name,args)=>{
    if(name==='halenn_prepare_online_call') return {data:{endpoint:'https://script.google.com/macros/s/test_deployment/exec',envelope:{body:JSON.stringify({requestId:token}),signature:'request-signature',sentAt}}};
    if(name==='halenn_finish_online_call') {assert.equal(args.raw_body,raw);assert.equal(args.signature,'a'.repeat(64));return {data:{accepted:true}};}
    return {data:confirmedPortal};
  },fetch:async(url,options)=>{assert.equal(url,'https://script.google.com/macros/s/test_deployment/exec');assert.equal(options.cache,'no-store');return Response.json({body:raw,signature:'a'.repeat(64),sentAt});}});
  const response=await h.api.POST(enquiryRequest({operation:'book'}),context);
  assert.deepEqual(await response.json(),{portal:confirmedPortal});
  assert.deepEqual(h.calls.map(x=>x.name),['halenn_prepare_online_call','halenn_finish_online_call','halenn_online_call_portal']);
});
test('provider timeouts retain an uncertain booking outcome and forged results never confirm', async () => {
  for(const failAt of ['fetch','signature']) {
    const h=harness('online',{rpc:async(name)=>name==='halenn_prepare_online_call'?{data:{endpoint:'https://script.google.com/macros/s/test/exec',envelope:{body:'{}'}}}:{error:{code:'28000',message:'private diagnostic'}},
      fetch:async()=>{if(failAt==='fetch')throw Error('private diagnostic');return Response.json({body:'{}',signature:'a'.repeat(64),sentAt});}});
    const response=await h.api.POST(enquiryRequest({operation:'book'}),context),body=await response.json();
    assert.equal(response.status,503); assert.equal(body.checking,true);assert.equal(JSON.stringify(body).includes('private diagnostic'),false);
    assert.equal(h.calls.some(x=>x.name==='halenn_online_call_portal'),false);
  }
});
test('signed callback preserves exact UTF-8 and rejects overlong bodies and stale headers', async () => {
  const raw=' {"name":"Zoë 💬"}\r\n';
  const h=harness('result',{rpc:async(name,args)=>{assert.equal(name,'halenn_finish_online_call');assert.equal(args.raw_body,raw);return {data:{accepted:true,private:'hidden'}};}});
  assert.deepEqual(await (await h.api.POST(eventRequest(raw,{},1))).json(),{accepted:true});
  for(const [body,headers,expected] of [['{}',{'x-halenn-timestamp':String(Number(sentAt)-301)},401],['a'.repeat(30001),{},413]]) {
    const invalid=harness('result'),response=await invalid.api.POST(eventRequest(body,headers,1024));
    assert.equal(response.status,expected);assert.equal(invalid.calls.length,0);
  }
});
test('calendar download is available only for verified confirmed bookings and sends no invitation', async () => {
  const h=harness('calendar',{rpc:async()=>({data:confirmedPortal})}),response=await h.api.GET(null,context),ics=await response.text();
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^text\/calendar/);
  assert.match(ics,/DTSTART:20261115T120000Z/);assert.match(ics,/DTEND:20261115T123000Z/);assert.match(ics,/METHOD:PUBLISH/);assert.doesNotMatch(ics,/ATTENDEE|METHOD:REQUEST/);
  for(const p of [{...confirmedPortal,status:'pending'},{...confirmedPortal,meetUrl:'https://evil.example'},{...confirmedPortal,startsAt:'invalid'}]) {
    assert.equal((await harness('calendar',{rpc:async()=>({data:p})}).api.GET(null,context)).status,404);
  }
});
