import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { InterlaceManager } from '../src/engine/scene/InterlaceManager.ts';
import { gapRectFor, ribbonPolygon, WeaveError } from '../src/engine/geometry/interlaceWeave.ts';
import { resolveOutlinedStroke } from '../src/engine/geometry/outlinedStroke.ts';

function engine() {
  const s = new paper.PaperScope();
  s.setup(new s.Size(800, 600));
  const e = new NibGliderEngine(s, () => {});
  return { s, e, layer: s.project.activeLayer, cleanup: () => { e.cancelCurrentDrawingOperation(); s.project.remove(); } };
}

// A horizontal stroke crossed twice by a zigzag stroke.
function weavePair(s) {
  const a = new s.Path({ segments: [[-50, 0], [50, 0]], strokeColor: 'black', strokeWidth: 10 });
  const b = new s.Path({
    segments: [[-50, -20], [0, 20], [50, -20]], strokeColor: 'black', strokeWidth: 10,
  });
  return { a, b, crossings: [{ x: -25, y: 0 }, { x: 25, y: 0 }] };
}

// Spine height of a result's interlace memo identifies its lineage.
function spineHeight(item) {
  const ys = item.data.interlace.spine.segments.map((s) => s.point.y);
  return Math.max(...ys) - Math.min(...ys);
}

test('gap footprint parallels the peer and spans shallow crossings', () => {
  // Right-angle crossing: width clears the over-band plus daylight.
  const square = gapRectFor(0, 10, 10, 1);
  assert.equal(square.angle, 0);
  assert.equal(square.width, 14);
  assert.equal(square.length, 14);
  // The footprint keeps the peer's angle, never the under-band's.
  assert.equal(gapRectFor(Math.PI / 4, 10, 10, Math.SQRT1_2).angle, Math.PI / 4);
  // Shallower crossings lengthen along the peer but never narrow the width.
  const shallow = gapRectFor(0.3, 10, 10, 0.4);
  assert.ok(shallow.length > square.length);
  assert.equal(shallow.width, square.width);
  // Near-tangent crossings clamp instead of blowing up.
  const grazing = gapRectFor(0, 10, 10, 0.01);
  assert.ok(Number.isFinite(grazing.length));
  assert.ok(grazing.length < 10 / 0.35 + 4 + 1);
});

test('cut ends parallel the peer band', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const { a, b } = weavePair(s);
    e.addItemToSelection(a);
    e.addItemToSelection(b);
    e.interlaceSelection();
    // The under-band at the first crossing: the gap edges near it are the
    // sides of the padded horizontal peer. A long peer has no butt cap here,
    // so those edges are parallel to the peer.
    const c0 = { x: -25, y: 0 };
    const under = layer.children.find((child) => !child.contains(new s.Point(c0.x, c0.y)));
    const paths = under.className === 'CompoundPath' ? [...under.children] : [under];
    let checked = 0;
    for (const p of paths) {
      for (let i = 0; i < p.segments.length; i++) {
        const p0 = p.segments[i].point;
        const p1 = p.segments[(i + 1) % p.segments.length].point;
        const mx = (p0.x + p1.x) / 2; const my = (p0.y + p1.y) / 2;
        if (Math.hypot(mx - c0.x, my - c0.y) >= 13) continue;
        if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 0.5) continue;
        const mod = ((Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI) % 180 + 180) % 180;
        assert.ok(mod < 5 || mod > 175, `cut edge at ${mod.toFixed(1)}° is not peer-parallel`);
        checked++;
      }
    }
    assert.ok(checked >= 2, 'expected gap edges near the crossing');
  } finally { cleanup(); }
});

