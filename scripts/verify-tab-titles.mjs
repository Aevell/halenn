import test from 'node:test';
import assert from 'node:assert/strict';
import { manageTabTitle, awayTitleDelay } from '../app/lib/tab-title.ts';
import { estimate, estimateTitle, parseSelection, defaultPricingTitle } from '../app/components/pricing/catalog.ts';

test('server-rendered and interactive titles share the same pricing rules', () => {
  assert.equal(estimateTitle(estimate(parseSelection({ services: '' }))), defaultPricingTitle);
  assert.equal(estimateTitle(estimate(parseSelection({ services: 'web', web: 'website', extras: 'bookings' }))), 'From €1,740 · Your estimate | Halenn');
  assert.equal(estimateTitle(estimate(parseSelection({ services: 'automation', customAutomation: 'yes' }))), 'Your tailored estimate | Halenn');
});

function setup() {
  const page = new EventTarget();
  page.title = 'Pricing | Halenn';
  page.visibilityState = 'visible';
  let now = 0, serial = 0;
  const pending = new Map();
  const clock = {
    setTimeout(callback, delay) { const id = ++serial; pending.set(id, { callback, due: now + delay }); return id; },
    clearTimeout(id) { pending.delete(id); },
  };
  const advance = ms => {
    now += ms;
    for (const [id, entry] of [...pending]) if (entry.due <= now) { pending.delete(id); entry.callback(); }
  };
  const visibility = value => { page.visibilityState = value; page.dispatchEvent(new Event('visibilitychange')); };
  return { page, clock, advance, visibility, pending };
}

test('an estimate title updates immediately and restores original metadata on cleanup', () => {
  const { page, clock } = setup();
  const cleanup = manageTabTitle('From €1,740 · Your estimate | Halenn', undefined, page, clock);
  assert.equal(page.title, 'From €1,740 · Your estimate | Halenn');
  cleanup();
  assert.equal(page.title, 'Pricing | Halenn');
});
test('a hidden pricing tab gets one reminder after 30 seconds and restores its current estimate on return', () => {
  const { page, clock, advance, visibility, pending } = setup();
  const cleanup = manageTabTitle('From €1,740 · Your estimate | Halenn', 'Your estimate is waiting | Halenn', page, clock);
  visibility('hidden'); advance(awayTitleDelay - 1);
  assert.equal(page.title, 'From €1,740 · Your estimate | Halenn');
  advance(1); assert.equal(page.title, 'Your estimate is waiting | Halenn');
  assert.equal(pending.size, 0);
  advance(100_000); assert.equal(page.title, 'Your estimate is waiting | Halenn');
  visibility('visible'); assert.equal(page.title, 'From €1,740 · Your estimate | Halenn');
  cleanup();
});
test('returning early cancels the reminder while a visible tab never gets one', () => {
  const { page, clock, advance, visibility, pending } = setup();
  const cleanup = manageTabTitle(undefined, 'Come back | Halenn', page, clock);
  advance(60_000); assert.equal(page.title, 'Pricing | Halenn');
  visibility('hidden'); advance(20_000); visibility('visible'); advance(60_000);
  assert.equal(page.title, 'Pricing | Halenn'); assert.equal(pending.size, 0);
  cleanup();
});
test('navigation cancels pending timers and leaves newer page metadata intact', () => {
  const { page, clock, advance, visibility, pending } = setup();
  const cleanup = manageTabTitle('Your estimate | Halenn', 'Come back | Halenn', page, clock);
  visibility('hidden'); page.title = 'About | Halenn'; cleanup();
  advance(60_000); visibility('visible');
  assert.equal(page.title, 'About | Halenn'); assert.equal(pending.size, 0);
});
test('a page opened in the background still delays the reminder', () => {
  const { page, clock, advance, visibility } = setup();
  page.visibilityState = 'hidden';
  const cleanup = manageTabTitle(undefined, 'Let’s plan your next step | Halenn', page, clock);
  assert.equal(page.title, 'Pricing | Halenn');
  advance(30_000); assert.equal(page.title, 'Let’s plan your next step | Halenn');
  visibility('visible'); assert.equal(page.title, 'Pricing | Halenn');
  cleanup();
});
test('quiz result titles do not trigger an away reminder', () => {
  const { page, clock, advance, visibility, pending } = setup();
  const cleanup = manageTabTitle('Your suggested solution | Halenn', undefined, page, clock);
  visibility('hidden'); advance(60_000);
  assert.equal(page.title, 'Your suggested solution | Halenn'); assert.equal(pending.size, 0);
  cleanup();
});
