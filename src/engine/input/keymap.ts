// One description of each physical shortcut.
//
// Owns: command identity, key matching, keycap labels, keyboard groups,
//   availability, and whether a match ends the key chain.
// May read: nothing mutable.
// May mutate: nothing.
// Public surface: KEY_COMMANDS, KEY_CAPS, and the lookup helpers below.
// Events: none. KeyboardController performs engine commands.
//   App-owned commands (panel, keyboard, and status visibility) are matched
//   here and performed by App.tsx. The on-screen board renders KEY_CAPS.
// Tests: keyGroupForLabel('M') is circle, 'S' is neutral, 'R' is end.
//   Slash does not highlight. Modifier chords do not swallow other keys.
//   See refs/engine-smoke-checklist.md.

import type { StatusKeyGroup } from '../types';

export interface KeyState {
  isDrawingPath: boolean;
  isDrawingShape: boolean;
  isDrawingQuad: boolean;
  isLiveDrawing: boolean;
  shapeType: string | null;
  selectedCount: number;
  isInDragLock: boolean;
  /** Live scale/rotate applies to paths, quads, and circle previews. */
  liveAdjustApplies: boolean;
}

export interface KeyCommand {
  id: string;
  /** Handler name on KeyboardController. App commands are not performed there. */
  action: string;
  keycap: string;
  group: StatusKeyGroup;
  help: string;
  match: (event: KeyboardEvent) => boolean;
  available: (state: KeyState) => boolean;
  /** Stop later commands after this one runs. */
  exclusive: boolean;
  /** Label-only entries are not dispatched. Defaults to true. */
  dispatch?: boolean;
  /** Performed by App, not the engine. */
  owner?: 'app';
  /**
   * Same physical key as another command. Status color uses the
   * non-alias command so S stays neutral while it also finishes a drawing.
   */
  alias?: boolean;
  /** Slash is not mirrored onto the on-screen keycap. */
  highlight?: boolean;
  /**
   * Optional settings surface for this command. The schema itself lives in
   * KeySettingsRegistry under settingsId, so the key definition and the
   * popover cannot drift. Clicking the whole on-screen cap opens that
   * surface and does not run the command. The physical key still does.
   */
  settingsId?: string;
  settingsAvailability?: (state: KeyState) => boolean;
  settingsSummary?: string;
}

export interface KeyCap {
  id: string;
  dataKey: string;
  className: string;
  legend: string;
  row: 'q' | 'a' | 'z' | 'space';
  commandId?: string;
  transform?: string;
  badge?: 'circle' | 'rect';
  /** Only the status keycap receives clicks. The rest fall through. */
  clickable?: boolean;
}

const drawing = (s: KeyState): boolean =>
  s.isDrawingPath || s.isDrawingShape || s.isDrawingQuad;

const idle = (s: KeyState): boolean => !drawing(s);

const letter = (key: string) => (event: KeyboardEvent) =>
  event.key.toLowerCase() === key;

const codeOrKey = (code: string, key: string) => (event: KeyboardEvent) =>
  event.code === code || event.key === key;

const meta = (event: KeyboardEvent): boolean =>
  event.metaKey || event.ctrlKey;

const always = (): boolean => true;