test('a bar through a hexagon corner weaves as one shaped cut', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    // A vertical bar through neighboring hex edges: two spine crossings
    // 13.9 apart share one daylight region around the corner vertex.
    const hexPts = [];
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3;
      hexPts.push([40 * Math.cos(a), 40 * Math.sin(a)]);
    }
    const hex = new s.Path({ segments: hexPts, closed: true, strokeColor: 'black', strokeWidth: 12 });
    const bar = new s.Path({ segments: [[36, -60], [36, 60]], strokeColor: 'black', strokeWidth: 12 });
    e.addItemToSelection(hex);
    e.addItemToSelection(bar);
    e.interlaceSelection();
    assert.equal(layer.children.length, 2);
    const weave = e.selectedInterlaceWeave();
    assert.equal(weave.crossings.length, 1);
    assert.equal(weave.crossings[0].over, 0);
    const hexBand = layer.children.find((child) => child.bounds.width > 30);
    const barBand = layer.children.find((child) => child !== hexBand);
    // The over-site survives: the neighbor cut must not punch a hole there.
    assert.equal(hexBand.contains(new s.Point(36, 6.93)), true);
    // The whole ring spine survives, so the corner wedge stays connected
    // instead of stranding a stray point past the cut.
    for (let k = 0; k < 6; k++) {
      const a0 = k * Math.PI / 3, a1 = (k + 1) * Math.PI / 3;
      for (const t of [0, 0.5]) {
        const x = 40 * (Math.cos(a0) * (1 - t) + Math.cos(a1) * t);
        const y = 40 * (Math.sin(a0) * (1 - t) + Math.sin(a1) * t);
        assert.equal(hexBand.contains(new s.Point(x, y)), true, `ring spine at (${x.toFixed(1)},${y.toFixed(1)})`);
      }
    }
    // The under-bar is severed at the corner but intact outside the slot.
    assert.equal(barBand.contains(new s.Point(36, 6.93)), false);
    assert.equal(barBand.contains(new s.Point(36, 40)), true);
    assert.equal(barBand.contains(new s.Point(36, -40)), true);
    // The hex hole's inner miter used to pinch off a speck of the bar.
    assert.equal(barBand.contains(new s.Point(30.4, 0)), false);
    const barPaths = barBand.className === 'CompoundPath' ? [...barBand.children] : [barBand];
    for (const path of barPaths) {
      for (const seg of path.segments) {
        assert.ok(Math.hypot(seg.point.x - 30.76, seg.point.y) > 0.4, 'stray miter point on the bar');
      }
    }
  } finally { cleanup(); }
});

test('five intersecting strokes weave in one op', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const h = new s.Path({ segments: [[-60, 0], [60, 0]], strokeColor: 'black', strokeWidth: 10 });
    const verticals = [-45, -15, 15, 45].map((x) =>
      new s.Path({ segments: [[x, -40], [x, 40]], strokeColor: 'black', strokeWidth: 10 }));
    e.addItemToSelection(h);
    for (const v of verticals) e.addItemToSelection(v);
    assert.equal(e.canInterlaceSelection(), true);
    // Live groups stay two-member: five fresh strokes are op-only.
    assert.equal(e.canInterlaceGroupSelection(), false);
    e.interlaceSelection();
    assert.equal(e.lastCombineNote, '');
    assert.equal(e.undoLabel(), 'Interlace');
    assert.equal(layer.children.length, 5);
    // Pairs run in selection order with the pair-ordinal alternation:
    // H over at x=-45 and x=15, under at x=-15 and x=45.
    const weave = e.selectedInterlaceWeave();
    assert.equal(weave.members, 5);
    assert.deepEqual(weave.crossings.map((c) => c.x), [-45, -15, 15, 45]);
    assert.deepEqual(weave.crossings.map((c) => c.over), [0, 2, 0, 4]);
    // Exactly one band covers each crossing — the winner.
    for (const c of weave.crossings) {
      const covering = layer.children.filter((child) => child.contains(new s.Point(c.x, c.y)));
      assert.equal(covering.length, 1, `crossing #${c.number} has no single winner`);
    }
    for (const child of layer.children) {
      assert.equal(child.data.interlace.sources.length, 5);
    }
    e.undo();
    assert.equal(layer.children.length, 5);
    assert.ok(layer.children.includes(h));
    for (const v of verticals) assert.ok(layer.children.includes(v));
  } finally { cleanup(); }
});

test('a chain linked through one middle stroke weaves together', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    // A and C never cross each other; each crosses B.
    const a = new s.Path({ segments: [[-20, -40], [-20, 40]], strokeColor: 'black', strokeWidth: 10 });
    const b = new s.Path({ segments: [[-60, 0], [60, 0]], strokeColor: 'black', strokeWidth: 10 });
    const c = new s.Path({ segments: [[20, -40], [20, 40]], strokeColor: 'black', strokeWidth: 10 });
    e.addItemToSelection(a);
    e.addItemToSelection(b);
    e.addItemToSelection(c);
    assert.equal(e.canInterlaceSelection(), true);
    e.interlaceSelection();
    assert.equal(layer.children.length, 3);
    const weave = e.selectedInterlaceWeave();
    assert.equal(weave.crossings.length, 2);
    assert.deepEqual(weave.crossings.map((c) => c.over), [0, 1]);
    e.undo();
    assert.equal(layer.children.length, 3);
  } finally { cleanup(); }
});

test('a disconnected stroke blocks the multi-weave with a note', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const a = new s.Path({ segments: [[-50, 0], [50, 0]], strokeColor: 'black', strokeWidth: 10 });
    const b = new s.Path({ segments: [[0, -40], [0, 40]], strokeColor: 'black', strokeWidth: 10 });
    const far = new s.Path({ segments: [[200, -40], [200, 40]], strokeColor: 'black', strokeWidth: 10 });
    e.addItemToSelection(a);
    e.addItemToSelection(b);
    e.addItemToSelection(far);
    assert.equal(e.canInterlaceSelection(), false);
    e.interlaceSelection();
    assert.equal(e.lastCombineNote, 'No crossings — paths do not intersect.');
    assert.equal(e.canUndo(), false);
    assert.equal(layer.children.length, 3);
  } finally { cleanup(); }
});

