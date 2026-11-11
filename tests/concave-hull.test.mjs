import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { concaveHull, convexHullMonotone, polygonArea } from '../src/engine/geometry/concaveHull.ts';

/** C-shaped point set: an annulus sector (outer r=100, inner r=60,
 * centred at (300,300)) spanning 25°..335°, leaving a wedge gap
 * facing +x. The convex hull bridges the wedge; a concave hull
 * must follow the inner arc instead. */
function cPoints() {
  const points = [];
  for (let deg = 25; deg <= 335; deg += 10) {
    const a = (deg * Math.PI) / 180;
    points.push({ x: 300 + 100 * Math.cos(a), y: 300 + 100 * Math.sin(a) });
    points.push({ x: 300 + 60 * Math.cos(a), y: 300 + 60 * Math.sin(a) });
  }
  return points;
}

function insidePolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

test('monotone-chain convex hull rings the C and bridges its wedge', () => {
  const points = cPoints();
  const hull = convexHullMonotone(points);
  assert.ok(hull.length >= 8);
  const area = Math.abs(polygonArea(hull));
  assert.ok(area > 28000, `convex area ${area} close to the full disc`);
  assert.equal(insidePolygon({ x: 380, y: 300 }, hull), true, 'wedge point is inside the convex hull');
  assert.equal(insidePolygon({ x: 300, y: 300 }, hull), true, 'centre is inside the convex hull');
  for (const p of points) assert.equal(insidePolygon(p, hull) || hull.includes(p), true, 'every point is in or on the hull');
});

test('kNN concave hull follows the C: smaller area, wedge and hole left outside', () => {
  const points = cPoints();
  const hull = concaveHull(points, 4);
  assert.ok(hull, 'a hull was found');
  const area = Math.abs(polygonArea(hull));
  const convexArea = Math.abs(polygonArea(convexHullMonotone(points)));
  const sectorArea = (310 / 360) * Math.PI * (100 * 100 - 60 * 60); // ≈ 17316
  assert.ok(area < convexArea * 0.72, `concave area ${area} well under convex ${convexArea}`);
  assert.ok(area > sectorArea * 0.78, `concave area ${area} still covers the sector (${sectorArea})`);
  assert.equal(insidePolygon({ x: 380, y: 300 }, hull), false, 'wedge point stays outside');
  assert.equal(insidePolygon({ x: 300, y: 300 }, hull), false, 'the annulus hole stays outside');
  assert.equal(insidePolygon({ x: 220, y: 300 }, hull), true, 'material point is inside');
  // Every hull vertex is one of the input points.
  const keys = new Set(points.map((p) => `${p.x},${p.y}`));
  for (const v of hull) assert.ok(keys.has(`${v.x},${v.y}`), 'hull vertices come from the point set');
});

test('concave hull degenerates safely: too few points and collinear sets', () => {
  assert.equal(concaveHull([{ x: 0, y: 0 }, { x: 10, y: 0 }], 3), null);
  assert.equal(concaveHull([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], 3), null);
  const tri = concaveHull([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }], 3);
  assert.equal(tri.length, 3);
});

test('engine concave hull deposits one closed path around the selection anchors, in one undo step', () => {
  const s = new paper.PaperScope();
  s.setup(new s.Size(900, 700));
  const e = new NibGliderEngine(s, () => {});
  try {
    const outer = [];
    const inner = [];
    for (let deg = 25; deg <= 335; deg += 10) {
      const a = (deg * Math.PI) / 180;
      outer.push(new s.Point(300 + 100 * Math.cos(a), 300 + 100 * Math.sin(a)));
      inner.push(new s.Point(300 + 60 * Math.cos(a), 300 + 60 * Math.sin(a)));
    }
    const outerPath = new s.Path({ segments: outer, strokeColor: 'black' });
    const innerPath = new s.Path({ segments: inner, strokeColor: 'black' });
    s.project.activeLayer.addChild(outerPath);
    s.project.activeLayer.addChild(innerPath);
    e.addItemToSelection(outerPath);
    e.addItemToSelection(innerPath);
    e.setHullConcaveness(1);
    const before = e.contentItems().length;
    assert.equal(e.concaveHullSelection(), 1);
    const items = e.contentItems();
    assert.equal(items.length, before + 1, 'one new item; sources untouched');
    const hullItem = items.find((item) => item.data?.concaveHullRecord);
    assert.ok(hullItem, 'the hull item carries its record');
    assert.equal(hullItem.closed, true);
    assert.equal(hullItem.data.concaveHullRecord.anchors, 64);
    const area = Math.abs(hullItem.area);
    assert.ok(area < 23000 && area > 12000, `hull area ${area} follows the C, not the disc`);
    assert.match(e.pathOpFeedback, /Concave hull/);
    e.undo();
    assert.equal(e.contentItems().length, before, 'one undo removes the hull');
  } finally {
    e.cancelCurrentDrawingOperation();
    s.project.remove();
  }
});
