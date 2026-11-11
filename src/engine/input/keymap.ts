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
import type { ModifierChord, ModifierSnapshot } from './ModifierStateTracker';

/**
 * Swappable board layout id. 'base' is today's board; 'spline' swaps in
 * while a composite path session is live. The remaining ids are reserved
 * for future layouts (clothoid spline, grid paint, repeat) and have no
 * tables yet — resolving them falls back to base.
 */
export type KeyboardLayoutId = 'base' | 'spline' | 'clothoid' | 'grid-paint' | 'repeat';

/** Layouts with compiled dispatch/display tables. Grows as layouts land. */
export type ConcreteLayoutId = 'base' | 'spline' | 'clothoid';

export interface KeyState {
  isDrawingPath: boolean;
  isDrawingShape: boolean;
  isDrawingQuad: boolean;
  isLiveDrawing: boolean;
  shapeType: string | null;
  selectedCount: number;
  isTypingText: boolean;
  isInDragLock: boolean;
  /** Live scale/rotate applies to paths, quads, and circle previews. */
  liveAdjustApplies: boolean;
  isCompositePath?: boolean;
  /** True while a composite path session holds the live point. */
  isCompositeSessionActive?: boolean;
  /**
   * Swappable board layout override. When undefined, the layout derives
   * from session state (spline while a composite path session is live).
   */
  activeLayoutId?: KeyboardLayoutId;
  /** Conventional transform controls (Ctrl/Cmd+T) are showing. */
  isTransformMode?: boolean;
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
  row: 'q' | 'a' | 'z' | 'space' | 'modifiers';
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

/** Transform-controls toggle chord: Command+T on macOS/iOS, Ctrl+T on
 * PC. Shift and Alt are never part of the chord. This is the desired
 * binding (it reaches us in Electron/webview shells); browsers reserve it
 * in normal tabs, so isAltTransformKey is the working alias there. */
export function isPrimaryTransformKey(event: KeyboardEvent): boolean {
  const mac = keyboardPlatform() === 'mac';
  const primary = mac ? (event.metaKey && !event.ctrlKey) : (event.ctrlKey && !event.metaKey);
  if (!primary || event.shiftKey || event.altKey) return false;
  return event.code === 'KeyT' || (event.key ?? '').toLowerCase() === 't';
}

/** Browser-safe toggle alias: Alt+T on PC, Option+T on Mac. Code-based
 * because Option+T produces the key '†' (not 't') on macOS. */
export function isAltTransformKey(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || !event.altKey || event.shiftKey) return false;
  return event.code === 'KeyT';
}

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
    id: 'cut',
    action: 'cut',
    keycap: 'X',
    group: 'neutral',
    help: 'Cut the selection',
    match: (e) => meta(e) && e.key.toLowerCase() === 'x' && !e.shiftKey,
    available: (s) => s.selectedCount > 0,
    exclusive: true,
    alias: true,
  },
  {
    id: 'copy',
    action: 'copy',
    keycap: 'C',
    group: 'neutral',
    help: 'Copy the selection',
    match: (e) => meta(e) && e.key.toLowerCase() === 'c' && !e.shiftKey,
    available: (s) => s.selectedCount > 0,
    exclusive: true,
    alias: true,
  },
  {
    id: 'paste',
    action: 'paste',
    keycap: 'V',
    group: 'neutral',
    help: 'Paste from the clipboard',
    match: (e) => meta(e) && e.key.toLowerCase() === 'v' && !e.shiftKey,
    available: always,
    exclusive: true,
    alias: true,
  },
  {
    id: 'select-all',
    action: 'select-all',
    keycap: 'A',
    group: 'neutral',
    help: 'Select all artwork',
    match: (e) => meta(e) && e.key.toLowerCase() === 'a' && !e.shiftKey,
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
    id: 'pan-lock',
    action: 'pan-lock',
    keycap: 'Z',
    group: 'neutral',
    help: 'Pan-lock the canvas',
    match: (e) => !meta(e) && letter('z')(e),
    available: idle,
    exclusive: true,
  },
  {
    id: 'erase-last-point',
    action: 'erase-last-point',
    keycap: 'Z',
    group: 'neutral',
    help: 'Erase last point',
    match: (e) => !meta(e) && letter('z')(e),
    available: (s) => !!s.isCompositeSessionActive,
    exclusive: true,
  },
  {
    id: 'transform-mode',
    action: 'transform-mode',
    keycap: 'T',
    group: 'neutral',
    help: 'Toggle transform controls',
    match: (e) => isPrimaryTransformKey(e) || isAltTransformKey(e),
    available: (s) => !drawing(s) && (s.selectedCount > 0 || !!s.isTransformMode),
    exclusive: true,
  },
  {
    id: 'transform-scale',
    action: 'transform-scale',
    keycap: 'S',
    group: 'op',
    help: 'Live scale from the cursor',
    match: letter('s'),
    available: (s) => !!s.isTransformMode && !drawing(s),
    exclusive: true,
  },
  {
    id: 'transform-rotate',
    action: 'transform-rotate',
    keycap: 'R',
    group: 'op',
    help: 'Live rotation from the cursor',
    match: letter('r'),
    available: (s) => !!s.isTransformMode && !drawing(s),
    exclusive: true,
  },
  {
    id: 'transform-shear-h',
    action: 'transform-shear-h',
    keycap: 'H',
    group: 'op',
    help: 'Live horizontal shear from the cursor',
    match: letter('h'),
    available: (s) => !!s.isTransformMode && !drawing(s),
    exclusive: true,
  },
  {
    id: 'transform-shear-v',
    action: 'transform-shear-v',
    keycap: 'V',
    group: 'op',
    help: 'Live vertical shear from the cursor',
    match: letter('v'),
    available: (s) => !!s.isTransformMode && !drawing(s),
    exclusive: true,
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
    id: 'rounded-point',
    action: 'rounded-point',
    keycap: 'H',
    group: 'neutral',
    help: 'Rounded composite path corner',
    match: letter('h'),
    available: (s) => !!s.isCompositePath && !s.isDrawingShape && !s.isDrawingQuad,
    exclusive: true,
  },
  {
    id: 'circle-diameter',
    action: 'circle-diameter',
    keycap: 'M',
    group: 'circle',
    help: 'Circle by diameter',
    match: letter('m'),
    available: always,
    exclusive: true,
  },
  {
    id: 'circle-radius',
    action: 'circle-radius',
    keycap: 'N',
    group: 'circle',
    help: 'Circle by radius',
    match: letter('n'),
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
    id: 'type-text',
    action: 'type-text',
    keycap: 'P',
    group: 'neutral',
    help: 'Type text at cursor',
    match: letter('p'),
    available: idle,
    exclusive: true,
  },
  {
    id: 'tension-down',
    action: 'tension-down',
    keycap: 'J',
    group: 'neutral',
    help: 'Decrease spline tension',
    match: letter('j'),
    available: (s) => s.isDrawingPath && !s.isCompositePath,
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
    available: (s) => s.isDrawingPath && !s.isCompositePath,
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
    available: (s) => s.isDrawingPath && !s.isCompositePath,
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
    match: letter('q'),
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
    id: 'select-rectangle',
    action: 'select-rectangle',
    keycap: 'X',
    group: 'neutral',
    help: 'Selection rectangle',
    match: (e) => !meta(e) && e.code === 'KeyX',
    available: always,
    exclusive: true,
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
  {
    id: 'enter-clothoid-layout',
    action: 'enter-clothoid-layout',
    keycap: '\\',
    group: 'neutral',
    help: 'Open the clothoid layout',
    // Plain Backslash: free in every layout while idle (the spline
    // layout's switch-rounding wins this chord while drawing, and the
    // clothoid board has no use for it). Fires once to pin the manual
    // clothoid override; the controller toggles it back off.
    match: (e) => e.code === 'Backslash' && !e.shiftKey && !e.altKey && !meta(e),
    // Never fires while drawing or from inside the clothoid layout itself.
    available: (s) => !s.isDrawingPath && s.activeLayoutId !== 'clothoid',
    exclusive: true,
  },
];