test('two intersecting strokes weave with alternating over/under', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const { a, b, crossings } = weavePair(s);
    e.addItemToSelection(a);
    e.addItemToSelection(b);
    assert.equal(e.canInterlaceSelection(), true);
    e.interlaceSelection();
    assert.equal(layer.children.length, 2);
    assert.equal(e.lastCombineNote, '');
    assert.equal(e.undoLabel(), 'Interlace');
    // First-selected goes over at the first crossing; the second crossing flips.
    const [c0, c1] = crossings;
    const over0 = layer.children.find((child) => child.contains(new s.Point(c0.x, c0.y)));
    const under0 = layer.children.find((child) => child !== over0);
    assert.equal(under0.contains(new s.Point(c0.x, c0.y)), false);
    assert.equal(spineHeight(over0), 0);
    const over1 = layer.children.find((child) => child.contains(new s.Point(c1.x, c1.y)));
    assert.equal(over1.contains(new s.Point(c1.x, c1.y)), true);
    assert.ok(spineHeight(over1) > 20);
    assert.equal(over1 === over0, false);
    // The gap clears the over-band: daylight around the crossing in the under band.
    assert.equal(under0.contains(new s.Point(c0.x + 8, c0.y)), false);
    assert.equal(over0.contains(new s.Point(c0.x, c0.y + 4)), true);
    // Results lower to Bézier authoring sources.
    for (const child of layer.children) {
      assert.equal(e.getRetainedPathDrawable(child.data.drawableId).source.mode, 'bezier');
    }
  } finally { cleanup(); }
});

test('re-run flips over and under at every crossing', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const { crossings } = weavePair(s);
    const [c0, c1] = crossings;
    // Select the two strokes (selection order is stable: adds append).
    const [strokeA, strokeB] = layer.children;
    e.addItemToSelection(strokeA);
    e.addItemToSelection(strokeB);
    e.interlaceSelection();
    const overFirst = layer.children.find((child) => child.contains(new s.Point(c0.x, c0.y)));
    assert.equal(spineHeight(overFirst), 0);
    // Re-run on the current selection: same roles, flipped phase.
    e.interlaceSelection();
    assert.equal(layer.children.length, 2);
    const overAfter = layer.children.find((child) => child.contains(new s.Point(c0.x, c0.y)));
    assert.ok(spineHeight(overAfter) > 20);
    const underAfter = layer.children.find((child) => child !== overAfter);
    assert.equal(underAfter.contains(new s.Point(c0.x, c0.y)), false);
    assert.equal(overAfter.contains(new s.Point(c1.x, c1.y)), false);
    assert.equal(underAfter.contains(new s.Point(c1.x, c1.y)), true);
  } finally { cleanup(); }
});

test('undo restores both original strokes', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const { a, b } = weavePair(s);
    e.addItemToSelection(a);
    e.addItemToSelection(b);
    e.interlaceSelection();
    assert.equal(layer.children.length, 2);
    e.undo();
    assert.equal(layer.children.length, 2);
    assert.ok(layer.children.includes(a));
    assert.ok(layer.children.includes(b));
  } finally { cleanup(); }
});

test('non-crossing and single selections no-op with a note', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const a = new s.Path({ segments: [[-50, -30], [50, -30]], strokeColor: 'black', strokeWidth: 10 });
    const b = new s.Path({ segments: [[-50, 30], [50, 30]], strokeColor: 'black', strokeWidth: 10 });
    e.addItemToSelection(a);
    e.addItemToSelection(b);
    assert.equal(e.canInterlaceSelection(), false);
    e.interlaceSelection();
    assert.equal(e.lastCombineNote, 'No crossings — paths do not intersect.');
    assert.equal(e.canUndo(), false);
    assert.equal(layer.children.length, 2);
  } finally { cleanup(); }
  const { s: s2, e: e2, layer: layer2, cleanup: cleanup2 } = engine();
  try {
    const single = new s2.Path({ segments: [[-50, 0], [50, 0]], strokeColor: 'black', strokeWidth: 10 });
    e2.addItemToSelection(single);
    assert.equal(e2.canInterlaceSelection(), false);
    e2.interlaceSelection();
    assert.equal(e2.lastCombineNote, 'Select two or more intersecting stroked paths first.');
    assert.equal(layer2.children.length, 1);
  } finally { cleanup2(); }
});

