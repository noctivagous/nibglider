import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { resolveKeyVariants } from '../src/engine/input/KeyboardLayoutResolver.ts';
import {
  KEYBOARD_LAYOUTS, KEY_COMMANDS, KEY_VARIANTS_BY_LAYOUT,
  keyboardLayoutById,
} from '../src/engine/input/keymap.ts';

const layoutLabel = (state) => keyboardLayoutById(state.activeLayoutId).label;
import { BASE_MODIFIERS } from '../src/engine/input/ModifierStateTracker.ts';
import { NibGliderEngine } from '../src/engine/engine.ts';

const savedRequest = globalThis.requestAnimationFrame;
const savedCancel = globalThis.cancelAnimationFrame;
let nextFrame = 0;
const frames = new Map();
globalThis.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
function tick() { const work = [...frames.values()]; frames.clear(); work.forEach((callback) => callback()); }
after(() => {
  globalThis.requestAnimationFrame = savedRequest;
  globalThis.cancelAnimationFrame = savedCancel;
});
function scope() { const s = new paper.PaperScope(); s.setup(new s.Size(800, 600)); return s; }
function engine() {
  const s = scope(); const e = new NibGliderEngine(s, () => {});
  e.setPathDrawingMode('ngComposite'); e.depositPointMode = 0;
  return { s, e, cleanup: () => { e.cancelCurrentDrawingOperation(); s.project.remove(); } };
}
const press = (code, k, mods = {}) => ({
  code, key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
  ...mods, target: null, getModifierState: () => false, preventDefault: () => {},
});

test('Backslash opens the clothoid layout and Escape returns to the mode layout', () => {
  const { e, cleanup } = engine();
  try {
    // Composite mode drives the spline board while idle.
    assert.equal(e.getKeyState().activeLayoutId, 'spline');
    e.handleKeyDown(press('Backslash', '\\'));
    tick();
    const live = e.getKeyState();
    assert.equal(live.activeLayoutId, 'clothoid');
    assert.equal(e.manualLayoutId, 'clothoid');
    assert.equal(layoutLabel(live), 'Clothoid');
    // Unmatched caps fall through to base (J toggles the panel
    // from inside the layout).
    assert.deepEqual(resolveKeyVariants('KeyJ', BASE_MODIFIERS, live).map((v) => v.commandId), ['toggle-panel']);
    // Spiro point keys are live and shadow base caps.
    assert.deepEqual(resolveKeyVariants('KeyW', BASE_MODIFIERS, live).map((v) => v.commandId), ['clothoid-prev-constraint']);
    assert.deepEqual(resolveKeyVariants('KeyS', BASE_MODIFIERS, live).map((v) => v.commandId), ['clothoid-g4']);
    assert.deepEqual(resolveKeyVariants('KeyD', BASE_MODIFIERS, live).map((v) => v.commandId), ['clothoid-g2']);
    assert.deepEqual(resolveKeyVariants('KeyF', BASE_MODIFIERS, live).map((v) => v.commandId), ['clothoid-corner']);
    assert.deepEqual(resolveKeyVariants('KeyG', BASE_MODIFIERS, live).map((v) => v.commandId), ['clothoid-line']);
    assert.deepEqual(resolveKeyVariants('KeyE', BASE_MODIFIERS, live).map((v) => v.commandId), ['clothoid-next-constraint']);
    // B stamps inside the layout instead of reopening it.
    assert.deepEqual(resolveKeyVariants('KeyB', BASE_MODIFIERS, live).map((v) => v.commandId), ['clothoid-stamp']);
    // Escape with no live drawing leaves the manual layout, canceling nothing.
    e.handleKeyDown(press('Escape', 'Escape'));
    assert.equal(e.getKeyState().activeLayoutId, 'spline');
    assert.equal(e.manualLayoutId, null);
  } finally { cleanup(); }
});

