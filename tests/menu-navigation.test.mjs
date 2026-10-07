import test from 'node:test';
import assert from 'node:assert/strict';
import { focusableIndexes, stepFocus, submenuForRow } from '../src/ui/menuNavigation.ts';

// Mirrors the operations menu shape: headers, a mix of wired and
// placeholder commands, and a trailing dialog group.
const ITEMS = [
  { commandId: 'hdr-1', label: 'Immediate', header: true },
  { commandId: 'group' },
  { commandId: 'delete-selection' },
  { commandId: 'hdr-2', label: 'With dialog', header: true },
  { commandId: 'scale-dialog' },
  { commandId: 'rotate-dialog' },
];
const ENABLED = new Set(['group', 'scale-dialog']);

test('focusable rows skip headers and unwired commands', () => {
  assert.deepEqual(focusableIndexes(ITEMS, ENABLED), [1, 4]);
  assert.deepEqual(focusableIndexes(ITEMS, new Set()), []);
});

test('unwired parents stay focusable so their submenu opens by keyboard', () => {
  const withParent = [
    ...ITEMS,
    { commandId: 'modes', label: 'Modes', children: [{ commandId: 'opt' }] },
  ];
  assert.deepEqual(focusableIndexes(withParent, ENABLED), [1, 4, 6]);
  assert.deepEqual(focusableIndexes(withParent, new Set()), [6]);
});

test('stepping starts at the near edge and skips over gaps', () => {
  assert.equal(stepFocus(ITEMS, ENABLED, -1, 1), 1);
  assert.equal(stepFocus(ITEMS, ENABLED, -1, -1), 4);
  // From a header or a disabled row, stepping finds the next wired row past it.
  assert.equal(stepFocus(ITEMS, ENABLED, 0, 1), 1);
  assert.equal(stepFocus(ITEMS, ENABLED, 2, 1), 4);
  assert.equal(stepFocus(ITEMS, ENABLED, 3, -1), 1);
  assert.equal(stepFocus(ITEMS, ENABLED, 5, -1), 4);
});

test('stepping wraps around the ends of the menu', () => {
  assert.equal(stepFocus(ITEMS, ENABLED, 4, 1), 1);
  assert.equal(stepFocus(ITEMS, ENABLED, 1, -1), 4);
});

test('stepping with nothing focusable stays parked', () => {
  assert.equal(stepFocus(ITEMS, new Set(), -1, 1), -1);
  assert.equal(stepFocus(ITEMS, new Set(), 2, -1), -1);
  assert.equal(stepFocus([], ENABLED, -1, 1), -1);
});

const TEXT_MODE = { commandId: 'text-mode', parentId: null, hasChildren: true };
const TEXT_OPTION = { commandId: 'text-mode-display', parentId: 'text-mode', hasChildren: false };
const PANEL_ROW = { commandId: 'panel-show-textControls', parentId: null, hasChildren: false };
const SNAPPING = { commandId: 'snapping', parentId: null, hasChildren: true };

test('pointer entry opens a parent and keyboard entry does not', () => {
  assert.equal(submenuForRow(null, TEXT_MODE, 'pointer'), 'text-mode');
  assert.equal(submenuForRow(null, TEXT_MODE, 'keyboard'), null);
  assert.equal(submenuForRow('snapping', SNAPPING, 'keyboard'), 'snapping');
});

test('leaving a submenu for a panel row or another parent closes it', () => {
  assert.equal(submenuForRow('text-mode', PANEL_ROW, 'pointer'), null);
  assert.equal(submenuForRow('text-mode', PANEL_ROW, 'keyboard'), null);
  assert.equal(submenuForRow('text-mode', SNAPPING, 'pointer'), 'snapping');
  assert.equal(submenuForRow('text-mode', SNAPPING, 'keyboard'), null);
});

test('an open submenu stays open on its parent and its options', () => {
  assert.equal(submenuForRow('text-mode', TEXT_MODE, 'pointer'), 'text-mode');
  assert.equal(submenuForRow('text-mode', TEXT_MODE, 'keyboard'), 'text-mode');
  assert.equal(submenuForRow('text-mode', TEXT_OPTION, 'pointer'), 'text-mode');
  assert.equal(submenuForRow('text-mode', TEXT_OPTION, 'keyboard'), 'text-mode');
});
