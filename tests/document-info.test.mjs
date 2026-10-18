import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import {
  currentName,
  memoryGallery,
  renameDocument,
  saveDocument,
} from '../src/ui/DocumentGallery.ts';

function setup() {
  const s = new paper.PaperScope();
  s.setup(new s.Size(400, 300));
  const engine = new NibGliderEngine(s, () => {});
  return { scope: s, engine };
}

test('an empty headless document reports no objects and no layers', () => {
  const { scope, engine } = setup();
  try {
    // Paper creates no layers until artwork exists; nothing counts yet.
    assert.deepEqual(engine.documentStats(), { objectCount: 0, layerCount: 0 });
  } finally { scope.project.remove(); }
});

test('deposited artwork counts as objects; guide layers never count', () => {
  const { scope, engine } = setup();
  try {
    new scope.Path({ segments: [[0, 0], [50, 0], [50, 50]] });
    assert.deepEqual(engine.documentStats(), { objectCount: 1, layerCount: 1 });
    const guide = new scope.Layer();
    guide.guide = true;
    guide.addChild(new scope.Path({ segments: [[0, 0], [10, 10]] }));
    scope.project.addLayer(guide);
    assert.deepEqual(engine.documentStats(), { objectCount: 1, layerCount: 1 });
  } finally { scope.project.remove(); }
});

test('gallery rename flow backing the Document Info name field', async () => {
  const db = memoryGallery();
  const id = await saveDocument(db, 'First', '<svg></svg>');
  assert.equal(await currentName(db), 'First');
  assert.equal(await renameDocument(db, id, '  Second  '), true);
  assert.equal(await currentName(db), 'Second');
  assert.equal(await renameDocument(db, id, '   '), false);
  assert.equal(await currentName(db), 'Second');
  assert.equal(await renameDocument(db, 'unknown-id', 'Nope'), false);
});
