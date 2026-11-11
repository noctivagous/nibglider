import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMenuXML } from '../src/ui/menuXML.ts';
import { keyboardPlatform, optShortcut, primaryShortcut } from '../src/engine/input/keymap.ts';

const MENUS_URL = new URL('../src/ui/menus/menus.xml', import.meta.url);

// Commands with a handler in App.tsx handleMenuCommand. Everything else in
// the XML renders disabled until it is wired. Keep both lists explicit so a
// typo, a missing handler, or a dead handler fails here instead of silently.
const WIRED_COMMANDS = [
  'open-gallery', 'new-document', 'save-gallery', 'rename-document', 'save-file', 'open-file',
  'export-raster-canvas', 'export-raster-viewport', 'export-raster-selection',
  'export-vector-canvas', 'export-vector-viewport', 'export-vector-selection',
  'import-svg', 'import-pdf', 'import-raster',
  'scale-dialog', 'rotate-dialog',
  'align-left', 'align-center-x', 'align-right', 'align-top', 'align-center-y', 'align-bottom',
  'align-doc-left', 'align-doc-center-x', 'align-doc-right', 'align-doc-top', 'align-doc-center-y', 'align-doc-bottom',
  'distribute-horizontal', 'distribute-vertical', 'flip-horizontal', 'flip-vertical',
  'settings', 'document-settings', 'canvas-size', 'pages-guides', 'page-setup', 'tutorial', 'empty-canvas',
  'about', 'paste-in-place', 'select-none', 'lock-selection', 'hide-selection',
  'print', 'print-selection', 'text-convert-outlines', 'reset-zoom',
  'zoom-in', 'zoom-out', 'fit-page', 'fit-artwork', 'fit-selection',
  'ruler-viewer', 'ruler-page', 'ruler-off', 'show-grid', 'show-guides', 'guide-snapping',
  'export-printify-area', 'export-printify-product',
  'repeat-grid', 'repeat-circle',
  'tool-line', 'tool-ellipse', 'tool-arc', 'tool-freehand',
  'tutorial-demo-rectangle', 'tutorial-fix-a-shape', 'tutorial-fill-and-stroke',
  'tutorial-adding-text', 'tutorial-grouping-and-ordering', 'tutorial-saving-and-exporting',
  'help-getting-started', 'help-keys-reference',
  'undo', 'redo', 'find-replace',
  'toggle-panel', 'toggle-keyboard', 'toggle-status',
  'length-unit-pt', 'length-unit-inch', 'length-unit-cm',
  'bring-to-front', 'send-to-back', 'bring-forward', 'send-backward', 'duplicate-selection',
  'group', 'ungroup-selection', 'delete-selection', 'transform-mode',
  'point-edit', 'point-select', 'point-split', 'point-delete', 'point-smooth', 'point-corner', 'point-close', 'point-join',
  'combinatorics-none', 'combinatorics-union', 'combinatorics-subtract', 'combinatorics-intersect', 'combinatorics-exclude', 'combinatorics-crop', 'combinatorics-cut', 'combinatorics-interlace',
  'interlace', 'interlace-group', 'remove-from-interlace',
  'rect-shape-rectangle', 'rect-shape-circle', 'rect-shape-polygon', 'rect-shape-supershape',
  'rect-shape-trapezoid', 'rect-shape-parallelogram', 'rect-shape-rightTriangle',
  'rect-shape-rhombus', 'rect-shape-kite', 'rect-shape-exportFrame',
  'circle-shape-circle', 'circle-shape-semicircle', 'circle-shape-sector', 'circle-shape-segment',
  'circle-shape-polygon', 'circle-shape-supershape', 'circle-shape-trapezoid',
  'circle-shape-parallelogram', 'circle-shape-rightTriangle', 'circle-shape-rhombus',
  'circle-shape-kite',
  'snap-grid', 'snap-path', 'snap-points', 'snap-angle', 'snap-length', 'snap-aspect',
  'text-mode-display', 'text-mode-body',
  'image-place', 'image-replace', 'image-info',
  'image-scale-half', 'image-scale-double', 'image-fit-view',
  'image-grayscale', 'image-flatten', 'image-convert-png', 'image-convert-jpeg',
  'image-trace', 'image-crop-frame', 'image-mask-shape', 'image-remove-mask', 'image-remove-crop',
  'image-filters',
];
const PLACEHOLDER_COMMANDS = [
  'length-unit', 'rulers',
  'export-raster', 'export-vector', 'export-printify', 'import',
  'rect-shape', 'circle-shape', 'combinatorics', 'snapping', 'text-mode',
  'image-transform', 'image-raster', 'draw-tools', 'tutorials',
  'cut', 'copy', 'paste', 'select-all',
];

