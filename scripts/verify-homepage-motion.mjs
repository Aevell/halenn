import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { previewPose, sequenceProgress, smooth } from '../app/components/halenn/cinematic/flow-motion.ts';

test('preview arrival has bounded desktop and compact poses and settles at the reading position', () => {
  for (const compact of [false, true]) {
    const start = previewPose(1.15, compact), end = previewPose(.55, compact);
    assert.equal(start.y, compact ? 24 : 48);
    assert.equal(start.angle, compact ? 3 : 8);
    assert.equal(start.scale, compact ? .96 : .92);
    assert.equal(start.demo, 0);
    assert.ok(end.y < 1e-10);
    assert.equal(end.scale, 1);
    assert.equal(end.demo, 1);
    for (const centre of [-100, 0, .3, .5]) assert.deepEqual(previewPose(centre, compact), previewPose(0, compact));
    assert.deepEqual(previewPose(100, compact), start);
  }
});

test('the internal demonstration overlaps the final frame arrival and finishes before reading', () => {
  assert.equal(previewPose(.94, false).demo, 0);
  const middle = previewPose(.75, false);
  assert.ok(middle.progress > middle.demo && middle.demo > 0);
  assert.equal(previewPose(.55, false).demo, 1);
});

test('reverse and fast scrolling resolve from position without a delayed timeline', () => {
  const path = [1.5, 1.15, .94, .8, .65, .55, .1, -1];
  for (const compact of [false, true]) {
    assert.deepEqual(path.map(p => previewPose(p, compact)), [...path].reverse().map(p => previewPose(p, compact)).reverse());
    for (const boundary of [1.15, .94, .55]) {
      const a = previewPose(boundary - .0001, compact), b = previewPose(boundary + .0001, compact);
      assert.ok(Math.abs(a.y - b.y) < .03);
      assert.ok(Math.abs(a.demo - b.demo) < .001);
    }
  }
});

test('workflow and process connections illuminate in order with a complete static finish', () => {
  assert.ok(Math.abs(sequenceProgress(.2, 0, 3) - .648) < 1e-10);
  assert.deepEqual([1, 2].map(i => sequenceProgress(.2, i, 3)), [0, 0]);
  assert.equal(sequenceProgress(.5, 0, 3), 1);
  assert.equal(sequenceProgress(.5, 2, 3), 0);
  for (const count of [1, 2, 3, 4]) {
    for (let i = 0; i < count; i++) {
      assert.equal(sequenceProgress(0, i, count), 0);
      assert.equal(sequenceProgress(1, i, count), 1);
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
    getBoundingClientRect() { context.reads++; return { top: this.top - context.scrollY, bottom: this.top + this.height - context.scrollY, left: 0, width: 600, height: this.height }; }
    querySelectorAll() { return []; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    removeAttribute(key) { this.attributes.delete(key); }
    contains(node) { return node === this || node?.parent === this; }
    closest() { return this.anchor || this; }
  }
  const root = new Node(0, 6500), preview = new Node(1200, 500);
  preview.dataset.flowPreview = '0';
  const workflow = [new Node(), new Node(), new Node()], links = [new Node(), new Node()];
  preview.querySelectorAll = selector => selector === '[data-workflow-step]' ? workflow : links;
  const processSteps = [0, 1, 2, 3].map(() => new Node(3600, 250));
  const intro = new Node(1000, 200), ambient = new Node(1000, 900);
  const opening = new Node(0, 900), passage = new Node(0, 4000), contact = new Node(5000, 700);
  const words = [new Node(), new Node()], light = new Node(), clearance = new Node(), exclusion = new Node();
  const selectors = {
    '[data-silk-clearance]': clearance, '[data-silk-exclusion]': exclusion,
    '[data-ribbon-art] img': new Node(200, 400), '[data-opening]': opening, '[data-solution-guide-interactive]': new Node(1400, 600),
    '[data-silk-passage]': passage, '#contact': contact, '[data-contact-light]': light,
  };
  const lists = { '[data-silk-outline]': [new Node(), new Node()], '[data-contact-word]': words,
    '[data-process-step]': processSteps, '[data-flow-preview]': [preview], '[data-flow-intro]': [intro], '[data-flow-ambient]': [ambient], section: [opening, contact] };
  root.querySelector = selector => selectors[selector];
  root.querySelectorAll = selector => lists[selector] || [];
  const motion = { ...events(), matches: !reduced }, compact = { ...events(), matches: false };
  const document = { ...events(), hidden: false, activeElement: null, fonts: { ...events(), ready: Promise.resolve() } };
  const window = events(), frames = new Map();
  let frame = 0, cleanup, resizeCallback, disconnected = false;
  context = {
    exports: {}, reads: 0, innerWidth: 1440, innerHeight: 900, scrollY: 0, document, window, location: { hash: '' },
    matchMedia: query => query.includes('prefers-reduced-motion') ? motion : compact,
    requestAnimationFrame: fn => { frames.set(++frame, fn); return frame; },
    cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: class { constructor(fn) { resizeCallback = fn; } observe() {} disconnect() { disconnected = true; } },
    require: id => id === 'react' ? { useRef: () => ({ current: root }), useEffect: fn => { cleanup = fn(); } }
      : id === 'react/jsx-runtime' ? { jsx: () => null }
      : id === './flow-motion' ? { previewPose, sequenceProgress, smooth } : { default: {} },
  };
  runInNewContext(compiled, context);
  context.exports.default({ children: null });
  const flush = () => { const work = [...frames.values()]; frames.clear(); work.forEach(fn => fn()); };
  return { context, preview, workflow, processSteps, intro, ambient, words, light, root, motion, document, window, frames, flush,
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
  assert.ok(live.preview.style.transform.includes('rotateY(8.000deg)'));
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
  assert.equal(app.preview.style['--concept-progress'], '1.0000');
  assert.ok(app.workflow.every(node => node.style['--step-progress'] === '1.0000'));
  app.document.activeElement = null; app.root.emit('focusout'); app.flush();
  app.scroll(1000);
  assert.ok(app.preview.style.transform.includes('rotateY(0.000deg)'));
  app.cleanup();
});

test('contact words slide in from opposite sides, settle, and retrace on reverse scroll', () => {
  const app = controller();
  app.scroll(4300);
  const entrance = app.words.map(word => word.style.transform);
  assert.match(entrance[0], /^translate3d\(-[\d.]+vw,/);
  assert.match(entrance[1], /^translate3d\([\d.]+vw,/);
  app.scroll(4900);
  for (const word of app.words) assert.equal(word.style.transform, 'translate3d(0.000vw,0.000px,0)');
  app.scroll(4300);
  assert.deepEqual(app.words.map(word => word.style.transform), entrance);
  app.cleanup();
});

test('layout changes above the examples invalidate cached positions', () => {
  const app = controller();
  app.scroll(1000);
  const before = app.preview.style.transform;
  app.preview.top += 500; app.resize();
  assert.notEqual(app.preview.style.transform, before);
  app.scroll(1500);
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

test('scroll frames do not read layout and skip offscreen work', () => {
  const app = controller();
  const reads = app.context.reads;
  app.scroll(650);
  const before = app.preview.style.transform;
  app.scroll(6000);
  assert.equal(app.preview.style.transform, before);
  assert.equal(app.context.reads, reads);
  app.cleanup();
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