export const KEY_COMMANDS: KeyCommand[] = [
  {
    id: 'reset-zoom',
    action: 'reset-zoom',
    keycap: '0',
    group: 'neutral',
    help: 'Reset zoom',
    match: (e) => meta(e) && e.key === '0',
    available: always,
    exclusive: true,
  },
  {
    id: 'step-zoom',
    action: 'step-zoom',
    keycap: '−',
    group: 'neutral',
    help: 'Step zoom',
    match: (e) => meta(e) && (e.key === '-' || e.key === '=' || e.key === '+'),
    available: always,
    exclusive: true,
  },
  {
    id: 'undo',
    action: 'undo',
    keycap: 'Z',
    group: 'neutral',
    help: 'Undo',
    match: (e) => meta(e) && e.key.toLowerCase() === 'z' && !e.shiftKey,
    available: always,
    exclusive: true,
  },
  {
    id: 'redo',
    action: 'redo',
    keycap: 'Z',
    group: 'neutral',
    help: 'Redo',
    match: (e) =>
      meta(e) &&
      ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y'),
    available: always,
    exclusive: true,
    alias: true,
  },
  {
    id: 'group',
    action: 'group',
    keycap: 'G',
    group: 'neutral',
    help: 'Group or ungroup the selection',
    match: (e) => meta(e) && e.key.toLowerCase() === 'g',
    available: always,
    exclusive: true,
    alias: true,
  },
  {
    id: 'nudge',
    action: 'nudge',
    keycap: 'Arrow',
    group: 'neutral',
    help: 'Nudge the selection',
    match: (e) =>
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown',
    available: always,
    exclusive: true,
  },
  {
    id: 'bracket-keys',
    action: 'brackets',
    keycap: '[',
    group: 'op',
    help: 'Centerline width, live scale, or selection scale',
    match: (e) =>
      codeOrKey('BracketLeft', '[')(e) || codeOrKey('BracketRight', ']')(e),
    available: (s) =>
      (s.isDrawingShape && s.shapeType === 'rectangle_centerline') ||
      (s.isLiveDrawing && s.liveAdjustApplies) ||
      s.selectedCount > 0,
    exclusive: true,
    alias: true,
  },
  {
    id: 'scale-down',
    action: 'brackets',
    keycap: '[',
    group: 'op',
    help: 'Scale down',
    match: codeOrKey('BracketLeft', '['),
    available: always,
    exclusive: false,
    dispatch: false,
  },
  {
    id: 'scale-up',
    action: 'brackets',
    keycap: ']',
    group: 'op',
    help: 'Scale up',
    match: codeOrKey('BracketRight', ']'),
    available: always,
    exclusive: false,
    dispatch: false,
  },
  {
    id: 'rotate-keys',
    action: 'rotate',
    keycap: ';',
    group: 'op',
    help: 'Live or selection rotation',
    match: (e) => codeOrKey('Semicolon', ';')(e) || codeOrKey('Quote', "'")(e),
    available: (s) =>
      (s.isLiveDrawing && s.liveAdjustApplies) || s.selectedCount > 0,
    exclusive: true,
    alias: true,
  },
  {
    id: 'rotate-ccw',
    action: 'rotate',
    keycap: ';',
    group: 'op',
    help: 'Rotate counter-clockwise',
    match: codeOrKey('Semicolon', ';'),
    available: always,
    exclusive: false,
    dispatch: false,
  },
  {
    id: 'rotate-cw',
    action: 'rotate',
    keycap: "'",
    group: 'op',
    help: 'Rotate clockwise',
    match: codeOrKey('Quote', "'"),
    available: always,
    exclusive: false,
    dispatch: false,
  },
  {
    id: 'radial-lock',
    action: 'radial-lock',
    keycap: '0',
    group: 'neutral',
    help: 'Lock or unlock the radial-stamp radius',
    match: (e) => !meta(e) && (e.code === 'Digit0' || e.key === '0'),
    available: always,
    exclusive: true,
  },
  {
    id: 'drag-lock',
    action: 'drag-lock',
    keycap: 'Space',
    group: 'neutral',
    help: 'Toggle drag-lock',
    match: (e) => e.key === ' ',
    available: (s) => s.selectedCount > 0,
    exclusive: false,
  },
  {
    id: 'delete-selection',
    action: 'delete-selection',
    keycap: 'Backspace',
    group: 'neutral',
    help: 'Delete the selection',
    match: (e) => e.key === 'Backspace',
    available: always,
    exclusive: false,
  },
  {
    id: 'clear-selection',
    action: 'clear-selection',
    keycap: 'Escape',
    group: 'end',
    help: 'Clear the selection and drag-lock',
    match: (e) => e.key === 'Escape',
    available: always,
    exclusive: false,
  },
  {
    id: 'stamp',
    action: 'stamp',
    keycap: 'W',
    group: 'op',
    help: 'Stamp the preview or the selection',
    match: letter('w'),
    available: always,
    exclusive: false,
  },
  {
    id: 'rect-centerline',
    action: 'rect-centerline',
    keycap: 'Y',
    group: 'rect',
    help: 'Rectangle by centerline',
    match: letter('y'),
    available: always,
    exclusive: true,
  },
  {
    id: 'rect-diagonal',
    action: 'rect-diagonal',
    keycap: 'I',
    group: 'rect',
    help: 'Rectangle by diagonal',
    match: letter('i'),
    available: always,
    exclusive: true,
  },
  {
    id: 'rect-two-edges',
    action: 'rect-two-edges',
    keycap: 'U',
    group: 'rect',
    help: 'Rectangle by two edges',
    match: letter('u'),
    available: always,
    exclusive: true,
  },
  {
    id: 'sharp-point',
    action: 'sharp-point',
    keycap: 'F',
    group: 'neutral',
    help: 'Sharp path point',
    match: letter('f'),
    available: always,
    exclusive: true,
  },
  {
    id: 'spline-point',
    action: 'spline-point',
    keycap: 'G',
    group: 'neutral',
    help: 'Spline path point',
    match: letter('g'),
    available: always,
    exclusive: true,
  },
  {
    id: 'circle-diameter',
    action: 'circle-diameter',
    keycap: 'N',
    group: 'circle',
    help: 'Circle by diameter',
    match: letter('n'),
    available: always,
    exclusive: true,
  },
  {
    id: 'circle-radius',
    action: 'circle-radius',
    keycap: 'M',
    group: 'circle',
    help: 'Circle by radius',
    match: letter('m'),
    available: always,
    exclusive: true,
  },
  {
    id: 'radial-stamp',
    action: 'radial-stamp',
    keycap: ',',
    group: 'circle',
    help: 'Radial stamp',
    match: codeOrKey('Comma', ','),
    available: always,
    exclusive: true,
  },
  {
    id: 'quad',
    action: 'quad',
    keycap: 'O',
    group: 'quad',
    help: 'Four-point quad',
    match: letter('o'),
    available: always,
    exclusive: true,
  },
  {
    id: 'tension-down',
    action: 'tension-down',
    keycap: 'J',
    group: 'neutral',
    help: 'Decrease spline tension',
    match: letter('j'),
    available: (s) => s.isDrawingPath,
    exclusive: true,
    alias: true,
  },
  {
    id: 'tension-up',
    action: 'tension-up',
    keycap: 'K',
    group: 'neutral',
    help: 'Increase spline tension',
    match: letter('k'),
    available: (s) => s.isDrawingPath,
    exclusive: true,
    alias: true,
  },
  {
    id: 'tension-reset',
    action: 'tension-reset',
    keycap: '/',
    group: 'neutral',
    help: 'Reset spline tension',
    match: letter('/'),
    available: (s) => s.isDrawingPath,
    exclusive: true,
    highlight: false,
  },
  {
    id: 'grid-toggle',
    action: 'grid-toggle',
    keycap: '/',
    group: 'neutral',
    help: 'Toggle the grid',
    match: letter('/'),
    available: (s) => !s.isDrawingPath,
    exclusive: true,
    highlight: false,
    alias: true,
  },
  {
    id: 'stroke-thinner',
    action: 'stroke-thinner',
    keycap: 'C',
    group: 'neutral',
    help: 'Thinner stroke',
    match: letter('c'),
    available: always,
    exclusive: true,
  },
  {
    id: 'stroke-thicker',
    action: 'stroke-thicker',
    keycap: 'V',
    group: 'neutral',
    help: 'Thicker stroke',
    match: letter('v'),
    available: always,
    exclusive: true,
  },
  {
    id: 'finish-r',
    action: 'finish-drawing',
    keycap: 'R',
    group: 'end',
    help: 'Complete the shape',
    match: letter('r'),
    available: drawing,
    exclusive: false,
  },
  {
    id: 'finish-e',
    action: 'finish-drawing',
    keycap: 'E',
    group: 'neutral',
    help: 'End the drawing',
    match: letter('e'),
    available: drawing,
    exclusive: false,
    alias: true,
  },
  {
    id: 'finish-s',
    action: 'finish-drawing',
    keycap: 'S',
    group: 'end',
    help: 'End the drawing',
    match: letter('s'),
    available: drawing,
    exclusive: false,
    alias: true,
  },
  {
    id: 'finish-a',
    action: 'finish-drawing',
    keycap: 'A',
    group: 'end',
    help: 'End the drawing',
    match: letter('a'),
    // Idle with drag-lock on, END releases the lock instead of drawing.
    available: (s) => drawing(s) || s.isInDragLock,
    exclusive: false,
  },
  {
    id: 'toggle-stroke',
    action: 'toggle-stroke',
    keycap: 'S',
    group: 'neutral',
    help: 'Toggle stroke',
    match: letter('s'),
    available: idle,
    exclusive: true,
  },
  {
    id: 'toggle-fill',
    action: 'toggle-fill',
    keycap: 'D',
    group: 'neutral',
    help: 'Toggle fill',
    match: letter('d'),
    available: idle,
    exclusive: true,
  },
  {
    id: 'cancel',
    action: 'cancel',
    keycap: 'Q',
    group: 'end',
    help: 'Cancel the current drawing',
    match: (e) => e.key === 'q',
    available: always,
    exclusive: false,
  },
  {
    id: 'cancel-escape',
    action: 'cancel',
    keycap: 'Escape',
    group: 'end',
    help: 'Cancel the current drawing',
    match: (e) => e.key === 'Escape',
    available: always,
    exclusive: false,
    alias: true,
  },
  {
    id: 'select',
    action: 'select',
    keycap: 'Tab',
    group: 'neutral',
    help: 'Select the item under the cursor',
    match: (e) => e.key === 'Tab',
    available: always,
    exclusive: false,
  },
  {
    id: 'toggle-panel',
    action: 'toggle-panel',
    keycap: 'J',
    group: 'neutral',
    help: 'Toggle the control panel',
    match: (e) => !meta(e) && letter('j')(e),
    available: (s) => !s.isDrawingPath,
    exclusive: false,
    owner: 'app',
  },
  {
    id: 'toggle-keyboard',
    action: 'toggle-keyboard',
    keycap: 'K',
    group: 'neutral',
    help: 'Toggle the on-screen keyboard',
    match: (e) => !meta(e) && letter('k')(e),
    available: (s) => !s.isDrawingPath,
    exclusive: false,
    owner: 'app',
  },
  {
    id: 'toggle-status',
    action: 'toggle-status',
    keycap: 'L',
    group: 'neutral',
    help: 'Toggle the status overlay',
    match: (e) => !meta(e) && letter('l')(e),
    available: (s) => !s.isDrawingPath,
    exclusive: false,
    owner: 'app',
  },
];