function loadMenus() {
  const result = parseMenuXML(readFileSync(MENUS_URL, 'utf8'));
  assert.ok(!('error' in result), 'error' in result ? result.error : 'parse failed');
  return result.menus;
}

test('menus XML parses to the application menus in order', () => {
  const menus = loadMenus();
  assert.deepEqual(menus.map((menu) => menu.id), ['file', 'edit', 'view', 'image', 'document', 'object', 'operations', 'modes', 'layers', 'context-object', 'help']);
  assert.deepEqual(menus.map((menu) => menu.title), [
    'File', 'Edit', 'View', 'Image', 'Document', 'Object', 'Repeat', 'Modes', 'Layers and Objects', 'Object', 'Help',
  ]);
});

test('every menu command is either wired or an explicit placeholder', () => {
  const commands = loadMenus()
    .flatMap((menu) => menu.items)
    .flatMap((item) => [item, ...(item.children ?? [])])
    .filter((item) => !item.header)
    .map((item) => item.commandId);
  const known = new Set([...WIRED_COMMANDS, ...PLACEHOLDER_COMMANDS]);
  for (const command of commands) {
    assert.ok(known.has(command), `${command} is neither wired nor an explicit placeholder`);
  }
  for (const command of WIRED_COMMANDS) {
    assert.ok(commands.includes(command), `wired handler ${command} has no menu entry`);
  }
});

test('groups emit ordered headers and Primary shortcuts resolve per platform', () => {
  const menus = loadMenus();
  const byMenu = Object.fromEntries(menus.map((menu) => [menu.id, menu]));
  const layers = byMenu.layers.items;
  assert.deepEqual(layers.map((item) => item.commandId), [
    'hdr-layers-1', 'group', 'ungroup-selection',
  ]);
  // Primary resolves through the keymap for the host platform (⌘ on macOS).
  const layerById = Object.fromEntries(layers.map((item) => [item.commandId, item]));
  assert.equal(layerById.group.shortcut, primaryShortcut('G'));
  assert.equal(layerById['ungroup-selection'].shortcut, primaryShortcut('G', true));
});

test('right-click menu offers transform controls with the Opt shortcut', () => {
  const menus = loadMenus();
  const context = menus.find((menu) => menu.id === 'context-object');
  assert.ok(context);
  const item = context.items.find((entry) => entry.commandId === 'transform-mode');
  assert.ok(item);
  assert.equal(item.label, 'Transform controls');
  // ⌥T on macOS/iOS, Alt+T elsewhere.
  assert.equal(item.shortcut, keyboardPlatform() === 'mac' ? '⌥T' : 'Alt+T');
  assert.equal(item.shortcut, optShortcut('T'));
  assert.equal(optShortcut('T', 'mac'), '⌥T');
  assert.equal(optShortcut('T', 'other'), 'Alt+T');
});

test('items fall back to the command id and menus to the menu id', () => {
  const result = parseMenuXML(
    '<menus><menu id="m"><item command="do-thing"/><group label="G"><item command="other"/></group></menu></menus>',
  );
  assert.ok(!('error' in result));
  assert.deepEqual(result.menus, [{
    id: 'm',
    title: 'm',
    items: [
      { commandId: 'do-thing' },
      { commandId: 'hdr-m-1', label: 'G', header: true },
      { commandId: 'other' },
    ],
  }]);
});

