import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIManager, KEYBOARD_WIDTH_DEFAULT } from '../src/ui/GUIManager.ts';
import { WidgetLayout, statusShiftX } from '../src/ui/WidgetLayout.ts';
import { APPLICATION_MENUS, MENU_PANEL_SECTIONS, PANEL_SECTIONS, PanelsManager, sectionOrder } from '../src/ui/PanelsManager.ts';
import { buildKeymapRows, buildStatusSchema } from '../src/ui/StatusPresenter.ts';
import { resolveKeyboardLayout, resolveKeyVariants } from '../src/engine/input/KeyboardLayoutResolver.ts';
import { buildChordRows } from '../src/ui/KeymapPresenter.ts';
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
    selectedCount: 0, gridEnabled: false, gridType: 'square', dropNote: '', dragLock: false, panLock: false,
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
  assert.ok(APPLICATION_MENUS.some((menu) => menu.items.some((item) => typeof item.shortcut === 'string')));
  assert.ok(APPLICATION_MENUS.some((menu) => menu.items.some((item) => item.header === true)));
  assert.ok(APPLICATION_MENUS.some((menu) => menu.items.some((item) => typeof item.icon === 'string')));
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

test('application menus cover file, edit, document, operations, modes, layers, context-object, help, and debug', () => {
  const byId = Object.fromEntries(APPLICATION_MENUS.map((menu) => [menu.id, menu]));
  assert.deepEqual(APPLICATION_MENUS.map((menu) => menu.id), ['file', 'edit', 'document', 'operations', 'modes', 'layers', 'context-object', 'help', 'debug']);
  assert.equal(byId.file.title, 'File');
  assert.deepEqual(byId.file.items.map((item) => item.commandId), [
    'open-gallery', 'new-document', 'save-gallery', 'rename-document', 'export', 'import',
    'settings',
  ]);
  assert.deepEqual(byId.help.items.map((item) => item.commandId), ['tutorial']);
  assert.ok(byId.document.items.some((item) => item.commandId === 'length-unit'));
  // Object control lives in Layers, not Operations.
  assert.ok(!byId.operations.items.some((item) => item.commandId === 'group'));
  assert.ok(!byId.operations.items.some((item) => item.commandId === 'delete-selection'));
  for (const id of [
    'select', 'bring-to-front', 'send-to-back', 'duplicate-selection',
    'group', 'ungroup-selection', 'delete-selection',
  ]) {
    assert.ok(byId.layers.items.some((item) => item.commandId === id), `layers menu lists ${id}`);
  }
  // Modes holds the mode parents; Operations holds the future Repeat area and dialogs.
  for (const id of ['rect-shape', 'circle-shape', 'combinatorics', 'snapping', 'text-mode']) {
    const parent = byId.modes.items.find((item) => item.commandId === id);
    assert.ok(parent?.children && parent.children.length > 0, `modes menu lists ${id} submenu`);
  }
  assert.deepEqual(byId.debug.items.map((item) => item.commandId), ['reset-settings', 'empty-canvas']);
  // Canvas right-click menu mirrors the Layers Order group.
  assert.equal(byId['context-object'].title, 'Object');
  assert.deepEqual(
    byId['context-object'].items.map((item) => item.commandId),
    ['hdr-context-object-1', 'bring-to-front', 'send-to-back'],
  );
});

test('menu panel sections map to known panel sections', () => {
  const known = new Set(PANEL_SECTIONS.map((section) => section.id));
  assert.deepEqual(MENU_PANEL_SECTIONS.modes, [
    'circleFrameControls', 'rectFrameControls', 'combinatoricsControls', 'snappingControls', 'textControls',
  ]);
  assert.deepEqual(MENU_PANEL_SECTIONS.edit, ['historyControls']);
  for (const [menuId, ids] of Object.entries(MENU_PANEL_SECTIONS)) {
    assert.ok(APPLICATION_MENUS.some((menu) => menu.id === menuId), `${menuId} is a real menu`);
    for (const id of ids) {
      assert.ok(known.has(id), `${id} is a real panel section`);
    }
  }
});

