import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import {CONSENT_COOKIE, parseConsent} from '../app/components/legal/consent-model.ts';
import * as model from '../app/lib/website-model.ts';

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
const trackerCode = compile('../app/lib/website-tracking.ts');
const componentCode = compile('../app/components/analytics/WebsiteTracker.tsx');
const TIMEOUT = 30 * 60 * 1000;
function harness({version = 3, accepted = true, missingChoice = false, restored, fetch: send} = {}) {
  let now = 1_800_000_000_000, timerId = 0, cookieReadBlocked = false, cookieWriteBlocked = false, storageBlocked = false;
  const cookies = new Map(), storage = new Map(), timers = new Map(), requests = [], effects = [];
  if (!missingChoice) cookies.set(CONSENT_COOKIE, encodeURIComponent(JSON.stringify({version, optional: accepted, updatedAt: now})));
  if (restored) { storage.set('halenn_visit', JSON.stringify(restored(now))); cookies.set('halenn_visitor', JSON.parse(storage.get('halenn_visit')).visitor_id); }
  const location = {pathname: '/', href: 'https://halenn.com/', protocol: 'https:'};
  const document = {referrer: '', visibilityState: 'visible', addEventListener() {}, removeEventListener() {}};
  Object.defineProperty(document, 'cookie', {
    get() { if (cookieReadBlocked) throw Error('Storage is blocked'); return [...cookies].map(([key, value]) => `${key}=${value}`).join('; '); },
    set(value) {
      if (cookieWriteBlocked) throw Error('Storage is blocked');
      const [pair, ...attributes] = value.split(';'), index = pair.indexOf('='), key = pair.slice(0, index);
      if (attributes.some(attribute => attribute.trim() === 'Max-Age=0')) cookies.delete(key);
      else cookies.set(key, pair.slice(index + 1));
    },
  });
  const api = {};
  const environment = {
    exports: api,
    require(path) { return path.includes('consent-model') ? {CONSENT_COOKIE, parseConsent: raw => parseConsent(raw, now)} : model; },
    crypto: {randomUUID}, Date: {now: () => now}, URL, document, location, innerWidth: 1200, AbortController,
    Event: class { constructor(type) { this.type = type; } },
    window: {dispatchEvent() {}, addEventListener() {}, removeEventListener() {}},
    sessionStorage: {
      getItem(key) { if (storageBlocked) throw Error('Storage is blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if (storageBlocked) throw Error('Storage is blocked'); storage.set(key, value); },
      removeItem(key) { if (storageBlocked) throw Error('Storage is blocked'); storage.delete(key); },
    },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, {callback, delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(url, options) { const request = {url, options, body: JSON.parse(options.body)}; requests.push(request); return send ? send(request, requests.length) : {status: 204}; },
  };
  vm.runInNewContext(trackerCode, environment);
  return {
    api, cookies, storage, requests, timers,
    advance(milliseconds) { now += milliseconds; },
    blockCookieRead() { cookieReadBlocked = true; }, blockCookieWrite() { cookieWriteBlocked = true; }, blockStorage() { storageBlocked = true; },
    navigate(path) { location.pathname = path; location.href = `https://halenn.com${path}`; },
    renderTracker(consent = true) {
      const component = {};
      vm.runInNewContext(componentCode, {...environment, exports: component, require(path) {
        if (path === 'react') return {useEffect: effect => effects.push(effect)};
        if (path === 'next/navigation') return {usePathname: () => location.pathname};
        return api;
      }});
      component.default({consent});
      const runEffects = () => effects.map(effect => effect()).filter(cleanup => typeof cleanup === 'function');
      return {runEffects};
    },
  };
}
const form = () => ({form_id: randomUUID(), origin: 'homepage'});

test('fresh accepted version 3 is required before any identifier, queue or request', async () => {
  for (const options of [{missingChoice: true}, {version: 2}, {accepted: false}]) {
    const h = harness(options);
    h.api.setWebsiteTrackingConsent(true);
    h.api.trackWebsiteEvent('enquiry_open', form());
    assert.equal(h.api.trackingContext(), null);
    await h.api.flushWebsiteEvents();
    assert.equal(h.cookies.has('halenn_visitor'), false);
    assert.equal(h.storage.has('halenn_visit'), false);
    assert.equal(h.requests.length, 0);
  }
});

test('StrictMode effect replay and ordinary cleanup preserve identity and exactly one first page view', async () => {
  const h = harness(), component = h.renderTracker();
  const cleanups = component.runEffects();
  const visitor = h.cookies.get('halenn_visitor'), session = h.api.trackingContext().session_id;
  cleanups.forEach(cleanup => cleanup());
  component.runEffects().forEach(cleanup => cleanup());
  assert.equal(h.cookies.get('halenn_visitor'), visitor);
  assert.equal(h.api.trackingContext().session_id, session);
  await h.api.flushWebsiteEvents();
  assert.deepEqual(h.requests.flatMap(request => request.body.events.map(event => event.kind)), ['page_view']);
});

test('frozen-tab rollover keeps old events under their original visit and opens the new visit with a page view', async () => {
  const h = harness(); h.api.setWebsiteTrackingConsent(true);
  const old = h.api.trackingContext().session_id;
  h.api.trackWebsiteEvent('enquiry_open', form());
  h.advance(TIMEOUT);
  h.api.trackWebsiteEvent('enquiry_start', form());
  const next = h.api.trackingContext().session_id;
  await h.api.flushWebsiteEvents();
  assert.notEqual(next, old);
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].body.visit.session_id, old);
  assert.deepEqual(h.requests[0].body.events.map(event => event.kind), ['page_view', 'enquiry_open']);
  assert.equal(h.requests[1].body.visit.session_id, next);
  assert.deepEqual(h.requests[1].body.events.map(event => event.kind), ['page_view', 'enquiry_start']);
});

test('active visits still rotate at 24 hours and clear previous quiz attribution', async () => {
  const h = harness(); h.api.setWebsiteTrackingConsent(true);
  const old = h.api.trackingContext().session_id;
  h.api.setActiveQuiz(randomUUID());
  for (let index = 0; index < 72; index++) { h.advance(20 * 60 * 1000); h.api.trackWebsiteEvent('enquiry_start', form()); }
  const next = h.api.trackingContext();
  assert.notEqual(next.session_id, old);
  assert.equal(next.quiz_id, undefined);
  await h.api.flushWebsiteEvents();
  const renewed = h.requests.filter(request => request.body.visit.session_id === next.session_id);
  assert.equal(renewed[0].body.events[0].kind, 'page_view');
});

test('withdrawal clears the visitor cookie even if session storage is blocked', async () => {
  const h = harness(); h.api.setWebsiteTrackingConsent(true); h.blockStorage();
  assert.doesNotThrow(() => h.api.setWebsiteTrackingConsent(false));
  assert.equal(h.cookies.has('halenn_visitor'), false);
  assert.equal(h.api.trackingContext(), null);
  await h.api.flushWebsiteEvents();
  assert.equal(h.requests.length, 0);
});

test('blocked cookie reads or writes cannot throw into quiz or enquiry handlers', async () => {
  const existing = harness(); existing.api.setWebsiteTrackingConsent(true); existing.blockCookieRead();
  assert.doesNotThrow(() => existing.api.trackWebsiteEvent('enquiry_attempt', form()));
  assert.equal(existing.api.trackingContext(), null);
  await existing.api.flushWebsiteEvents(); assert.equal(existing.requests.length, 0);
  const fresh = harness(); fresh.blockCookieWrite();
  assert.doesNotThrow(() => fresh.api.setWebsiteTrackingConsent(true));
  assert.equal(fresh.api.trackingContext(), null);
  await fresh.api.flushWebsiteEvents(); assert.equal(fresh.requests.length, 0);
});

test('restored visits and request bodies contain only declared fields', async () => {
  const visitor = randomUUID(), session = randomUUID(), quiz = randomUUID();
  const h = harness({restored: now => ({visitor_id: visitor, session_id: session, source: 'Instagram', medium: 'social', campaign: 'Autumn', referrer: 'instagram.com', landing_path: '/', device: 'mobile', started: now - 1000, last: now - 10, quiz_id: quiz, email: 'private@example.com', full_url: 'https://halenn.com/?message=private'})});
  h.api.setWebsiteTrackingConsent(true);
  assert.equal(h.api.trackingContext().session_id, session);
  assert.equal(h.api.trackingContext().quiz_id, quiz);
  await h.api.flushWebsiteEvents();
  assert.deepEqual(Object.keys(h.requests[0].body.visit).sort(), ['visitor_id', 'session_id', 'source', 'medium', 'campaign', 'referrer', 'landing_path', 'device'].sort());
  assert.equal(JSON.stringify(h.requests).includes('private'), false);
  assert.equal(h.storage.get('halenn_visit').includes('private'), false);
});

test('withdrawal and immediate reacceptance cannot retry an old grant', async () => {
  let rejectOld;
  const h = harness({fetch: (request, index) => index === 1 ? new Promise((resolve, reject) => { rejectOld = reject; }) : Promise.resolve({status: 204})});
  h.api.setWebsiteTrackingConsent(true);
  const old = h.api.trackingContext().session_id;
  const flushing = h.api.flushWebsiteEvents();
  h.api.setWebsiteTrackingConsent(false);
  assert.equal(h.requests[0].options.signal.aborted, true);
  h.api.setWebsiteTrackingConsent(true);
  rejectOld(new Error('aborted'));
  await flushing;
  assert.equal(h.requests.filter(request => request.body.visit.session_id === old).length, 1);
  assert.equal(h.requests.length, 2);
});

test('concurrent flush callers drain later events with bounded batches and stable retry IDs', async () => {
  let release;
  const h = harness({fetch: (request, index) => index === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve({status: 204})});
  h.api.setWebsiteTrackingConsent(true);
  const first = h.api.flushWebsiteEvents();
  for (let index = 0; index < 25; index++) h.api.trackWebsiteEvent('enquiry_open', form());
  const second = h.api.flushWebsiteEvents();
  release({status: 503}); await Promise.all([first, second]);
  assert.deepEqual(h.requests[0].body, h.requests[1].body);
  assert.ok(h.requests.every(request => request.body.events.length <= 20));
  const unique = new Set(h.requests.flatMap(request => request.body.events.map(event => event.id)));
  assert.equal(unique.size, 26);
  assert.equal(h.requests.length, 4);
});

test('the transport aborts each blocked attempt at two seconds and still lets the caller finish', async () => {
  const h = harness({fetch: request => new Promise((resolve, reject) => request.options.signal.addEventListener('abort', () => reject(new Error('timeout'))))});
  h.api.setWebsiteTrackingConsent(true);
  const flushing = h.api.flushWebsiteEvents();
  for (let attempt = 0; attempt < 2; attempt++) {
    const deadline = [...h.timers.values()].find(timer => timer.delay === 2000);
    assert.ok(deadline); deadline.callback();
    for (let step = 0; step < 10; step++) await Promise.resolve();
  }
  await flushing;
  assert.equal(h.requests.length, 2);
  assert.ok(h.requests.every(request => request.options.signal.aborted));
});