/**
 * Swappable keyboard layouts (TASKS-FMStroke Phase 1, Slice 14). A
 * layout is named data: the commands it adds or overrides plus the
 * caps it overrides. Layout commands win on their caps; unmatched
 * caps fall back to the base layout, so the base command set stays
 * live underneath every layout. Reservation (Phase 1.1): A is always
 * End and Q is always Cancel in every layout — no layout command may
 * claim KeyA or KeyQ, so those base commands always resolve.
 */
export interface KeyboardLayoutDef {
  id: string;
  label: string;
  /** Commands this layout adds; they precede the base commands when
   * this layout's variants are compiled, so they win shared caps. */
  commands: KeyCommand[];
  /** Cap overrides/additions, merged over KEY_CAPS by cap id. */
  caps: KeyCap[];
}

const compositeReady = (s: KeyState): boolean =>
  !!s.isCompositePath && !s.isDrawingShape && !s.isDrawingQuad;
const compositeDrawing = (s: KeyState): boolean =>
  compositeReady(s) && s.isDrawingPath;

/** Shared erase-last-point command, compiled into every session layout
 * (spline and clothoid): Z is Pan-lock in the base layout, but Pan-lock
 * is idle-only, so the cap is free while drawing (the TASKS-FMStroke
 * audit). Hoisted so both layouts resolve the same command object. */
const eraseLastPointCommand: KeyCommand = {
  id: 'erase-last-point',
  action: 'erase-last-point',
  keycap: 'Z',
  group: 'neutral',
  help: 'Erase last point',
  match: (e) => !meta(e) && !e.shiftKey && letter('z')(e),
  available: compositeDrawing,
  exclusive: true,
};

