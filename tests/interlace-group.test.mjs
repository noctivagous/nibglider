import test from 'node:test';
import assert from 'node:assert/strict';
import { deserializeDrawable, serializeDrawable, ModelValidationError } from '../src/engine/model/serialization.ts';
import { resolveInterlaceGroup, WeaveError } from '../src/engine/geometry/interlaceWeave.ts';

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
  const live = groupDrawable({ childIds: ['a', 'b'], interlace: { phase: 0, padding: 2, firstId: 'a' } });
  assert.deepEqual(deserializeDrawable(serializeDrawable(live)), live);
});

test('interlace group validation rejects bad params and non-member roles', () => {
  const good = groupDrawable({ childIds: ['a', 'b'], interlace: { phase: 0, padding: 2, firstId: 'a' } });
  const cases = [
    (d) => { d.source.interlace.phase = 2; },
    (d) => { d.source.interlace.padding = -1; },
    (d) => { d.source.interlace.firstId = 'c'; },
    (d) => { d.source.interlace = { phase: 0, padding: 2 }; },
    (d) => { d.source.interlace.extra = true; },
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
