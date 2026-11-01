import test from 'node:test';
import assert from 'node:assert/strict';
import { guideQuestions, chooseGuideAnswer, guideComplete, parseGuideAnswers, guideRecommendation, guidePricingHref, guideBrief } from '../app/components/halenn/solution-guide.ts';
import { parseSelection, estimate } from '../app/components/pricing/catalog.ts';

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
    if (href) {
      const url = new URL(href, 'https://halenn.com');
      assert.equal(url.pathname, '/pricing');
      assert.equal(url.hash, '#builder');
      assert.deepEqual(parseGuideAnswers(url.searchParams.get('guide')), answers);
      const selection = parseSelection(Object.fromEntries(url.searchParams));
      assert.ok(selection.services.length > 0);
      assert.equal(estimate(selection).quoteRequired, false);
    }
  };
  walk();
  assert.ok(routes > 1000);
  for (const expected of ['website', 'commerce', 'agent', 'phone', 'chat', 'workflow', 'portal', 'mobile-app', 'conversation']) assert.ok(outcomes.has(expected), expected);
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