test('repeat holds the Conway-labelled presets, object holds arrange and dialogs, modes holds the mode parents; layers holds group control', () => {
  const menus = loadMenus();
  const byId = Object.fromEntries(menus.map((menu) => [menu.id, menu]));
  assert.deepEqual(byId.operations.items.map((item) => item.commandId), [
    'hdr-operations-1', 'repeat-grid', 'repeat-circle',
  ]);
  assert.deepEqual(
    byId.operations.items.filter((item) => item.header).map((item) => item.label),
    ['Repeat'],
  );
  const repeatById = Object.fromEntries(byId.operations.items.map((item) => [item.commandId, item]));
  assert.equal(repeatById['repeat-grid'].label, 'Repeat Grid — o');
  assert.deepEqual(byId.object.items.map((item) => item.commandId), [
    'hdr-object-1', 'bring-to-front', 'bring-forward', 'send-backward', 'send-to-back',
    'hdr-object-2', 'group', 'ungroup-selection', 'lock-selection', 'hide-selection',
    'hdr-object-3', 'align-left', 'align-center-x', 'align-right', 'align-top', 'align-center-y', 'align-bottom',
    'hdr-object-4', 'align-doc-left', 'align-doc-center-x', 'align-doc-right', 'align-doc-top', 'align-doc-center-y', 'align-doc-bottom',
    'hdr-object-5', 'distribute-horizontal', 'distribute-vertical',
    'hdr-object-6', 'flip-horizontal', 'flip-vertical',
    'hdr-object-7', 'scale-dialog', 'rotate-dialog',
    'hdr-object-8', 'text-convert-outlines',
  ]);
  assert.deepEqual(
    byId.object.items.filter((item) => item.header).map((item) => item.label),
    ['Order', 'Group', 'Align', 'Align to Document', 'Distribute', 'Flip', 'With dialog', 'Text'],
  );
  assert.deepEqual(byId.modes.items.map((item) => item.commandId), [
    'rect-shape', 'circle-shape', 'combinatorics', 'snapping', 'text-mode', 'draw-tools',
  ]);
  assert.equal(byId.modes.items.some((item) => item.header), false);
  const opsText = JSON.stringify(byId.operations);
  assert.equal(opsText.includes('stroke'), false);
  assert.equal(opsText.includes('fill'), false);
  assert.deepEqual(byId.layers.items.map((item) => item.commandId), [
    'hdr-layers-1', 'group', 'ungroup-selection',
  ]);
});