/** The spline (FMStroke) layout's commands. These keys used to be
 * hard-coded KEY_COMMANDS entries; they resolve through the layout
 * registry now. The layout activates automatically while composite
 * mode is on (D1); see engine.activeKeyboardLayoutId. */
export const SPLINE_COMMANDS: KeyCommand[] = [
  {
    id: 'bowed-point',
    action: 'bowed-point',
    keycap: 'B',
    group: 'neutral',
    help: 'Bowed line point (composite paths)',
    match: (e) => letter('b')(e) && !e.shiftKey,
    available: compositeReady,
    exclusive: true,
  },
  {
    id: 'bowed-point-flip',
    action: 'bowed-point-flip',
    keycap: '⇧B',
    group: 'neutral',
    help: 'Bowed line point, facing flipped (composite paths)',
    match: (e) => letter('b')(e) && e.shiftKey,
    available: compositeReady,
    exclusive: true,
  },
  {
    id: 'arc-three-point',
    action: 'arc-three-point',
    keycap: '.',
    group: 'neutral',
    help: 'Arc by three points: press at the end point to arc through the previous point; the next point key finishes it (composite paths)',
    match: (e) => e.key === '.',
    available: compositeReady,
    exclusive: true,
  },
  {
    id: 'switch-rounding',
    action: 'switch-rounding',
    keycap: '\\',
    group: 'neutral',
    help: 'Switch corner rounding: arc, spline, or bevel, for the next rounded points',
    match: (e) => e.code === 'Backslash' && !e.shiftKey && !e.altKey && !meta(e),
    available: compositeDrawing,
    exclusive: true,
  },
  eraseLastPointCommand,
];

// Settings metadata attached to the command that owns the behavior.
// Each popover edits how its tool draws (not what the panel sections
// draw). Path keys, Circle by Diameter, Circle by Radius, and Rect by Diagonal have
// popovers; keys without a link show no popover and no gear badge.
const KEY_SETTINGS_LINKS: Record<string, { settingsId: string; settingsSummary: string }> = {
  'sharp-point': { settingsId: 'path-tool', settingsSummary: 'Path mode and rounded corners' },
  'spline-point': { settingsId: 'path-tool', settingsSummary: 'Path mode and rounded corners' },
  'rounded-point': { settingsId: 'path-tool', settingsSummary: 'Path mode and rounded corners' },
  'bowed-point': { settingsId: 'path-tool', settingsSummary: 'Path mode and rounded corners' },
  'bowed-point-flip': { settingsId: 'path-tool', settingsSummary: 'Path mode and rounded corners' },
  'switch-rounding': { settingsId: 'path-tool', settingsSummary: 'Path mode and rounded corners' },
  'erase-last-point': { settingsId: 'path-tool', settingsSummary: 'Path mode and rounded corners' },
  'arc-three-point': { settingsId: 'path-tool', settingsSummary: 'Path mode and rounded corners' },
  'circle-diameter': { settingsId: 'circle-diameter-tool', settingsSummary: 'Circle polygon fit' },
  'circle-radius': { settingsId: 'circle-radius-tool', settingsSummary: 'Circle radius start' },
  'rect-diagonal': { settingsId: 'rect-diagonal-tool', settingsSummary: 'Rect diagonal extent' },
};

for (const cmd of [...KEY_COMMANDS, ...SPLINE_COMMANDS]) {
  const link = KEY_SETTINGS_LINKS[cmd.id];
  if (!link) continue;
  cmd.settingsId = link.settingsId;
  cmd.settingsSummary = link.settingsSummary;
  cmd.settingsAvailability = always;
}

