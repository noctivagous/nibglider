import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIManager, KEYBOARD_WIDTH_DEFAULT } from '../src/ui/GUIManager.ts';
import { WidgetLayout, statusShiftX } from '../src/ui/WidgetLayout.ts';
import { APPLICATION_MENUS, PanelsManager, sectionOrder } from '../src/ui/PanelsManager.ts';
import { buildStatusSchema } from '../src/ui/StatusPresenter.ts';
import { writePreviewPaths } from '../src/ui/PreviewBoxPresenter.ts';
import { keycapClick } from '../src/ui/KeyboardViewModel.ts';
import { NibGliderEngine } from '../src/engine/engine.ts';
import paper from 'paper';

function store() {
  const mem = new Map();
  return { getItem: (key) => (mem.has(key) ? mem.get(key) : null), setItem: (key, value) => { mem.set(key, value); } };
}

function snap(over = {}) {
  return {
    selectedCount: 0, gridEnabled: false, gridType: 'square', dropNote: '', dragLock: false,
    drawingPath: false, composite: false, cornerRadius: 12, splineTension: 0.4,
    drawingShape: false, shapeType: null, circleRadiusAnchor: 'origin', radialStampLockedRadius: null,
    rectDiagonalMode: 'full', shapeWidth: 40, aspectLabel: null, hasSecondEdge: false,
    drawingQuad: false, quadPointCount: 0, liveHints: [], ...over,
  };
}

test('keyboard width treats a blank store as the default and menu layout stays stack', () => {
  const mem = store();
  mem.setItem('nibglider.keyboardWidth', '');
  mem.setItem('nibglider.keyboardVisible', '0');
  const gui = new GUIManager(mem);
  assert.equal(gui.keyboardWidth, KEYBOARD_WIDTH_DEFAULT);
  assert.equal(gui.keyboardVisible, false);
  assert.equal(gui.controlsVisible, true);
  assert.equal(gui.showSpacebar, false);
  assert.equal(gui.menuLayout, 'stack');
  gui.setKeyboardWidth(10);
  assert.equal(gui.keyboardWidth, 480);
  gui.setMenuLayout('grid');
  const panels = new PanelsManager(mem);
  assert.equal(panels.menuLayout, 'grid');
  assert.ok(APPLICATION_MENUS.every((menu) => menu.items.every((item) => typeof item.commandId === 'string')));
  assert.equal(JSON.stringify(APPLICATION_MENUS).includes('shortcut'), false);
});

test('panel order round-trips through the store', () => {
  const mem = store();
  const panels = new PanelsManager(mem);
  panels.moveSection('textControls', 'strokeControls');
  const again = new PanelsManager(mem);
  assert.deepEqual(sectionOrder(again.order).slice(0, 4), [
    'textControls', 'strokeControls', 'fillControls', 'circleFrameControls',
  ]);
  again.moveSection('textControls', 'gridControls', true);
  assert.equal(sectionOrder(new PanelsManager(mem).order).at(-2), 'textControls');
});

test('legacy grouped panel layout becomes one ordered sequence', () => {
  const mem = store();
  mem.setItem('nibglider.panelOrder', JSON.stringify({
    paint: ['fillControls', 'strokeControls', 'textControls'],
    keys: ['historyControls', 'circleFrameControls', 'rectFrameControls', 'combinatoricsControls'],
    snap: ['snappingControls', 'gridControls'],
  }));
  assert.deepEqual(sectionOrder(new PanelsManager(mem).order), [
    'fillControls', 'strokeControls', 'textControls', 'historyControls',
    'circleFrameControls', 'rectFrameControls', 'combinatoricsControls',
    'snappingControls', 'gridControls',
  ]);
});

test('dragging across a row boundary keeps the requested visual row', () => {
  const mem = store();
  const panels = new PanelsManager(mem);
  panels.setRowStarts(['circleFrameControls', 'gridControls']);

  // Moving the first card immediately before row two's first card does not
  // change the flat order enough to create a natural flex wrap. The break
  // must move onto the dragged card itself.
  panels.moveSection('strokeControls', 'circleFrameControls');
  assert.equal(panels.rowStarts[0], 'strokeControls');
  assert.equal(sectionOrder(panels.order).indexOf('strokeControls'), 2);
  assert.equal(new PanelsManager(mem).rowStarts[0], 'strokeControls');

  // Starting with a fresh layout, move the last card of row one to the end
  // of row two. The two row boundaries must remain on their rows.
  const again = new PanelsManager(store());
  again.setRowStarts(['circleFrameControls', 'gridControls']);
  again.moveSection('textControls', 'historyControls', true);
  assert.deepEqual(again.rowStarts, ['circleFrameControls', 'gridControls']);
  assert.equal(sectionOrder(again.order).indexOf('textControls'), 6);
});

test('application menus cover file, document, operations, and layers', () => {
  const byId = Object.fromEntries(APPLICATION_MENUS.map((menu) => [menu.id, menu]));
  assert.deepEqual(APPLICATION_MENUS.map((menu) => menu.id), ['file', 'document', 'operations', 'layers']);
  assert.equal(byId.file.title, 'File');
  assert.deepEqual(byId.file.items.map((item) => item.commandId), [
    'open-gallery', 'new-document', 'save-gallery', 'rename-document', 'export', 'import', 'tutorial',
  ]);
  assert.ok(byId.document.items.some((item) => item.commandId === 'length-unit'));
  assert.ok(byId.operations.items.some((item) => item.commandId === 'group'));
  assert.ok(byId.operations.items.some((item) => item.commandId === 'delete-selection'));
  for (const id of ['bring-to-front', 'send-to-back', 'duplicate-selection', 'group']) {
    assert.ok(byId.layers.items.some((item) => item.commandId === id), `layers menu lists ${id}`);
  }
});

