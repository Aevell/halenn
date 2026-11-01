import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { previewPose, smooth } from '../app/components/halenn/cinematic/flow-motion.ts';

test('examples hold a flat, stationary pose throughout the reading zone', () => {
  for (const compact of [false, true]) {
    for (const distance of [-.28, -.1, 0, .1, .28]) {
      assert.deepEqual(previewPose(distance, compact), { y: 0, angle: 0 });
    }
  }
});

test('fast scrolling clamps to the desktop and compact motion budgets', () => {
  for (const compact of [false, true]) {
    for (const distance of [-1000, -1, -.5, .5, 1, 1000]) {
      const pose = previewPose(distance, compact);
      assert.ok(Math.abs(pose.y) <= (compact ? 12 : 24));
      assert.ok(Math.abs(pose.angle) <= (compact ? 2 : 5));
    }
    assert.deepEqual(previewPose(-1000, compact), previewPose(-1, compact));
    assert.deepEqual(previewPose(1000, compact), previewPose(1, compact));
  }
});

test('scroll reversal retraces the same pose and entry mirrors exit', () => {
  const path = [-1, -.8, -.4, 0, .4, .8, 1];
  for (const compact of [false, true]) {
    const outward = path.map(distance => previewPose(distance, compact));
    const backward = [...path].reverse().map(distance => previewPose(distance, compact)).reverse();
    assert.deepEqual(outward, backward);
    for (const distance of [.3, .5, .9, 1]) {
      const entry = previewPose(-distance, compact), exit = previewPose(distance, compact);
      assert.equal(entry.y, -exit.y);
      assert.equal(entry.angle, -exit.angle);
    }
  }
});

test('the reading-zone and offscreen boundaries have no position jump', () => {
  for (const compact of [false, true]) {
    for (const boundary of [-1, -.28, .28, 1]) {
      const before = previewPose(boundary - .0001, compact);
      const after = previewPose(boundary + .0001, compact);
      assert.ok(Math.abs(before.y - after.y) < .001);
      assert.ok(Math.abs(before.angle - after.angle) < .001);
    }
  }
});