// Settings metadata attached to the command that owns the behavior.
// Each popover edits how its tool draws (not what the panel sections
// draw). Only Circle by Radius and Rect by Diagonal have popovers for
// now; keys without a link show no popover and no gear badge.
const KEY_SETTINGS_LINKS: Record<string, { settingsId: string; settingsSummary: string }> = {
  'circle-radius': { settingsId: 'circle-radius-tool', settingsSummary: 'Circle radius start' },
  'rect-diagonal': { settingsId: 'rect-diagonal-tool', settingsSummary: 'Rect diagonal extent' },
};

for (const cmd of KEY_COMMANDS) {
  const link = KEY_SETTINGS_LINKS[cmd.id];
  if (!link) continue;
  cmd.settingsId = link.settingsId;
  cmd.settingsSummary = link.settingsSummary;
  cmd.settingsAvailability = always;
}

export const KEY_CAPS: KeyCap[] = [
  { id: 'Tab', dataKey: 'tab', commandId: 'select', row: 'q', className: 'keyboardkey tabKey OtherKey enabledButton', legend: 'SELECT OBJECTS' },
  { id: 'KeyQ', dataKey: 'q', commandId: 'cancel', row: 'q', className: 'keyboardkey KeyQ operationButton enabledButton cancelButton', transform: 'translate(-45%, 0%)', legend: 'CANCEL' },
  { id: 'KeyW', dataKey: 'w', commandId: 'stamp', row: 'q', className: 'keyboardkey wKey operationButton enabledButton', legend: 'STAMP' },
  { id: 'KeyE', dataKey: 'e', commandId: 'finish-e', row: 'q', className: 'keyboardkey eKey ', legend: '' },
  { id: 'KeyR', dataKey: 'r', commandId: 'finish-r', row: 'q', className: 'keyboardkey rKey endButton enabledButton', transform: 'translate(-45%, 0%)', legend: 'COMPLETE<br/>SHAPE' },
  { id: 'KeyT', dataKey: 't', row: 'q', className: 'keyboardkey tKey ', transform: 'translate(-45%, 0%)', legend: '' },
  { id: 'KeyY', dataKey: 'y', commandId: 'rect-centerline', row: 'q', className: 'keyboardkey yKey drawingButton enabledButton rectangleButton', transform: 'translate(-45%, 0%)', legend: 'RECT.<br/>BY CENTERLINE', badge: 'rect' },
  { id: 'KeyU', dataKey: 'u', commandId: 'rect-two-edges', row: 'q', className: 'keyboardkey uKey drawingButton enabledButton rectangleButton', transform: 'translate(-45%, 0%)', legend: 'RECT.<br/>BY 2 EDGES', badge: 'rect' },
  { id: 'KeyI', dataKey: 'i', commandId: 'rect-diagonal', row: 'q', className: 'keyboardkey iKey drawingButton enabledButton rectangleButton', transform: 'translate(-47%, 0%)', legend: 'RECT.<br/>BY DIAG.', badge: 'rect' },
  { id: 'KeyO', dataKey: 'o', commandId: 'quad', row: 'q', className: 'keyboardkey oKey drawingButton enabledButton quadButton', transform: 'translate(-45%, 0%)', legend: 'QUAD<br/>4 PTS' },
  { id: 'KeyP', dataKey: 'p', row: 'q', className: 'keyboardkey pKey ', legend: '' },
  { id: 'BracketLeft', dataKey: '[', commandId: 'scale-down', row: 'q', className: 'keyboardkey  bracketLeftKey operationButton enabledButton', legend: 'SCALE -' },
  { id: 'BracketRight', dataKey: ']', commandId: 'scale-up', row: 'q', className: 'keyboardkey  bracketRightKey operationButton enabledButton', legend: 'SCALE +' },
  { id: 'Backslash', dataKey: '\\', row: 'q', className: 'keyboardkey  backslashKey', legend: '' },
  { id: 'CapsLock', dataKey: 'capslock', row: 'a', className: 'keyboardkey capsLockKey OtherKey hidden', legend: '' },
  { id: 'KeyA', dataKey: 'a', commandId: 'finish-a', row: 'a', className: 'keyboardkey KeyA endButton', transform: 'translate(-27%, 0%)', legend: '<b>END</b><br />' },
  { id: 'KeyS', dataKey: 's', commandId: 'toggle-stroke', row: 'a', className: 'keyboardkey sKey toggleButton enabledButton', transform: 'translate(-27%, 0%)', legend: 'TOGGLE<br/>STROKE' },
  { id: 'KeyD', dataKey: 'd', commandId: 'toggle-fill', row: 'a', className: 'keyboardkey dKey toggleButton enabledButton', transform: 'translate(-27%, 0%)', legend: 'TOGGLE<br/>FILL' },
  { id: 'KeyF', dataKey: 'f', commandId: 'sharp-point', row: 'a', className: 'keyboardkey fKey drawingButton', transform: 'translate(-27%, 0%)', legend: 'SHARP</br>POINT' },
  { id: 'KeyG', dataKey: 'g', commandId: 'spline-point', row: 'a', className: 'keyboardkey gKey drawingButton enabledButton', transform: 'translate(-27%, 0%)', legend: 'SPLINE<br/>POINT' },
  { id: 'KeyH', dataKey: 'h', row: 'a', className: 'keyboardkey hKey ', transform: 'translate(-27%, 0%)', legend: '' },
  { id: 'KeyJ', dataKey: 'j', commandId: 'toggle-panel', row: 'a', className: 'keyboardkey jKey toggleButton enabledButton overlayToggle', transform: 'translate(-27%, 0%)', legend: 'PANEL<br/>TOGGLE' },
  { id: 'KeyK', dataKey: 'k', commandId: 'toggle-keyboard', row: 'a', className: 'keyboardkey kKey toggleButton enabledButton overlayToggle', transform: 'translate(-27%, 0%)', legend: 'KB<br/>TOGGLE' },
  { id: 'KeyL', dataKey: 'l', commandId: 'toggle-status', row: 'a', className: 'keyboardkey lKey toggleButton enabledButton overlayToggle statusToggle', transform: 'translate(-27%, 0%)', legend: 'STATUS<br/>TOGGLE', clickable: true },
  { id: 'Semicolon', dataKey: ';', commandId: 'rotate-ccw', row: 'a', className: 'keyboardkey semicolonKey operationButton enabledButton', transform: 'translate(-27%, 0%)', legend: 'ROTATE -' },
  { id: 'Quote', dataKey: "'", commandId: 'rotate-cw', row: 'a', className: 'keyboardkey  singleQuoteKey operationButton enabledButton', transform: 'translate(-27%, 0%)', legend: 'ROTATE +' },
  { id: 'Enter', dataKey: 'return', row: 'a', className: 'keyboardkey returnKey OtherKey hidden', transform: 'translate(-5%, 0%)', legend: 'RETURN' },
  { id: 'ShiftLeft', dataKey: 'shift', row: 'z', className: 'keyboardkey shiftKeyLeft OtherKey hidden', legend: '' },
  { id: 'KeyZ', dataKey: 'z', row: 'z', className: 'keyboardkey KeyZ ', transform: 'translate(38%, 0%)', legend: '' },
  { id: 'KeyX', dataKey: 'x', row: 'z', className: 'keyboardkey xKey ', transform: 'translate(38%, 0%)', legend: '' },
  { id: 'KeyC', dataKey: 'c', commandId: 'stroke-thinner', row: 'z', className: 'keyboardkey cKey stepper1Decrement enabledButton', transform: 'translate(38%, 0%)', legend: '-<br />STROKE<br />WIDTH' },
  { id: 'KeyV', dataKey: 'v', commandId: 'stroke-thicker', row: 'z', className: 'keyboardkey vKey stepper1Increment enabledButton', transform: 'translate(38%, 0%)', legend: '+<br />STROKE<br />WIDTH' },
  { id: 'KeyB', dataKey: 'b', row: 'z', className: 'keyboardkey bKey ', transform: 'translate(38%, 0%)', legend: '' },
  { id: 'KeyN', dataKey: 'n', commandId: 'circle-diameter', row: 'z', className: 'keyboardkey nKey drawingButton enabledButton circleButton', transform: 'translate(38%, 0%)', legend: 'CIRCLE<br/>BY DIAMETER', badge: 'circle' },
  { id: 'KeyM', dataKey: 'm', commandId: 'circle-radius', row: 'z', className: 'keyboardkey mKey drawingButton enabledButton circleButton', transform: 'translate(38%, 0%)', legend: 'CIRCLE<br/>BY RADIUS', badge: 'circle' },
  { id: 'Comma', dataKey: ',', commandId: 'radial-stamp', row: 'z', className: 'keyboardkey commaKey drawingButton enabledButton circleButton', transform: 'translate(38%, 0%)', legend: 'RADIAL<br/>STAMP', badge: 'circle' },
  { id: 'Period', dataKey: '.', row: 'z', className: 'keyboardkey periodKey ', transform: 'translate(38%, 0%)', legend: '' },
  { id: 'Slash', dataKey: '/', commandId: 'grid-toggle', row: 'z', className: 'keyboardkey forwardSlashKey OtherKey enabledButton', transform: 'translate(38%, 0%)', legend: 'GRID<br/>TOGGLE' },
  { id: 'ShiftRight', dataKey: 'shift', row: 'z', className: 'keyboardkey shiftKeyRight OtherKey hidden', transform: 'translate(15%, 0%)', legend: '' },
  { id: 'Space', dataKey: 'spacebar', commandId: 'drag-lock', row: 'space', className: 'keyboardkey spacebarKey OtherKey enabledButton selectionButton', legend: 'DRAG LOCK' },
];

