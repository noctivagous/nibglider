import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { TUTORIAL_CATALOG } from '../src/tutorial/tutorialCatalog.ts';
import { parseTutorialText } from '../src/tutorial/tutorialLoader.ts';

// Slice 28: every target a tutorial names — step targets, bubble avoid
// ids, and demo move-cursor / point-at targets — must resolve in the
// composed UI. The id sources are parsed from the same files the app
// composes its data-tutorial-id attributes from, not hand-copied lists:
//   literal ids  — static data-tutorial-id / tutorialId attributes in src
//                  (canvas, status, available-keys, rect-shape-select,
//                  circle-shape-select, …)
//   section-<id> — PANEL_SECTIONS in src/ui/PanelsManager.ts, composed
//                  in ControlPanel as data-tutorial-id={`section-${id}`}
//   key-<dataKey>— the physical key definitions in
//                  src/engine/input/keymap.ts, composed in
//                  OnscreenKeyboard as data-tutorial-id={`key-${dataKey}`}
//   menu-<id>    — <menu id="…"> in src/ui/menus/menus.xml, composed in
//                  AppMenu as data-tutorial-id={`menu-${menu.id}`}

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

function sectionIds() {
  const src = read('src/ui/PanelsManager.ts');
  const start = src.indexOf('PANEL_SECTIONS');
  const block = src.slice(start, src.indexOf('];', start));
  return new Set([...block.matchAll(/\{ id: '([^']+)'/g)].map((m) => m[1]));
}

function dataKeys() {
  const src = read('src/engine/input/keymap.ts');
  return new Set([...src.matchAll(/dataKey: '([^']+)'/g)].map((m) => m[1]));
}

function menuIds() {
  const xml = read('src/ui/menus/menus.xml');
  return new Set([...xml.matchAll(/<menu id="([^"]+)"/g)].map((m) => m[1]));
}

function literalIds() {
  const ids = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry.name)) {
        for (const m of read(rel).matchAll(/(?:data-tutorial-id|tutorialId)="([^"]+)"/g)) ids.add(m[1]);
      }
    }
  };
  walk('src');
  return ids;
}

function resolves(id, sources) {
  if (sources.literals.has(id)) return true;
  if (id.startsWith('section-')) return sources.sections.has(id.slice('section-'.length));
  if (id.startsWith('key-')) return sources.keys.has(id.slice('key-'.length));
  if (id.startsWith('menu-')) return sources.menus.has(id.slice('menu-'.length));
  return false;
}

function* stepTargets(step) {
  if (step.target) yield step.target;
  for (const avoid of step.bubble.avoid ?? []) yield avoid;
  for (const action of step.demo ?? []) {
    if (action.kind === 'move-cursor') yield action.to;
    if (action.kind === 'point-at') yield action.target;
  }
}

test('id sources parse to the expected shapes (guards against a vacuous pass)', () => {
  const sources = { literals: literalIds(), sections: sectionIds(), keys: dataKeys(), menus: menuIds() };
  assert.equal(sources.sections.size, 15);
  assert.ok(sources.keys.size > 40, `expected the full keyboard, got ${sources.keys.size}`);
  assert.equal(sources.menus.size, 11);
  for (const literal of ['canvas', 'status', 'available-keys', 'rect-shape-select', 'circle-shape-select']) {
    assert.ok(sources.literals.has(literal), `literal ${literal} is composed in src`);
  }
});

test('every tutorial target resolves against the composed id sources', () => {
  const sources = { literals: literalIds(), sections: sectionIds(), keys: dataKeys(), menus: menuIds() };
  const failures = [];
  let walked = 0;
  for (const entry of TUTORIAL_CATALOG) {
    const loaded = parseTutorialText(entry.raw);
    assert.equal(loaded.ok, true, `${entry.id} parses`);
    for (const step of loaded.tutorial.steps) {
      for (const target of stepTargets(step)) {
        walked += 1;
        if (!resolves(target, sources)) {
          failures.push(`${entry.id}/${step.id}: "${target}" does not resolve`);
        }
      }
    }
  }
  assert.ok(walked > 60, `expected to walk the whole catalog's targets, walked ${walked}`);
  assert.deepEqual(failures, []);
});