test('status box clears the menus rail hanging below the panel', () => {
  const panel = { x: 10, y: 10, width: 1000, height: 110 };
  // Tall rail overlaps the status lane: shift by the rail width.
  assert.equal(statusShiftX(panel, { x: 10, y: 10, width: 136, height: 200 }), 136);
  // Short rail stays inside the panel: no shift.
  assert.equal(statusShiftX(panel, { x: 10, y: 10, width: 136, height: 100 }), 0);
  // Missing rects: no shift.
  assert.equal(statusShiftX(undefined, { x: 10, y: 10, width: 136, height: 200 }), 0);
  assert.equal(statusShiftX(panel, undefined), 0);
});

test('widget layout publishes the status shift and persists positions', () => {
  const mem = store();
  const layout = new WidgetLayout(mem);
  assert.equal(layout.getSnapshot().statusShiftX, 0);
  layout.setRect('panel', { x: 10, y: 10, width: 1000, height: 110 });
  layout.setRect('menus', { x: 10, y: 10, width: 136, height: 200 });
  assert.equal(layout.getSnapshot().statusShiftX, 136);
  // Near-identical rects do not bump the version.
  const version = layout.getVersion();
  layout.setRect('menus', { x: 10.1, y: 10, width: 136, height: 200 });
  assert.equal(layout.getVersion(), version);
  // Saved drag positions round-trip through the store.
  layout.setWidgetPosition('keyboard', 40, 500);
  assert.deepEqual(new WidgetLayout(mem).getSnapshot().positions, { keyboard: { x: 40, y: 500 } });
});

test('status schema keeps a drop note and does not publish undo labels', () => {
  const schema = buildStatusSchema(snap({ dropNote: 'Drop skipped: notes.txt is not an image.', selectedCount: 2 }));
  const text = JSON.stringify(schema);
  assert.ok(text.includes('Drop skipped: notes.txt is not an image.'));
  assert.ok(text.includes('Selected Objects: 2'));
  assert.equal(text.includes('Undo'), false);
});

test('status schema breaks scale/rotate into an adjust section', () => {
  const schema = buildStatusSchema(snap({ selectedCount: 2 }));
  const adjust = schema.steps.filter((l) => l.kind === 'adjust');
  assert.equal(adjust.length, 1);
  assert.ok(JSON.stringify(adjust[0]).includes('to Rotate'));
  assert.ok(schema.steps.some((l) => l.kind === 'hint' && JSON.stringify(l).includes('Drag-Lock')));
  const locked = buildStatusSchema(snap({ selectedCount: 2, dragLock: true }));
  assert.equal(locked.steps.filter((l) => l.kind === 'adjust').length, 1);
});

test('status schema prefers the short rotate line over a degree-ful live hint', () => {
  const withSel = buildStatusSchema(snap({
    selectedCount: 2, liveHints: [{ label: 'Rotate selection by 15°', keys: ['rotate-cw'] }],
  }));
  assert.ok(JSON.stringify(withSel).includes('to Rotate'));
  assert.equal(JSON.stringify(withSel).includes('Rotate selection by 15°'), false);
  const solo = buildStatusSchema(snap({
    liveHints: [{ label: 'Rotate selection by 15°', keys: ['rotate-cw'] }],
  }));
  assert.ok(JSON.stringify(solo).includes('Rotate selection by 15°'));
});

test('preview presenter writes circle and rect path data', () => {
  const s = new paper.PaperScope();
  s.setup(new s.Size(100, 100));
  const engine = new NibGliderEngine(s, () => {});
  const attrs = {};
  const doc = {
    getElementById(id) {
      return { setAttribute(_name, value) { attrs[id] = value; } };
    },
  };
  try {
    writePreviewPaths(doc, {
      circle: engine.innerShapePreviewPath(engine.circleInnerShapeType, engine.circleInnerShapeParams),
      rect: engine.innerShapePreviewPath(engine.rectangleInnerShapeType, engine.rectangleInnerShapeParams, 'rect'),
    });
    assert.ok(attrs.shapePreviewPath.startsWith('M'));
    assert.ok(attrs.rectShapePreviewPath.startsWith('M'));
    assert.notEqual(attrs.shapePreviewPath, attrs.rectShapePreviewPath);
  } finally { s.project.remove(); }
});

test('onscreen caps open settings instead of running the drawing command', () => {
  assert.equal(keycapClick({
    settingsId: 'circle-radius-tool', settingsSummary: 'Circle radius start', clickable: false, commandId: 'circle-radius',
  }), 'settings');
  assert.equal(keycapClick({
    settingsId: undefined, settingsSummary: undefined, clickable: true, commandId: 'toggle-status',
  }), 'command');
  assert.equal(keycapClick({
    settingsId: undefined, settingsSummary: undefined, clickable: false, commandId: 'circle-radius',
  }), 'none');
});
