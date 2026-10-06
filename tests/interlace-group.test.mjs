import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { readFileSync } from 'node:fs';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { parseInCanvasXML } from '../src/ui/inCanvasGui.ts';
import { deserializeDrawable, serializeDrawable, ModelValidationError } from '../src/engine/model/serialization.ts';
import { resolveInterlaceGroup, WeaveError } from '../src/engine/geometry/interlaceWeave.ts';

function engine() {
  const s = new paper.PaperScope();
  s.setup(new s.Size(800, 600));
  const e = new NibGliderEngine(s, () => {});
  return { s, e, layer: s.project.activeLayer, cleanup: () => { e.cancelCurrentDrawingOperation(); s.project.remove(); } };
}

function weavePair(s) {
  const a = new s.Path({ segments: [[-50, 0], [50, 0]], strokeColor: 'black', strokeWidth: 10 });
  const b = new s.Path({
    segments: [[-50, -20], [0, 20], [50, -20]], strokeColor: 'black', strokeWidth: 10,
  });
  return { a, b, crossings: [{ x: -25, y: 0 }, { x: 25, y: 0 }] };
}

function displaysOf(group) {
  return [...group.children].filter((child) => child?.data?.interlaceDisplay);
}

function membersOf(group) {
  return [...group.children].filter((child) => !child?.data?.interlaceDisplay);
}

function overAt(group, s, x, y) {
  return displaysOf(group).find((child) => child.contains(new s.Point(x, y)));
}

// A-lineage displays are the flat horizontal band; B-lineage is the tall zigzag.
function isHorizontal(display) {
  return display.bounds.height < 20;
}

const segment = (x, y) => ({ point: { x, y }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } });
const bezierSpine = (id, pts, closed = false) => ({
  id, mode: 'bezier', fillRule: 'nonzero',
  contours: [{ closed, segments: pts.map(([x, y]) => segment(x, y)) }],
});
const stroke = (over = {}) => ({
  width: 10, cap: 'butt', join: 'miter', miterLimit: 10,
  dashLength: 0, gapLength: 0, position: 'center', ...over,
});
// Horizontal stroke crossed twice by a zigzag stroke.
const members = () => ([
  { id: 'a', source: bezierSpine('spine-a', [[-50, 0], [50, 0]]), stroke: stroke() },
  { id: 'b', source: bezierSpine('spine-b', [[-50, -20], [0, 20], [50, -20]]), stroke: stroke() },
]);
const groupDrawable = (source) => ({
  id: 'group-1', kind: 'group', layerId: 'artwork',
  transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  opacity: 1, visible: true, locked: false, source,
});

test('interlace groups round-trip; plain groups are unaffected', () => {
  const plain = groupDrawable({ childIds: ['a', 'b'] });
  assert.deepEqual(deserializeDrawable(serializeDrawable(plain)), plain);
  const live = groupDrawable({ childIds: ['a', 'b'], interlace: { phase: 0, padding: 2, firstId: 'a', overrides: {} } });
  assert.deepEqual(deserializeDrawable(serializeDrawable(live)), live);
});

test('interlace group validation rejects bad params and non-member roles', () => {
  const good = groupDrawable({ childIds: ['a', 'b'], interlace: { phase: 0, padding: 2, firstId: 'a', overrides: {} } });
  const cases = [
    (d) => { d.source.interlace.phase = 2; },
    (d) => { d.source.interlace.padding = -1; },
    (d) => { d.source.interlace.firstId = 'c'; },
    (d) => { d.source.interlace = { phase: 0, padding: 2, firstId: 'a' }; },
    (d) => { d.source.interlace.extra = true; },
    (d) => { d.source.interlace.overrides = { 'a>b#0': 'c' }; },
    (d) => { d.source.interlace.overrides = { 'a>c#0': 'a' }; },
    (d) => { d.source.interlace.overrides = { 'nope': 'a' }; },
    (d) => { d.source.interlace.overrides = []; },
  ];
  for (const mutate of cases) {
    const model = deserializeDrawable(serializeDrawable(good));
    mutate(model);
    assert.throws(() => serializeDrawable(model), ModelValidationError);
  }
});

test('resolver weaves with alternation from the first-role spine', () => {
  const weave = resolveInterlaceGroup(members(), { phase: 0, padding: 2, firstId: 'a' });
  assert.deepEqual(weave.order, ['a', 'b']);
  assert.equal(weave.gaps.length, 2);
  // Crossings at x = -25 and +25 along the horizontal spine.
  assert.deepEqual(weave.gaps.map((gap) => Math.round(gap.center.x)), [-25, 25]);
  // Alternation: first gap targets b, second targets a.
  assert.deepEqual(weave.gaps.map((gap) => gap.targetId), ['b', 'a']);
  // Gap footprints parallel the peer: horizontal at the first crossing.
  assert.ok(Math.abs(weave.gaps[0].angle) < 1e-9);
  assert.equal(weave.bands.length, 2);
  for (const band of weave.bands) assert.ok(band.loops.length >= 1);
});

