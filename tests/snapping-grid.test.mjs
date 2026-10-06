import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { snapAngle, snapAspect, snapGrid, snapLength } from '../src/engine/snapping/snappingMath.ts';
import { GridRenderer } from '../src/engine/snapping/GridRenderer.ts';
import { SnappingManager } from '../src/engine/snapping/SnappingManager.ts';
import { NibGliderEngine } from '../src/engine/engine.ts';

function scope() { const s = new paper.PaperScope(); s.setup(new s.Size(400, 300)); return s; }
function near(point, x, y) { assert.ok(Math.abs(point.x - x) < 1e-8); assert.ok(Math.abs(point.y - y) < 1e-8); }

test('pure snapping math handles square/diamond, angle, length, and aspect constraints', () => {
  assert.deepEqual(snapGrid({ x: 13, y: -11 }, 10, 'square'), { x: 10, y: -10 });
  near(snapGrid({ x: 12, y: 9 }, 20, 'diamond'), 14.142135623730951, 14.142135623730951);
  const angled = Math.hypot(10, 8) / Math.SQRT2;
  near(snapAngle({ x: 0, y: 0 }, { x: 10, y: 8 }, 45), angled, angled);
  near(snapLength({ x: 0, y: 0 }, { x: 13, y: 0 }, 10), 10, 0);
  assert.deepEqual(snapAspect({ x: 0, y: 0 }, { x: -9, y: 20 }, 3, 4), { x: -15, y: 20 });
});

test('grid renderer creates guide dots, preserves active layer, and controls cursor visibility', () => {
  const s = scope();
  try {
    const active = s.project.activeLayer;
    const grid = new GridRenderer(s);
    grid.draw('square', 20);
    assert.equal(grid.gridLayer.guide, true);
    assert.equal(grid.gridLayer.locked, true);
    assert.ok(grid.gridLayer.children.length > 0);
    assert.equal(s.project.activeLayer, active);
    let mounted = null;
    grid.updateCursor(new s.Point(20, 40), true, (item) => { mounted = item; });
    assert.equal(mounted, grid.gridCursor);
    assert.equal(grid.gridCursor.visible, true);
    grid.updateCursor(null, false, () => {});
    assert.equal(grid.gridCursor.visible, false);
    grid.clear(); assert.equal(grid.gridLayer.children.length, 0);
  } finally { s.project.remove(); }
});

test('snapping manager ignores previews and guides, snaps path before points, and mounts indicators', () => {
  const s = scope();
  try {
    const target = new s.Path({ segments: [[0, 0], [100, 0]] });
    const preview = new s.Path({ segments: [[51, 2], [90, 2]] }); preview.data.isPathPreview = true;
    const guide = new s.Path({ segments: [[52, 0], [52, 20]] }); guide.guide = true;
    const mounted = []; let pathCursor = null; let pointCursor = null;
    const state = { gridEnabled: true, gridSnapping: true, gridType: 'square', gridSpacing: 20,
      path: true, point: true, angle: true, length: true, aspect: true, angleDegrees: 45, lengthStep: 10, aspectA: 3, aspectB: 4 };
    const manager = new SnappingManager(s, () => state, () => new Set([preview]), (item) => !!item.guide,
      { mount: (item) => mounted.push(item), pathCursor: (item) => { pathCursor = item; }, pointCursor: (item) => { pointCursor = item; } });
    near(manager.grid(new s.Point(12, 9)), 20, 0);
    const diagonal = Math.hypot(9, 8) / Math.SQRT2;
    near(manager.angle(new s.Point(0, 0), new s.Point(9, 8)), diagonal, diagonal);
    near(manager.length(new s.Point(0, 0), new s.Point(13, 0)), 10, 0);
    near(manager.aspect(new s.Point(0, 0), new s.Point(10, 20)), 15, 20);
    const path = manager.snapPath(new s.Point(52, 7)); near(path, 52, 0);
    const point = manager.snapPoint(new s.Point(2, 2)); near(point, 0, 0);
    assert.equal(pathCursor, manager.pathIndicator);
    assert.equal(pointCursor, manager.pointIndicator);
    assert.ok(mounted.includes(pathCursor) && mounted.includes(pointCursor));
    state.path = false; assert.equal(manager.snapPath(new s.Point(1, 1)), null); assert.equal(pathCursor.visible, false);
  } finally { s.project.remove(); }
});

test('point snapping hits path intersections that are not vertices or midpoints', () => {
  const s = scope();
  try {
    const state = { gridEnabled: false, gridSnapping: false, gridType: 'square', gridSpacing: 20,
      path: false, point: true, angle: false, length: false, aspect: false,
      angleDegrees: 45, lengthStep: 10, aspectA: 3, aspectB: 4 };
    const manager = new SnappingManager(s, () => state, () => new Set(), (item) => !!item.guide,
      { mount: () => {}, pathCursor: () => {}, pointCursor: () => {} });
    // Crossing at (66.67, 0): neither a vertex nor a midpoint of either line.
    new s.Path({ segments: [[0, 0], [100, 0]] });
    new s.Path({ segments: [[25, -50], [75, 10]] });
    const crossing = manager.snapPoint(new s.Point(67, 2));
    assert.ok(crossing);
    assert.ok(Math.abs(crossing.x - 200 / 3) < 1e-4, `x ${crossing.x} ~= ${200 / 3}`);
    assert.ok(Math.abs(crossing.y - 0) < 1e-4, `y ${crossing.y} ~= 0`);
    // Far from the crossing, no snap: the intersection is out of tolerance.
    s.project.activeLayer.removeChildren();
    new s.Path({ segments: [[0, 0], [100, 0]] });
    new s.Path({ segments: [[25, -50], [75, 10]] });
    assert.equal(manager.snapPoint(new s.Point(200, 200)), null);
  } finally { s.project.remove(); }
});

test('point snapping hits a path self-intersection', () => {
  const s = scope();
  try {
    const state = { gridEnabled: false, gridSnapping: false, gridType: 'square', gridSpacing: 20,
      path: false, point: true, angle: false, length: false, aspect: false,
      angleDegrees: 45, lengthStep: 10, aspectA: 3, aspectB: 4 };
    const manager = new SnappingManager(s, () => state, () => new Set(), (item) => !!item.guide,
      { mount: () => {}, pathCursor: () => {}, pointCursor: () => {} });
    new s.Path({ segments: [[0, 0], [100, 100], [100, 0], [0, 100]], closed: true });
    const snapped = manager.snapPoint(new s.Point(52, 48));
    assert.ok(snapped);
    near(snapped, 50, 50);
  } finally { s.project.remove(); }
});

test('engine delegates grid and pointer snapping to manager state', () => {
  const s = scope(); const engine = new NibGliderEngine(s, () => {});
  try {
    engine.setGridEnabled(true); engine.setGridSnappingEnabled(true); engine.gridSpacing = 20;
    near(engine.snapToGrid(new s.Point(9, 11)), 0, 20);
    engine.setGridType('diamond');
    near(engine.snapToGrid(new s.Point(12, 9)), 14.142135623730951, 14.142135623730951);
    const target = new s.Path({ segments: [[100, 0], [150, 0]] });
    engine.isPathSnappingEnabled = true; engine.mousePt = new s.Point(119, 6);
    engine.applyPathSnapping(engine.mousePt);
    near(engine.mousePt, 119, 0);
    assert.ok(engine.pathSnapCursor.visible);
    target.remove();
  } finally { s.project.remove(); }
});