test('ribbon cutter hugs straight and curved peers with butt ends', () => {
  // Straight spine: exact butt-ended rectangle, no corner past the window.
  const straight = ribbonPolygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], 5);
  assert.equal(straight.length, 6);
  assert.deepEqual(straight[0], { x: 0, y: 5 });
  assert.deepEqual(straight[2], { x: 20, y: 5 });
  assert.deepEqual(straight[3], { x: 20, y: -5 });
  assert.deepEqual(straight[5], { x: 0, y: -5 });
  for (const p of straight) assert.ok(p.x >= 0 && p.x <= 20, 'cutter corner extends past the window');
  // Quarter-circle peer (r=10): every vertex stays on the offset curves.
  const arc = [];
  for (let d = 0; d <= 90; d += 15) {
    const a = d * Math.PI / 180;
    arc.push({ x: 10 * Math.cos(a), y: 10 * Math.sin(a) });
  }
  const curved = ribbonPolygon(arc, 2);
  assert.equal(curved.length, arc.length * 2);
  for (const p of curved) {
    const r = Math.hypot(p.x, p.y);
    assert.ok(r >= 7.9 && r <= 12.1, `vertex at radius ${r.toFixed(2)} leaves the peer footprint`);
    // Butt ends stay perpendicular to the end segments: vertices never swing
    // past the window the way rectangle corners do.
    const deg = Math.atan2(p.y, p.x) * 180 / Math.PI;
    assert.ok(deg >= -3 && deg <= 93, `vertex at ${deg.toFixed(1)}° extends past the window ends`);
  }
  // Mid-arc vertices bulge off the chord: the gap follows the curve on
  // both the outer (r≈12) and inner (r≈8) offset sides.
  const near45 = curved.filter((p) => Math.abs(Math.atan2(p.y, p.x) * 180 / Math.PI - 45) < 8);
  assert.ok(near45.some((p) => Math.hypot(p.x, p.y) > 11.5), 'outer side leaves the chord');
  assert.ok(near45.some((p) => Math.hypot(p.x, p.y) < 8.5), 'inner side leaves the chord');
  assert.throws(() => ribbonPolygon([{ x: 0, y: 0 }], 2), WeaveError);
  assert.throws(() => ribbonPolygon([{ x: 0, y: 0 }, { x: 1, y: 0 }], 0), WeaveError);
});

test('ribbon cutter miters sharp corners along the interior angle', () => {
  // Hexagon-style 60° turn with a 12pt band: the offset edges meet at true
  // miter intersections 6/sin(60°) from the vertex, like the band itself.
  const corner = [{ x: -10, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 8.660 }];
  const poly = ribbonPolygon(corner, 6);
  assert.equal(poly.length, 6);
  for (const [mx, my] of [[-3.464, 6], [3.464, -6]]) {
    const near = poly.filter((p) => Math.hypot(p.x - mx, p.y - my) < 0.1);
    assert.equal(near.length, 1, `expected a miter vertex near (${mx},${my})`);
  }
  // No vertex strays past the miter: cutters never spike outside the band.
  const distToSpine = (p) => {
    let best = Infinity;
    for (let i = 0; i + 1 < corner.length; i++) {
      const ax = corner[i].x, ay = corner[i].y;
      const dx = corner[i + 1].x - ax, dy = corner[i + 1].y - ay;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(p.x - (ax + dx * t), p.y - (ay + dy * t)));
    }
    return best;
  };
  for (const p of poly) assert.ok(distToSpine(p) <= 7.0, `vertex strays ${distToSpine(p).toFixed(2)} from the spine`);
  // Bevel cuts the corner short instead of mitering it.
  const bev = ribbonPolygon(corner, 6, { join: 'bevel' });
  assert.ok(bev.every((p) => Math.hypot(p.x - 3.464, p.y + 6) > 0.5), 'bevel keeps the outer miter');
  // A turn past the miter limit falls back to a bevel, never a spike.
  const hairpin = [{ x: 0, y: 0 }, { x: 10, y: 0 },
    { x: 10 + 5 * Math.cos(140 * Math.PI / 180), y: 5 * Math.sin(140 * Math.PI / 180) }];
  const limited = ribbonPolygon(hairpin, 2, { miterLimit: 1 });
  assert.equal(limited.length, 7);
  const far = (p) => {
    let best = Infinity;
    for (let i = 0; i + 1 < hairpin.length; i++) {
      const ax = hairpin[i].x, ay = hairpin[i].y;
      const dx = hairpin[i + 1].x - ax, dy = hairpin[i + 1].y - ay;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(p.x - (ax + dx * t), p.y - (ay + dy * t)));
    }
    return best;
  };
  for (const p of limited) assert.ok(far(p) <= 4.5, 'limited miter spikes past the band');
});

