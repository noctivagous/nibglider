import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { CoordinateManager, PT_PER_INCH } from '../src/engine/document/CoordinateManager.ts';
import { DocumentManager } from '../src/engine/document/DocumentManager.ts';
import { LayerManager } from '../src/engine/document/LayerManager.ts';
import { ViewportManager } from '../src/engine/document/ViewportManager.ts';
import { NibGliderEngine, classifyWheel } from '../src/engine/engine.ts';

function scope() { const s = new paper.PaperScope(); s.setup(new s.Size(400, 300)); return s; }

test('document coordinates preserve point geometry and convert physical/SVG units explicitly', () => {
  const c = new CoordinateManager();
  assert.deepEqual(c.documentPoint({ x: 1.25, y: -3 }), { x: 1.25, y: -3 });
  assert.equal(c.toPoints(1, 'inch'), PT_PER_INCH);
  assert.equal(c.toPoints(2.54, 'cm'), PT_PER_INCH);
  assert.equal(c.fromPoints(72, 'inch'), 1);
  assert.equal(c.svgToPoints(96), 72);
  assert.equal(c.svgToPoints(25.4, 'mm'), 72);
  assert.equal(c.pointsToSvg(72, 'px'), 96);
  assert.equal(c.roundPoints(1.23456789), 1.234568);
  assert.throws(() => c.documentPoint({ x: Infinity, y: 0 }));
  assert.throws(() => c.svgToPoints(2, 'bad'));
  assert.throws(() => c.roundPoints(NaN));
});

test('one unbounded page gains metadata and emits dirty changes only after edits', () => {
  const document = new DocumentManager(); const events = [];
  const unsubscribe = document.subscribe((event) => events.push(event));
  assert.deepEqual(document.pageSettings, { id: 'page-1', widthPt: null, heightPt: null, orientation: null, unit: 'pt' });
  assert.equal(document.isDirty, false);
  document.setPageSize(8.5, 11, 'inch');
  assert.deepEqual(document.pageSettings, { id: 'page-1', widthPt: 612, heightPt: 792, orientation: 'portrait', unit: 'inch' });
  document.setPageSize(8.5, 11, 'inch'); assert.equal(document.revisionNumber, 1);
  document.setDisplayUnit('cm'); assert.equal(document.revisionNumber, 2);
  assert.equal(document.pageSettings.widthPt, 612);
  assert.throws(() => document.setPageSize(0, 1));
  assert.equal(document.revisionNumber, 2);
  document.markClean(); assert.equal(document.isDirty, false);
  document.markEdited(); assert.equal(document.revisionNumber, 3);
  assert.deepEqual(events.map((e) => e.reason), ['page', 'page', 'clean', 'scene']);
  unsubscribe(); document.markEdited(); assert.equal(events.length, 4);
});

test('viewport zoom and center are readable before the canvas is attached', () => {
  const s = new paper.PaperScope();
  const viewport = new ViewportManager(s);
  assert.equal(s.view, null);
  assert.equal(viewport.zoom, 1);
  assert.equal(viewport.center.x, 0);
  assert.equal(viewport.center.y, 0);
});

test('layer and viewport managers preserve active layer, cursor zoom, pan, and zoom limits', () => {
  const s = scope();
  try {
    const layers = new LayerManager(s);
    const item = new s.Path({ insert: false, segments: [[0, 0], [10, 0]] });
    layers.addToActive(item);
    assert.equal(item.parent, layers.activeLayer);
    assert.equal(layers.layerForId(layers.activeLayerId), layers.activeLayer);
    assert.equal(layers.layerForId('wrong'), null);
    let changes = 0;
    const viewport = new ViewportManager(s, () => changes++);
    const cursor = new s.Point(100, 100);
    const before = s.view.viewToProject(cursor);
    assert.equal(viewport.zoomForWheel(-100, cursor), true);
    assert.ok(viewport.zoom > 1);
    assert.ok(s.view.viewToProject(cursor).getDistance(before) < 1e-9);
    assert.equal(viewport.resetZoom(), true);
    assert.equal(viewport.zoom, 1);
    assert.equal(viewport.stepZoom(1), true);
    assert.equal(viewport.zoom, 1.25);
    s.view.zoom = 16; assert.equal(viewport.stepZoom(1), false);
    s.view.zoom = 0.1; assert.equal(viewport.stepZoom(-1), false);
    s.view.zoom = 1;
    const oldCenter = viewport.center;
    viewport.beginPan(new s.Point(100, 100));
    assert.equal(viewport.isPanning, true);
    viewport.panTo(new s.Point(120, 100), new s.Point(20, 0));
    assert.equal(viewport.center.x, oldCenter.x - 20);
    viewport.endPan(); assert.equal(viewport.isPanning, false);
    assert.ok(changes >= 4);
  } finally { s.project.remove(); }
});

