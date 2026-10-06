import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTutorial } from '../src/tutorial/tutorialSchema.ts';
import { parseTutorialText } from '../src/tutorial/tutorialLoader.ts';

function helloJson() {
  return readFileSync(new URL('../tutorials/hello-rectangle.tutorial.json', import.meta.url), 'utf8');
}

test('example hello-rectangle tutorial parses and validates', () => {
  const loaded = parseTutorialText(helloJson());
  assert.equal(loaded.ok, true);
  assert.equal(loaded.errors.length, 0);
  assert.ok(loaded.tutorial);
  assert.equal(loaded.tutorial.id, 'hello-rectangle');
  assert.ok(loaded.tutorial.steps.length >= 3);
  assert.ok(loaded.tutorial.steps.every((step) => step.bubble.title && step.bubble.body));
});

test('example tutorial resolves at the path App.tsx imports', () => {
  // Guards the src/App.tsx ?raw import: it must stay one level up from src/.
  const fromSrc = new URL('../src/../tutorials/hello-rectangle.tutorial.json', import.meta.url);
  const loaded = parseTutorialText(readFileSync(fromSrc, 'utf8'));
  assert.equal(loaded.ok, true);
  assert.ok(loaded.tutorial);
});

test('validator rejects a non-object, empty steps, and bad placement', () => {
  assert.equal(validateTutorial(null).ok, false);
  const empty = validateTutorial({ id: 'x', title: 'X', steps: [] });
  assert.equal(empty.ok, false);
  const badPlacement = validateTutorial({
    id: 'x',
    title: 'X',
    steps: [{ id: 's', bubble: { title: 'T', body: 'B', placement: 'sideways' } }],
  });
  assert.equal(badPlacement.ok, false);
  assert.ok(!badPlacement.ok || badPlacement.errors.some((e) => e.includes('placement')));
});

test('validator rejects unknown expect kinds, missing payloads, and duplicate ids', () => {
  const unknown = validateTutorial({
    id: 'x',
    title: 'X',
    steps: [{ id: 's', bubble: { title: 'T', body: 'B' }, expect: { kind: 'teleport' } }],
  });
  assert.equal(unknown.ok, false);

  const missingKey = validateTutorial({
    id: 'x',
    title: 'X',
    steps: [{ id: 's', bubble: { title: 'T', body: 'B' }, expect: { kind: 'press-key' } }],
  });
  assert.equal(missingKey.ok, false);

  const missingCommand = validateTutorial({
    id: 'x',
    title: 'X',
    steps: [{ id: 's', bubble: { title: 'T', body: 'B' }, expect: { kind: 'run-command', command: '' } }],
  });
  assert.equal(missingCommand.ok, false);

  const dupes = validateTutorial({
    id: 'x',
    title: 'X',
    steps: [
      { id: 's', bubble: { title: 'T', body: 'B' } },
      { id: 's', bubble: { title: 'T', body: 'B' } },
    ],
  });
  assert.equal(dupes.ok, false);
  assert.ok(!dupes.ok || dupes.errors.some((e) => e.includes('duplicate')));
});

test('validator accepts every documented expect kind and defaults expect to none', () => {
  const checked = validateTutorial({
    id: 'x',
    title: 'X',
    steps: [
      { id: 'a', bubble: { title: 'T', body: 'B' } },
      { id: 'b', bubble: { title: 'T', body: 'B' }, expect: { kind: 'none' } },
      { id: 'c', bubble: { title: 'T', body: 'B' }, expect: { kind: 'press-key', key: 'i' } },
      { id: 'd', bubble: { title: 'T', body: 'B' }, expect: { kind: 'run-command', command: 'toggle-status' } },
      { id: 'e', bubble: { title: 'T', body: 'B' }, expect: { kind: 'selection-changed' } },
      { id: 'f', bubble: { title: 'T', body: 'B' }, expect: { kind: 'scene-changed' } },
    ],
  });
  assert.equal(checked.ok, true);
  assert.ok(checked.ok && checked.tutorial.steps[0].expect?.kind === 'none');
});

test('loader reports invalid JSON instead of throwing', () => {
  const loaded = parseTutorialText('not json {');
  assert.equal(loaded.ok, false);
  assert.equal(loaded.tutorial, null);
  assert.ok(loaded.errors.length > 0);
});

test('validator accepts bubble anchor and avoid, and passes them through', () => {
  const checked = validateTutorial({
    id: 'x',
    title: 'X',
    steps: [
      {
        id: 's',
        target: 'canvas',
        bubble: { title: 'T', body: 'B', anchor: 'bottom-right', avoid: ['key-i', 'status'] },
      },
    ],
  });
  assert.equal(checked.ok, true);
  assert.ok(checked.ok);
  assert.equal(checked.tutorial.steps[0].bubble.anchor, 'bottom-right');
  assert.deepEqual(checked.tutorial.steps[0].bubble.avoid, ['key-i', 'status']);
});

test('validator rejects a bad anchor and a malformed avoid list', () => {
  const badAnchor = validateTutorial({
    id: 'x',
    title: 'X',
    steps: [{ id: 's', bubble: { title: 'T', body: 'B', anchor: 'middle' } }],
  });
  assert.equal(badAnchor.ok, false);

  const badAvoid = validateTutorial({
    id: 'x',
    title: 'X',
    steps: [{ id: 's', bubble: { title: 'T', body: 'B', avoid: 'key-i' } }],
  });
  assert.equal(badAvoid.ok, false);

  const emptyAvoidEntry = validateTutorial({
    id: 'x',
    title: 'X',
    steps: [{ id: 's', bubble: { title: 'T', body: 'B', avoid: [''] } }],
  });
  assert.equal(emptyAvoidEntry.ok, false);
});

test('intro tutorial follows the demo-then-try structure with the welcome slide intact', () => {
  const loaded = parseTutorialText(helloJson());
  assert.equal(loaded.ok, true);
  assert.ok(loaded.tutorial);
  const steps = loaded.tutorial.steps;
  assert.deepEqual(
    steps.map((s) => s.id),
    [
      'welcome',
      'watch-diagonal',
      'try-diagonal-press',
      'try-diagonal-draw',
      'watch-two-edges',
      'try-two-edges-press',
      'try-two-edges-draw',
      'shape-selector',
      'status-box',
      'available-keys',
    ],
  );
  // First slide is unchanged.
  assert.deepEqual(steps[0].bubble, {
    title: 'Welcome to NibGlider',
    body: 'The mouse steers the cursor, but keys do the clicking. This tour points at the controls you will need.',
    placement: 'center',
  });
  // Each demo pairs with its try-it key and carries playback preconditions.
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
  for (const [demoId, key] of [['watch-diagonal', 'i'], ['watch-two-edges', 'u']]) {
    const demo = byId[demoId];
    assert.ok(demo.demo && demo.demo.length > 0, demoId);
    assert.ok(demo.demo.some((a) => a.kind === 'press-key' && a.key === key), demoId);
    assert.ok(demo.preconditions, demoId);
    assert.ok(demo.bubble.anchor, demoId);
  }
  assert.equal(byId['try-diagonal-press'].expect?.kind, 'press-key');
  assert.equal(byId['try-two-edges-press'].expect?.kind, 'press-key');
  assert.equal(byId['try-diagonal-draw'].expect?.kind, 'scene-changed');
  assert.equal(byId['try-two-edges-draw'].expect?.kind, 'scene-changed');
  assert.equal(byId['shape-selector'].target, 'rect-shape-select');
  assert.equal(byId['status-box'].target, 'status');
  assert.equal(byId['available-keys'].target, 'available-keys');
});
