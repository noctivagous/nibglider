// Slice 14 — FMStroke remainders: the 9-field bowed model and its
// geometry (Phase 2/3), seam-crossing arc triples, session keys
// (switch-rounding, erase-last, Phase 4), and the swappable
// keyboard-layout registry (Phases 1/5).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { resolveCompositePath } from '../src/engine/geometry/compositeExpansion.ts';
import { PathDrawingSession } from '../src/engine/drawing/PathDrawingSession.ts';
import { validatePath, serializeDrawable, deserializeDrawable } from '../src/engine/model/serialization.ts';
import { parseNativeDocument, buildNativeDocument, serializeNativeDocument } from '../src/engine/document/NativeDocument.ts';
import { KEYBOARD_LAYOUTS, KEY_CAPS, capsForLayout, commandById } from '../src/engine/input/keymap.ts';
import { resolveKeyVariants, resolveKeyboardLayout } from '../src/engine/input/KeyboardLayoutResolver.ts';
import { NibGliderEngine } from '../src/engine/engine.ts';

const savedRequest = globalThis.requestAnimationFrame;
const savedCancel = globalThis.cancelAnimationFrame;
let nextFrame = 0;
const frames = new Map();
globalThis.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
after(() => { globalThis.requestAnimationFrame = savedRequest; globalThis.cancelAnimationFrame = savedCancel; });

let seq = 0;
const pt = (x, y, kind = 'bSpline', outgoing) => ({
  id: `p${++seq}`, x, y, kind, ...(outgoing ? { outgoing } : {}),
});
const composite = (points, closed = false) => ({ id: 'c', mode: 'ngComposite', closed, points });
const bow = (over = {}) => ({
  facing: 'A', amplitude: 20, amplitudeIsPercent: false, peakLocation: 0.5,
  peakLocationMultiplier: 1, isArc: false, dualDistance: 0, corneredApex: 'none', ...over,
});
const samplesOf = (path) => resolveCompositePath(path).segments.map((s) => s.point);
const bowedSamples = (over) => samplesOf(composite([
  pt(0, 0, 'bowedLine', { kind: 'bowedLine', bow: bow(over) }),
  pt(100, 0),
]));

// --- Phase 3.1/3.5: bowed geometry ------------------------------------

test('bowed geometry: facing flips the peak side; percent and absolute amplitude agree', () => {
  const a = bowedSamples({ facing: 'A' });
  const b = bowedSamples({ facing: 'B' });
  assert.ok(Math.min(...a.map((p) => p.y)) < -15);
  assert.ok(Math.max(...b.map((p) => p.y)) > 15);
  // 20% of a 100-unit chord is the same bow as 20pt absolute.
  const pct = bowedSamples({ amplitude: 20, amplitudeIsPercent: true });
  assert.ok(Math.abs(Math.min(...pct.map((p) => p.y)) - Math.min(...a.map((p) => p.y))) < 1.5);
});

test('bowed geometry: peak location moves the peak along the chord', () => {
  const samples = bowedSamples({ peakLocation: 0.25 });
  const peak = samples.reduce((m, p) => (p.y < m.y ? p : m), samples[0]);
  assert.ok(peak.x > 15 && peak.x < 35, `peak near x=25, got ${peak.x}`);
  assert.ok(peak.y < -15);
});

test('bowed geometry: dual peaks flatten the top of the bow', () => {
  const single = bowedSamples({});
  const dual = bowedSamples({ dualDistance: 0.4 });
  const yAt = (samples, x) => samples.reduce((m, p) => (Math.abs(p.x - x) < Math.abs(m.x - x) ? p : m), samples[0]).y;
  // At x=30 the single bow is still climbing; the dual bow is at its peak.
  assert.ok(yAt(dual, 30) < yAt(single, 30) - 2, `dual ${yAt(dual, 30)} vs single ${yAt(single, 30)}`);
  assert.ok(yAt(dual, 30) < -17 && yAt(dual, 70) < -17);
});

