import test from 'node:test';
import assert from 'node:assert/strict';
import { TUTORIAL_CATALOG, tutorialByCommand, tutorialById } from '../src/tutorial/tutorialCatalog.ts';
import { parseTutorialText } from '../src/tutorial/tutorialLoader.ts';

test('catalog covers the roadmap tutorial topics in order', () => {
  assert.deepEqual(TUTORIAL_CATALOG.map((e) => e.id), [
    'hello-rectangle', 'demo-rectangle', 'fix-a-shape', 'fill-and-stroke',
    'adding-text', 'grouping-and-ordering', 'saving-and-exporting',
  ]);
});

test('every catalog tutorial parses and validates', () => {
  for (const entry of TUTORIAL_CATALOG) {
    const loaded = parseTutorialText(entry.raw);
    assert.equal(loaded.ok, true, `${entry.id}: ${loaded.errors.join('; ')}`);
    assert.equal(loaded.tutorial.id, entry.id);
    assert.ok(loaded.tutorial.steps.length >= 3, `${entry.id} has at least 3 steps`);
  }
});

test('catalog lookups by command and id agree', () => {
  for (const entry of TUTORIAL_CATALOG) {
    assert.equal(tutorialByCommand(entry.command), entry);
    assert.equal(tutorialById(entry.id), entry);
  }
  assert.equal(tutorialByCommand('no-such-command'), null);
  assert.equal(tutorialById('no-such-id'), null);
});
