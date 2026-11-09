import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSENT_VERSION, CONSENT_COOKIE, CONSENT_PATH, CONSENT_MAX_AGE, consentCookie, parseConsent } from '../app/components/legal/consent-model.ts';

const now = Date.parse('2026-11-09T12:00:00Z');
const encoded = value => encodeURIComponent(JSON.stringify(value));
test('accept and reject persist only declared fields, with equal expiry and HTTPS protection', () => {
  for (const optional of [false, true]) {
    const choice = { version:CONSENT_VERSION, optional, updatedAt:now };
    const cookie = consentCookie({...choice, email:'must-not-be-saved@example.com'}, true);
    assert.deepEqual(parseConsent(cookie.split(';')[0].slice(CONSENT_COOKIE.length + 1), now), choice);
    assert.ok(!cookie.includes('email') && !cookie.includes('example.com'));
    assert.ok(cookie.endsWith('; Secure'));
    assert.equal(CONSENT_PATH, '/');
    assert.equal(CONSENT_COOKIE, 'halenn_privacy');
    assert.ok(cookie.includes(`Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax`));
    assert.ok(!consentCookie(choice, false).includes('Secure'));
  }
});
test('demo, unknown, malformed, expired, future and non-boolean choices fail closed', () => {
  for (const raw of [undefined, '', '%broken', 'null', '[]', encoded({}), 'x'.repeat(301),
    encoded({version:1, analytics:true, updatedAt:now}), encoded({version:4, optional:true, updatedAt:now}),
    encoded({version:CONSENT_VERSION, optional:'true', updatedAt:now}), encoded({version:CONSENT_VERSION, optional:1, updatedAt:now}),
    encoded({version:CONSENT_VERSION, optional:true, updatedAt:now + 1}), encoded({version:CONSENT_VERSION, optional:true, updatedAt:now - CONSENT_MAX_AGE * 1000}),
    encoded({version:CONSENT_VERSION, optional:true, updatedAt:-1}), encoded({version:CONSENT_VERSION, optional:true, updatedAt:1.2})]) {
    assert.equal(parseConsent(raw, now), null, String(raw));
  }
  assert.equal(parseConsent(encoded({version:CONSENT_VERSION, optional:true, updatedAt:now - CONSENT_MAX_AGE * 1000 + 1}), now)?.optional, true);
});
test('choices made before analytics was introduced require a fresh informed choice', () => {
  assert.equal(CONSENT_VERSION, 3);
  for (const optional of [false, true]) {
    assert.equal(parseConsent(encoded({version:2, optional, updatedAt:now}), now), null);
  }
  assert.equal(parseConsent(encoded({version:CONSENT_VERSION, optional:false, updatedAt:now}), now)?.optional, false);
  assert.equal(parseConsent(encoded({version:CONSENT_VERSION, optional:true, updatedAt:now}), now)?.optional, true);
});
const development = process.env.HALENN_LEGAL_DEV_URL;
const production = process.env.HALENN_PRODUCTION_URL;
const publicBase = production || development;
test('public legal pages are readable without JavaScript and have canonical production URLs', {skip:!publicBase}, async () => {
  for (const slug of ['privacy','cookies','terms','business']) {
    const response = await fetch(`${publicBase}/${slug}`);
    assert.equal(response.status,200);
    const html = await response.text();
    assert.match(html, new RegExp(`<link rel="canonical" href="https://halenn.com/${slug}"`));
    assert.match(html, /<article>/);
    assert.match(html, /Cookie information/);
    assert.ok(!/Preview only|Not published|To confirm before publication|Replay notice|Local preview|Draft for review/.test(html));
    assert.ok(!html.includes('id="consent-title"'), 'inert consent buttons must not be emitted before JS');
    assert.ok(!html.includes('—'));
  }
  const business = await (await fetch(`${publicBase}/business`)).text();
  assert.match(business, /Business name: AEVELL/);
  assert.match(business, /Business address and country: to be confirmed/);
});
test('homepage retains all quick links and adds functioning legal links', {skip:!publicBase}, async () => {
  const html = await (await fetch(publicBase)).text();
  const footer = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0];
  assert.ok(footer);
  for(const path of ['/#services','/pricing','/about','/#process','/#faq','/#contact','/privacy','/cookies','/terms','/business']) {
    assert.ok(footer.includes(`href="${path}"`), path);
  }
  assert.ok(!footer.includes('aria-disabled'));
});
test('legal preview stays non-indexable and rejects unknown slugs in development', {skip:!development}, async () => {
  const html = await (await fetch(`${development}/prototypes/legal/privacy`)).text();
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  for(const slug of ['unknown','constructor','__proto__']) assert.equal((await fetch(`${development}/prototypes/legal/${slug}`)).status,404);
});
test('normal production returns 404 for all prototype routes', {skip:!production}, async () => {
  for(const path of ['/prototypes/legal','/prototypes/legal/privacy','/prototypes/legal/cookies','/prototypes/legal/terms','/prototypes/legal/business','/prototypes/hero','/prototypes/pricing']) {
    assert.equal((await fetch(production + path)).status,404,path);
  }
});