export const KEY_CAPS: KeyCap[] = [
  { id: 'ControlLeft', dataKey: 'ctrl', row: 'modifiers', className: 'keyboardkey modifierKey', legend: 'CONTROL' },
  { id: 'AltLeft', dataKey: 'alt', row: 'modifiers', className: 'keyboardkey modifierKey', legend: 'ALT' },
  { id: 'MetaLeft', dataKey: 'meta', row: 'modifiers', className: 'keyboardkey modifierKey', legend: 'META' },
  { id: 'Tab', dataKey: 'tab', commandId: 'select', row: 'q', className: 'keyboardkey tabKey OtherKey enabledButton', legend: 'SELECT OBJECTS' },
  { id: 'KeyQ', dataKey: 'q', commandId: 'cancel', row: 'q', className: 'keyboardkey KeyQ operationButton enabledButton cancelButton', transform: 'translate(-45%, 0%)', legend: 'CANCEL' },
  { id: 'KeyW', dataKey: 'w', commandId: 'stamp', row: 'q', className: 'keyboardkey wKey operationButton enabledButton', legend: 'STAMP' },
  { id: 'KeyE', dataKey: 'e', commandId: 'finish-e', row: 'q', className: 'keyboardkey eKey ', legend: '' },
  { id: 'KeyR', dataKey: 'r', commandId: 'finish-r', row: 'q', className: 'keyboardkey rKey endButton enabledButton', transform: 'translate(-45%, 0%)', legend: 'COMPLETE<br/>SHAPE' },
  { id: 'KeyT', dataKey: 't', row: 'q', className: 'keyboardkey tKey operationButton enabledButton', transform: 'translate(-45%, 0%)', legend: 'TRANSFORM' },
  { id: 'KeyY', dataKey: 'y', commandId: 'rect-centerline', row: 'q', className: 'keyboardkey yKey drawingButton enabledButton rectangleButton', transform: 'translate(-45%, 0%)', legend: 'RECT.<br/>BY CENTERLINE', badge: 'rect' },
  { id: 'KeyU', dataKey: 'u', commandId: 'rect-two-edges', row: 'q', className: 'keyboardkey uKey drawingButton enabledButton rectangleButton', transform: 'translate(-45%, 0%)', legend: 'RECT.<br/>BY 2 EDGES', badge: 'rect' },
  { id: 'KeyI', dataKey: 'i', commandId: 'rect-diagonal', row: 'q', className: 'keyboardkey iKey drawingButton enabledButton rectangleButton', transform: 'translate(-47%, 0%)', legend: 'RECT.<br/>BY DIAG.', badge: 'rect' },
  { id: 'KeyO', dataKey: 'o', commandId: 'quad', row: 'q', className: 'keyboardkey oKey drawingButton enabledButton quadButton', transform: 'translate(-45%, 0%)', legend: 'QUAD<br/>4 PTS' },
  { id: 'KeyP', dataKey: 'p', commandId: 'type-text', row: 'q', className: 'keyboardkey pKey drawingButton enabledButton', legend: 'TYPE<br/>TEXT' },
  { id: 'BracketLeft', dataKey: '[', commandId: 'scale-down', row: 'q', className: 'keyboardkey  bracketLeftKey operationButton enabledButton', legend: 'SCALE -' },
  { id: 'BracketRight', dataKey: ']', commandId: 'scale-up', row: 'q', className: 'keyboardkey  bracketRightKey operationButton enabledButton', legend: 'SCALE +' },
  { id: 'Backslash', dataKey: '\\', row: 'q', className: 'keyboardkey  backslashKey', legend: '' },
  { id: 'CapsLock', dataKey: 'capslock', row: 'a', className: 'keyboardkey capsLockKey OtherKey', legend: '' },
  { id: 'KeyA', dataKey: 'a', commandId: 'finish-a', row: 'a', className: 'keyboardkey KeyA endButton', transform: 'translate(-27%, 0%)', legend: '<b>END</b><br />' },
  { id: 'KeyS', dataKey: 's', commandId: 'toggle-stroke', row: 'a', className: 'keyboardkey sKey toggleButton enabledButton', transform: 'translate(-27%, 0%)', legend: 'TOGGLE<br/>STROKE' },
  { id: 'KeyD', dataKey: 'd', commandId: 'toggle-fill', row: 'a', className: 'keyboardkey dKey toggleButton enabledButton', transform: 'translate(-27%, 0%)', legend: 'TOGGLE<br/>FILL' },
  { id: 'KeyF', dataKey: 'f', commandId: 'sharp-point', row: 'a', className: 'keyboardkey fKey drawingButton', transform: 'translate(-27%, 0%)', legend: 'SHARP</br>POINT' },
  { id: 'KeyG', dataKey: 'g', commandId: 'spline-point', row: 'a', className: 'keyboardkey gKey drawingButton enabledButton', transform: 'translate(-27%, 0%)', legend: 'SPLINE<br/>POINT' },
  { id: 'KeyH', dataKey: 'h', commandId: 'rounded-point', row: 'a', className: 'keyboardkey hKey drawingButton', transform: 'translate(-27%, 0%)', legend: 'ROUNDED<br/>CORNER' },
  { id: 'KeyJ', dataKey: 'j', commandId: 'toggle-panel', row: 'a', className: 'keyboardkey jKey toggleButton enabledButton overlayToggle', transform: 'translate(-27%, 0%)', legend: 'PANEL<br/>TOGGLE' },
  { id: 'KeyK', dataKey: 'k', commandId: 'toggle-keyboard', row: 'a', className: 'keyboardkey kKey toggleButton enabledButton overlayToggle', transform: 'translate(-27%, 0%)', legend: 'KB<br/>TOGGLE' },
  { id: 'KeyL', dataKey: 'l', commandId: 'toggle-status', row: 'a', className: 'keyboardkey lKey toggleButton enabledButton overlayToggle statusToggle', transform: 'translate(-27%, 0%)', legend: 'STATUS<br/>TOGGLE', clickable: true },
  { id: 'Semicolon', dataKey: ';', commandId: 'rotate-ccw', row: 'a', className: 'keyboardkey semicolonKey operationButton enabledButton', transform: 'translate(-27%, 0%)', legend: 'ROTATE -' },
  { id: 'Quote', dataKey: "'", commandId: 'rotate-cw', row: 'a', className: 'keyboardkey  singleQuoteKey operationButton enabledButton', transform: 'translate(-27%, 0%)', legend: 'ROTATE +' },
  { id: 'Enter', dataKey: 'return', row: 'a', className: 'keyboardkey returnKey OtherKey hidden', transform: 'translate(-5%, 0%)', legend: 'RETURN' },
  { id: 'ShiftLeft', dataKey: 'shift', row: 'z', className: 'keyboardkey shiftKeyLeft OtherKey', legend: '' },
  { id: 'KeyZ', dataKey: 'z', commandId: 'pan-lock', row: 'z', className: 'keyboardkey KeyZ zKey drawingButton enabledButton', transform: 'translate(38%, 0%)', legend: 'PAN<br/>LOCK' },
  { id: 'KeyX', dataKey: 'x', commandId: 'select-rectangle', row: 'z', className: 'keyboardkey xKey drawingButton enabledButton', transform: 'translate(38%, 0%)', legend: 'SELECT<br/>RECT' },
  { id: 'KeyC', dataKey: 'c', commandId: 'stroke-thinner', row: 'z', className: 'keyboardkey cKey stepper1Decrement enabledButton', transform: 'translate(38%, 0%)', legend: '-<br />STROKE<br />WIDTH' },
  { id: 'KeyV', dataKey: 'v', commandId: 'stroke-thicker', row: 'z', className: 'keyboardkey vKey stepper1Increment enabledButton', transform: 'translate(38%, 0%)', legend: '+<br />STROKE<br />WIDTH' },
  { id: 'KeyB', dataKey: 'b', commandId: 'bowed-point', row: 'z', className: 'keyboardkey bKey drawingButton', transform: 'translate(38%, 0%)', legend: 'BOWED<br/>LINE' },
  { id: 'KeyN', dataKey: 'n', commandId: 'circle-radius', row: 'z', className: 'keyboardkey nKey drawingButton enabledButton circleButton', transform: 'translate(38%, 0%)', legend: 'CIRCLE<br/>BY RADIUS', badge: 'circle' },
  { id: 'KeyM', dataKey: 'm', commandId: 'circle-diameter', row: 'z', className: 'keyboardkey mKey drawingButton enabledButton circleButton', transform: 'translate(38%, 0%)', legend: 'CIRCLE<br/>BY DIAMETER', badge: 'circle' },
  { id: 'Comma', dataKey: ',', commandId: 'radial-stamp', row: 'z', className: 'keyboardkey commaKey drawingButton enabledButton circleButton', transform: 'translate(38%, 0%)', legend: 'RADIAL<br/>STAMP', badge: 'circle' },
  { id: 'Period', dataKey: '.', commandId: 'arc-three-point', row: 'z', className: 'keyboardkey periodKey drawingButton', transform: 'translate(38%, 0%)', legend: 'ARC<br/>3-PT' },
  { id: 'Slash', dataKey: '/', commandId: 'grid-toggle', row: 'z', className: 'keyboardkey forwardSlashKey OtherKey enabledButton', transform: 'translate(38%, 0%)', legend: 'GRID<br/>TOGGLE' },
  { id: 'ShiftRight', dataKey: 'shift', row: 'z', className: 'keyboardkey shiftKeyRight OtherKey', transform: 'translate(15%, 0%)', legend: '' },
  { id: 'Space', dataKey: 'spacebar', commandId: 'drag-lock', row: 'space', className: 'keyboardkey spacebarKey OtherKey enabledButton selectionButton', legend: 'DRAG LOCK' },
];

