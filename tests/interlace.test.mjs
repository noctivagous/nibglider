import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { InterlaceManager, gapRectFor } from '../src/engine/scene/InterlaceManager.ts';
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
    // The under-band at the first crossing: every boundary segment near the
    // gap must run parallel or perpendicular to the horizontal peer.
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
        const mod = ((Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI) % 90 + 90) % 90;
        assert.ok(mod < 5 || mod > 85, `cut edge at ${mod.toFixed(1)}° is not peer-parallel`);
        checked++;
      }
    }
    assert.ok(checked >= 4, 'expected gap edges near the crossing');
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
    assert.equal(e2.lastCombineNote, 'Select two stroked paths first.');
    assert.equal(layer2.children.length, 1);
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
