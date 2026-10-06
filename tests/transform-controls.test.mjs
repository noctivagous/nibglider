import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { SceneRepository } from '../src/engine/scene/SceneRepository.ts';
import { SelectionManager } from '../src/engine/scene/SelectionManager.ts';
import { HistoryManager } from '../src/engine/history/HistoryManager.ts';
import { TransformManager } from '../src/engine/history/TransformManager.ts';
import { buildKeymapRows, buildStatusSchema } from '../src/ui/StatusPresenter.ts';
import { resolveKeyVariants } from '../src/engine/input/KeyboardLayoutResolver.ts';
import { isAltTransformKey, isPrimaryTransformKey, keyboardPlatform } from '../src/engine/input/keymap.ts';

// Command+T on macOS/iOS, Ctrl+T on PC: the test host reports whichever
// platform it runs on, so drive the matching chord.
function primaryChord() {
  return keyboardPlatform() === 'mac' ? { ctrlKey: false, metaKey: true } : { ctrlKey: true, metaKey: false };
}

function engineSetup() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(400, 300));
  const engine = new NibGliderEngine(scope, () => {});
  const rect = () => new scope.Path.Rectangle({ from: [0, 0], to: [40, 20] });
  const key = (code, k, mods = {}) => ({
    code, key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
    ...mods, target: null, getModifierState: () => false, preventDefault: () => {},
  });
  return { scope, engine, rect, key, cleanup: () => scope.project.remove() };
}

function boundsOf(engine) {
  const b = engine.collectiveBounds(engine.topLevelSelected());
  return { x: b.x, y: b.y, width: b.width, height: b.height };
}

function snap(over = {}) {
  return {
    selectedCount: 0, gridEnabled: false, gridType: 'square', dropNote: '', dragLock: false, panLock: false,
    drawingPath: false, composite: false, cornerRadius: 12, splineTension: 0.4,
    drawingShape: false, shapeType: null, circleRadiusAnchor: 'origin', radialStampLockedRadius: null,
    rectDiagonalMode: 'full', shapeWidth: 40, aspectLabel: null, hasSecondEdge: false,
    drawingQuad: false, quadPointCount: 0, liveHints: [], transformMode: false, transformLive: null, ...over,
  };
}

function keyState(over = {}) {
  return {
    isDrawingPath: false, isDrawingShape: false, isDrawingQuad: false,
    isLiveDrawing: false, shapeType: null, selectedCount: 0,
    isInDragLock: false, liveAdjustApplies: false, ...over,
  };
}

const NO_MODS = { shift: false, alt: false, control: false, meta: false, capsLock: false };

test('transform mode needs a selection and builds the handle overlay', () => {
  const { engine, rect, cleanup } = engineSetup();
  try {
    engine.setTransformMode(true);
    assert.equal(engine.isTransformMode, false);
    const item = rect();
    engine.addItemToSelection(item);
    engine.setTransformMode(true);
    assert.equal(engine.isTransformMode, true);
    const handles = engine.transformHandles.handleItems;
    // Box outline + stem + eight scale handles + rotate knob.
    assert.equal(handles.length, 11);
    assert.ok(handles.every((h) => h.guide === true));
    engine.setTransformMode(false);
    assert.equal(engine.isTransformMode, false);
    assert.equal(engine.transformHandles.handleItems.length, 0);
  } finally { cleanup(); }
});

test('primary+T toggles transform mode and S arms live scale from the cursor', () => {
  const { scope, engine, rect, key, cleanup } = engineSetup();
  try {
    const item = rect();
    engine.addItemToSelection(item);
    let prevented = 0;
    const toggle = { ...key('KeyT', 't', primaryChord()), preventDefault: () => { prevented++; } };
    engine.handleKeyDown(toggle);
    assert.equal(prevented, 1);
    assert.equal(engine.isTransformMode, true);
    engine.mousePt = new scope.Point(30, 15);
    engine.handleKeyDown(key('KeyS', 's'));
    engine.mousePt = new scope.Point(40, 20);
    engine.pointer.onMouseMove({ point: engine.mousePt });
    const grown = boundsOf(engine);
    assert.ok(grown.width > 40 && grown.height > 20);
    // Same key again commits one undo entry.
    engine.handleKeyDown(key('KeyS', 's'));
    assert.equal(engine.history.undoLabel(), 'Scale');
    engine.undo();
    const restored = boundsOf(engine);
    assert.ok(Math.abs(restored.width - 40) < 1e-6 && Math.abs(restored.height - 20) < 1e-6);
  } finally { cleanup(); }
});