test('cmd/ctrl - and = step viewport zoom, cmd/ctrl 0 resets to 100%', () => {
  const s = scope(); const engine = new NibGliderEngine(s, () => {});
  const chord = (code, key, mods) => ({
    code, key, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
    ...mods, target: null, getModifierState: () => false, preventDefault: () => {},
  });
  try {
    assert.equal(s.view.zoom, 1);
    engine.handleKeyDown(chord('Equal', '=', { metaKey: true }));
    assert.equal(s.view.zoom, 1.25);
    engine.handleKeyDown(chord('Minus', '-', { metaKey: true }));
    assert.equal(s.view.zoom, 1);
    engine.handleKeyDown(chord('Equal', '=', { ctrlKey: true }));
    assert.equal(s.view.zoom, 1.25);
    engine.handleKeyDown(chord('Digit0', '0', { ctrlKey: true }));
    assert.equal(s.view.zoom, 1);
    engine.handleKeyDown(chord('Equal', '+', { metaKey: true, shiftKey: true }));
    assert.equal(s.view.zoom, 1.25);
    engine.handleKeyDown(chord('Digit0', '0', { metaKey: true }));
    assert.equal(s.view.zoom, 1);
  } finally { engine.cancelCurrentDrawingOperation(); s.project.remove(); }
});

test('engine document revision follows committed scene edits, undo/redo, and page metadata', () => {
  const s = scope(); const engine = new NibGliderEngine(s, () => {});
  try {
    const events = []; engine.subscribeDocumentChanges((event) => events.push(event));
    const a = new s.Path.Rectangle({ from: [0, 0], to: [40, 40] });
    const b = new s.Path.Rectangle({ from: [20, 0], to: [60, 40] });
    engine.addItemToSelection(a); engine.addItemToSelection(b);
    assert.equal(engine.isDocumentDirty(), false);
    engine.groupSelection(); assert.equal(engine.documentRevision(), 1);
    engine.undo(); assert.equal(engine.documentRevision(), 2);
    engine.redo(); assert.equal(engine.documentRevision(), 3);
    engine.setPageDimensions(300, 200);
    assert.equal(engine.getPageSettings().orientation, 'landscape');
    assert.equal(engine.documentRevision(), 4);
    assert.deepEqual(events.map((e) => e.reason), ['scene', 'scene', 'scene', 'page']);
    engine.undo(); assert.equal(engine.documentRevision(), 5);
    engine.combineSelection('union'); assert.equal(engine.documentRevision(), 6);
    engine.setStrokeWidth(7); assert.equal(engine.documentRevision(), 7);
    assert.equal(engine.isDocumentDirty(), true);
  } finally { s.project.remove(); }
});

test('selection size reports live union bounds for the scale dialog', () => {
  const s = scope(); const engine = new NibGliderEngine(s, () => {});
  try {
    assert.equal(engine.selectionSize(), null);
    const rect = new s.Path.Rectangle({ from: [0, 0], to: [40, 30] });
    engine.addItemToSelection(rect);
    assert.deepEqual(engine.selectionSize(), { width: 40, height: 30 });
    engine.scaleSelectionPreview(2);
    assert.deepEqual(engine.selectionSize(), { width: 80, height: 60 });
    engine.scaleSelectionPreview(0.5);
    assert.deepEqual(engine.selectionSize(), { width: 40, height: 30 });
  } finally { engine.cancelCurrentDrawingOperation(); s.project.remove(); }
});

test('z pan-lock glues the canvas to the cursor until any key', () => {
  const s = scope(); const engine = new NibGliderEngine(s, () => {});
  const key = (code, k, mods = {}) => ({
    code, key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
    ...mods, target: null, getModifierState: () => false, preventDefault: () => {},
  });
  try {
    engine.mousePt = new s.Point(100, 100);
    engine.handleKeyDown(key('KeyZ', 'z'));
    assert.equal(engine.isPanLocked, true);
    const before = s.view.center.clone();
    engine.pointer.onMouseMove({ point: new s.Point(120, 100) });
    assert.equal(s.view.center.x, before.x - 20);
    assert.equal(s.view.center.y, before.y);
    assert.equal(engine.documentRevision(), 0);
    engine.handleKeyDown(key('KeyI', 'i'));
    assert.equal(engine.isPanLocked, false);
    assert.equal(engine.isDrawingShape, false);
    engine.handleKeyDown(key('KeyZ', 'z'));
    assert.equal(engine.isPanLocked, true);
    engine.handleKeyDown(key('Escape', 'Escape'));
    assert.equal(engine.isPanLocked, false);
  } finally { engine.cancelCurrentDrawingOperation(); s.project.remove(); }
});