test('manual clothoid persists across spline sessions until cleared', () => {
  const { s, e, cleanup } = engine();
  try {
    e.handleKeyDown(press('Backslash', '\\'));
    assert.equal(e.getKeyState().activeLayoutId, 'clothoid');
    // A manual override wins over session derivation: starting a
    // spline path keeps the clothoid board up.
    e.mousePt = new s.Point(10, 10); e.splinePointKC();
    assert.equal(e.getKeyState().activeLayoutId, 'clothoid');
    // Finish keeps the manual choice, not the mode layout.
    e.handleKeyDown(press('KeyA', 'a'));
    assert.equal(e.isDrawingPath, false);
    assert.equal(e.getKeyState().activeLayoutId, 'clothoid');
    // Cancel keeps it too.
    e.mousePt = new s.Point(10, 10); e.splinePointKC();
    assert.equal(e.getKeyState().activeLayoutId, 'clothoid');
    e.handleKeyDown(press('KeyQ', 'q'));
    assert.equal(e.getKeyState().activeLayoutId, 'clothoid');
    // Resolving never mutates engine state.
    assert.equal(e.manualLayoutId, 'clothoid');
    e.handleKeyDown(press('Escape', 'Escape'));
    assert.equal(e.getKeyState().activeLayoutId, 'spline');
  } finally { cleanup(); }
});

test('clothoid deposits route through the clothoid solver and persist', async () => {
  const { s, e, cleanup } = engine();
  try {
    const { resolveCompositePath } = await import('../src/engine/geometry/compositeExpansion.ts');
    const { validatePath } = await import('../src/engine/model/serialization.ts');
    e.handleKeyDown(press('Backslash', '\\'));
    tick();
    assert.equal(e.getKeyState().activeLayoutId, 'clothoid');
    e.mousePt = new s.Point(10, 10);
    e.handleKeyDown(press('KeyS', 's'));
    tick();
    e.mousePt = new s.Point(120, 20);
    e.handleKeyDown(press('KeyD', 'd'));
    tick();
    e.mousePt = new s.Point(200, 120);
    e.handleKeyDown(press('KeyG', 'g'));
    tick();
    assert.equal(e.compositePathTool.active, true);
    const deposit = e.compositePathTool.stamp(false);
    assert.ok(deposit);
    const snap = deposit.source;
    const kinds = snap.points.map((p) => p.kind);
    // Key-click convention retypes the previous point, so the first
    // deposit's kind shifts; what matters is clothoid vocabulary persists.
    assert.ok(kinds.includes('g2'));
    assert.ok(kinds.every((k) => ['g4', 'g2', 'clothoidCorner', 'line', 'prevConstraint', 'nextConstraint', 'bSpline', 'hardCorner'].includes(k)));
    assert.doesNotThrow(() => validatePath(snap));
    const resolved = resolveCompositePath(snap);
    assert.ok(resolved.segments.length > 2);
    assert.ok(resolved.segments.every((seg) => Number.isFinite(seg.point.x) && Number.isFinite(seg.point.y)));
    const before = e.selectedItems.length;
    e.handleKeyDown(press('KeyA', 'a'));
    tick();
    assert.equal(e.compositePathTool.active, false);
    assert.ok(e.selectedItems.length >= before);
  } finally { cleanup(); }
});

test('clothoid registry shape: third layout, per-layout compile, sparse tables', () => {
  assert.deepEqual(KEYBOARD_LAYOUTS.map((l) => l.id), ['base', 'spline', 'clothoid']);
  assert.deepEqual(KEYBOARD_LAYOUTS.map((l) => l.label), ['Base', 'Spline', 'Clothoid']);
  assert.ok(Array.isArray(KEY_VARIANTS_BY_LAYOUT.clothoid));
  assert.ok(KEY_VARIANTS_BY_LAYOUT.clothoid.some((v) => v.commandId === 'clothoid-g4'));
  // The compile stays near FM-plist order, not near the product space.
  assert.ok(KEY_VARIANTS_BY_LAYOUT.clothoid.length < KEY_COMMANDS.length * 10);
  // W shadows Stamp while a session draws, so the audit's explicit Stamp
  // binding (B) must resolve inside the layout.
  const drawingClothoid = {
    isDrawingPath: true, isDrawingShape: false, isDrawingQuad: false,
    isLiveDrawing: true, shapeType: null, selectedCount: 0, isTypingText: false,
    isInDragLock: false, liveAdjustApplies: false, isCompositePath: false,
    activeLayoutId: 'clothoid',
  };
  assert.deepEqual(
    resolveKeyVariants('KeyB', BASE_MODIFIERS, drawingClothoid).map((v) => v.commandId),
    ['clothoid-stamp'],
  );
});