test('S and V yield to transform live keys while the mode is on', () => {
  const idle = keyState({ selectedCount: 1 });
  const active = keyState({ selectedCount: 1, isTransformMode: true });
  assert.equal(resolveKeyVariants('KeyS', NO_MODS, idle)[0].commandId, 'toggle-stroke');
  assert.equal(resolveKeyVariants('KeyS', NO_MODS, active)[0].commandId, 'transform-scale');
  assert.equal(resolveKeyVariants('KeyV', NO_MODS, idle)[0].commandId, 'stroke-thicker');
  assert.equal(resolveKeyVariants('KeyV', NO_MODS, active)[0].commandId, 'transform-shear-v');
  assert.equal(resolveKeyVariants('KeyR', NO_MODS, active)[0].commandId, 'transform-rotate');
  assert.equal(resolveKeyVariants('KeyH', NO_MODS, active)[0].commandId, 'transform-shear-h');
  const primary = keyboardPlatform() === 'mac'
    ? { ...NO_MODS, meta: true }
    : { ...NO_MODS, control: true };
  const selected = keyState({ selectedCount: 1 });
  assert.equal(resolveKeyVariants('KeyT', primary, selected)[0].commandId, 'transform-mode');
  assert.equal(resolveKeyVariants('KeyT', NO_MODS, selected).length, 0);
  // Alt/Option+T is the browser-safe alias on every platform.
  const alt = { ...NO_MODS, alt: true };
  assert.equal(resolveKeyVariants('KeyT', alt, selected)[0].commandId, 'transform-mode');
  const t = (mods) => ({ code: 'KeyT', shiftKey: false, altKey: false, ...mods });
  assert.equal(isAltTransformKey({ ...t({ altKey: true }), key: 't', ctrlKey: false, metaKey: false }), true);
  // Option+T yields '†' on macOS; the code still matches.
  assert.equal(isAltTransformKey({ ...t({ altKey: true }), key: '†', ctrlKey: false, metaKey: false }), true);
  assert.equal(isAltTransformKey({ ...t({ altKey: true }), key: 't', ctrlKey: true, metaKey: false }), false);
  assert.equal(isAltTransformKey({ ...t({ altKey: false }), key: 't', ctrlKey: false, metaKey: false }), false);
});

test('primary transform chord is command on mac and control on pc', () => {
  const t = (mods) => ({ code: 'KeyT', key: 't', shiftKey: false, altKey: false, ...mods });
  const mac = keyboardPlatform() === 'mac';
  assert.equal(isPrimaryTransformKey(t({ ctrlKey: false, metaKey: true })), mac);
  assert.equal(isPrimaryTransformKey(t({ ctrlKey: true, metaKey: false })), !mac);
  assert.equal(isPrimaryTransformKey(t({ ctrlKey: true, metaKey: true })), false);
  assert.equal(isPrimaryTransformKey({ ...t({ ctrlKey: !mac, metaKey: mac }), shiftKey: true }), false);
  const hadNavigator = 'navigator' in globalThis;
  const saved = globalThis.navigator;
  try {
    // Force the opposite platform and check the chord flips with it.
    Object.defineProperty(globalThis, 'navigator',
      { value: { platform: mac ? 'Win32' : 'MacIntel' }, configurable: true });
    assert.equal(isPrimaryTransformKey(t({ ctrlKey: false, metaKey: true })), !mac);
    assert.equal(isPrimaryTransformKey(t({ ctrlKey: true, metaKey: false })), mac);
  } finally {
    if (hadNavigator) Object.defineProperty(globalThis, 'navigator', { value: saved, configurable: true });
    else delete globalThis.navigator;
  }
});

test('se handle drag scales with undo and shift forces uniform', () => {
  const { scope, engine, rect, cleanup } = engineSetup();
  try {
    engine.addItemToSelection(rect());
    engine.setTransformMode(true);
    engine.mousePt = new scope.Point(30, 15);
    engine.beginTransformDrag('se');
    engine.updateTransformDrag(new scope.Point(40, 15), false);
    let b = boundsOf(engine);
    assert.ok(Math.abs(b.width - 60) < 1e-6 && Math.abs(b.height - 20) < 1e-6);
    engine.updateTransformDrag(new scope.Point(36, 16), true);
    b = boundsOf(engine);
    assert.ok(Math.abs(b.width - 52) < 1e-6 && Math.abs(b.height - 26) < 1e-6);
    engine.endTransformDrag();
    assert.equal(engine.history.undoLabel(), 'Scale');
    engine.undo();
    b = boundsOf(engine);
    assert.ok(Math.abs(b.width - 40) < 1e-6 && Math.abs(b.height - 20) < 1e-6);
  } finally { cleanup(); }
});

