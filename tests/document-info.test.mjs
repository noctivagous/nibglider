import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import {
  currentName,
  renameDocument,
  saveDocument,
} from '../src/ui/DocumentGallery.ts';

function store() {
  const mem = new Map();
  return { getItem: (key) => (mem.has(key) ? mem.get(key) : null), setItem: (key, value) => { mem.set(key, value); } };
}

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

test('gallery rename flow backing the Document Info name field', () => {
  const mem = store();
  const id = saveDocument(mem, 'First', '<svg></svg>');
  assert.equal(currentName(mem), 'First');
  assert.equal(renameDocument(mem, id, '  Second  '), true);
  assert.equal(currentName(mem), 'Second');
  assert.equal(renameDocument(mem, id, '   '), false);
  assert.equal(currentName(mem), 'Second');
  assert.equal(renameDocument(mem, 'unknown-id', 'Nope'), false);
});