test('every submenu option carries its panel icon, and every icon key has an AppMenu glyph', () => {
  const menus = loadMenus();
  const options = menus
    .flatMap((menu) => menu.items)
    .flatMap((item) => item.children ?? []);
  assert.ok(options.length > 0);
  for (const option of options) {
    // Length units are text-only in the panel too, so they keep no icon.
    if (option.commandId.startsWith('length-unit-')) continue;
    assert.equal(typeof option.icon, 'string', `${option.commandId} carries an icon`);
  }
  const referenced = new Set();
  for (const item of menus.flatMap((menu) => menu.items)) {
    if (item.icon) referenced.add(item.icon);
    for (const child of item.children ?? []) {
      if (child.icon) referenced.add(child.icon);
    }
  }
  const appMenu = readFileSync(new URL('../src/components/AppMenu.tsx', import.meta.url), 'utf8');
  const defined = new Set(
    [...appMenu.matchAll(/^  ('([\w-]+)'|([\w-]+)): \($/gm)].map((m) => m[2] ?? m[3]),
  );
  for (const key of referenced) {
    assert.ok(defined.has(key), `icon "${key}" has a glyph in AppMenu.tsx`);
  }
});

test('help holds the tutorials and docs, and shape parents use the short Keys labels', () => {
  const menus = loadMenus();
  const byId = Object.fromEntries(menus.map((menu) => [menu.id, menu]));
  assert.deepEqual(byId.help.items.map((item) => item.commandId), [
    'tutorials', 'help-getting-started', 'help-keys-reference', 'about',
  ]);
  const tutorials = byId.help.items.find((item) => item.commandId === 'tutorials');
  assert.deepEqual(tutorials.children.map((child) => child.commandId), [
    'tutorial', 'tutorial-demo-rectangle', 'tutorial-fix-a-shape', 'tutorial-fill-and-stroke',
    'tutorial-adding-text', 'tutorial-grouping-and-ordering', 'tutorial-saving-and-exporting',
  ]);
  assert.ok(!byId.file.items.some((item) => item.commandId === 'tutorial'));
  const modesById = Object.fromEntries(byId.modes.items.map((item) => [item.commandId, item]));
  assert.equal(modesById['rect-shape'].label, 'Rect Keys');
  assert.equal(modesById['circle-shape'].label, 'Circle Keys');
});

test('edit holds undo/redo, clipboard, and selection entries', () => {
  const menus = loadMenus();
  const edit = menus.find((menu) => menu.id === 'edit');
  assert.deepEqual(edit.items.map((item) => item.commandId), [
    'undo', 'redo',
    'hdr-edit-1', 'cut', 'copy', 'paste', 'paste-in-place',
    'hdr-edit-2', 'duplicate-selection', 'delete-selection', 'select-all', 'select-none',
    'hdr-edit-3', 'find-replace',
  ]);
  assert.deepEqual(
    edit.items.filter((item) => item.header).map((item) => item.label),
    ['Clipboard', 'Selection', 'Text'],
  );
  const byId = Object.fromEntries(edit.items.map((item) => [item.commandId, item]));
  assert.equal(byId.undo.shortcut, primaryShortcut('Z'));
  assert.equal(byId.redo.shortcut, primaryShortcut('Z', true));
  assert.equal(byId.cut.shortcut, primaryShortcut('X'));
  assert.equal(byId.copy.shortcut, primaryShortcut('C'));
  assert.equal(byId.paste.shortcut, primaryShortcut('V'));
  assert.equal(byId['paste-in-place'].shortcut, primaryShortcut('V', true));
  assert.equal(byId['select-all'].shortcut, primaryShortcut('A'));
  assert.equal(byId['delete-selection'].shortcut, 'Backspace');
  for (const id of ['undo', 'redo', 'cut', 'copy', 'paste', 'select-all']) {
    assert.equal(typeof byId[id].icon, 'string', `${id} carries an icon`);
  }
});

test('document menu leads with the live canvas-size row above Document Settings', () => {
  const menus = loadMenus();
  const doc = menus.find((menu) => menu.id === 'document');
  assert.deepEqual(doc.items.map((item) => item.commandId).slice(0, 2), [
    'canvas-size', 'document-settings',
  ]);
  assert.equal(doc.items[0].icon, 'page-size');
});

test('length-unit carries the three unit options as a submenu', () => {
  const menus = loadMenus();
  const view = menus.find((menu) => menu.id === 'view');
  const unit = view.items.find((item) => item.commandId === 'length-unit');
  assert.deepEqual(unit.children.map((child) => child.commandId), [
    'length-unit-pt', 'length-unit-inch', 'length-unit-cm',
  ]);
  assert.deepEqual(unit.children.map((child) => child.label), [
    'Points (pt)', 'Inches', 'Centimeters (cm)',
  ]);
});

test('view menu holds zoom, fit, display toggles, and rulers; document keeps only document items', () => {
  const menus = loadMenus();
  const byId = Object.fromEntries(menus.map((menu) => [menu.id, menu]));
  assert.deepEqual(byId.view.items.map((item) => item.commandId), [
    'hdr-view-1', 'zoom-in', 'zoom-out', 'reset-zoom', 'fit-page', 'fit-artwork', 'fit-selection',
    'length-unit',
    'hdr-view-2', 'toggle-panel', 'toggle-keyboard', 'toggle-status', 'show-grid', 'show-guides', 'guide-snapping',
    'rulers',
  ]);
  assert.deepEqual(
    byId.view.items.filter((item) => item.header).map((item) => item.label),
    ['Zoom', 'Show'],
  );
  const rulers = byId.view.items.find((item) => item.commandId === 'rulers');
  assert.deepEqual(rulers.children.map((child) => child.commandId), ['ruler-viewer', 'ruler-page', 'ruler-off']);
  assert.deepEqual(rulers.children.map((child) => child.label), ['Viewer edges', 'Page frame', 'Off']);
  assert.deepEqual(byId.document.items.map((item) => item.commandId), [
    'canvas-size', 'document-settings', 'pages-guides',
  ]);
  assert.equal(byId.document.title, 'Document');
});

test('menu XML rejects malformed definitions', () => {
  for (const xml of [
    '<menu id="m"><item command="c"/></menu>',
    '<menus><menu><item command="c"/></menu></menus>',
    '<menus><menu id="m"><item/></menu></menus>',
    '<menus><menu id="m"><item command="c">text</item></menu></menus>',
    '<menus><menu id="m"><item command="c"><item command="d"/></item></menu></menus>',
    '<menus><menu id="m"><item command="c"><option/></item></menu></menus>',
    '<menus><menu id="m"><item command="c"><option command="d"><option command="e"/></option></item></menu></menus>',
    '<menus><menu id="m"><option command="d"/></menu></menus>',
    '<menus><menu id="m"><group><item command="c"/></group></menu></menus>',
    '<menus><menu id="m"><group label="G"><toggle/></group></menu></menus>',
    '<menus><menu id="m"><item command="c" shortcut="Primary+"/></menu></menus>',
    '<menus><menu id="m"><item command="c" shortcut="Primary+G+H"/></menu></menus>',
    '<menus><menu id="m"><item command="c" shortcut="Opt+"/></menu></menus>',
    '<menus><menu id="m"><item command="c" shortcut="Opt+TH"/></menu></menus>',
    '<menus><menu id="m"><bogus/></menu></menus>',
    'not xml at all',
    '',
  ]) {
    const result = parseMenuXML(xml);
    assert.ok('error' in result, `expected an error for ${xml}`);
    assert.ok(result.error.length > 0);
  }
});

test('image menu groups place/selection/arrange around transform and raster submenus', () => {
  const menus = loadMenus();
  const image = menus.find((menu) => menu.id === 'image');
  assert.equal(image.title, 'Image');
  assert.deepEqual(image.items.map((item) => item.commandId), [
    'image-filters',
    'hdr-image-1', 'image-place', 'image-replace',
    'hdr-image-2', 'image-info',
    'hdr-image-3', 'image-crop-frame', 'image-mask-shape', 'image-remove-mask', 'image-remove-crop',
    'image-transform', 'image-raster',
    'hdr-image-4', 'bring-to-front', 'bring-forward', 'send-backward', 'send-to-back',
  ]);
  assert.deepEqual(
    image.items.filter((item) => item.header).map((item) => item.label),
    ['Place', 'Selection', 'Crop & Mask', 'Arrange'],
  );
  const byId = Object.fromEntries(image.items.map((item) => [item.commandId, item]));
  assert.deepEqual(byId['image-transform'].children.map((child) => child.commandId), [
    'image-scale-half', 'image-scale-double', 'image-fit-view', 'scale-dialog',
  ]);
  assert.deepEqual(byId['image-raster'].children.map((child) => child.commandId), [
    'image-grayscale', 'image-flatten', 'image-convert-png', 'image-convert-jpeg', 'image-trace',
  ]);
});