// Clothoid (Spiro-vocabulary) point commands for the clothoid layout.
// Deposits are live through PathDrawingSession + sampleClothoid. They
// resolve through the layout registry like the spline commands; the
// clothoid layout activates while a clothoid session draws, or through
// the manual clothoid-layout key (see engine.activeKeyboardLayoutId).
function clothoidPoint(id: string, keycap: string, key: string, help: string): KeyCommand {
  return {
    id, action: `${id}-deposit`, keycap, group: 'neutral',
    help,
    match: letter(key),
    available: compositeReady,
    exclusive: true,
  };
}
export const CLOTHOID_COMMANDS: KeyCommand[] = [
  clothoidPoint('clothoid-g4', 'S', 's', 'G4 point: gentle curve'),
  clothoidPoint('clothoid-g2', 'D', 'd', 'G2 point: curvature-continuous curve'),
  clothoidPoint('clothoid-corner', 'F', 'f', 'Corner point: abrupt direction change'),
  clothoidPoint('clothoid-line', 'G', 'g', 'Line point: zero-curvature run'),
  clothoidPoint('clothoid-prev-constraint', 'W', 'w', 'Previous constraint: curve into straight'),
  clothoidPoint('clothoid-next-constraint', 'E', 'e', 'Next constraint: straight into curve'),
  {
    id: 'clothoid-stamp', action: 'stamp', keycap: 'B', group: 'neutral',
    help: 'Stamp the preview or the selection',
    match: letter('b'), available: always, exclusive: false,
  },
];