test('bowed geometry: cornered apex repeats the peak control (multiplicity)', () => {
  const plain = bowedSamples({});
  const hard = bowedSamples({ corneredApex: 'hard' });
  const rounded = bowedSamples({ corneredApex: 'rounded' });
  const depth = (samples) => -Math.min(...samples.map((p) => p.y));
  // The exact quadratic passes through the peak (20). A repeated
  // control pulls the spline toward the control point beyond the
  // peak, so the hard apex overshoots it; both stay finite.
  assert.ok(Math.abs(depth(plain) - 20) < 2.5);
  assert.ok(depth(hard) > depth(plain) + 3, `hard ${depth(hard)} vs plain ${depth(plain)}`);
  assert.ok(depth(rounded) > 8);
  for (const samples of [hard, rounded]) {
    assert.ok(samples.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
});

test('bowed geometry: arc mode resolves onto the circle through start, peak, end', () => {
  const samples = bowedSamples({ isArc: true });
  // Circle through (0,0), (50,-20), (100,0): centre (50, 52.5), r ≈ 72.5.
  for (const p of samples) {
    const d = Math.hypot(p.x - 50, p.y - 52.5);
    assert.ok(Math.abs(d - 72.5) < 2.5, `sample on circle (d=${d})`);
  }
  const flat = bowedSamples({ isArc: true, amplitude: 0 });
  assert.ok(flat.every((p) => Math.abs(p.y) < 1e-6), 'collinear arc bow falls back to a line');
});

test('bowed geometry: a degenerate chord resolves without throwing', () => {
  const samples = samplesOf(composite([
    pt(10, 10, 'bowedLine', { kind: 'bowedLine', bow: bow({}) }),
    pt(10, 10),
    pt(60, 10),
  ]));
  assert.ok(samples.length >= 2);
  assert.ok(samples.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

// --- Slice 14(c): seam-crossing arc triples -----------------------------

test('closed path: an arc triple crossing the array seam expands as an arc', () => {
  // Ring order: anchor (0,0) → through (50,-50) → end (100,0) → back
  // to the anchor. Stored starting at the end point, so the triple
  // wraps the array seam.
  const wrapped = composite([
    pt(100, 0, 'arcByThreeEnd'),
    pt(0, 0, 'line'),
    pt(50, -50, 'arcByThreeStart'),
  ], true);
  validatePath(wrapped, 'path'); // cyclic pairing is valid when closed
  const samples = samplesOf(wrapped);
  const arcSamples = samples.filter((p) => p.x >= 0 && p.x <= 100 && p.y < -5);
  assert.ok(arcSamples.length > 4, 'the wrapped triple produced arc samples');
  for (const p of arcSamples) {
    const d = Math.hypot(p.x - 50, p.y - 0);
    assert.ok(Math.abs(d - 50) < 2.5, `sample on circle (d=${d})`);
  }
  // The same wrapped pairing in an open path stays invalid.
  const open = composite([
    pt(100, 0, 'arcByThreeEnd'),
    pt(0, 0, 'line'),
    pt(50, -50, 'arcByThreeStart'),
  ], false);
  assert.throws(() => validatePath(open, 'path'));
});

// --- Phase 2.4/2.5: validation ------------------------------------------

test('bow validation rejects out-of-range values and misplaced records', () => {
  const withBow = (over, kind = 'bowedLine') => composite([
    pt(0, 0, 'bowedLine', { kind, bow: bow(over) }),
    pt(100, 0),
  ]);
  assert.throws(() => validatePath(withBow({ peakLocation: 1.5 }), 'path'));
  assert.throws(() => validatePath(withBow({ peakLocationMultiplier: 3 }), 'path'));
  assert.throws(() => validatePath(withBow({ amplitude: -5 }), 'path'));
  assert.throws(() => validatePath(withBow({ dualDistance: 1.5 }), 'path'));
  assert.throws(() => validatePath(withBow({ facing: 'left' }), 'path'));
  assert.throws(() => validatePath(withBow({}, 'line'), 'path'), 'bow on a non-bowed segment');
  validatePath(withBow({}), 'path'); // the full record, in range, passes
});

test('bow record round-trips every field through drawable serialization', () => {
  const drawable = {
    id: 'd1', kind: 'path', layerId: 'artwork',
    transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    opacity: 1, visible: true, locked: false,
    source: composite([
      pt(0, 0, 'bowedLine', {
        kind: 'bowedLine',
        bow: bow({ facing: 'B', amplitude: 33, amplitudeIsPercent: true, peakLocation: 0.3, peakLocationMultiplier: 1.4, isArc: true, dualDistance: 0.2, corneredApex: 'rounded' }),
      }),
      pt(100, 0),
    ]),
  };
  assert.deepEqual(deserializeDrawable(serializeDrawable(drawable)), drawable);
});

test('native v3 files migrate bowOffset/bowFacing into the bow record', () => {
  const drawable = (outgoing) => ({
    id: 'd1', kind: 'path', layerId: 'paper-layer-2',
    transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    opacity: 1, visible: true, locked: false,
    source: composite([pt(0, 0, 'bowedLine', outgoing), pt(100, 0)]),
  });
  const v3Text = (drawables) => {
    const doc = buildNativeDocument({
      name: 'Old', savedAt: '', layers: [{ id: 'paper-layer-2', name: 'Layer 1' }],
      activeLayerId: 'paper-layer-2', drawables, retainedPaths: [],
      page: null, view: null, scene: '{"format":"nibglider-scene","version":2,"items":[]}',
    });
    const raw = JSON.parse(serializeNativeDocument(doc));
    raw.version = 3;
    return JSON.stringify(raw);
  };
  const absolute = parseNativeDocument(v3Text([drawable({ kind: 'bowedLine', bowOffset: 20, bowFacing: 'right' })]));
  assert.equal(absolute.ok, true);
  assert.equal(absolute.doc.version, 6);
  assert.deepEqual(absolute.doc.drawables[0].source.points[0].outgoing.bow, {
    facing: 'B', amplitude: 20, amplitudeIsPercent: false, peakLocation: 0.5,
    peakLocationMultiplier: 1, isArc: false, dualDistance: 0, corneredApex: 'none',
  });
  const percent = parseNativeDocument(v3Text([drawable({ kind: 'bowedLine', bowFacing: 'left' })]));
  assert.equal(percent.ok, true);
  assert.deepEqual(percent.doc.drawables[0].source.points[0].outgoing.bow, {
    facing: 'A', amplitude: 25, amplitudeIsPercent: true, peakLocation: 0.5,
    peakLocationMultiplier: 1, isArc: false, dualDistance: 0, corneredApex: 'none',
  });
});

// --- Phase 4: session keys ------------------------------------------------

test('session stamps the bow parameter snapshot at deposit; later changes do not rewrite it', () => {
  const session = new PathDrawingSession('s', { x: 0, y: 0 }, 'bSpline');
  session.setBowParams({ amplitude: 40, amplitudeIsPercent: false });
  session.commitBowed({ x: 100, y: 0 }, 'left');
  session.setBowParams({ amplitude: 5, amplitudeIsPercent: false });
  session.commitBowed({ x: 200, y: 0 }, 'right');
  const snap = session.snapshot();
  assert.equal(snap.points[0].outgoing.bow.amplitude, 40);
  assert.equal(snap.points[0].outgoing.bow.facing, 'A');
  assert.equal(snap.points[1].outgoing.bow.amplitude, 5);
  assert.equal(snap.points[1].outgoing.bow.facing, 'B');
});

test('session: switch-rounding cycles the rounding for subsequently deposited points', () => {
  const session = new PathDrawingSession('s', { x: 0, y: 0 }, 'bSpline');
  assert.equal(session.roundingMode, 'arc');
  session.commit('roundedCorner', { x: 50, y: 0 });
  assert.equal(session.cycleRounding(), 'bSpline');
  session.commit('roundedCorner', { x: 100, y: 0 });
  assert.equal(session.cycleRounding(), 'bevel');
  session.commit('roundedCorner', { x: 150, y: 0 });
  const snap = session.snapshot();
  // The rounded commits retype the previous point per the key-click
  // convention, so the three commits carry the three roundings in
  // cycle order.
  const roundings = snap.points.filter((p) => p.kind === 'roundedCorner').map((p) => p.corner.rounding);
  assert.deepEqual(roundings, ['arc', 'bSpline', 'bevel']);
});

test('session: erase-last removes committed points and closes arc slots', () => {
  const session = new PathDrawingSession('s', { x: 0, y: 0 }, 'bSpline');
  session.commit('bSpline', { x: 50, y: 0 });
  session.commit('bSpline', { x: 100, y: 0 });
  assert.equal(session.eraseLast(), true);
  assert.equal(session.eraseLast(), true);
  assert.equal(session.eraseLast(), false, 'no-op once only the first point is committed');
  const snap = session.snapshot();
  assert.equal(snap.points.length, 2); // first point + final inherited point
  assert.deepEqual(snap.points.map((p) => p.x), [0, 100]);

  const arc = new PathDrawingSession('a', { x: 0, y: 0 }, 'bSpline');
  arc.commit('bSpline', { x: 50, y: -50 });
  arc.commitArcThrough({ x: 100, y: 0 });
  assert.equal(arc.isArcOpen, true);
  assert.equal(arc.eraseLast(), true);
  assert.equal(arc.isArcOpen, false, 'erasing while an arc is open abandons the arc');
  assert.ok(!arc.snapshot().points.some((p) => p.kind === 'arcByThreeStart'));
  assert.ok(samplesOf(arc.snapshot()).length >= 1, 'snapshot still resolves');

  const done = new PathDrawingSession('d', { x: 0, y: 0 }, 'bSpline');
  done.commit('bSpline', { x: 50, y: -50 });
  done.commitArcThrough({ x: 100, y: 0 });
  done.commit('bSpline', { x: 160, y: 0 });
  assert.equal(done.snapshot().points[1].kind, 'arcByThreeStart');
  assert.equal(done.eraseLast(), true); // the (160,0) point
  assert.equal(done.snapshot().points[1].kind, 'arcByThreeStart', 'arc survives erasing a later point');
  assert.equal(done.eraseLast(), true); // the arc's end point
  const after = done.snapshot();
  assert.ok(!after.points.some((p) => p.kind === 'arcByThreeStart'), 'erasing the arc end abandons the arc');
});

test('session: live scale scales absolute bow amplitudes, percent rides the chord', () => {
  const session = new PathDrawingSession('s', { x: 0, y: 0 }, 'bSpline');
  session.setBowParams({ amplitude: 20, amplitudeIsPercent: false });
  session.commitBowed({ x: 100, y: 0 }, 'left');
  session.scale(2);
  const snap = session.snapshot();
  assert.equal(snap.points[0].outgoing.bow.amplitude, 40);
  const pct = new PathDrawingSession('p', { x: 0, y: 0 }, 'bSpline');
  pct.commitBowed({ x: 100, y: 0 }, 'left'); // default: 25 percent
  pct.scale(2);
  assert.equal(pct.snapshot().points[0].outgoing.bow.amplitude, 25);
});

// --- Phases 1/5: the layout registry --------------------------------------

const NO_MODS = { shift: false, alt: false, control: false, meta: false, capsLock: false };
const keyState = (over = {}) => ({
  isDrawingPath: false, isDrawingShape: false, isDrawingQuad: false,
  isLiveDrawing: false, shapeType: null, selectedCount: 0, isTypingText: false,
  isInDragLock: false, liveAdjustApplies: false, ...over,
});
const splineDrawing = keyState({ activeLayoutId: 'spline', isCompositePath: true, isDrawingPath: true, isLiveDrawing: true });
const ids = (variants) => variants.map((v) => v.commandId);

test('layout registry: base is unchanged; the spline layout carries the FMStroke keys', () => {
  assert.deepEqual(KEYBOARD_LAYOUTS.map((l) => l.id), ['base', 'spline']);
  assert.equal(commandById('bowed-point')?.action, 'bowed-point');
  assert.equal(commandById('switch-rounding')?.keycap, '\\');
  assert.equal(commandById('erase-last-point')?.keycap, 'Z');
  // Base layout, composite mode on: B resolves nothing (the bowed
  // commands live in the spline layout now).
  const baseState = keyState({ isCompositePath: true, isDrawingPath: true });
  assert.deepEqual(ids(resolveKeyVariants('KeyB', NO_MODS, baseState)), []);
  // Spline layout: the session keys resolve.
  assert.deepEqual(ids(resolveKeyVariants('KeyB', NO_MODS, splineDrawing)), ['bowed-point']);
  assert.deepEqual(ids(resolveKeyVariants('KeyB', { ...NO_MODS, shift: true }, splineDrawing)), ['bowed-point-flip']);
  assert.deepEqual(ids(resolveKeyVariants('Period', NO_MODS, splineDrawing)), ['arc-three-point']);
  assert.deepEqual(ids(resolveKeyVariants('Backslash', NO_MODS, splineDrawing)), ['switch-rounding']);
  assert.deepEqual(ids(resolveKeyVariants('KeyZ', NO_MODS, splineDrawing)), ['erase-last-point']);
});

test('layout registry: A stays End and Q stays Cancel in the spline layout', () => {
  assert.deepEqual(ids(resolveKeyVariants('KeyA', NO_MODS, splineDrawing)), ['finish-a']);
  assert.deepEqual(ids(resolveKeyVariants('KeyQ', NO_MODS, splineDrawing)), ['cancel']);
});

test('layout registry: unmatched caps fall back to base; typing suppresses everything', () => {
  const splineIdle = keyState({ activeLayoutId: 'spline', isCompositePath: true });
  // Z is Pan-lock while idle, even in the spline layout.
  assert.deepEqual(ids(resolveKeyVariants('KeyZ', NO_MODS, splineIdle)), ['pan-lock']);
  // B can still start a composite path while idle in the spline layout.
  assert.deepEqual(ids(resolveKeyVariants('KeyB', NO_MODS, splineIdle)), ['bowed-point']);
  const typing = keyState({ activeLayoutId: 'spline', isCompositePath: true, isDrawingPath: true, isTypingText: true });
  assert.deepEqual(resolveKeyVariants('KeyB', NO_MODS, typing), []);
});

test('layout registry: the board renders the active layout caps', () => {
  const baseCaps = resolveKeyboardLayout(NO_MODS, 'other', keyState({}));
  assert.equal(baseCaps.length, KEY_CAPS.length);
  assert.equal(baseCaps.find((c) => c.id === 'Backslash')?.commandId, undefined);
  const splineCaps = resolveKeyboardLayout(NO_MODS, 'other', splineDrawing);
  assert.equal(splineCaps.length, capsForLayout('spline').length);
  const backslash = splineCaps.find((c) => c.id === 'Backslash');
  assert.equal(backslash?.commandId, 'switch-rounding');
  assert.match(backslash?.legend ?? '', /ROUNDING/);
  assert.equal(splineCaps.find((c) => c.id === 'KeyB')?.commandId, 'bowed-point');
});

// --- Engine: D1 auto-activation + dispatch through the controller ---------

function makeEngine() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  const engine = new NibGliderEngine(scope, () => {});
  return { scope, engine };
}
const keyEvent = (key, code, shift = false) => ({
  key, code, shiftKey: shift, altKey: false, ctrlKey: false, metaKey: false,
  preventDefault: () => {},
});

test('engine: the spline layout follows composite mode; manual choice applies otherwise', () => {
  const { scope, engine } = makeEngine();
  try {
    assert.equal(engine.activeKeyboardLayoutId(), 'base');
    engine.setKeyboardLayoutChoice('spline');
    assert.equal(engine.activeKeyboardLayoutId(), 'spline');
    engine.setKeyboardLayoutChoice('auto');
    engine.setPathDrawingMode('ngComposite');
    assert.equal(engine.activeKeyboardLayoutId(), 'spline');
    engine.setPathDrawingMode('legacy');
    assert.equal(engine.activeKeyboardLayoutId(), 'base');
  } finally { scope.project.remove(); }
});

test('engine: spline keys dispatch through the keyboard controller while drawing', () => {
  const { scope, engine } = makeEngine();
  try {
    engine.setPathDrawingMode('ngComposite');
    engine.depositPointMode = 0;
    engine.mousePt = new scope.Point(10, 10);
    engine.handleKeyDown(keyEvent('f', 'KeyF'));
    engine.mousePt = new scope.Point(110, 10);
    engine.pointer.onMouseMove({ point: engine.mousePt });
    // B stamps the first point as the bowed segment's start.
    engine.handleKeyDown(keyEvent('b', 'KeyB'));
    engine.mousePt = new scope.Point(210, 10);
    engine.pointer.onMouseMove({ point: engine.mousePt });
    engine.handleKeyDown(keyEvent('h', 'KeyH'));
    engine.mousePt = new scope.Point(210, 10);
    engine.pointer.onMouseMove({ point: engine.mousePt });
    // Switch rounding, then deposit another rounded corner: it takes
    // the new rounding; the first keeps 'arc'.
    engine.handleKeyDown(keyEvent('\\', 'Backslash'));
    assert.equal(engine.compositeRoundingMode, 'bSpline');
    engine.handleKeyDown(keyEvent('h', 'KeyH'));
    engine.mousePt = new scope.Point(310, 10);
    engine.pointer.onMouseMove({ point: engine.mousePt });
    // Erase the last point, then finish.
    engine.handleKeyDown(keyEvent('z', 'KeyZ'));
    engine.endPathOrShape();
    const layer = scope.project.activeLayer;
    assert.equal(layer.children.length, 1);
    const retained = engine.getRetainedPathDrawable(layer.children[0].data.drawableId);
    assert.equal(retained.source.mode, 'ngComposite');
    const kinds = retained.source.points.map((p) => p.kind);
    assert.equal(kinds[0], 'bowedLine');
    assert.equal(retained.source.points[0].outgoing.bow.facing, 'A');
    // First rounded corner kept 'arc'; the one deposited after the
    // switch took 'bSpline', and the final point inherits it.
    const roundings = retained.source.points.filter((p) => p.kind === 'roundedCorner').map((p) => p.corner.rounding);
    assert.deepEqual(roundings, ['arc', 'bSpline', 'bSpline']);
  } finally { scope.project.remove(); }
});