// Exercise the real controller with a deterministic layout and browser events.
// No browser globals, preferences or application state are changed by this harness.
const source = await readFile(new URL('../app/components/halenn/cinematic/CinematicMotion.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

function controller({ reduced = false } = {}) {
  const events = () => {
    const listeners = new Map();
    return {
      addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
      removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
      emit(name) { listeners.get(name)?.forEach(fn => fn()); },
      count() { return [...listeners.values()].reduce((n, set) => n + set.size, 0); },
    };
  };
  let context;
  class Node {
    constructor(top = 0, height = 300) {
      this.top = top; this.height = height; this.dataset = {}; this.attributes = new Map();
      this.style = { removeProperty(key) { delete this[key]; }, setProperty(key, value) { this[key] = value; }, getPropertyValue(key) { return this[key] || ''; } };
      Object.assign(this, events());
    }
    get offsetHeight() { return this.height; }
    getBoundingClientRect() { return { top: this.top - context.scrollY, left: 0, width: 600, height: this.height }; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    removeAttribute(key) { this.attributes.delete(key); }
    contains(node) { return node === this || node?.parent === this; }
    closest() { return this.anchor || this; }
  }
  const root = new Node(0, 6500), preview = new Node(1200, 500);
  preview.dataset.flowPreview = '0';
  const intro = new Node(1000, 200), ambient = new Node(1000, 900);
  const opening = new Node(0, 900), passage = new Node(0, 4000), contact = new Node(5000, 700);
  const words = [new Node(), new Node()], light = new Node(), clearance = new Node(), exclusion = new Node();
  const selectors = {
    '[data-silk-clearance]': clearance, '[data-silk-exclusion]': exclusion,
    '[data-ribbon-art] img': new Node(200, 400), '[data-opening]': opening,
    '[data-silk-passage]': passage, '#contact': contact, '[data-contact-light]': light,
  };
  const lists = { '[data-silk-outline]': [new Node(), new Node()], '[data-contact-word]': words,
    '[data-flow-preview]': [preview], '[data-flow-intro]': [intro], '[data-flow-ambient]': [ambient], section: [opening, contact] };
  root.querySelector = selector => selectors[selector];
  root.querySelectorAll = selector => lists[selector] || [];
  const motion = { ...events(), matches: !reduced }, compact = { ...events(), matches: false };
  const document = { ...events(), hidden: false, activeElement: null, fonts: { ...events(), ready: Promise.resolve() } };
  const window = events(), frames = new Map();
  let frame = 0, cleanup, resizeCallback, disconnected = false;
  context = {
    exports: {}, innerHeight: 900, scrollY: 0, document, window, location: { hash: '' },
    matchMedia: query => query.includes('prefers-reduced-motion') ? motion : compact,
    requestAnimationFrame: fn => { frames.set(++frame, fn); return frame; },
    cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: class { constructor(fn) { resizeCallback = fn; } observe() {} disconnect() { disconnected = true; } },
    require: id => id === 'react' ? { useRef: () => ({ current: root }), useEffect: fn => { cleanup = fn(); } }
      : id === 'react/jsx-runtime' ? { jsx: () => null }
      : id === './flow-motion' ? { previewPose, smooth } : { default: {} },
  };
  runInNewContext(compiled, context);
  context.exports.default({ children: null });
  const flush = () => { const work = [...frames.values()]; frames.clear(); work.forEach(fn => fn()); };
  return { context, preview, intro, ambient, words, light, root, motion, document, window, frames, flush,
    resize: () => { resizeCallback(); flush(); },
    scroll: y => { context.scrollY = y; window.emit('scroll'); flush(); },
    cleanup: () => { cleanup(); assert.equal(disconnected, true); },
  };
}

test('reduced motion starts static and changing the preference removes all spatial motion', () => {
  const still = controller({ reduced: true });
  assert.equal(still.preview.style.transform, undefined);
  assert.equal(still.intro.style.opacity, undefined);
  still.cleanup();
  const live = controller();
  assert.ok(live.preview.style.transform.includes('rotateY(5.000deg)'));
  live.motion.matches = false; live.motion.emit('change'); live.flush();
  for (const node of [live.preview, live.intro, live.ambient, ...live.words, live.light]) {
    assert.equal(node.style.transform, undefined);
    assert.equal(node.style.opacity, undefined);
  }
  live.cleanup();
});

test('keyboard focus settles the preview without moving the surrounding content', () => {
  const app = controller();
  app.scroll(600);
  app.document.activeElement = { parent: app.preview, matches: () => true };
  app.root.emit('focusin'); app.flush();
  assert.equal(app.preview.style.transform, 'none');
  app.document.activeElement = null; app.root.emit('focusout'); app.flush();
  app.scroll(900);
  assert.ok(app.preview.style.transform.includes('rotateY(0.000deg)'));
  app.cleanup();
});

test('layout changes above the examples invalidate cached positions', () => {
  const app = controller();
  app.scroll(900);
  const before = app.preview.style.transform;
  app.preview.top += 500; app.resize();
  assert.notEqual(app.preview.style.transform, before);
  app.scroll(1400);
  assert.equal(app.preview.style.transform, before);
  app.cleanup();
});

test('hidden tabs cancel pending work and unmount removes listeners and frames', () => {
  const app = controller();
  app.window.emit('scroll');
  assert.equal(app.frames.size, 1);
  app.document.hidden = true; app.document.emit('visibilitychange');
  assert.equal(app.frames.size, 0);
  app.window.emit('scroll');
  assert.equal(app.frames.size, 0);
  app.document.hidden = false; app.document.emit('visibilitychange'); app.flush();
  app.cleanup();
  assert.equal(app.frames.size, 0);
  assert.equal(app.window.count() + app.root.count() + app.document.count() + app.motion.count() + app.document.fonts.count(), 0);
});

const production = process.env.HALENN_PRODUCTION_URL;
test('production HTML exposes content and contact without JS, while prototypes remain unavailable', { skip: !production }, async () => {
  const response = await fetch(production);
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const id of ['hero-content', 'goals', 'services', 'process', 'faq', 'contact']) assert.ok(html.includes(`id="${id}"`));
  assert.match(html, /mailto:contact@halenn\.com/);
  assert.match(html, /The guide needs JavaScript/);
  assert.match(html, /\/brand\/halenn-ribbon-2x\.webp/);
  assert.equal((html.match(/data-flow-preview="[012]"/g) || []).length, 3);
  for (const path of ['/prototypes/hero', '/prototypes/pricing']) assert.equal((await fetch(production + path)).status, 404);
});