// Clothoid caps: base board with the Spiro-vocabulary legends. Only caps
// carrying a clothoid command get a new commandId; the rest share base caps.
const CLOTHOID_CAP_COMMANDS: Record<string, string> = {
  KeyS: 'clothoid-g4', KeyD: 'clothoid-g2', KeyF: 'clothoid-corner',
  KeyG: 'clothoid-line', KeyW: 'clothoid-prev-constraint', KeyE: 'clothoid-next-constraint',
  KeyZ: 'erase-last-point', KeyB: 'clothoid-stamp',
};
const CLOTHOID_CAP_LEGENDS: Record<string, string> = {
  KeyS: 'G4<br/>POINT', KeyD: 'G2<br/>POINT', KeyF: 'CORNER<br/>POINT',
  KeyG: 'LINE<br/>POINT', KeyW: 'PREV<br/>CONSTRAINT', KeyE: 'NEXT<br/>CONSTRAINT',
  KeyZ: 'ERASE<br/>LAST', KeyB: 'STAMP',
};
export const CLOTHOID_CAPS: KeyCap[] = KEY_CAPS.map((cap) => {
  const commandId = CLOTHOID_CAP_COMMANDS[cap.id] ?? cap.commandId;
  const legend = CLOTHOID_CAP_LEGENDS[cap.id] ?? cap.legend;
  if (commandId === cap.commandId && legend === cap.legend) return cap;
  return { ...cap, commandId, legend };
});

/** The layout registry. Base is today's keymap, unchanged; the
 * spline layout adds the FMStroke session keys on top of it and the
 * clothoid layout adds the Spiro-vocabulary point keys. */
export const KEYBOARD_LAYOUTS: KeyboardLayoutDef[] = [
  { id: 'base', label: 'Base', commands: KEY_COMMANDS, caps: [] },
  {
    id: 'spline',
    label: 'Spline',
    commands: SPLINE_COMMANDS,
    caps: [
      { id: 'Backslash', dataKey: '\\', commandId: 'switch-rounding', row: 'q', className: 'keyboardkey  backslashKey drawingButton', legend: 'ROUNDING<br/>TYPE' },
    ],
  },
  {
    id: 'clothoid',
    label: 'Clothoid',
    commands: [...CLOTHOID_COMMANDS, eraseLastPointCommand],
    caps: CLOTHOID_CAPS,
  },
];

export function keyboardLayoutById(id: string | undefined): KeyboardLayoutDef {
  return KEYBOARD_LAYOUTS.find((l) => l.id === id) ?? KEYBOARD_LAYOUTS[0];
}

/** The cap set a layout renders: base caps with the layout's
 * overrides merged in by cap id. Base returns KEY_CAPS itself. */
export function capsForLayout(id: string | undefined): KeyCap[] {
  const layout = keyboardLayoutById(id);
  if (!layout.caps.length) return KEY_CAPS;
  const overrides = new Map(layout.caps.map((cap) => [cap.id, cap]));
  const merged = KEY_CAPS.map((cap) => overrides.get(cap.id) ?? cap);
  for (const cap of layout.caps) if (!KEY_CAPS.some((c) => c.id === cap.id)) merged.push(cap);
  return merged;
}

export function commandById(id: string): KeyCommand | undefined {
  for (const layout of KEYBOARD_LAYOUTS) {
    const found = layout.commands.find((c) => c.id === id);
    if (found) return found;
  }
  return undefined;
}

export function keyGroupForLabel(label: string): StatusKeyGroup {
  const k = label.toLowerCase();
  const cmd = KEYBOARD_LAYOUTS.flatMap((l) => l.commands).find(
    (c) => !c.alias && c.keycap.toLowerCase() === k,
  );
  return cmd?.group ?? 'neutral';
}

export function commandKeycap(id: string): string {
  return commandById(id)?.keycap ?? id;
}

/** Chord commands hidden from the keys table while the hide-common flag is
 * on: universally known shortcuts that would otherwise crowd the widget. */
export const COMMON_KEYMAP_IDS = ['undo', 'redo', 'cut', 'copy', 'paste'];

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
    isTypingText: false,
    isInDragLock: false,
    liveAdjustApplies: false,
    isTransformMode: false,
  };
  const code = event.code || codeForLabel(event.key);
  for (const variant of KEY_VARIANTS) {
    if (variant.command.owner !== 'app' || variant.code !== code) continue;
    const chord = variant.chord;
    if (chord.shift !== event.shiftKey || chord.alt !== event.altKey ||
      chord.control !== event.ctrlKey || chord.meta !== event.metaKey) continue;
    if (variant.when(keyState)) return variant.commandId;
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
    isTypingText: false,
    isInDragLock: false,
    liveAdjustApplies: false,
    isTransformMode: false,
  });
}


export type KeyboardPlatform = 'mac' | 'other';
export function keyboardPlatform(): KeyboardPlatform {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? 'mac' : 'other';
}

