import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { guideQuestions, chooseGuideAnswer, guideComplete, parseGuideAnswers, guideRecommendation, guidePricingHref, guideBrief } from '../app/components/halenn/solution-guide.ts';
import { parseSelection, estimate, projects, money } from '../app/components/pricing/catalog.ts';

const pricingSource = await readFile(new URL('../app/components/halenn/guide-pricing.ts', import.meta.url), 'utf8');
const pricingCompiled = ts.transpileModule(pricingSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  .replace('"../pricing/catalog"', JSON.stringify(new URL('../app/components/pricing/catalog.ts', import.meta.url).href))
  .replace('"./solution-guide"', JSON.stringify(new URL('../app/components/halenn/solution-guide.ts', import.meta.url).href));
const { guidePricingDetails, guideEnquiryBrief } = await import(`data:text/javascript;base64,${Buffer.from(pricingCompiled).toString('base64')}`);

const website = { goal: 'leads', presence: 'new', visitorAction: 'bookings' };
const agent = { goal: 'time', task: 'enquiries', behaviour: 'actions', tools: 'crm', channel: 'website' };
const assistant = { ...agent, behaviour: 'answers' };

test('every reachable route finishes in 3–5 questions with a valid, bounded handoff', () => {
  const outcomes = new Set();
  let routes = 0;
  const walk = (answers = {}) => {
    const next = guideQuestions(answers).find(q => !answers[q.id]);
    if (next) {
      for (const choice of next.options) {
        assert.doesNotMatch(choice.label, /saas|software business/i);
        walk(chooseGuideAnswer(answers, next.id, choice.value));
      }
      return;
    }
    routes++;
    assert.equal(guideComplete(answers), true);
    assert.ok(guideQuestions(answers).length >= 3 && guideQuestions(answers).length <= 5);
    assert.deepEqual(parseGuideAnswers(JSON.stringify(answers)), answers);
    const recommendation = guideRecommendation(answers);
    outcomes.add(recommendation.id);
    assert.ok(guideBrief(answers).length < 1800);
    const href = guidePricingHref(answers);
    const inline = guidePricingDetails(answers);
    if (href) {
      const url = new URL(href, 'https://halenn.com');
      assert.equal(url.pathname, '/pricing');
      assert.equal(url.hash, '#builder');
      assert.deepEqual(parseGuideAnswers(url.searchParams.get('guide')), answers);
      const selection = parseSelection(Object.fromEntries(url.searchParams));
      assert.ok(selection.services.length > 0);
      assert.equal(estimate(selection).quoteRequired, false);
      assert.equal(inline.kind, 'estimate');
      assert.deepEqual(inline.estimate.selection, selection);
      assert.equal(inline.estimate.oneTime, estimate(selection).oneTime);
      assert.deepEqual(inline.estimate.lines, estimate(selection).lines);
      assert.ok(inline.estimate.oneTime > 0);
      assert.equal(inline.estimate.monthly, 0, 'The quiz must not silently add optional care');
      assert.ok(inline.runningCosts.length > 0);
    } else {
      assert.equal(inline.kind, 'custom');
      assert.ok(inline.reason.length > 35, recommendation.id);
      assert.equal(inline.estimate, undefined, 'Custom work must not appear to cost zero');
    }
  };
  walk();
  assert.ok(routes > 1000);
  for (const expected of ['website', 'commerce', 'agent', 'phone', 'chat', 'workflow', 'portal', 'mobile-app', 'conversation']) assert.ok(outcomes.has(expected), expected);
});

test('inline estimates follow catalogue changes and include the actual package scope', () => {
  const oldPrice = projects.website.price;
  try {
    projects.website.price = oldPrice + 123;
    const result = guidePricingDetails(website);
    assert.equal(result.kind, 'estimate');
    assert.equal(result.estimate.oneTime, oldPrice + 123 + 250);
    assert.ok(result.estimate.lines[0].scope.includes('Up to five pages with editable content'));
    assert.deepEqual(result.estimate.lines.map(line => line.id), ['website', 'bookings']);
  } finally { projects.website.price = oldPrice; }
});

test('discussing a result carries the visible price or custom-scoping explanation into the enquiry', () => {
  const priced = guideEnquiryBrief(website);
  assert.ok(priced.includes(`Starting estimate: From ${money(1740)} one-time, excluding VAT.`));
  assert.match(priced, /Booking integration/);
  assert.match(priced, /Indicative starting estimate, not a quote/);
  const custom = guideEnquiryBrief(agent);
  assert.match(custom, /A tailored quote is needed/);
  assert.match(custom, /person should approve an action/);
  assert.doesNotMatch(custom, /€|Starting estimate:/);
});

test('websites and bookable services carry the relevant booking extra into pricing', () => {
  const params = new URL(guidePricingHref(website), 'https://halenn.com').searchParams;
  const result = estimate(parseSelection(Object.fromEntries(params)));
  assert.deepEqual(result.selection.services, ['web']);
  assert.deepEqual(result.selection.extras, ['bookings']);
  assert.equal(result.oneTime, 1740);
  const shop = { goal: 'sell', salesStage: 'new', sellType: 'both' };
  const selection = parseSelection(Object.fromEntries(new URL(guidePricingHref(shop), 'https://halenn.com').searchParams));
  assert.equal(selection.webType, 'webshop');
  assert.deepEqual(selection.extras, ['bookings']);
});

test('an existing working website does not trigger a new website package', () => {
  const existing = { ...website, presence: 'happy', visitorAction: 'enquiries' };
  const params = new URL(guidePricingHref(existing), 'https://halenn.com').searchParams;
  assert.deepEqual(parseSelection(Object.fromEntries(params)).services, ['automation']);
  assert.equal(guidePricingHref({ ...existing, visitorAction: 'bookings' }), undefined);
  assert.equal(guidePricingHref({ goal: 'sell', salesStage: 'existing', sellType: 'products' }), undefined);
});

test('answering questions and carrying out tasks get distinct recommendations', () => {
  assert.equal(guideRecommendation(agent).id, 'agent');
  assert.equal(guidePricingHref(agent), undefined);
  assert.equal(guideRecommendation(assistant).id, 'chat');
  assert.equal(guideRecommendation({ ...assistant, channel: 'phone' }).id, 'phone');
  assert.equal(guidePricingHref({ ...assistant, channel: 'team' }), undefined);
  assert.equal(guidePricingHref({ ...assistant, task: 'reminders', channel: 'phone' }), undefined);
});

test('reminders use their own trigger and package rather than a generic automation price', () => {
  const base = { goal: 'time', task: 'reminders', behaviour: 'rules', tools: 'crm', reminder: 'invoices' };
  assert.equal(guideQuestions(base).length, 5);
  assert.equal(guideRecommendation(base).id, 'invoices');
  const params = new URL(guidePricingHref(base), 'https://halenn.com').searchParams;
  assert.deepEqual(parseSelection(Object.fromEntries(params)).automationPackages, ['invoices']);
});

test('browser portals and work on existing apps are scoped instead of priced as new native apps', () => {
  const app = { goal: 'tool', users: 'staff', toolTask: 'internal', platform: 'browser', existing: 'tools' };
  assert.equal(guideRecommendation(app).title, 'An internal web app');
  assert.equal(guidePricingHref(app), undefined);
  assert.equal(guidePricingHref({ ...app, platform: 'ios', existing: 'app' }), undefined);
  const href = guidePricingHref({ ...app, platform: 'both', existing: 'none' });
  assert.equal(parseSelection(Object.fromEntries(new URL(href, 'https://halenn.com').searchParams)).appPlatform, 'both');
});

test('changing an earlier answer clears downstream and hidden branch answers', () => {
  assert.deepEqual(chooseGuideAnswer(agent, 'behaviour', 'rules'), { goal: 'time', task: 'enquiries', behaviour: 'rules' });
  assert.deepEqual(chooseGuideAnswer(agent, 'goal', 'leads'), { goal: 'leads' });
  assert.deepEqual(chooseGuideAnswer(agent, 'tools', 'booking'), { goal: 'time', task: 'enquiries', behaviour: 'actions', tools: 'booking' });
  assert.deepEqual(chooseGuideAnswer(agent, 'goal', 'time'), agent);
  assert.deepEqual(chooseGuideAnswer(agent, 'presence', 'new'), agent);
});

test('invalid, incomplete and stale handoffs fall back without accepting arbitrary content', () => {
  for (const value of ['{', 'null', '[]', '{}', JSON.stringify({ goal: 'leads' }), JSON.stringify({ ...website, hidden: 'data' }), JSON.stringify({ ...website, presence: '<script>' }), JSON.stringify({ ...agent, behaviour: 'rules' }), 'x'.repeat(1201)]) assert.equal(parseGuideAnswers(value), undefined);
  assert.throws(() => guideRecommendation({ goal: 'leads' }));
  assert.equal(guideComplete({}), false);
});