test('a stroke that ends in the crossing is cut on the over edge', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const over = new s.Path({ segments: [[-40, 0], [40, 0]], strokeColor: 'black', strokeWidth: 20 });
    const under = new s.Path({ segments: [[0, 0], [0, 50]], strokeColor: 'black', strokeWidth: 10 });
    e.addItemToSelection(over);
    e.addItemToSelection(under);
    e.interlaceSelection();
    const cut = layer.children.find((child) => !child.contains(new s.Point(0, 0)));
    assert.ok(cut, 'under-band should be open at the crossing');
    // Padded over half-width is 10/2 + 2. The stub ends on that edge.
    assert.equal(cut.contains(new s.Point(0, 20)), true);
    assert.equal(cut.contains(new s.Point(0, 6)), false);
    const paths = cut.className === 'CompoundPath' ? [...cut.children] : [cut];
    const points = paths.flatMap((path) => path.segments.map((seg) => seg.point));
    assert.equal(points.length, 4);
    for (const point of points) {
      assert.ok(Math.abs(point.y - 12) < 0.05 || Math.abs(point.y - 50) < 0.05, `stray cut vertex at y=${point.y}`);
    }
  } finally { cleanup(); }
});

test('circle-on-circle gaps are symmetric and hug the over-ring', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const c1 = new s.Path.Circle(new s.Point(-20, 0), 40);
    c1.strokeColor = 'black'; c1.strokeWidth = 12;
    const c2 = new s.Path.Circle(new s.Point(20, 0), 40);
    c2.strokeColor = 'black'; c2.strokeWidth = 12;
    e.addItemToSelection(c1);
    e.addItemToSelection(c2);
    assert.equal(e.canInterlaceSelection(), true);
    e.interlaceSelection();
    assert.equal(layer.children.length, 2);
    const top = { x: 0, y: Math.sqrt(40 * 40 - 20 * 20) };
    const under = layer.children.find((child) => !child.contains(new s.Point(top.x, top.y)));
    assert.ok(under, 'expected an under-band at the crossing');
    // Walk the under-band's own centerline out from the crossing.
    const memo = under.data.interlace;
    let cx = 0; let cy = 0;
    for (const seg of memo.spine.segments) { cx += seg.point.x; cy += seg.point.y; }
    cx /= memo.spine.segments.length; cy /= memo.spine.segments.length;
    const R = 40;
    const phi0 = Math.atan2(top.y - cy, top.x - cx);
    const at = (d) => new s.Point(cx + R * Math.cos(phi0 + d / R), cy + R * Math.sin(phi0 + d / R));
    const extent = (dir) => {
      let last = 0;
      for (let d = 0; d <= 18; d += 0.25) {
        if (!under.contains(at(dir * d))) last = d;
      }
      return last;
    };
    // Severed at the crossing, present well outside it.
    assert.equal(under.contains(at(0)), false);
    assert.equal(under.contains(at(15)), true);
    assert.equal(under.contains(at(-15)), true);
    // Butt-ended ribbon window: lateral-bound theory gives ~9.2 a side for
    // 12pt bands at 60°. The legacy rectangle's corners gouged to 10.0 here.
    const plus = extent(1); const minus = extent(-1);
    assert.ok(plus >= 7.5 && plus <= 9.9, `+extent ${plus}`);
    assert.ok(minus >= 7.5 && minus <= 11.5, `-extent ${minus}`);
    assert.ok(Math.abs(plus - minus) <= 1.5, `asymmetric extents ${plus} vs ${minus}`);
  } finally { cleanup(); }
});

test('baked memos keep authoring sources across runs', () => {
  const s = new paper.PaperScope();
  s.setup(new s.Size(800, 600));
  try {
    const layer = s.project.activeLayer;
    // A plain canvas stroke whose held record is parametric (bSpline).
    const item = new s.Path({ segments: [[-50, 0], [50, 0]], strokeColor: 'black', strokeWidth: 10 });
    const peer = new s.Path({ segments: [[0, -40], [0, 40]], strokeColor: 'black', strokeWidth: 10 });
    const bspline = { id: 'live-spine', mode: 'bSpline', closed: false,
      points: [{ x: -50, y: 0 }, { x: 50, y: 0 }], degree: 3 };
    const selected = [item, peer];
    const host = {
      combineMode: () => 'none',
      setCombineNote: () => {},
      selectedItems: () => [...selected],
      prependSelection: (it) => { const i = selected.indexOf(it); if (i >= 0) selected.splice(i, 1); selected.unshift(it); },
      removeFromSelection: (it) => { const i = selected.indexOf(it); if (i >= 0) selected.splice(i, 1); },
      addToSelection: (it) => { if (!selected.includes(it)) selected.push(it); },
      activeLayer: () => layer,
      capture: () => ({ before: [...layer.children], selected: [...selected], retained: new Map() }),
      commit: (label, snap, placed) => {
        for (const it of snap.before) if (!placed.includes(it)) { try { it.remove(); } catch { /* Gone. */ } }
        for (const it of placed) if (!it.parent) layer.addChild(it);
        selected.length = 0; selected.push(...placed);
      },
      retain: (it) => { it.data ??= {}; it.data.drawableId ??= `id-${it.id}`; },
      updateTextContent: () => {},
      notify: () => {},
      paperScope: () => s,
      layerChildren: () => [...layer.children],
      pathSourceOf: (it) => it === item ? bspline : null,
      bezierSourceOf: (it) => ({
        id: 'bez', mode: 'bezier', fillRule: 'nonzero',
        contours: [{ closed: !!it.closed,
          segments: it.segments.map((seg) => ({
            point: { x: seg.point.x, y: seg.point.y },
            handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } })) }],
      }),
    };
    const manager = new InterlaceManager(host);
    manager.interlaceSelection();
    assert.equal(layer.children.length, 2);
    // The parametric member keeps its bSpline record; the record-less peer
    // keeps a Bézier authoring snapshot (its only truth).
    const modes = layer.children.map((band) => band.data.interlace.source?.mode).sort();
    assert.deepEqual(modes, ['bSpline', 'bezier']);
    for (const band of layer.children) {
      assert.equal(band.data.interlace.sources.length, 2);
    }
    // Re-run re-expands the stored bSpline record, not a flattened snapshot.
    manager.interlaceSelection();
    assert.equal(layer.children.length, 2);
    const rerunModes = layer.children.map((band) => band.data.interlace.source?.mode).sort();
    assert.deepEqual(rerunModes, ['bSpline', 'bezier']);
    const weaves = new Set(layer.children.map((band) => band.data.interlace.weave));
    assert.equal(weaves.size, 1);
    assert.ok([...weaves][0]);
  } finally { s.project.remove(); }
});

