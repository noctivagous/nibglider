// Align/distribute math (pure) + engine integration: one history
// entry per operation, flips mirror around the selection centre.
import test from 'node:test';
import assert from 'node:assert/strict';

import paper from 'paper';

const { alignDeltas, alignToSelectionDeltas, distributeDeltas } = await import('../src/engine/geometry/arrange.ts');
const { NibGliderEngine } = await import('../src/engine/engine.ts');

const B = (x, y, width, height) => ({ x, y, width, height });

test('align to selection: edges and centres', () => {
  const items = [B(0, 0, 10, 10), B(30, 5, 20, 10), B(15, 40, 10, 20)];
  assert.deepEqual(alignToSelectionDeltas(items, 'left'), [
    { x: 0, y: 0 }, { x: -30, y: 0 }, { x: -15, y: 0 },
  ]);
  assert.deepEqual(alignToSelectionDeltas(items, 'right').map((d) => d.x), [40, 0, 25]);
  assert.deepEqual(alignToSelectionDeltas(items, 'centerX').map((d) => d.x), [20, -15, 5]);
  assert.deepEqual(alignToSelectionDeltas(items, 'top').map((d) => d.y), [0, -5, -40]);
  assert.deepEqual(alignToSelectionDeltas(items, 'bottom').map((d) => d.y), [50, 45, 0]);
  assert.deepEqual(alignToSelectionDeltas(items, 'centerY').map((d) => d.y), [25, 20, -20]);
});

test('align to a document reference rect', () => {
  const page = B(100, 100, 400, 300);
  assert.deepEqual(alignDeltas([B(150, 160, 50, 50)], 'left', page), [{ x: -50, y: 0 }]);
  assert.deepEqual(alignDeltas([B(150, 160, 50, 50)], 'centerY', page), [{ x: 0, y: 65 }]);
});

test('distribute: equal gaps, ends stay, input order preserved', () => {
  const items = [B(100, 0, 10, 10), B(0, 0, 10, 10), B(50, 0, 20, 10)];
  // Span 0..110, sizes 40, gaps = (110-40)/2 = 35: order by x is
  // idx1 (0), idx2 (50→45), idx0 (100). 
  const deltas = distributeDeltas(items, 'horizontal');
  assert.deepEqual(deltas[1], { x: 0, y: 0 });
  assert.deepEqual(deltas[2], { x: -5, y: 0 });
  assert.deepEqual(deltas[0], { x: 0, y: 0 });
  const vertical = distributeDeltas([B(0, 0, 10, 10), B(0, 90, 10, 10), B(0, 30, 10, 30)], 'vertical');
  // Span 0..100, sizes 50, gaps 25: middle moves 30 → 35.
  assert.deepEqual(vertical[2], { x: 0, y: 5 });
  assert.deepEqual(distributeDeltas([B(0, 0, 5, 5), B(9, 0, 5, 5)], 'horizontal'), [
    { x: 0, y: 0 }, { x: 0, y: 0 },
  ], 'fewer than three items: no-op');
});

function makeEngine() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(1000, 800));
  return { scope, engine: new NibGliderEngine(scope, () => {}) };
}

function rect(scope, x, y, w, h) {
  const r = new scope.Path.Rectangle(new scope.Rectangle(x, y, w, h));
  r.fillColor = new scope.Color('#888888');
  scope.project.activeLayer.addChild(r);
  return r;
}

test('engine align + distribute move the selection as one undo entry', () => {
  const { scope, engine } = makeEngine();
  const a = rect(scope, 0, 0, 20, 20);
  const b = rect(scope, 100, 40, 20, 20);
  const c = rect(scope, 200, 90, 20, 20);
  for (const item of [a, b, c]) engine.addItemToSelection(item);
  engine.alignSelection('left', 'selection');
  assert.deepEqual([a.bounds.x, b.bounds.x, c.bounds.x], [0, 0, 0]);
  engine.undo();
  assert.deepEqual([a.bounds.x, b.bounds.x, c.bounds.x], [0, 100, 200], 'one undo restores all');
  engine.redo();
  engine.distributeSelection('vertical');
  // Heights 20 each; span y 0..110 → gaps (110-60)/2 = 25: tops 0, 45, 90.
  assert.deepEqual([a.bounds.y, b.bounds.y, c.bounds.y], [0, 45, 90]);
});

test('engine flip mirrors around the selection centre and undoes', () => {
  const { scope, engine } = makeEngine();
  const a = rect(scope, 0, 0, 20, 10);
  const b = rect(scope, 60, 0, 20, 10);
  engine.addItemToSelection(a);
  engine.addItemToSelection(b);
  engine.flipSelection('horizontal');
  // Collective centre x = 40: a (0..20) lands at 60..80, b at 0..20.
  assert.deepEqual([Math.round(a.bounds.x), Math.round(b.bounds.x)], [60, 0]);
  engine.undo();
  assert.deepEqual([Math.round(a.bounds.x), Math.round(b.bounds.x)], [0, 60]);
});

test('engine flip vertical mirrors positions across the centre line', () => {
  const { scope, engine } = makeEngine();
  const a = rect(scope, 0, 0, 20, 10);
  const b = rect(scope, 0, 30, 20, 20);
  engine.addItemToSelection(a);
  engine.addItemToSelection(b);
  engine.flipSelection('vertical');
  // Centre y = 25: a (0..10) lands at 40..50; b (30..50) lands at 0..20.
  assert.deepEqual([Math.round(a.bounds.y), Math.round(b.bounds.y)], [40, 0]);
});