export function primaryShortcut(key: string, shift = false, platform = keyboardPlatform()): string {
  return `${platform === 'mac' ? '⌘' : 'Ctrl'}+${shift ? 'Shift+' : ''}${key}`;
}

/** Alt/Option shortcut label: ⌥ on macOS/iOS, Alt+ elsewhere. */
export function optShortcut(key: string, platform = keyboardPlatform()): string {
  return `${platform === 'mac' ? '⌥' : 'Alt+'}${key}`;
}

// The values here are used by commands AND legends; modifiers never change
// stroke-width/centerline steps. Shift wins over Alt for scale/rotation,
// while nudge combines them, preserving the established physical behavior.
export function scaleFactor(chord: Pick<ModifierChord, 'shift' | 'alt'>, dir: -1 | 1): number {
  return chord.shift ? (dir < 0 ? 0.8 : 1.25) : chord.alt ? (dir < 0 ? 0.98 : 1.02) : (dir < 0 ? 0.9 : 1.1);
}
export function rotationStep(chord: Pick<ModifierChord, 'shift' | 'alt'>): number {
  return chord.shift ? 45 : chord.alt ? 5 : 10;
}
export function nudgeStep(chord: Pick<ModifierChord, 'shift' | 'alt'>): number {
  return (chord.shift ? 10 : 1) * (chord.alt ? 0.2 : 1);
}

const PUNCTUATION: Record<string, string> = {
  BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'",
  Comma: ',', Period: '.', Slash: '/', Space: ' ', Digit0: '0', Minus: '-', Equal: '=',
};
export function physicalKey(code: string): string {
  return PUNCTUATION[code] ?? (code.startsWith('Key') ? code.slice(3).toLowerCase() : code);
}
function codeForLabel(label: string): string {
  if (/^[a-z]$/i.test(label)) return `Key${label.toUpperCase()}`;
  return Object.keys(PUNCTUATION).find((code) => PUNCTUATION[code] === label) ?? label;
}

export interface KeyCommandVariant {
  code: string;
  chord: ModifierChord;
  commandId: string;
  command: KeyCommand;
  when: (state: KeyState) => boolean;
  present: (state: KeyState, chord: ModifierSnapshot, platform: KeyboardPlatform) => {
    legend: string; description: string; group: StatusKeyGroup;
  };
}

function presentation(command: KeyCommand, code: string, state: KeyState, chord: ModifierSnapshot, platform: KeyboardPlatform, caps: KeyCap[] = KEY_CAPS) {
  const cap = caps.find((cap) => cap.commandId === command.id);
  let legend = cap?.legend || command.help.toUpperCase();
  let description = command.help;
  const dir = code === 'BracketLeft' || code === 'Semicolon' ? -1 : 1;
  if (command.action === 'brackets') {
    if (state.isDrawingShape && state.shapeType === 'rectangle_centerline') {
      legend = `WIDTH ${dir < 0 ? '−' : '+'}2 PT`;
      description = `Adjust centerline width by ${dir * 2} pt`;
    } else {
      const factor = scaleFactor(chord, dir);
      legend = `SCALE ×${factor}`;
      description = `Scale ${state.isLiveDrawing && state.liveAdjustApplies ? 'live drawing' : 'selection'} by ${factor}`;
    }
  } else if (command.action === 'rotate') {
    legend = `ROTATE ${dir < 0 ? '−' : '+'}${rotationStep(chord)}°`;
    description = `Rotate ${state.isLiveDrawing && state.liveAdjustApplies ? 'live drawing' : 'selection'} by ${dir * rotationStep(chord)}°`;
  } else if (command.action === 'nudge') {
    legend = `NUDGE ${nudgeStep(chord)} PT`;
    description = `Nudge selection ${nudgeStep(chord)} pt`;
  } else if (command.action === 'group') {
    legend = chord.shift ? 'UNGROUP' : 'GROUP';
    description = `${legend} selection (${primaryShortcut('G', chord.shift, platform)})`;
  } else if (command.action === 'undo' || command.action === 'redo') {
    legend = command.help.toUpperCase();
    description = `${command.help} (${primaryShortcut(code.slice(3), chord.shift, platform)})`;
  } else if (command.action === 'stroke-thinner' || command.action === 'stroke-thicker') {
    legend = `STROKE ${command.action === 'stroke-thinner' ? '−' : '+'}1 PT`;
  } else if (command.id === 'tension-down' || command.id === 'tension-up') {
    legend = `TENSION ${command.id === 'tension-down' ? '−' : '+'}0.1`;
  } else if (command.id === 'tension-reset') {
    legend = 'RESET TENSION';
  } else if (command.action === 'sharp-point' || command.action === 'spline-point') {
    description = `${state.isDrawingPath ? 'Add' : 'Start path with'} ${command.action === 'sharp-point' ? 'sharp' : state.isCompositePath ? 'B-spline' : 'spline'} point`;
    if (state.isCompositePath && command.action === 'spline-point') legend = 'B-SPLINE POINT';
  } else if (command.action === 'finish-drawing') {
    legend = command.id === 'finish-r' ? 'COMPLETE SHAPE' : 'END DRAWING';
  }
  return { legend, description, group: command.group };
}