test('operations menu groups dialog entries and carries rail shortcuts and icons', () => {
  const byId = Object.fromEntries(APPLICATION_MENUS.map((menu) => [menu.id, menu]));
  const ops = byId.operations.items.map((item) => item.commandId);
  // Scale/Rotate sit under a "With dialog" group header, mirroring the rail.
  assert.deepEqual(ops.slice(-3), ['hdr-operations-2', 'scale-dialog', 'rotate-dialog']);
  const dialogHeader = byId.operations.items.find((item) => item.commandId === 'hdr-operations-2');
  assert.equal(dialogHeader.header, true);
  assert.equal(dialogHeader.label, 'With dialog');
  // Shortcuts match the vertical rail's Operations/Layers menus.
  const shortcutById = Object.fromEntries(
    APPLICATION_MENUS.flatMap((menu) => menu.items)
      .filter((item) => typeof item.shortcut === 'string')
      .map((item) => [item.commandId, item.shortcut]),
  );
  assert.equal(shortcutById['delete-selection'], 'Backspace');
  assert.ok(typeof shortcutById.group === 'string' && shortcutById.group.endsWith('G'));
  // File entries reuse the rail's card artwork via the AppMenu icon map.
  const iconById = Object.fromEntries(
    byId.file.items.filter((item) => typeof item.icon === 'string')
      .map((item) => [item.commandId, item.icon]),
  );
  assert.deepEqual(iconById, {
    'open-gallery': 'open',
    'new-document': 'new',
    'save-gallery': 'save',
    'rename-document': 'rename',
    export: 'export',
    import: 'import',
    settings: 'settings',
  });
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

test('status schema carries state and instructions but no key references', () => {
  const schema = buildStatusSchema(snap({ selectedCount: 2, gridEnabled: true, gridType: 'square' }));
  assert.equal(JSON.stringify(schema).includes('"t":"key"'), false);
  assert.ok(schema.state.some((l) => JSON.stringify(l).includes('Selected Objects: 2')));
  assert.ok(schema.steps.some((l) => JSON.stringify(l).includes('Drag-Lock')));
  assert.ok(schema.steps.some((l) => JSON.stringify(l).includes('Scale or rotate')));
});

test('keymap rows break scale/rotate into an adjust section', () => {
  const rows = buildKeymapRows(snap({ selectedCount: 2 }));
  const adjust = rows.filter((r) => r.section === 'adjust');
  assert.equal(adjust.length, 2);
  assert.ok(adjust.some((r) => r.label === 'Scale' && r.keys.join('') === '[]'));
  assert.ok(adjust.some((r) => r.label === 'Rotate'));
  assert.ok(rows.some((r) => r.label === 'Begin Drag-Lock' && r.keys.join('') === 'Space'));
  const locked = buildKeymapRows(snap({ selectedCount: 2, dragLock: true }));
  assert.equal(locked.filter((r) => r.section === 'adjust').length, 2);
  assert.ok(locked.some((r) => r.label === 'Stamp'));
});

test('keymap rows prefer the short rotate row over a degree-ful live hint', () => {
  const withSel = buildKeymapRows(snap({
    selectedCount: 2, liveHints: [{ label: 'Rotate selection by 15°', keys: ['rotate-cw'] }],
  }));
  assert.ok(withSel.some((r) => r.label === 'Rotate'));
  assert.equal(withSel.some((r) => r.label.includes('15°')), false);
  const solo = buildKeymapRows(snap({
    liveHints: [{ label: 'Rotate selection by 15°', keys: ['rotate-cw'] }],
  }));
  assert.ok(solo.some((r) => r.label.includes('15°')));
});

test('keymap rows carry the grid toggle the status box no longer names', () => {
  const schema = buildStatusSchema(snap({ gridEnabled: true, gridType: 'square' }));
  assert.equal(JSON.stringify(schema).includes('"t":"key"'), false);
  const rows = buildKeymapRows(snap({ gridEnabled: true, gridType: 'square' }));
  assert.ok(rows.some((r) => r.label === 'Toggle the grid' && r.keys.join('') === '/'));
});

function keyState(over = {}) {
  return {
    isDrawingPath: false, isDrawingShape: false, isDrawingQuad: false,
    isLiveDrawing: false, shapeType: null, selectedCount: 0,
    isInDragLock: false, liveAdjustApplies: false, ...over,
  };
}

const NO_MODS = { shift: false, alt: false, control: false, meta: false, capsLock: false };

test('each adjust command id appears in exactly one keymap row', () => {
  const snapshots = [
    snap({ selectedCount: 2 }),
    snap({ selectedCount: 2, dragLock: true }),
    snap({ drawingPath: true }),
    snap({ drawingPath: true, composite: true }),
    snap({ drawingShape: true, shapeType: 'circle_radius' }),
    snap({ drawingShape: true, shapeType: 'circle_radial_stamp' }),
    snap({ drawingShape: true, shapeType: 'rectangle_centerline' }),
    snap({ drawingQuad: true }),
    snap({ selectedCount: 2, liveHints: [
      { label: 'scale', keys: ['[', ']'], actionId: 'scale' },
      { label: 'rotate', keys: [';', "'"], actionId: 'rotate' },
    ] }),
    snap({ gridEnabled: true }),
  ];
  for (const s of snapshots) {
    const ids = buildKeymapRows(s).flatMap((r) => r.ids);
    assert.deepEqual(ids, [...new Set(ids)], JSON.stringify(s));
  }
});

test('static adjust rows yield to live hints for the same action', () => {
  const rows = buildKeymapRows(snap({ selectedCount: 2, liveHints: [
    { label: 'scale', keys: ['[', ']'], actionId: 'scale' },
  ] }));
  assert.equal(rows.filter((r) => r.ids.includes('scale-down')).length, 1);
  assert.ok(rows.some((r) => r.section === 'adjust' && r.label === 'Rotate'));
});

test('chord rows skip commands the schema rows already cover', () => {
  const resolved = resolveKeyboardLayout(NO_MODS, 'other', keyState({ selectedCount: 2 }));
  const uncovered = buildChordRows(resolved, { primary: false, coveredIds: [] });
  assert.equal(uncovered.length, 4);
  assert.ok(uncovered.every((r) => r.section === 'adjust'));
  const schemaRows = buildKeymapRows(snap({ selectedCount: 2 }));
  const coveredIds = schemaRows.flatMap((r) => r.ids);
  assert.ok(coveredIds.includes('scale-down') && coveredIds.includes('rotate-cw'));
  assert.deepEqual(buildChordRows(resolved, { primary: false, coveredIds }), []);
  const merged = [...schemaRows, ...buildChordRows(resolved, { primary: false, coveredIds })];
  const ids = merged.flatMap((r) => r.ids);
  assert.deepEqual(ids, [...new Set(ids)]);
});

test('adjust availability still gates dispatch variants', () => {
  const sel = keyState({ selectedCount: 2 });
  const idle = keyState();
  assert.deepEqual(resolveKeyVariants('BracketLeft', NO_MODS, sel).map((v) => v.commandId), ['scale-down']);
  assert.deepEqual(resolveKeyVariants('BracketLeft', NO_MODS, idle), []);
  assert.deepEqual(resolveKeyVariants('Semicolon', NO_MODS, sel).map((v) => v.commandId), ['rotate-ccw']);
  assert.deepEqual(resolveKeyVariants('Semicolon', NO_MODS, idle), []);
  const drawing = keyState({ isDrawingPath: true, isLiveDrawing: true });
  assert.deepEqual(resolveKeyVariants('KeyJ', NO_MODS, drawing).map((v) => v.commandId), ['tension-down']);
  assert.deepEqual(resolveKeyVariants('KeyJ', NO_MODS, idle).map((v) => v.commandId), ['toggle-panel']);
});

test('x resolves to the selection rectangle command', () => {
  assert.deepEqual(resolveKeyVariants('KeyX', NO_MODS, keyState()).map((v) => v.commandId), ['select-rectangle']);
  const rows = buildKeymapRows(snap({ drawingShape: true, shapeType: 'rectangle_select' }));
  assert.ok(rows.some((r) => r.ids.includes('select-rectangle') && r.label === 'Finish selection'));
  assert.ok(rows.some((r) => r.ids.includes('cancel') && r.label === 'Cancel selection'));
});

test('marquee selection suppresses idle-selection messaging', () => {
  const marquee = keyState({ isDrawingShape: true, shapeType: 'rectangle_select', selectedCount: 2 });
  assert.deepEqual(resolveKeyVariants('BracketLeft', NO_MODS, marquee), []);
  assert.deepEqual(resolveKeyVariants('Semicolon', NO_MODS, marquee), []);
  const rows = buildKeymapRows(snap({ drawingShape: true, shapeType: 'rectangle_select', selectedCount: 2 }));
  assert.ok(rows.some((r) => r.ids.includes('select-rectangle')));
  assert.ok(!rows.some((r) => r.ids.includes('drag-lock') || r.ids.includes('scale-down') || r.ids.includes('rotate-cw')));
  const schema = JSON.stringify(buildStatusSchema(snap({ drawingShape: true, shapeType: 'rectangle_select', selectedCount: 2 })));
  assert.ok(schema.includes('Selected Objects: 2'));
  assert.ok(!schema.includes('Begin Drag-Lock to move all selected.'));
  assert.ok(!schema.includes('Scale or rotate the selection.'));
});

test('z pan-locks the canvas and advertises release', () => {
  assert.deepEqual(resolveKeyVariants('KeyZ', NO_MODS, keyState()).map((v) => v.commandId), ['pan-lock']);
  const rows = buildKeymapRows(snap({ panLock: true }));
  assert.ok(rows.some((r) => r.ids.includes('pan-lock') && r.label === 'Release Pan-Lock'));
  const schema = JSON.stringify(buildStatusSchema(snap({ panLock: true })));
  assert.ok(schema.includes('Pan-Lock On'));
  assert.ok(schema.includes('Press any key to release.'));
});

test('chord rows still surface uncovered primary-modifier commands', () => {
  const withMeta = { ...NO_MODS, meta: true };
  const resolved = resolveKeyboardLayout(withMeta, 'other', keyState({ selectedCount: 2 }));
  const schemaRows = buildKeymapRows(snap({ selectedCount: 2 }));
  const chords = buildChordRows(resolved, {
    primary: true, coveredIds: schemaRows.flatMap((r) => r.ids),
  });
  assert.ok(chords.some((r) => r.ids.includes('undo')));
  const ids = [...schemaRows, ...chords].flatMap((r) => r.ids);
  assert.deepEqual(ids, [...new Set(ids)]);
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

test('window registry opens one window at a time and emits snapshots', () => {
  const gui = new GUIManager(store());
  assert.equal(gui.openWindowId, null);
  assert.equal(gui.getSnapshot().openWindowId, null);
  let emissions = 0;
  const unsubscribe = gui.subscribe(() => { emissions++; });
  try {
    gui.openWindow('settings');
    assert.equal(gui.openWindowId, 'settings');
    assert.equal(gui.getSnapshot().openWindowId, 'settings');
    gui.openWindow('settings');
    gui.openWindow('');
    gui.openWindow('other');
    assert.equal(gui.openWindowId, 'other');
    gui.closeWindow();
    assert.equal(gui.openWindowId, null);
    gui.closeWindow();
    assert.equal(emissions, 3);
  } finally { unsubscribe(); }
});
