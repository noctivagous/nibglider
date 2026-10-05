import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import {
  editableBaselines,
  gridSnapThreshold,
  nearestGridLine,
  resolveTextMoveDelta,
} from '../src/engine/snapping/textSnap.ts';

function setup() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  const engine = new NibGliderEngine(scope, () => {});
  const guides = () => scope.project.getItems({
    match: (item) => !!(item && item.data && item.data.isBaselineGuide),
  });
  return { scope, engine, guides, cleanup: () => scope.project.remove() };
}

test('text move prefers baselines over box edges', () => {
  assert.equal(nearestGridLine(107, 20), 100);
  assert.equal(gridSnapThreshold(20), 10);
  assert.equal(gridSnapThreshold(40), 12);
  // Baseline within reach wins even when an edge is nearer the grid.
  const first = resolveTextMoveDelta(
    { baselines: [103], top: 54, bottom: 150, left: 0, right: 60 }, 0, 0, 20);
  assert.deepEqual(first, { dx: 0, dy: -3 });
  // Nearest baseline wins among several (97 rises to 100, beating 112's pull to 120).
  const multi = resolveTextMoveDelta(
    { baselines: [97, 112], top: 50, bottom: 200, left: 0, right: 60 }, 0, 0, 20);
  assert.equal(multi.dy, 3);
  // Baseline out of reach falls back to box edges.
  const edge = resolveTextMoveDelta(
    { baselines: [100], top: 81, bottom: 170, left: 5, right: 60 }, 0, 0, 40);
  assert.deepEqual(edge, { dx: -5, dy: -1 });
  // Nothing within reach leaves the delta alone (all features > 12 from a line).
  const plain = resolveTextMoveDelta(
    { baselines: [100], top: 1013, bottom: 2013, left: 1013, right: 2013 }, 4, 6, 40);
  assert.deepEqual(plain, { dx: 4, dy: 6 });
});

test('selected editable text shows its baseline grid', () => {
  const { scope, engine, guides, cleanup } = setup();
  try {
    const ascenders = () => scope.project.getItems({
      match: (item) => !!(item && item.data && item.data.isAscenderGuide),
    });
    assert.equal(guides().length, 0);
    assert.equal(engine.pastePlainText('hi'), true);
    const item = engine.selectedItems[0];
    const shown = guides();
    assert.equal(shown.length, 1);
    assert.ok(shown[0].bounds.width >= item.bounds.width);
    // Baselines run through the text local origin (line 1 at y = 0).
    const origins = editableBaselines(engine.scope, item);
    assert.equal(origins.length, 1);
    // One ascender rule per line, 0.75 leading above its baseline.
    const caps = ascenders();
    assert.equal(caps.length, 1);
    assert.ok(Math.abs(caps[0].bounds.center.y -
      (origins[0].point.y - 0.75 * item.leading)) < 1e-6);
    engine.clearOutSelection();
    assert.equal(guides().length, 0);
    assert.equal(ascenders().length, 0);
    assert.equal(engine.pastePlainText('a\nb'), true);
    assert.equal(guides().length, 2);
    assert.equal(ascenders().length, 2);
  } finally { cleanup(); }
});

test('drag moves snap baselines to the grid before box edges', () => {
  const { scope, engine, guides, cleanup } = setup();
  try {
    engine.setGridSnappingEnabled(true);
    assert.equal(engine.pastePlainText('hi'), true);
    const baseline = guides()[0].bounds.center.y;
    const grid = Math.round(baseline / 20) * 20;
    engine.moveSelectionBy(new scope.Point(0, grid - baseline + 3), true);
    assert.ok(Math.abs(guides()[0].bounds.center.y - grid) < 1e-6);
    // The raw path preserves the offset exactly.
    engine.moveSelectionBy(new scope.Point(0, 3), false);
    assert.ok(Math.abs(guides()[0].bounds.center.y - (grid + 3)) < 1e-6);
  } finally { cleanup(); }
});

test('non-text moves and idle grid ignore baseline snapping', () => {
  const { scope, engine, guides, cleanup } = setup();
  try {
    engine.setGridSnappingEnabled(true);
    const rect = new scope.Path.Rectangle({ from: [10, 10], to: [40, 40] });
    engine.addItemToSelection(rect);
    assert.equal(guides().length, 0);
    engine.moveSelectionBy(new scope.Point(7, 9), true);
    assert.ok(Math.abs(rect.position.x - (25 + 7)) < 1e-6);
    assert.ok(Math.abs(rect.position.y - (25 + 9)) < 1e-6);
    engine.clearOutSelection();
    assert.equal(engine.pastePlainText('hi'), true);
    const before = guides()[0].bounds.center.y;
    engine.setGridSnappingEnabled(false);
    engine.moveSelectionBy(new scope.Point(0, 7), true);
    assert.ok(Math.abs(guides()[0].bounds.center.y - (before + 7)) < 1e-6);
  } finally { cleanup(); }
});