// Canonical adjust actions: one entry per physical action, not per key.
// Dispatch variants, live bindings, and keymap rows all derive from these,
// so scale/rotate/tension keys are described in exactly one place.
export interface AdjustAction {
  /** Stable action id: 'scale' | 'rotate' | 'tension'. */
  id: string;
  /** Per-key command ids backing this action, in display order. */
  commandIds: string[];
  /** Keymap table label for the action. */
  label: string;
  /** Keymap table section for the action's row. */
  section: 'guide' | 'adjust';
  /** When the action applies; shared by dispatch, live bindings, and rows. */
  when: (state: KeyState) => boolean;
}

export const ADJUST_ACTIONS: AdjustAction[] = [
  {
    id: 'scale',
    commandIds: ['scale-down', 'scale-up'],
    label: 'Scale',
    section: 'adjust',
    when: (s) =>
      s.shapeType !== 'rectangle_select' &&
      ((s.isDrawingShape && s.shapeType === 'rectangle_centerline') ||
        (s.isLiveDrawing && s.liveAdjustApplies) ||
        s.selectedCount > 0),
  },
  {
    id: 'rotate',
    commandIds: ['rotate-ccw', 'rotate-cw'],
    label: 'Rotate',
    section: 'adjust',
    when: (s) =>
      s.shapeType !== 'rectangle_select' &&
      ((s.isLiveDrawing && s.liveAdjustApplies) || s.selectedCount > 0),
  },
  {
    id: 'tension',
    commandIds: ['tension-down', 'tension-up', 'tension-reset'],
    label: 'Adjust tension',
    section: 'guide',
    when: (s) => s.isDrawingPath && !s.isCompositePath,
  },
];

export function adjustActionForCommand(id: string): AdjustAction | undefined {
  return ADJUST_ACTIONS.find((a) => a.commandIds.includes(id));
}

// Compile ordered commands into exact typed physical chords. Both
// dispatch and presentation consume this registry. No browser Event is needed
// to resolve a layout, and Option-produced characters cannot move a keycap.
// Only commands that require a primary modifier may claim browser shortcuts.
// Compilation is per layout (Phase 1.5): the base list is exactly what
// it was before layouts existed, and each other layout compiles its own
// commands ahead of the base set over its merged caps — same size class
// as the base compile, paid once per registered layout at startup.
function compileKeyVariants(commands: KeyCommand[], caps: KeyCap[]): KeyCommandVariant[] {
  const variants: KeyCommandVariant[] = [];
  const variantCodes = [...new Set([
    ...caps.map((cap) => cap.id), 'Digit0', 'Minus', 'Equal', 'Escape', 'Backspace',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  ])];
  for (const command of commands) {
    const adjust = adjustActionForCommand(command.id);
    const when = adjust ? adjust.when
      : command.action === 'nudge' ? (state: KeyState) => idle(state) && state.selectedCount > 0
      : command.id === 'radial-lock' ? (state: KeyState) => state.isDrawingShape && state.shapeType === 'circle_radial_stamp'
      : command.available;
    for (const code of variantCodes) {
      for (let bits = 0; bits < 16; bits++) {
        const chord = Object.freeze({ shift: !!(bits & 1), alt: !!(bits & 2), control: !!(bits & 4), meta: !!(bits & 8) });
        const event = { code, key: physicalKey(code), shiftKey: chord.shift, altKey: chord.alt, ctrlKey: chord.control, metaKey: chord.meta } as KeyboardEvent;
        if (!command.match(event)) continue;
        if (chord.control || chord.meta) {
          // Unregistered primary chords must retain browser/native behavior.
          if (chord.alt || (chord.control && chord.meta) || command.match({ ...event, ctrlKey: false, metaKey: false } as KeyboardEvent)) continue;
        }
        variants.push({ code, chord, commandId: command.id, command, when,
          present: (state, modifiers, platform) => presentation(command, code, state, modifiers, platform, caps),
        });
      }
    }
  }
  return variants;
}

export const KEY_VARIANTS: KeyCommandVariant[] = compileKeyVariants(KEY_COMMANDS, KEY_CAPS);

/** Variant lists per layout id; 'base' is KEY_VARIANTS itself. */
export const KEY_VARIANTS_BY_LAYOUT: Record<string, KeyCommandVariant[]> = { base: KEY_VARIANTS };
for (const layout of KEYBOARD_LAYOUTS) {
  if (layout.id === 'base') continue;
  KEY_VARIANTS_BY_LAYOUT[layout.id] = compileKeyVariants(
    [...layout.commands, ...KEY_COMMANDS], capsForLayout(layout.id),
  );
}

export function keyVariantsForLayout(id: string | undefined): KeyCommandVariant[] {
  return KEY_VARIANTS_BY_LAYOUT[id ?? 'base'] ?? KEY_VARIANTS;
}