test('rotate handle rotates with undo and shift snaps to 15 degrees', () => {
  const { scope, engine, rect, cleanup } = engineSetup();
  try {
    engine.addItemToSelection(rect());
    engine.setTransformMode(true);
    // Center is (20, 10); start due east of it.
    engine.mousePt = new scope.Point(40, 10);
    engine.beginTransformDrag('rotate');
    engine.updateTransformDrag(new scope.Point(20, 30), false);
    let b = boundsOf(engine);
    assert.ok(Math.abs(b.width - 20) < 1e-6 && Math.abs(b.height - 40) < 1e-6);
    engine.updateTransformDrag(new scope.Point(13, 29), true);
    assert.ok(Math.abs(engine.transformDrag.netDegrees - 105) < 1e-6);
    engine.endTransformDrag();
    assert.equal(engine.history.undoLabel(), 'Rotate');
    engine.undo();
    b = boundsOf(engine);
    assert.ok(Math.abs(b.width - 40) < 1e-6 && Math.abs(b.height - 20) < 1e-6);
  } finally { cleanup(); }
});

test('live shear commits with undo and esc cancels the next gesture', () => {
  const { scope, engine, rect, key, cleanup } = engineSetup();
  try {
    engine.addItemToSelection(rect());
    engine.setTransformMode(true);
    engine.mousePt = new scope.Point(30, 15);
    engine.handleKeyDown(key('KeyH', 'h'));
    engine.mousePt = new scope.Point(50, 15);
    engine.updateTransformLive();
    assert.ok(boundsOf(engine).width > 40);
    engine.handleKeyDown(key('KeyH', 'h'));
    assert.equal(engine.history.undoLabel(), 'Shear horizontal');
    const committed = boundsOf(engine).width;
    engine.undo();
    assert.ok(Math.abs(boundsOf(engine).width - 40) < 1e-6);
    // Arm again, move, then cancel: geometry returns, nothing recorded.
    engine.handleKeyDown(key('KeyV', 'v'));
    engine.mousePt = new scope.Point(30, 35);
    engine.updateTransformLive();
    assert.equal(engine.transformEscape(), true);
    assert.ok(Math.abs(boundsOf(engine).width - 40) < 1e-6);
    assert.equal(engine.history.canUndo(), false);
    assert.equal(engine.history.redoLabel(), 'Shear horizontal');
    void committed;
  } finally { cleanup(); }
});

test('alt+T toggles transform mode on and off', () => {
  const { engine, rect, key, cleanup } = engineSetup();
  try {
    engine.addItemToSelection(rect());
    engine.handleKeyDown(key('KeyT', 't', { altKey: true }));
    assert.equal(engine.isTransformMode, true);
    engine.handleKeyDown(key('KeyT', 't', { altKey: true }));
    assert.equal(engine.isTransformMode, false);
  } finally { cleanup(); }
});

test('esc exits transform mode and clearing the selection turns it off', () => {
  const { engine, rect, cleanup } = engineSetup();
  try {
    engine.addItemToSelection(rect());
    engine.setTransformMode(true);
    assert.equal(engine.transformEscape(), true);
    assert.equal(engine.isTransformMode, false);
    assert.equal(engine.transformEscape(), false);
    engine.setTransformMode(true);
    engine.clearOutSelection();
    assert.equal(engine.isTransformMode, false);
  } finally { cleanup(); }
});

test('status schema and keymap rows name S R H V in transform mode', () => {
  const schema = buildStatusSchema(snap({ selectedCount: 1, transformMode: true }));
  assert.ok(JSON.stringify(schema).includes('Transform Controls On'));
  const rows = buildKeymapRows(snap({ selectedCount: 1, transformMode: true }));
  const ids = rows.flatMap((r) => r.ids);
  for (const id of ['transform-scale', 'transform-rotate', 'transform-shear-h', 'transform-shear-v']) {
    assert.ok(ids.includes(id), id);
  }
  const keys = rows.filter((r) => r.ids[0]?.startsWith('transform-')).map((r) => r.keys.join(''));
  assert.deepEqual(keys, ['S', 'R', 'H', 'V']);
  const off = buildKeymapRows(snap({ selectedCount: 1 }));
  assert.ok(!off.flatMap((r) => r.ids).some((id) => id.startsWith('transform-')));
});

test('shear commits and previews through the transform layer with undo', () => {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(400, 300));
  const scene = new SceneRepository(scope, () => ({ gridLayer: null, cursors: [], previews: [] }));
  let selection;
  const history = new HistoryManager(scene, () => selection, () => {});
  selection = new SelectionManager(scene, history, (original, clone) => scene.retainClone(original, clone, (item) => item));
  const transforms = new TransformManager(scene, selection, history);
  try {
    const item = new scope.Path.Rectangle({ from: [0, 0], to: [40, 20] });
    selection.add(item);
    transforms.shear(true, 0.5);
    assert.equal(history.undoLabel(), 'Shear horizontal');
    assert.ok(Math.abs(item.bounds.width - 50) < 1e-6);
    history.undo();
    assert.ok(Math.abs(item.bounds.width - 40) < 1e-6);
    history.redo();
    assert.ok(Math.abs(item.bounds.width - 50) < 1e-6);
    transforms.shearPreview(false, 0.25);
    assert.ok(Math.abs(item.bounds.height - 32.5) < 1e-6);
  } finally { scope.project.remove(); }
});