test('a third stroke weaves into a baked pair without flipping it', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const { a, b, crossings } = weavePair(s);
    const [c0] = crossings;
    e.addItemToSelection(a);
    e.addItemToSelection(b);
    e.interlaceSelection();
    assert.equal(layer.children.length, 2);
    const overBefore = layer.children.find((child) => child.contains(new s.Point(c0.x, c0.y)));
    // Newcomer crosses both members (vertical at x=0 through (0,0) and (0,20)).
    const c = new s.Path({ segments: [[0, -40], [0, 40]], strokeColor: 'black', strokeWidth: 8 });
    e.addItemToSelection(c);
    assert.equal(e.canInterlaceSelection(), true);
    e.interlaceSelection();
    assert.equal(e.undoLabel(), 'Interlace Add');
    assert.equal(layer.children.length, 3);
    for (const band of layer.children) {
      assert.equal(band.data.interlace.sources.length, 3);
      assert.equal(band.data.interlace.phase, 0);
    }
    // The old pair's first crossing keeps its over side: no phase flip.
    const overAfter = layer.children.find((child) => child.contains(new s.Point(c0.x, c0.y)));
    assert.equal(spineHeight(overAfter), spineHeight(overBefore));
    // The newcomer is cut where the zigzag passes over it at (0,20).
    const atTwenty = layer.children.filter((child) => child.contains(new s.Point(0, 20)));
    assert.equal(atTwenty.length, 1);
    assert.ok(spineHeight(atTwenty[0]) > 20);
    // Undo restores the baked pair plus the untouched newcomer.
    e.undo();
    assert.equal(layer.children.length, 3);
    assert.ok(layer.children.includes(c));
    assert.equal(layer.children.filter((child) => child.data?.interlace).length, 2);
  } finally { cleanup(); }
});

test('baked crossing flip picks one crossing and survives re-runs', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const { a, b, crossings } = weavePair(s);
    const [c0, c1] = crossings;
    e.addItemToSelection(a);
    e.addItemToSelection(b);
    e.interlaceSelection();
    const weave = () => e.selectedInterlaceWeave();
    assert.equal(weave().kind, 'baked');
    assert.equal(weave().members, 2);
    assert.deepEqual(weave().crossings.map((c) => c.over), [0, 1]);
    // Flip only the first crossing: its over side changes lineage.
    const overBefore = layer.children.find((child) => child.contains(new s.Point(c0.x, c0.y)));
    assert.equal(spineHeight(overBefore), 0);
    e.flipInterlaceCrossing(weave().crossings[0].key);
    assert.equal(e.undoLabel(), 'Interlace Crossing');
    assert.equal(layer.children.length, 2);
    assert.deepEqual(weave().crossings.map((c) => c.over), [1, 1]);
    const overAfter = layer.children.find((child) => child.contains(new s.Point(c0.x, c0.y)));
    assert.ok(spineHeight(overAfter) > 20);
    // The other crossing is untouched: still the zigzag over.
    const overOther = layer.children.find((child) => child.contains(new s.Point(c1.x, c1.y)));
    assert.ok(spineHeight(overOther) > 20);
    // A phase-flipping re-run keeps the explicit pick and flips the rest.
    e.interlaceSelection();
    assert.deepEqual(weave().crossings.map((c) => c.over), [1, 0]);
    // Undo walks back through re-run, flip, and bake.
    e.undo();
    assert.deepEqual(weave().crossings.map((c) => c.over), [1, 1]);
    e.undo();
    assert.deepEqual(weave().crossings.map((c) => c.over), [0, 1]);
    e.undo();
    assert.equal(layer.children.length, 2);
    assert.ok(layer.children.includes(a));
    assert.ok(layer.children.includes(b));
  } finally { cleanup(); }
});

