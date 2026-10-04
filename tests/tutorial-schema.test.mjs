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