test('wheel gestures route pinch, trackpad pan, and notched zoom', () => {
  const wheel = (over = {}) => ({
    deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, clientX: 0, clientY: 0,
    preventDefault: () => {}, ...over,
  });
  assert.equal(classifyWheel(wheel({ ctrlKey: true, deltaY: 8 })), 'pinch');
  assert.equal(classifyWheel(wheel({ deltaMode: 1, deltaY: 3 })), 'zoom');
  assert.equal(classifyWheel(wheel({ deltaX: 12, deltaY: 4 })), 'pan');
  assert.equal(classifyWheel(wheel({ deltaY: 6 })), 'pan');
  assert.equal(classifyWheel(wheel({ deltaY: 100 })), 'zoom');
  assert.equal(classifyWheel(wheel({ deltaY: 100, wheelDeltaY: -120 })), 'zoom');
  assert.equal(classifyWheel(wheel({ deltaY: 100, wheelDeltaY: -120 }), true), 'zoom');
  assert.equal(classifyWheel(wheel({ deltaY: 4, wheelDeltaY: -12 })), 'pan');
  assert.equal(classifyWheel(wheel({ deltaY: 100 }), true), 'pan');
  assert.equal(classifyWheel(wheel({ deltaY: 100 }), false), 'zoom');
});

test('trackpad pan shifts the view and pinch zooms without dirtying', () => {
  const s = scope(); const engine = new NibGliderEngine(s, () => {});
  const wheel = (over = {}) => ({
    deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, clientX: 0, clientY: 0,
    preventDefault: () => {}, ...over,
  });
  try {
    const before = s.view.center.clone();
    engine['onMouseWheel'](wheel({ deltaX: 20, deltaY: 10 }));
    assert.equal(s.view.center.x, before.x - 20);
    assert.equal(s.view.center.y, before.y - 10);
    assert.equal(s.view.zoom, 1);
    engine['onMouseWheel'](wheel({ deltaY: 100, wheelDeltaY: -120 }));
    assert.equal(s.view.zoom, Math.exp(-0.2));
    engine['onMouseWheel'](wheel({ ctrlKey: true, deltaY: -10 }));
    assert.ok(Math.abs(s.view.zoom - Math.exp(-0.2) * Math.exp(0.06)) < 1e-9);
    assert.equal(engine.documentRevision(), 0);
    assert.equal(engine.isDocumentDirty(), false);
  } finally { s.project.remove(); }
});

test('safari gesture pinch zooms by scale ratio and stands wheel down', () => {
  const s = scope(); const engine = new NibGliderEngine(s, () => {});
  const gesture = (over = {}) => ({ preventDefault: () => {}, ...over });
  const wheel = (over = {}) => ({
    deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, clientX: 0, clientY: 0,
    preventDefault: () => {}, ...over,
  });
  try {
    engine.onGestureStart(gesture({ scale: 1 }));
    engine.onGestureChange(gesture({ scale: 1.2 }));
    assert.equal(s.view.zoom, 1.2);
    engine.onGestureChange(gesture({ scale: 1.44 }));
    assert.ok(Math.abs(s.view.zoom - 1.44) < 1e-9);
    engine.onGestureChange(gesture({ scale: 14.4 }));
    assert.equal(s.view.zoom, 1.44 * 1.3);
    engine['onMouseWheel'](wheel({ deltaY: 100, wheelDeltaY: -120 }));
    assert.equal(s.view.zoom, 1.44 * 1.3);
    engine.onGestureEnd();
    engine['onMouseWheel'](wheel({ deltaY: 100, wheelDeltaY: -120 }));
    assert.ok(Math.abs(s.view.zoom - 1.44 * 1.3 * Math.exp(-0.2)) < 1e-9);
  } finally { s.project.remove(); }
});