test('remove from interlace restores clean strokes with undo', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const { a, b, crossings } = weavePair(s);
    const [c0, c1] = crossings;
    e.addItemToSelection(a);
    e.addItemToSelection(b);
    e.interlaceSelection();
    assert.equal(layer.children.length, 2);
    // Select a single band: the section predicate holds.
    e.clearOutSelection();
    e.addItemToSelection(layer.children[0]);
    assert.equal(e.canRemoveFromInterlace(), true);
    e.removeFromInterlace();
    assert.equal(e.undoLabel(), 'Remove from Interlace');
    // Both shapes are back gap-free with no weave memos left.
    assert.equal(layer.children.length, 2);
    assert.ok(layer.children.every((child) => !child.data?.interlace));
    for (const c of [c0, c1]) {
      assert.ok(layer.children.some((child) => child.contains(new s.Point(c.x, c.y))));
    }
    assert.deepEqual([...e.selectedItems].length, 2);
    // Undo brings the weave back with its gaps.
    e.undo();
    assert.equal(layer.children.length, 2);
    assert.ok(layer.children.every((child) => child.data?.interlace));
    const under = layer.children.find((child) => !child.contains(new s.Point(c0.x, c0.y)));
    assert.ok(under);
  } finally { cleanup(); }
});

test('removing one member of three re-weaves the survivors', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const { a, b, crossings } = weavePair(s);
    const [c0] = crossings;
    e.addItemToSelection(a);
    e.addItemToSelection(b);
    e.interlaceSelection();
    const c = new s.Path({ segments: [[0, -40], [0, 40]], strokeColor: 'black', strokeWidth: 8 });
    e.addItemToSelection(c);
    e.interlaceSelection();
    assert.equal(e.undoLabel(), 'Interlace Add');
    assert.equal(layer.children.length, 3);
    // The newcomer owns (0,0): select just its band and remove it.
    const bandC = layer.children.find((child) => child.contains(new s.Point(0, 0)));
    e.clearOutSelection();
    e.addItemToSelection(bandC);
    e.removeFromInterlace();
    assert.equal(layer.children.length, 3);
    const freed = layer.children.find((child) => !child.data?.interlace);
    assert.ok(freed);
    assert.equal(freed.contains(new s.Point(0, 0)), true);
    assert.equal(freed.contains(new s.Point(0, 20)), true);
    // Survivors re-weave as the original pair: phase kept, A over at c0.
    const woven = layer.children.filter((child) => child.data?.interlace);
    assert.equal(woven.length, 2);
    for (const band of woven) assert.equal(band.data.interlace.sources.length, 2);
    const over = layer.children.find((child) => child.contains(new s.Point(c0.x, c0.y)));
    assert.equal(spineHeight(over), 0);
    // Undo restores the three-way weave.
    e.undo();
    assert.equal(layer.children.length, 3);
    assert.ok(layer.children.every((child) => child.data?.interlace));
  } finally { cleanup(); }
});

test('remove gates: fresh strokes and mixed weaves no-op', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const single = new s.Path({ segments: [[-50, 0], [50, 0]], strokeColor: 'black', strokeWidth: 10 });
    e.addItemToSelection(single);
    assert.equal(e.canRemoveFromInterlace(), false);
    e.removeFromInterlace();
    assert.equal(e.lastCombineNote, 'Select a baked interlace result first.');
    assert.equal(e.canUndo(), false);
    assert.equal(layer.children.length, 1);
  } finally { cleanup(); }
  const { s: s2, e: e2, layer: layer2, cleanup: cleanup2 } = engine();
  try {
    const mkPair = (dy) => {
      const p = new s2.Path({ segments: [[-50, dy - 60], [50, dy - 60]], strokeColor: 'black', strokeWidth: 10 });
      const q = new s2.Path({ segments: [[-50, dy - 80], [0, dy - 40], [50, dy - 80]], strokeColor: 'black', strokeWidth: 10 });
      return [p, q];
    };
    const [p1, q1] = mkPair(0);
    e2.addItemToSelection(p1);
    e2.addItemToSelection(q1);
    e2.interlaceSelection();
    e2.clearOutSelection();
    const [p2, q2] = mkPair(200);
    e2.addItemToSelection(p2);
    e2.addItemToSelection(q2);
    e2.interlaceSelection();
    assert.equal(layer2.children.length, 4);
    // Bands from two different weaves: refuse instead of mixing them.
    e2.clearOutSelection();
    e2.addItemToSelection(layer2.children[0]);
    e2.addItemToSelection(layer2.children[2]);
    assert.equal(e2.canRemoveFromInterlace(), true);
    e2.removeFromInterlace();
    assert.equal(e2.lastCombineNote, 'Select bands from one baked weave at a time.');
    assert.equal(layer2.children.length, 4);
  } finally { cleanup2(); }
});

