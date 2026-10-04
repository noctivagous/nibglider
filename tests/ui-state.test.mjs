import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIManager, KEYBOARD_WIDTH_DEFAULT } from '../src/ui/GUIManager.ts';
import { APPLICATION_MENUS, PanelsManager, sectionLists } from '../src/ui/PanelsManager.ts';
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
  panels.moveSection('paint', 'textControls', 'keys', 'circleFrameControls', false);
  const again = new PanelsManager(mem);
  assert.equal(sectionLists(again.order).keys[0], 'textControls');
  assert.equal(sectionLists(again.order).paint.includes('textControls'), false);
});

test('status schema keeps a drop note and does not publish undo labels', () => {
  const schema = buildStatusSchema(snap({ dropNote: 'Drop skipped: notes.txt is not an image.', selectedCount: 2 }));
  const text = JSON.stringify(schema);
  assert.ok(text.includes('Drop skipped: notes.txt is not an image.'));
  assert.ok(text.includes('Selected Objects: 2'));
  assert.equal(text.includes('Undo'), false);
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
