// Swatch storage (Slice 4): normalization, document palette and
// recents persistence over an in-memory store, plus the eyedropper
// sampling fill/stroke from canvas objects.
import test from 'node:test';
import assert from 'node:assert/strict';

import paper from 'paper';

const sw = await import('../src/ui/swatches.ts');
const { NibGliderEngine } = await import('../src/engine/engine.ts');

function memoryStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
}

test('normalizeSwatchColor canonicalizes hex forms', () => {
  assert.equal(sw.normalizeSwatchColor('#ABC'), '#aabbcc');
  assert.equal(sw.normalizeSwatchColor(' #FF0000 '), '#ff0000');
  assert.equal(sw.normalizeSwatchColor('red'), null);
  assert.equal(sw.normalizeSwatchColor('#12345'), null);
  assert.equal(sw.normalizeSwatchColor(42), null);
});

test('document palette persists, dedupes, and removes', () => {
  const store = memoryStore();
  let palette = sw.loadDocumentPalette(store);
  assert.deepEqual(palette, []);
  palette = sw.addDocumentSwatch(palette, '#FF0000', store);
  palette = sw.addDocumentSwatch(palette, '#00ff00', store);
  palette = sw.addDocumentSwatch(palette, '#ff0000', store);
  assert.deepEqual(palette, ['#00ff00', '#ff0000'], 'newest first, no duplicates');
  assert.deepEqual(sw.loadDocumentPalette(store), palette, 'persisted across loads');
  palette = sw.removeDocumentSwatch(palette, '#FF0000', store);
  assert.deepEqual(sw.loadDocumentPalette(store), ['#00ff00']);
});

test('recents are most-recent-first, deduped, and capped', () => {
  const store = memoryStore();
  let recents = [];
  for (let i = 0; i < 15; i += 1) {
    recents = sw.pushRecentColor(recents, `#0000${String(i).padStart(2, '0')}`, store);
  }
  assert.equal(recents.length, sw.MAX_RECENT_COLORS);
  const sixth = recents[5];
  recents = sw.pushRecentColor(recents, sixth, store);
  assert.equal(recents[0], sixth);
  assert.equal(recents.filter((c) => c === sixth).length, 1);
  assert.deepEqual(sw.loadRecentColors(store), recents);
});

test('default palette is a sane spread of distinct hex colours', () => {
  assert.ok(sw.DEFAULT_PALETTE.length >= 24);
  for (const color of sw.DEFAULT_PALETTE) {
    assert.equal(sw.normalizeSwatchColor(color), color);
  }
  assert.equal(new Set(sw.DEFAULT_PALETTE).size, sw.DEFAULT_PALETTE.length);
});

test('eyedropper samples fill and stroke from the topmost object', () => {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  const engine = new NibGliderEngine(scope, () => {});
  const under = new scope.Path.Rectangle(new scope.Rectangle(0, 0, 200, 200));
  under.fillColor = new scope.Color('#0000ff');
  const over = new scope.Path.Rectangle(new scope.Rectangle(50, 50, 100, 100));
  over.fillColor = new scope.Color('#ff0000');
  over.strokeColor = new scope.Color('#00ff00');
  over.strokeWidth = 4;
  scope.project.activeLayer.addChildren([under, over]);
  const picked = engine.pickEyedropperColor({ x: 100, y: 100 });
  assert.deepEqual(picked, { fill: '#ff0000', stroke: '#00ff00' });
  const pickedUnder = engine.pickEyedropperColor({ x: 10, y: 10 });
  assert.equal(pickedUnder.fill, '#0000ff');
  assert.equal(engine.pickEyedropperColor({ x: 500, y: 500 }), null);
  // One-shot press routing: activates, samples into the current fill.
  engine.setEyedropperActive(true);
  assert.equal(engine.eyedropperDown(new scope.Point(100, 100)), true);
  assert.equal(engine.eyedropperActive, false, 'one-shot: deactivates after sampling');
  assert.equal(engine.globalFillColor, '#ff0000');
});