test('outlined-stroke records interlace on their spines with record widths', () => {
  const s = new paper.PaperScope();
  s.setup(new s.Size(800, 600));
  try {
    const layer = s.project.activeLayer;
    const segment = (x, y) => ({ point: { x, y }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } });
    const spineSource = { id: 'spine-a', mode: 'bezier', fillRule: 'nonzero',
      contours: [{ closed: false, segments: [segment(-50, 0), segment(50, 0)] }] };
    const outlinedSource = { id: 'outlined-a', mode: 'outlinedStroke', spine: spineSource,
      width: 12, cap: 'butt', join: 'miter', miterLimit: 10, dashLength: 0, gapLength: 0, position: 'center' };
    const geometry = resolveOutlinedStroke(outlinedSource);
    const band = new s.Path({ insert: false, closed: true,
      segments: geometry.segments.map((seg) => new s.Segment(
        new s.Point(seg.point.x, seg.point.y),
        new s.Point(seg.handleIn.x, seg.handleIn.y),
        new s.Point(seg.handleOut.x, seg.handleOut.y),
      )),
    });
    band.fillColor = 'black';
    layer.addChild(band);
    const plain = new s.Path({ segments: [[0, -40], [0, 40]], strokeColor: 'black', strokeWidth: 8 });
    const selected = [band, plain];
    const notes = [];
    const retained = new Map();
    const host = {
      combineMode: () => 'none',
      setCombineNote: (note) => notes.push(note),
      selectedItems: () => [...selected],
      prependSelection: (item) => { const i = selected.indexOf(item); if (i >= 0) selected.splice(i, 1); selected.unshift(item); },
      removeFromSelection: (item) => { const i = selected.indexOf(item); if (i >= 0) selected.splice(i, 1); },
      addToSelection: (item) => { if (!selected.includes(item)) selected.push(item); },
      isSelected: (item) => selected.includes(item),
      dropItem: (item) => { host.removeFromSelection(item); try { item.remove(); } catch { /* Detached. */ } },
      shapePartOf: (item) => item,
      textModeEnabled: () => false,
      withShapeText: (item) => item,
      activeLayer: () => layer,
      drawingPath: () => null,
      quadPath: () => null,
      isNonContentItem: () => false,
      layerChildren: () => [...layer.children],
      capture: () => ({ before: [...layer.children], selected: [...selected], retained: new Map(retained) }),
      commit: (label, snap, placed) => {
        for (const item of snap.before) if (!placed.includes(item)) { try { item.remove(); } catch { /* Detached. */ } }
        for (const item of placed) if (!item.parent) layer.addChild(item);
        selected.length = 0; selected.push(...placed);
        host.lastLabel = label;
      },
      retain: (item) => { item.data ??= {}; item.data.drawableId ??= `id-${retained.size}`; retained.set(item.data.drawableId, item); },
      updateTextContent: () => {},
      notify: () => {},
      paperScope: () => s,
      pathSourceOf: (item) => item === band ? outlinedSource : null,
      bezierSourceOf: (item) => ({
        id: 'bez', mode: 'bezier', fillRule: 'nonzero',
        contours: [{
          closed: !!item.closed,
          segments: item.segments.map((seg) => ({
            point: { x: seg.point.x, y: seg.point.y },
            handleIn: { x: seg.handleIn.x, y: seg.handleIn.y },
            handleOut: { x: seg.handleOut.x, y: seg.handleOut.y },
          })),
        }],
      }),
    };
    const manager = new InterlaceManager(host);
    assert.equal(manager.canInterlaceSelection(), true);
    manager.interlaceSelection();
    assert.equal(host.lastLabel, 'Interlace');
    assert.equal(layer.children.length, 2);
    // Single crossing at the origin: the first-selected outlined band goes over.
    const [under, over] = layer.children[0].contains(new s.Point(0, 0))
      ? [layer.children[1], layer.children[0]]
      : [layer.children[0], layer.children[1]];
    assert.equal(over.contains(new s.Point(0, 0)), true);
    assert.equal(under.contains(new s.Point(0, 0)), false);
    // The over band kept the outlined spine snapshot and record width.
    assert.equal(over.data.interlace.width, 12);
    const spinePts = over.data.interlace.spine.segments.map((seg) => seg.point);
    assert.deepEqual(spinePts[0], { x: -50, y: 0 });
    assert.deepEqual(spinePts[spinePts.length - 1], { x: 50, y: 0 });
  } finally { s.project.remove(); }
});