test('resolver phase flip swaps every target side', () => {
  const flipped = resolveInterlaceGroup(members(), { phase: 1, padding: 2, firstId: 'a' });
  assert.deepEqual(flipped.gaps.map((gap) => gap.targetId), ['a', 'b']);
  assert.deepEqual(flipped.gaps.map((gap) => Math.round(gap.center.x)), [-25, 25]);
});

test('resolver honors per-crossing overrides over the alternation', () => {
  const [a, b] = members();
  const key0 = `${a.id}>${b.id}#0`;
  // Baseline alternation from a targets b, then a. Naming b over at the
  // first crossing targets a there instead; the rest keep alternating.
  const picked = resolveInterlaceGroup([a, b],
    { phase: 0, padding: 2, firstId: 'a', overrides: { [key0]: 'b' } });
  assert.deepEqual(picked.gaps.map((gap) => gap.targetId), ['a', 'a']);
  assert.deepEqual(picked.gaps.map((gap) => Math.round(gap.center.x)), [-25, 25]);
  // Unknown keys, non-member values, and out-of-range indices fall back.
  const lax = resolveInterlaceGroup([a, b], { phase: 0, padding: 2, firstId: 'a',
    overrides: { nope: 'a', [key0]: 'nobody', [`${a.id}>${b.id}#7`]: 'b' } });
  assert.deepEqual(lax.gaps.map((gap) => gap.targetId), ['b', 'a']);
  // Overrides compose with a flipped phase: the pick holds (a over at 0
  // targets b), the rest flip (phase 1 puts a over at 1, targeting b).
  const phased = resolveInterlaceGroup([a, b],
    { phase: 1, padding: 2, firstId: 'a', overrides: { [key0]: 'a' } });
  assert.deepEqual(phased.gaps.map((gap) => gap.targetId), ['b', 'b']);
});

test('interlace group overrides round-trip in the model', () => {
  const live = groupDrawable({ childIds: ['a', 'b'],
    interlace: { phase: 0, padding: 2, firstId: 'a', overrides: { 'a>b#0': 'b' } } });
  assert.deepEqual(deserializeDrawable(serializeDrawable(live)), live);
});

test('resolver honors custom padding and rejects bad input', () => {
  const narrow = resolveInterlaceGroup(members(), { phase: 0, padding: 0, firstId: 'a' });
  const wide = resolveInterlaceGroup(members(), { phase: 0, padding: 6, firstId: 'a' });
  assert.ok(wide.gaps[0].width > narrow.gaps[0].width);
  assert.ok(wide.gaps[0].length > narrow.gaps[0].length);
  const [a, b] = members();
  assert.throws(() => resolveInterlaceGroup([a], { phase: 0, padding: 2, firstId: 'a' }), WeaveError);
  assert.throws(() => resolveInterlaceGroup([a, a], { phase: 0, padding: 2, firstId: 'a' }), WeaveError);
  assert.throws(() => resolveInterlaceGroup([a, b], { phase: 3, padding: 2, firstId: 'a' }), WeaveError);
  assert.throws(() => resolveInterlaceGroup(
    [{ ...a, stroke: stroke({ width: 0 }) }, b], { phase: 0, padding: 2, firstId: 'a' }), WeaveError);
  const apart = [
    { id: 'a', source: bezierSpine('spine-a', [[-50, -30], [50, -30]]), stroke: stroke() },
    { id: 'b', source: bezierSpine('spine-b', [[-50, 30], [50, 30]]), stroke: stroke() },
  ];
  assert.throws(() => resolveInterlaceGroup(apart, { phase: 0, padding: 2, firstId: 'a' }), WeaveError);
});

test('grouping hides members and shows the derived weave', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const { a, b, crossings } = weavePair(s);
    const [c0, c1] = crossings;
    e.addItemToSelection(a);
    e.addItemToSelection(b);
    assert.equal(e.canInterlaceGroupSelection(), true);
    e.interlaceGroupSelection();
    assert.equal(layer.children.length, 1);
    assert.equal(e.undoLabel(), 'Interlace Group');
    const group = layer.children[0];
    assert.equal(group.className, 'Group');
    assert.deepEqual(e.selectedItems, [group]);
    // Members stay live inside the group, hidden; two display bands weave.
    assert.equal(membersOf(group).length, 2);
    assert.ok(membersOf(group).every((child) => child.visible === false));
    assert.equal(displaysOf(group).length, 2);
    assert.ok(overAt(group, s, c0.x, c0.y));
    assert.ok(overAt(group, s, c1.x, c1.y));
    assert.notEqual(overAt(group, s, c0.x, c0.y), overAt(group, s, c1.x, c1.y));
    // Stored snapshots keep full member data for later re-resolves.
    const stored = group.data.interlaceGroup;
    assert.equal(stored.members.length, 2);
    assert.equal(stored.params.firstId, stored.members[0].id);
    // Undo restores the two original strokes, visible and ungrouped.
    e.undo();
    assert.equal(layer.children.length, 2);
    assert.ok(layer.children.includes(a));
    assert.ok(layer.children.includes(b));
    assert.ok(layer.children.every((child) => child.visible !== false));
  } finally { cleanup(); }
});