export function commandById(id: string): KeyCommand | undefined {
  return KEY_COMMANDS.find((c) => c.id === id);
}

export function keyGroupForLabel(label: string): StatusKeyGroup {
  const k = label.toLowerCase();
  const cmd = KEY_COMMANDS.find(
    (c) => !c.alias && c.keycap.toLowerCase() === k,
  );
  return cmd?.group ?? 'neutral';
}

export function commandKeycap(id: string): string {
  return commandById(id)?.keycap ?? id;
}

/** Typing in panel fields must never arm canvas functions. */
export function isTextEntryTarget(event: KeyboardEvent): boolean {
  const t = event.target as HTMLElement | null;
  if (!t) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** App overlay toggles. Null when the key belongs to the engine or a field. */
export function matchAppCommand(
  event: KeyboardEvent,
  state: { isDrawingPath: boolean },
): string | null {
  if (event.metaKey || event.ctrlKey) return null;
  if (isTextEntryTarget(event)) return null;
  const keyState: KeyState = {
    isDrawingPath: state.isDrawingPath,
    isDrawingShape: false,
    isDrawingQuad: false,
    isLiveDrawing: state.isDrawingPath,
    shapeType: null,
    selectedCount: 0,
    isInDragLock: false,
    liveAdjustApplies: false,
  };
  for (const cmd of KEY_COMMANDS) {
    if (cmd.owner !== 'app') continue;
    if (!cmd.match(event)) continue;
    if (!cmd.available(keyState)) return null;
    return cmd.id;
  }
  return null;
}

export function isCommandAvailable(
  id: string,
  state: { isDrawingPath: boolean },
): boolean {
  const cmd = commandById(id);
  if (!cmd) return false;
  return cmd.available({
    isDrawingPath: state.isDrawingPath,
    isDrawingShape: false,
    isDrawingQuad: false,
    isLiveDrawing: state.isDrawingPath,
    shapeType: null,
    selectedCount: 0,
    isInDragLock: false,
    liveAdjustApplies: false,
  });
}
