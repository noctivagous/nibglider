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
    // Partial overlay: keys with no available clothoid binding fall
    // through to base (J toggles the panel from inside the layout).
    assert.deepEqual(resolveKeyVariants('KeyJ', BASE_MODIFIERS, live).map((v) => v.commandId), ['toggle-panel']);
    // Slice A shell: point keys are disabled until the solver lands, so the
    // base fallthrough applies (W stamps, S toggles stroke while idle).
    // The Spiro legends appear once Slice C flips availability on.
    assert.deepEqual(resolveKeyVariants('KeyW', BASE_MODIFIERS, live).map((v) => v.commandId), ['stamp']);
    assert.deepEqual(resolveKeyVariants('KeyS', BASE_MODIFIERS, live).map((v) => v.commandId), ['toggle-stroke']);
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