test('ungroup restores live members and drops derived bands', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const { a, b } = weavePair(s);
    e.addItemToSelection(a);
    e.addItemToSelection(b);
    e.interlaceGroupSelection();
    e.ungroupSelected();
    assert.equal(layer.children.length, 2);
    assert.ok(layer.children.includes(a));
    assert.ok(layer.children.includes(b));
    assert.ok(layer.children.every((child) => child.visible !== false));
    assert.deepEqual(e.selectedItems, [a, b]);
    assert.ok(!layer.children.some((child) => child.className === 'Group'));
  } finally { cleanup(); }
});

test('param retune flips the weave in place with undo', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const { crossings } = weavePair(s);
    const [c0, c1] = crossings;
    const [strokeA, strokeB] = layer.children;
    e.addItemToSelection(strokeA);
    e.addItemToSelection(strokeB);
    e.interlaceGroupSelection();
    const group = () => layer.children[0];
    assert.notEqual(overAt(group(), s, c0.x, c0.y), overAt(group(), s, c1.x, c1.y));
    assert.equal(isHorizontal(overAt(group(), s, c0.x, c0.y)), true);
    // Retune keeps the same group item and swaps the over sides.
    const sameGroup = group();
    e.setInterlaceParams({ phase: 1 });
    assert.equal(layer.children.length, 1);
    assert.equal(layer.children[0], sameGroup);
    assert.equal(isHorizontal(overAt(group(), s, c0.x, c0.y)), false);
    assert.equal(isHorizontal(overAt(group(), s, c1.x, c1.y)), true);
    assert.equal(e.undoLabel(), 'Interlace Params');
    // Undo and redo flip the weave back and forth.
    e.undo();
    assert.equal(isHorizontal(overAt(group(), s, c0.x, c0.y)), true);
    assert.equal(isHorizontal(overAt(group(), s, c1.x, c1.y)), false);
    e.redo();
    assert.equal(isHorizontal(overAt(group(), s, c0.x, c0.y)), false);
    assert.equal(isHorizontal(overAt(group(), s, c1.x, c1.y)), true);
  } finally { cleanup(); }
});

test('group crossing flip picks one crossing with undo', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const { crossings } = weavePair(s);
    const [c0, c1] = crossings;
    const [strokeA, strokeB] = layer.children;
    e.addItemToSelection(strokeA);
    e.addItemToSelection(strokeB);
    e.interlaceGroupSelection();
    const weave = () => e.selectedInterlaceWeave();
    assert.equal(weave().kind, 'group');
    assert.equal(weave().members, 2);
    assert.deepEqual(weave().crossings.map((c) => c.number), [1, 2]);
    // Baseline alternation: member 1 over at crossing 1, member 2 at 2.
    assert.deepEqual(weave().crossings.map((c) => c.over), [0, 1]);
    assert.ok(weave().crossings[0].key.endsWith('#0'));
    // Flip only the first crossing: the canvas follows the pick.
    e.flipInterlaceCrossing(weave().crossings[0].key);
    assert.equal(e.undoLabel(), 'Interlace Params');
    assert.deepEqual(weave().crossings.map((c) => c.over), [1, 1]);
    assert.equal(isHorizontal(overAt(layer.children[0], s, c0.x, c0.y)), false);
    assert.equal(isHorizontal(overAt(layer.children[0], s, c1.x, c1.y)), false);
    // Undo and redo move just that pick back and forth.
    e.undo();
    assert.deepEqual(weave().crossings.map((c) => c.over), [0, 1]);
    e.redo();
    assert.deepEqual(weave().crossings.map((c) => c.over), [1, 1]);
    // Unknown keys no-op with a note instead of touching the weave.
    e.flipInterlaceCrossing('nobody>nobody#9');
    assert.equal(e.lastCombineNote, 'Crossing not found — the weave may have changed.');
    assert.deepEqual(weave().crossings.map((c) => c.over), [1, 1]);
    e.clearOutSelection();
    assert.equal(e.selectedInterlaceWeave(), null);
  } finally { cleanup(); }
});