test('pan deltas are capped per event and clamped to content', () => {
  const s = scope(); const engine = new NibGliderEngine(s, () => {});
  try {
    const viewport = engine['viewport'];
    const before = s.view.center.clone();
    viewport.panByScreen(1000, 0);
    assert.equal(s.view.center.x, before.x - 200);
    viewport.panByScreen(0, -1000);
    assert.equal(s.view.center.y, before.y + 200);
    const small = new s.Path.Rectangle({ from: [0, 0], to: [100, 100] });
    viewport.panByScreen(30, 0);
    assert.deepEqual([s.view.center.x, s.view.center.y], [-30, 210]);
    const dragBefore = s.view.center.clone();
    viewport.beginPan(new s.Point(200, 150));
    viewport.panTo(new s.Point(220, 150), new s.Point(20, 0));
    assert.ok(s.view.center.x < dragBefore.x);
    viewport.endPan();
    small.remove();
    const wide = new s.Path.Rectangle({ from: [0, 0], to: [1000, 1000] });
    for (let i = 0; i < 30; i++) viewport.panByScreen(200, 0);
    assert.equal(s.view.center.x, 0 + 40 - s.view.bounds.width / 2);
    wide.remove();
  } finally { s.project.remove(); }
});

test('engine pointer pan delegates to viewport and does not dirty document', () => {
  const s = scope(); const engine = new NibGliderEngine(s, () => {});
  try {
    const before = s.view.center.clone();
    engine.pointer.onMouseDown({ point: new s.Point(100, 100) });
    engine.pointer.onMouseDrag({ point: new s.Point(120, 100), delta: new s.Point(20, 0) });
    assert.equal(s.view.center.x, before.x - 20);
    engine.pointer.releasePointer();
    assert.equal(engine.documentRevision(), 0);
    assert.equal(engine.isDocumentDirty(), false);
  } finally { s.project.remove(); }
});

test('right mousedown never acts like a left click', () => {
  const s = scope(); const engine = new NibGliderEngine(s, () => {});
  try {
    const rect = new s.Path.Rectangle({ from: [0, 0], to: [100, 100] });
    rect.fillColor = 'black';
    const right = (x, y) => ({ point: new s.Point(x, y), event: { button: 2 } });
    // Left click selects; right-click on the selection keeps it and moves nothing.
    engine.pointer.onMouseDown({ point: new s.Point(50, 50) });
    assert.equal(engine.selectedItems.length, 1);
    const boundsBefore = rect.bounds.clone();
    engine.pointer.onMouseDown(right(50, 50));
    engine.pointer.onMouseDrag({ ...right(70, 50), delta: new s.Point(20, 0) });
    engine.pointer.releasePointer();
    assert.equal(engine.selectedItems.length, 1);
    assert.deepEqual([rect.bounds.x, rect.bounds.y], [boundsBefore.x, boundsBefore.y]);
    // Right-click on empty space neither deselects nor pans.
    const centerBefore = s.view.center.clone();
    engine.pointer.onMouseDown(right(300, 250));
    engine.pointer.onMouseDrag({ ...right(320, 250), delta: new s.Point(20, 0) });
    engine.pointer.releasePointer();
    assert.equal(engine.selectedItems.length, 1);
    assert.deepEqual([s.view.center.x, s.view.center.y], [centerBefore.x, centerBefore.y]);
    rect.remove();
  } finally { s.project.remove(); }
});

test('the first drag sample moves a shape, including one already selected', () => {
  const s = scope(); const engine = new NibGliderEngine(s, () => {});
  try {
    const rect = new s.Path.Rectangle({ from: [0, 0], to: [100, 100] });
    rect.fillColor = 'black';
    const drag = (from, to) => {
      // The move Paper emits before mousedown clears the drag anchor.
      engine.pointer.onMouseMove({ point: from });
      engine.pointer.onMouseDown({ point: from });
      engine.pointer.onMouseDrag({ point: to, delta: to.subtract(from) });
      engine.pointer.releasePointer();
    };
    drag(new s.Point(50, 50), new s.Point(90, 50));
    assert.equal(rect.bounds.x, 40);
    assert.equal(rect.bounds.y, 0);
    assert.equal(engine.selectedItems.length, 1);
    drag(new s.Point(90, 50), new s.Point(130, 70));
    assert.equal(rect.bounds.x, 80);
    assert.equal(rect.bounds.y, 20);
    assert.ok(engine.selectedItems.includes(rect));
    // A press that does not leave the down point still deselects.
    const click = new s.Point(120, 60);
    engine.pointer.onMouseDown({ point: click });
    assert.equal(engine.selectedItems.length, 1);
    engine.pointer.releasePointer();
    assert.equal(engine.selectedItems.length, 0);
    rect.remove();
  } finally { s.project.remove(); }
});
