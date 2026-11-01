import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { resolveKeyVariants } from '../src/engine/input/KeyboardLayoutResolver.ts';
import {
  KEYBOARD_LAYOUTS, KEY_COMMANDS, LAYOUT_VARIANT_TABLES,
  layoutIdForState, layoutLabelForState, variantsForLayout,
} from '../src/engine/input/keymap.ts';
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

test('KeyB opens the clothoid overlay and Escape returns to base', () => {
  const { e, cleanup } = engine();
  try {
    assert.equal(layoutIdForState(e.getKeyState()), 'base');
    e.handleKeyDown(press('KeyB', 'b'));
    tick();
    const live = e.getKeyState();
    assert.equal(live.activeLayoutId, 'clothoid');
    assert.equal(layoutIdForState(live), 'clothoid');
    assert.equal(layoutLabelForState(live), 'Clothoid');
    // Partial overlay: keys with no clothoid binding fall
    // through to base (J toggles the panel from inside the layout).
    assert.deepEqual(resolveKeyVariants('KeyJ', BASE_MODIFIERS, live).map((v) => v.commandId), ['toggle-panel']);
    // Slice 7.3: Spiro point keys are live and shadow base caps.
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
    assert.equal(layoutIdForState(e.getKeyState()), 'base');
    assert.equal(e.manualLayoutId, null);
  } finally { cleanup(); }
});

test('manual clothoid yields to a spline session and returns after', () => {
  const { s, e, cleanup } = engine();
  try {
    e.handleKeyDown(press('KeyB', 'b'));
    assert.equal(layoutIdForState(e.getKeyState()), 'clothoid');
    // Starting a spline path temporarily overrides the manual layout.
    e.mousePt = new s.Point(10, 10); e.splinePointKC();
    assert.equal(layoutIdForState(e.getKeyState()), 'spline');
    // Finish restores the manual choice, not base.
    e.handleKeyDown(press('KeyA', 'a'));
    assert.equal(e.isDrawingPath, false);
    assert.equal(layoutIdForState(e.getKeyState()), 'clothoid');
    // Cancel restores it too.
    e.mousePt = new s.Point(10, 10); e.splinePointKC();
    assert.equal(layoutIdForState(e.getKeyState()), 'spline');
    e.handleKeyDown(press('KeyQ', 'q'));
    assert.equal(layoutIdForState(e.getKeyState()), 'clothoid');
    // Resolving through other layouts never mutates engine state.
    assert.equal(e.manualLayoutId, 'clothoid');
    e.handleKeyDown(press('Escape', 'Escape'));
    assert.equal(layoutIdForState(e.getKeyState()), 'base');
  } finally { cleanup(); }
});

test('clothoid deposits route through the clothoid solver and persist', async () => {
  const { s, e, cleanup } = engine();
  try {
    const { resolveCompositePath } = await import('../src/engine/geometry/compositeExpansion.ts');
    const { validatePath } = await import('../src/engine/model/serialization.ts');
    e.handleKeyDown(press('KeyB', 'b'));
    tick();
    assert.equal(layoutIdForState(e.getKeyState()), 'clothoid');
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

test('clothoid registry shape: partial overlay, shell commands, sparse tables', () => {
  assert.equal(KEYBOARD_LAYOUTS.clothoid.overlay, 'partial');
  assert.equal(KEYBOARD_LAYOUTS.spline.overlay, 'partial');
  assert.equal(KEYBOARD_LAYOUTS.base.overlay, 'partial');
  assert.deepEqual(Object.keys(KEYBOARD_LAYOUTS), ['base', 'spline', 'clothoid']);
  assert.equal(variantsForLayout('clothoid'), LAYOUT_VARIANT_TABLES.clothoid);
  // Shell stays near FM-plist order, not near the product space.
  let keyed = 0;
  for (const [, list] of LAYOUT_VARIANT_TABLES.clothoid) keyed += list.length;
  assert.ok(keyed < KEY_COMMANDS.length * 10);
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