test('wider padding widens the gaps without regrouping', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const { crossings } = weavePair(s);
    const [c0] = crossings;
    const [strokeA, strokeB] = layer.children;
    e.addItemToSelection(strokeA);
    e.addItemToSelection(strokeB);
    e.interlaceGroupSelection();
    const group = () => layer.children[0];
    // Along the under-band past the default gap but inside the widened one.
    const probe = new s.Point(c0.x + 12 * 0.78, c0.y + 12 * 0.625);
    const underBefore = displaysOf(group()).find((child) => !child.contains(new s.Point(c0.x, c0.y)));
    assert.equal(underBefore.contains(probe), true);
    const sameGroup = group();
    e.setInterlaceParams({ padding: 8 });
    assert.equal(layer.children[0], sameGroup);
    const underAfter = displaysOf(group()).find((child) => !child.contains(new s.Point(c0.x, c0.y)));
    assert.equal(underAfter.contains(probe), false);
    assert.equal(underAfter.contains(new s.Point(c0.x, c0.y)), false);
  } finally { cleanup(); }
});

test('baked pairs convert to live groups keeping phase and roles', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const { crossings } = weavePair(s);
    const [c0, c1] = crossings;
    const [strokeA, strokeB] = layer.children;
    e.addItemToSelection(strokeA);
    e.addItemToSelection(strokeB);
    e.interlaceSelection();
    const bakedOver = layer.children.find((child) => child.contains(new s.Point(c0.x, c0.y)));
    e.convertSelectionToGroup();
    assert.equal(layer.children.length, 1);
    const group = layer.children[0];
    assert.equal(group.className, 'Group');
    assert.equal(membersOf(group).length, 2);
    assert.equal(displaysOf(group).length, 2);
    // The weave matches the baked op it was converted from.
    const bakedSpineHeight = (item) => {
      const ys = item.data.interlace.spine.segments.map((seg) => seg.point.y);
      return Math.max(...ys) - Math.min(...ys);
    };
    assert.equal(bakedSpineHeight(bakedOver), 0);
    assert.equal(overAt(group, s, c0.x, c0.y) !== overAt(group, s, c1.x, c1.y), true);
    e.undo();
    assert.equal(layer.children.length, 2);
  } finally { cleanup(); }
});

test('selectedInterlaceGroup feeds the in-canvas controls', () => {
  const { s, e, cleanup } = engine();
  try {
    assert.equal(e.selectedInterlaceGroup(), null);
    const { a, b } = weavePair(s);
    e.addItemToSelection(a);
    e.addItemToSelection(b);
    assert.equal(e.selectedInterlaceGroup(), null);
    e.interlaceGroupSelection();
    assert.deepEqual(e.selectedInterlaceGroup(), {
      phase: 0, padding: 2, firstId: e.selectedItems[0].data.interlaceGroup.params.firstId, members: 2,
    });
    e.setInterlaceParams({ phase: 1, padding: 5 });
    assert.equal(e.selectedInterlaceGroup().phase, 1);
    assert.equal(e.selectedInterlaceGroup().padding, 5);
    e.clearOutSelection();
    assert.equal(e.selectedInterlaceGroup(), null);
  } finally { cleanup(); }
});

test('interlace in-canvas XML declares the control contract', () => {
  const xml = readFileSync(new URL('../src/ui/inCanvas/interlace.xml', import.meta.url), 'utf8');
  const parsed = parseInCanvasXML(xml);
  assert.ok(!('error' in parsed));
  assert.equal(parsed.spec.id, 'interlace');
  assert.deepEqual(
    parsed.spec.controls.map((control) => [control.kind, control.key ?? control.label]),
    [['toggle', 'alternate'], ['field', 'padding'], ['export', 'Ungroup']],
  );
});

test('resolver weaves outlined-stroke members on their spines', () => {
  const outlined = {
    id: 'o', mode: 'outlinedStroke',
    spine: bezierSpine('spine-o', [[-50, 0], [50, 0]]),
    width: 12, cap: 'butt', join: 'miter', miterLimit: 10,
    dashLength: 0, gapLength: 0, position: 'center',
  };
  const [, b] = members();
  const weave = resolveInterlaceGroup(
    [{ id: 'o', source: outlined, stroke: stroke({ width: 12 }) }, { ...b, id: 'b2' }],
    { phase: 0, padding: 2, firstId: 'o' },
  );
  assert.deepEqual(weave.order, ['o', 'b2']);
  assert.equal(weave.gaps.length, 2);
  // Each member's own width sizes the gaps where it goes over.
  assert.equal(weave.gaps[0].width, 12 + 2 * Math.max(2, 10 * 0.15));
  assert.equal(weave.gaps[1].width, 10 + 2 * Math.max(2, 12 * 0.15));
});
