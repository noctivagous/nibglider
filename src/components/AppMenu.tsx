// Application menu bar. Renders menu definitions (PanelsManager
// APPLICATION_MENUS) as dropdown menus; items dispatch through onCommand and
// items without a wired handler render disabled. Owns its open-menu,
// row-focus, and submenu state: mouse hover and arrow keys share one
// `focused` highlight (accent-soft, like the rail's CustomSelect), Enter
// activates, Escape closes, Left/Right move between menus. Rows whose
// command is in checkedCommands carry a check glyph (toggle and option
// state); rows with children expand into a flyout submenu. Moving onto a
// row that is not that parent or one of its options closes the flyout
// (a leaf under the last parent must not leave it open). Tested indirectly
// through App wiring; menu defs from tests/ui-state.test.mjs, stepping rules
// from tests/menu-navigation.test.mjs.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { MenuDef, MenuItemDef } from '../ui/PanelsManager';
import { stepFocus, submenuForRow } from '../ui/menuNavigation';
import { SnapNumInput } from './ControlPanel';

/** Live numeric field hosted inside a menu option row (e.g. snap steps). */
export interface MenuNumberField {
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  label: string;
}

/** One choice in a segmented control hosted at the top of a submenu
 * (e.g. Export Raster formats). Disabled options stay visible so users
 * learn the option exists before it is available. */
export interface MenuSegmentOption {
  value: string;
  label: string;
  disabled?: boolean;
  title?: string;
}

/** Segmented format control hosted at the top of a submenu, keyed by the
 * parent command id. Selecting a segment never dispatches or closes. */
export interface MenuSegmentField {
  value: string;
  options: MenuSegmentOption[];
  label: string;
}

/** Live panel-section state for a menu's bottom Panel toggle group. */
export interface MenuPanelSection {
  id: string;
  label: string;
  hidden: boolean;
  collapsed: boolean;
}

export type PanelSectionAction = 'toggle-show' | 'toggle-expand';

function commandLabel(commandId: string): string {
  return commandId
    .split('-')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

// Menu glyphs, mirroring the vertical rail's card icons (ControlPanel)
// so the horizontal menu carries the same artwork to the left of each label.
function MenuGlyph({ children, size = 15 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

// Panel-section artwork reused verbatim: the shape thumbs and combinatorics
// buttons draw in a 16x14 box, the snap toggles in a 12x12 box. Separate
// wrappers keep the original coordinates instead of rescaling into 24x24.
function Thumb1614({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 14"
      width="15"
      height="13"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function Thumb1212({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="13"
      height="13"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.5 5.5 L4 8 L8.5 2.5" />
    </svg>
  );
}

const MENU_ICONS: Record<string, ReactNode> = {
  open: (
    <MenuGlyph>
      <path d="M3 7 h6 l2 2 h10 v9 H3 Z" />
      <path d="M3 7 v10" />
    </MenuGlyph>
  ),
  new: (
    <MenuGlyph>
      <path d="M7 3 h7 l4 4 v14 H7 Z" />
      <path d="M12 11 v6 M9 14 h6" />
    </MenuGlyph>
  ),
  save: (
    <MenuGlyph>
      <path d="M5 4 h11 l3 3 v13 H5 Z" />
      <path d="M8 4 v5 h7 V4" />
      <path d="M8 20 v-6 h8 v6" />
    </MenuGlyph>
  ),
  rename: (
    <MenuGlyph>
      <path d="M4 20 l1 -4 L16 5 l3 3 L8 19 Z" />
      <path d="M14 7 l3 3" />
    </MenuGlyph>
  ),
  export: (
    <MenuGlyph>
      <path d="M4 14 v6 h16 v-6" />
      <path d="M12 3 v10 M8 7 l4 -4 4 4" />
    </MenuGlyph>
  ),
  import: (
    <MenuGlyph>
      <path d="M4 14 v6 h16 v-6" />
      <path d="M12 4 v10 M8 10 l4 4 4 -4" />
    </MenuGlyph>
  ),
  tutorial: (
    <MenuGlyph>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5 l6 3.5 -6 3.5 Z" />
    </MenuGlyph>
  ),
  settings: (
    <MenuGlyph>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.5 v4 M12 17.5 v4 M2.5 12 h4 M17.5 12 h4" />
    </MenuGlyph>
  ),
  undo: (
    <MenuGlyph>
      <path d="M4 9 h11 a5 5 0 0 1 0 10 h-9" />
      <path d="M8 5 L4 9 l4 4" />
    </MenuGlyph>
  ),
  redo: (
    <MenuGlyph>
      <path d="M20 9 H9 a5 5 0 0 0 0 10 h9" />
      <path d="M16 5 l4 4 -4 4" />
    </MenuGlyph>
  ),
  cut: (
    <MenuGlyph>
      <circle cx="6" cy="6.5" r="2.5" />
      <circle cx="6" cy="17.5" r="2.5" />
      <path d="M8 7.5 L20 19 M8 16.5 L20 5" />
    </MenuGlyph>
  ),
  copy: (
    <MenuGlyph>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 5 V4 H4 v11 h1" />
    </MenuGlyph>
  ),
  paste: (
    <MenuGlyph>
      <rect x="5" y="5" width="14" height="16" rx="2" />
      <rect x="9" y="2.5" width="6" height="4" rx="1" />
      <path d="M9 12 h6 M9 16 h6" />
    </MenuGlyph>
  ),
  duplicate: (
    <MenuGlyph>
      <rect x="3" y="7" width="8" height="10" />
      <rect x="13" y="7" width="8" height="10" />
    </MenuGlyph>
  ),
  delete: (
    <MenuGlyph>
      <path d="M4 7 h16 M9 7 V4 h6 v3 M6 7 l1 13 h10 l1 -13" />
      <path d="M10 11 v6 M14 11 v6" />
    </MenuGlyph>
  ),
  'select-all': (
    <MenuGlyph>
      <rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="3 2" />
      <path d="M9 9 h6 v6 h-6 Z" />
    </MenuGlyph>
  ),
  'page-size': (
    <MenuGlyph>
      <rect x="6" y="3" width="12" height="18" />
      <path d="M3 6 H1.5 M3 18 H1.5 M21 6 h1.5 M21 18 h1.5" />
    </MenuGlyph>
  ),
  'length-unit': (
    <MenuGlyph>
      <path d="M3 17 L17 3 l4 4 L7 21 Z" />
      <path d="M8 16 l1.5 1.5 M11 13 l1.5 1.5 M14 10 l1.5 1.5" />
    </MenuGlyph>
  ),
  'reset-zoom': (
    <MenuGlyph>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15.5 15.5 L21 21" />
      <path d="M10.5 8.5 v4 M8.5 10.5 h4" />
    </MenuGlyph>
  ),
  'toggle-panel': (
    <MenuGlyph>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9.5 4 v16" />
    </MenuGlyph>
  ),
  'toggle-keyboard': (
    <MenuGlyph>
      <rect x="2.5" y="7" width="19" height="11" rx="2" />
      <path d="M6 11 h1 M10 11 h1 M14 11 h1 M18 11 h1 M7 14.5 h10" />
    </MenuGlyph>
  ),
  'toggle-status': (
    <MenuGlyph>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M12 8 v.5 M12 11.5 V16" />
    </MenuGlyph>
  ),
  'rect-shape': (
    <MenuGlyph>
      <rect x="5" y="7" width="14" height="10" />
    </MenuGlyph>
  ),
  'circle-shape': (
    <MenuGlyph>
      <circle cx="12" cy="12" r="8" />
    </MenuGlyph>
  ),
  combinatorics: (
    <MenuGlyph>
      <circle cx="9" cy="12" r="6" />
      <circle cx="15" cy="12" r="6" />
    </MenuGlyph>
  ),
  snapping: (
    <MenuGlyph>
      <path d="M7 4 v6 a5 5 0 0 0 10 0 V4" />
      <path d="M7 7 h4 M13 7 h4" />
    </MenuGlyph>
  ),
  'text-mode': (
    <MenuGlyph>
      <path d="M5 5 h14 M12 5 v14" />
    </MenuGlyph>
  ),
  'repeat-grid': (
    <MenuGlyph>
      <rect x="4" y="4" width="6" height="6" />
      <rect x="14" y="4" width="6" height="6" />
      <rect x="4" y="14" width="6" height="6" />
      <rect x="14" y="14" width="6" height="6" />
    </MenuGlyph>
  ),
  'repeat-circle': (
    <MenuGlyph>
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="12" cy="4.5" r="1" />
      <circle cx="19.5" cy="12" r="1" />
      <circle cx="12" cy="19.5" r="1" />
      <circle cx="4.5" cy="12" r="1" />
    </MenuGlyph>
  ),
  'scale-dialog': (
    <MenuGlyph>
      <path d="M4 9 V4 h5 M15 4 h5 v5 M20 15 v5 h-5 M9 20 H4 v-5" />
      <path d="M9 15 L15 9" />
    </MenuGlyph>
  ),
  'rotate-dialog': (
    <MenuGlyph>
      <path d="M20 12 a8 8 0 1 1 -2.5 -5.8" />
      <path d="M18 3.5 V8 h-4.5" />
    </MenuGlyph>
  ),
  select: (
    <MenuGlyph>
      <path d="M6 3 L18 12 l-7 1 -2.5 7 Z" />
    </MenuGlyph>
  ),
  'bring-to-front': (
    <MenuGlyph>
      <path d="M4 14 l8 -6 8 6 M4 19 l8 -6 8 6" />
    </MenuGlyph>
  ),
  'send-to-back': (
    <MenuGlyph>
      <path d="M4 5 l8 6 8 -6 M4 10 l8 6 8 -6" />
    </MenuGlyph>
  ),
  group: (
    <MenuGlyph>
      <rect x="3" y="10" width="9" height="9" />
      <rect x="12" y="5" width="9" height="9" />
    </MenuGlyph>
  ),
  ungroup: (
    <MenuGlyph>
      <rect x="2" y="8" width="8" height="8" />
      <rect x="14" y="8" width="8" height="8" />
    </MenuGlyph>
  ),
  'reset-settings': (
    <MenuGlyph>
      <path d="M4 12 a8 8 0 1 0 2.34 5.66" />
      <path d="M4 20.5 V16 h4.5" />
    </MenuGlyph>
  ),
  // Shape silhouettes from the panel's Circle/Rect Keys custom selects.
  'shape-circle': (
    <Thumb1614>
      <circle cx="8" cy="7" r="5" />
    </Thumb1614>
  ),
  'shape-semicircle': (
    <Thumb1614>
      <path d="M3 9.5 A5 5 0 0 1 13 9.5 Z" />
    </Thumb1614>
  ),
  'shape-sector': (
    <Thumb1614>
      <path d="M8 7 L11.8 3.2 A5.4 5.4 0 0 1 11.8 10.8 Z" />
    </Thumb1614>
  ),
  'shape-segment': (
    <Thumb1614>
      <circle cx="8" cy="7" r="5" />
      <path d="M3.6 9.6 H12.4" />
    </Thumb1614>
  ),
  'shape-polygon': (
    <Thumb1614>
      <path d="M8 1.8 L12.4 4.4 V9.6 L8 12.2 L3.6 9.6 V4.4 Z" />
    </Thumb1614>
  ),
  'shape-supershape': (
    <Thumb1614>
      <path d="M8 1.2 C8.8 4.8 10 6 13.8 7 C10 8 8.8 9.2 8 12.8 C7.2 9.2 6 8 2.2 7 C6 6 7.2 4.8 8 1.2 Z" />
    </Thumb1614>
  ),
  'shape-trapezoid': (
    <Thumb1614>
      <path d="M4.2 11.5 L6 2.8 H10 L11.8 11.5 Z" />
    </Thumb1614>
  ),
  'shape-parallelogram': (
    <Thumb1614>
      <path d="M6.8 2.8 H13 L9.2 11.2 H3 Z" />
    </Thumb1614>
  ),
  'shape-rightTriangle': (
    <Thumb1614>
      <path d="M4.5 2.8 V11.2 H11.5 Z" />
    </Thumb1614>
  ),
  'shape-rhombus': (
    <Thumb1614>
      <path d="M8 1.8 L12.8 7 L8 12.2 L3.2 7 Z" />
    </Thumb1614>
  ),
  'shape-kite': (
    <Thumb1614>
      <path d="M8 1.5 L11 6.5 L8 12.5 L5 6.5 Z" />
    </Thumb1614>
  ),
  'shape-rectangle': (
    <Thumb1614>
      <path d="M2.8 3.2 H13.2 V10.8 H2.8 Z" />
    </Thumb1614>
  ),
  'shape-exportFrame': (
    <Thumb1614>
      <path d="M2.8 3.2 H13.2 V10.8 H2.8 Z" strokeDasharray="2.2 1.6" />
    </Thumb1614>
  ),
  // Snapping artwork from the panel's snap toggle buttons.
  'snap-grid': (
    <Thumb1212>
      <circle cx="2.5" cy="2.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="6" cy="2.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="2.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="6" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="9.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="6" cy="9.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="9.5" r="1.1" fill="currentColor" stroke="none" />
    </Thumb1212>
  ),
  'snap-path': (
    <Thumb1212>
      <path d="M1.5 9 C4 9 4 3.5 6.5 3.5 S9.5 6 10.5 6" />
      <circle cx="1.5" cy="9" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
    </Thumb1212>
  ),
  'snap-points': (
    <Thumb1212>
      <path d="M2 9.5 L6 4 L10 7" />
      <circle cx="2" cy="9.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="6" cy="4" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="10" cy="7" r="1.2" fill="currentColor" stroke="none" />
    </Thumb1212>
  ),
  'snap-angle': (
    <Thumb1212>
      <path d="M1.5 10.5 H10.5 M1.5 10.5 L8.5 2" />
      <path d="M4.8 10.5 A3.4 3.4 0 0 0 4.2 7.6" />
    </Thumb1212>
  ),
  'snap-length': (
    <Thumb1212>
      <path d="M2 6 H10 M2 6 L4 4 M2 6 L4 8 M10 6 L8 4 M10 6 L8 8" />
    </Thumb1212>
  ),
  'snap-aspect': (
    <Thumb1212>
      <path d="M1 2.5 H11 V9.5 H1 Z M6 2.5 V9.5" />
    </Thumb1212>
  ),
  // Combinatorics artwork from the panel's combine-mode buttons.
  'combinatorics-none': (
    <Thumb1614>
      <circle cx="8" cy="7" r="3.6" />
      <path d="M5.5 9.5 L10.5 4.5" />
    </Thumb1614>
  ),
  'combinatorics-union': (
    <Thumb1614>
      <circle cx="6" cy="7" r="3.6" />
      <circle cx="10" cy="7" r="3.6" />
    </Thumb1614>
  ),
  'combinatorics-subtract': (
    <Thumb1614>
      <circle cx="6" cy="7" r="3.6" />
      <circle cx="10" cy="7" r="3.6" strokeDasharray="2 1.4" opacity="0.55" />
    </Thumb1614>
  ),
  'combinatorics-intersect': (
    <Thumb1614>
      <path d="M6 3.4 A3.6 3.6 0 0 1 6 10.6 A3.6 3.6 0 0 1 6 3.4 Z M10 3.4 A3.6 3.6 0 0 0 10 10.6 A3.6 3.6 0 0 0 10 3.4 Z" />
    </Thumb1614>
  ),
  'combinatorics-crop': (
    <Thumb1614>
      <circle cx="8" cy="7" r="3.6" strokeDasharray="2 1.4" />
      <path d="M5.5 4.5 H10.5 V9.5 H5.5 Z" />
    </Thumb1614>
  ),
  'combinatorics-interlace': (
    <Thumb1614>
      <path d="M2 7 H14" />
      <path d="M8 2.2 V5.2" />
      <path d="M8 8.8 V11.8" />
    </Thumb1614>
  ),
  // Text modes have no panel artwork; ragged lines for Display,
  // justified lines for Body.
  'textmode-display': (
    <Thumb1614>
      <path d="M2.5 3.5 h11 M2.5 7 h11 M2.5 10.5 h7" />
    </Thumb1614>
  ),
  'textmode-body': (
    <Thumb1614>
      <path d="M2.5 3.5 h11 M2.5 7 h11 M2.5 10.5 h11" />
    </Thumb1614>
  ),
  // Image menu rows: picture frame, half-tone grayscale, flattened sheet,
  // and a trace path over a frame.
  image: (
    <MenuGlyph>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M3 17 l5 -4 4 3 3 -2 6 4" />
    </MenuGlyph>
  ),
  'image-grayscale': (
    <MenuGlyph>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4 a8 8 0 0 1 0 16 Z" fill="currentColor" stroke="none" />
    </MenuGlyph>
  ),
  'image-flatten': (
    <MenuGlyph>
      <rect x="4" y="3" width="16" height="12" rx="1" strokeDasharray="3 2" />
      <path d="M4 15 h16 v5 H4 Z" fill="currentColor" stroke="none" opacity="0.45" />
    </MenuGlyph>
  ),
  'image-trace': (
    <MenuGlyph>
      <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 2" />
      <path d="M6 16 C9 10 11 18 14 12 S17 8 18 8" />
      <circle cx="18" cy="8" r="1.2" fill="currentColor" stroke="none" />
    </MenuGlyph>
  ),
  filters: (
    <MenuGlyph>
      <path d="M4 7 h16 M4 17 h16" />
      <circle cx="9" cy="7" r="2.2" fill="currentColor" stroke="none" opacity="0.85" />
      <circle cx="15" cy="17" r="2.2" fill="currentColor" stroke="none" opacity="0.85" />
    </MenuGlyph>
  ),
};

/** Glyphs for the top-level menu triggers, left of each title in the bar. */
const TRIGGER_ICONS: Record<string, ReactNode> = {
  file: (
    <MenuGlyph size={13}>
      <path d="M6 3 h8 l4 4 v14 H6 Z" />
      <path d="M14 3 v4 h4" />
    </MenuGlyph>
  ),
  edit: (
    <MenuGlyph size={13}>
      <path d="M4 20 l1 -4 L16 5 l3 3 L8 19 Z" />
      <path d="M14 7 l3 3" />
    </MenuGlyph>
  ),
  image: (
    <MenuGlyph size={13}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M3 17 l5 -4 4 3 3 -2 6 4" />
    </MenuGlyph>
  ),
  document: (
    <MenuGlyph size={13}>
      <rect x="5" y="3" width="14" height="18" rx="1" />
      <path d="M8 8 h8 M8 12 h8 M8 16 h5" />
    </MenuGlyph>
  ),
  operations: (
    <MenuGlyph size={13}>
      <path d="M4 7 h16 M4 17 h16" />
      <circle cx="9" cy="7" r="2.2" />
      <circle cx="15" cy="17" r="2.2" />
    </MenuGlyph>
  ),
  modes: (
    <MenuGlyph size={13}>
      <rect x="3" y="6" width="18" height="12" rx="6" />
      <circle cx="15" cy="12" r="3" />
    </MenuGlyph>
  ),
  layers: (
    <MenuGlyph size={13}>
      <path d="M12 3 l9 5 -9 5 -9 -5 Z" />
      <path d="M3 13 l9 5 9 -5" />
    </MenuGlyph>
  ),
  debug: (
    <MenuGlyph size={13}>
      <circle cx="12" cy="13" r="6" />
      <path d="M12 7 V4 M8 9 L5 6 M16 9 l3 -3 M6 13 H3 M21 13 h-3 M8 17 l-3 3 M16 17 l3 3" />
    </MenuGlyph>
  ),
  help: (
    <MenuGlyph size={13}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5 a2.5 2.5 0 1 1 3.6 2.2 c-.9.4-1.1 1-1.1 1.8" />
      <path d="M12 17 v.5" />
    </MenuGlyph>
  ),
};

/** No checked rows; default so callers without live state pass nothing. */
const NO_CHECKS: Set<string> = new Set();

function rowId(menuId: string, commandId: string): string {
  return `appmenu-${menuId}-${commandId}`;
}

interface MenuRow {
  item: MenuItemDef;
  parent: MenuItemDef | null;
}

export default function AppMenu({
  menus,
  enabledCommands,
  checkedCommands = NO_CHECKS,
  labelOverrides,
  detailOverrides,
  onCommand,
  numberFields,
  onNumberCommit,
  segmentFields,
  onSegmentSelect,
  panelSections,
  onPanelSection,
}: {
  menus: MenuDef[];
  /** Commands with a wired handler; everything else renders disabled. */
  enabledCommands: Set<string>;
  /** Commands currently active; their rows carry a check glyph. */
  checkedCommands?: Set<string>;
  /** Live labels overriding the static XML (e.g. canvas dimensions). */
  labelOverrides?: Record<string, string>;
  /** Second-line detail under a row's label (e.g. export scope dims). */
  detailOverrides?: Record<string, string | undefined>;
  onCommand: (commandId: string) => void;
  /** Numeric inputs hosted in option rows, keyed by command id. */
  numberFields?: Record<string, MenuNumberField>;
  onNumberCommit?: (commandId: string, value: number) => void;
  /** Segmented controls hosted at the top of a submenu, keyed by the
   * parent command id. */
  segmentFields?: Record<string, MenuSegmentField>;
  onSegmentSelect?: (commandId: string, value: string) => void;
  /** Panel sections per menu id; menus in this map grow a bottom Panel group. */
  panelSections?: Record<string, MenuPanelSection[]>;
  onPanelSection?: (action: PanelSectionAction, sectionId: string) => void;
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState<number>(-1);
  const [openSub, setOpenSub] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());

  const openMenuTo = (menuId: string | null): void => {
    setOpenMenu(menuId);
    setFocusIdx(-1);
    setOpenSub(null);
  };

  // Live labels (canvas dimensions) win over the static menu definition.
  const labelFor = (item: MenuItemDef): string =>
    labelOverrides?.[item.commandId] ?? item.label ?? commandLabel(item.commandId);

  // Optional second line under a row's label (export scope dimensions).
  const detailFor = (item: MenuItemDef): string | undefined =>
    detailOverrides?.[item.commandId];
  const labelWithDetail = (item: MenuItemDef): ReactNode => {
    const detail = detailFor(item);
    if (!detail) return labelFor(item);
    return (
      <>
        {labelFor(item)}
        <span className="app-menu-detail">{detail}</span>
      </>
    );
  };

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) openMenuTo(null);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') openMenuTo(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu]);

  return (
    <div ref={barRef} className="app-menu-bar" role="menubar" aria-label="Application">
      {menus.map((menu, menuIndex) => {
        const isOpen = openMenu === menu.id;
        // Panel toggles for this menu: a bottom group with per-section
        // show/expand rows. Expand stays disabled while its section is hidden.
        const sections = onPanelSection ? (panelSections?.[menu.id] ?? []) : [];
        const panelChecked = (commandId: string): boolean => {
          for (const sec of sections) {
            if (commandId === `panel-show-${sec.id}`) return !sec.hidden;
            if (commandId === `panel-expand-${sec.id}`) return !sec.collapsed;
          }
          return false;
        };
        const effectiveEnabled = new Set(enabledCommands);
        for (const sec of sections) {
          effectiveEnabled.add(`panel-show-${sec.id}`);
          if (!sec.hidden) effectiveEnabled.add(`panel-expand-${sec.id}`);
        }
        // Visible rows: headers and items in order, with one submenu's
        // options spliced after their parent and the Panel group last.
        // focusIdx addresses this list. Spliced options shift every index
        // below them, so closing a flyout has to retarget by command id.
        const buildRows = (sub: string | null): MenuRow[] => {
          const list: MenuRow[] = [];
          for (const item of menu.items) {
            list.push({ item, parent: null });
            if (item.children && sub === item.commandId) {
              for (const child of item.children) list.push({ item: child, parent: item });
            }
          }
          if (sections.length > 0) {
            list.push({
              item: { commandId: `hdr-${menu.id}-panel`, label: 'Panel', header: true },
              parent: null,
            });
            for (const sec of sections) {
              list.push({ item: { commandId: `panel-show-${sec.id}`, label: `Show ${sec.label}` }, parent: null });
              list.push({ item: { commandId: `panel-expand-${sec.id}`, label: `Expand ${sec.label}` }, parent: null });
            }
          }
          return list;
        };
        const rows = buildRows(openSub);
        const rowItems = rows.map((row) => row.item);
        const placeHighlight = (commandId: string, sub: string | null): void => {
          const idx = buildRows(sub).findIndex((row) => row.item.commandId === commandId);
          setOpenSub(sub);
          setFocusIdx(idx);
        };
        const step = (from: number, dir: 1 | -1): void => {
          const next = stepFocus(rowItems, effectiveEnabled, from, dir);
          const row = rows[next];
          if (!row) {
            setFocusIdx(next);
            return;
          }
          const sub = submenuForRow(openSub, {
            commandId: row.item.commandId,
            parentId: row.parent?.commandId ?? null,
            hasChildren: !!row.item.children,
          }, 'keyboard');
          // Same flyout: the current index list still addresses this row.
          if (sub === openSub) {
            setFocusIdx(next);
            return;
          }
          placeHighlight(row.item.commandId, sub);
        };
        const activateRow = (rowIdx: number): void => {
          const row = rows[rowIdx];
          if (!row || row.item.header) return;
          if (row.item.commandId.startsWith('panel-show-') || row.item.commandId.startsWith('panel-expand-')) {
            if (!effectiveEnabled.has(row.item.commandId)) return;
            const sectionId = row.item.commandId.replace(/^panel-(show|expand)-/, '');
            openMenuTo(null);
            onPanelSection?.(
              row.item.commandId.startsWith('panel-show-') ? 'toggle-show' : 'toggle-expand',
              sectionId,
            );
            return;
          }
          if (row.parent === null && row.item.children) {
            // Parent rows expand; their own command never dispatches.
            setOpenSub(row.item.commandId);
            const firstChild = rows.findIndex((r) => r.parent === row.item);
            if (firstChild >= 0) setFocusIdx(firstChild);
            return;
          }
          if (!effectiveEnabled.has(row.item.commandId)) return;
          openMenuTo(null);
          onCommand(row.item.commandId);
        };
        const collapseSub = (): void => {
          const parentIdx = rows.findIndex((row) => row.parent === null && row.item.commandId === openSub);
          setOpenSub(null);
          setFocusIdx(parentIdx);
        };
        const focusedId = isOpen && focusIdx >= 0 && rows[focusIdx] && !rows[focusIdx].item.header
          ? rowId(menu.id, rows[focusIdx].item.commandId)
          : undefined;
        return (
        <div key={menu.id} className="app-menu">
          <button
            ref={(el) => {
              if (el) triggerRefs.current.set(menu.id, el);
              else triggerRefs.current.delete(menu.id);
            }}
            type="button"
            className={isOpen ? 'app-menu-trigger open' : 'app-menu-trigger'}
            data-tutorial-id={`menu-${menu.id}`}
            aria-haspopup="menu"
            aria-expanded={isOpen}
            aria-activedescendant={focusedId}
            aria-controls={isOpen ? `appmenu-dropdown-${menu.id}` : undefined}
            onClick={() => openMenuTo(isOpen ? null : menu.id)}
            onMouseEnter={() => {
              if (openMenu && !isOpen) openMenuTo(menu.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!isOpen) {
                  setOpenMenu(menu.id);
                  setFocusIdx(stepFocus(rowItems, effectiveEnabled, -1, e.key === 'ArrowDown' ? 1 : -1));
                } else {
                  step(focusIdx, e.key === 'ArrowDown' ? 1 : -1);
                }
              } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (isOpen && focusIdx >= 0) activateRow(focusIdx);
                else openMenuTo(menu.id);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                if (openSub !== null) collapseSub();
                else openMenuTo(null);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const row = focusIdx >= 0 ? rows[focusIdx] : null;
                if (e.key === 'ArrowRight' && row && row.parent === null && row.item.children && openSub !== row.item.commandId) {
                  activateRow(focusIdx);
                } else if (e.key === 'ArrowLeft' && row && row.parent !== null) {
                  collapseSub();
                } else {
                  const next = menus[(menuIndex + (e.key === 'ArrowRight' ? 1 : menus.length - 1)) % menus.length];
                  if (next) {
                    openMenuTo(next.id);
                    triggerRefs.current.get(next.id)?.focus();
                  }
                }
              }
            }}
          >
            <span className="app-menu-trigger-icon" aria-hidden="true">
              {TRIGGER_ICONS[menu.id] ?? null}
            </span>
            {menu.title}
          </button>
          {isOpen && (
            <div
              id={`appmenu-dropdown-${menu.id}`}
              className="app-menu-dropdown"
              role="menu"
              aria-label={menu.title}
              onMouseLeave={() => {
                setFocusIdx(-1);
                setOpenSub(null);
              }}
            >
              {rows.map((row, rowIdx) => {
                const { item } = row;
                if (item.header) {
                  return (
                    <div
                      key={item.commandId}
                      onMouseEnter={() => {
                        // Crossing a group label leaves the previous flyout.
                        // The parent row's index does not move when its
                        // options drop out, so the highlight can stay there.
                        if (openSub === null) return;
                        const parentIdx = rows.findIndex(
                          (candidate) => candidate.parent === null && candidate.item.commandId === openSub,
                        );
                        setOpenSub(null);
                        setFocusIdx(parentIdx);
                      }}
                    >
                      {rowIdx > 0 && <div className="app-menu-sep" role="separator" />}
                      <div className="app-menu-group" role="presentation">
                        <span>{item.label ?? commandLabel(item.commandId)}</span>
                      </div>
                    </div>
                  );
                }
                if (row.parent !== null) return null;
                const enabled = effectiveEnabled.has(item.commandId);
                const isParent = !!item.children;
                const expanded = openSub === item.commandId;
                // Parents stay clickable while unwired: their click expands.
                const clickable = enabled || isParent;
                const childIndexes = rows
                  .map((r, i) => ({ row: r, index: i }))
                  .filter(({ row: r }) => r.parent === item);
                return (
                  <div key={item.commandId} className="app-menu-parent">
                    <button
                      id={rowId(menu.id, item.commandId)}
                      type="button"
                      role="menuitem"
                      className={rowIdx === focusIdx ? 'app-menu-item focused' : 'app-menu-item'}
                      aria-disabled={!clickable}
                      aria-haspopup={isParent || undefined}
                      aria-expanded={isParent ? expanded : undefined}
                      tabIndex={-1}
                      onMouseEnter={() => {
                        const sub = submenuForRow(openSub, {
                          commandId: item.commandId,
                          parentId: null,
                          hasChildren: isParent,
                        }, 'pointer');
                        placeHighlight(item.commandId, sub);
                      }}
                      onClick={() => activateRow(rowIdx)}
                    >
                      <span className="app-menu-icon" aria-hidden="true">
                        {checkedCommands.has(item.commandId) || panelChecked(item.commandId)
                          ? <CheckGlyph />
                          : ((item.icon && MENU_ICONS[item.icon]) ?? null)}
                      </span>
                      <span className="app-menu-label">{labelWithDetail(item)}</span>
                      {item.shortcut && (
                        <span className="app-menu-shortcut">
                          <kbd>{item.shortcut}</kbd>
                        </span>
                      )}
                      {isParent && <span className="app-menu-caret" aria-hidden="true" />}
                    </button>
                    {expanded && (
                      <div className="app-menu-submenu" role="menu" aria-label={labelFor(item)}>
                        {segmentFields?.[item.commandId] && onSegmentSelect && (
                          <div
                            className="app-menu-segments"
                            role="group"
                            aria-label={segmentFields[item.commandId].label}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            {segmentFields[item.commandId].options.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={
                                  'app-menu-segment'
                                  + (segmentFields[item.commandId].value === option.value ? ' selected' : '')
                                  + (option.disabled ? ' unavailable' : '')
                                }
                                aria-pressed={segmentFields[item.commandId].value === option.value}
                                aria-disabled={option.disabled || undefined}
                                title={option.title}
                                tabIndex={-1}
                                onMouseEnter={() => setFocusIdx(rowIdx)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (option.disabled) return;
                                  onSegmentSelect(item.commandId, option.value);
                                }}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        )}
                        {childIndexes.map(({ row: childRow, index: childIdx }) => {
                          const childEnabled = effectiveEnabled.has(childRow.item.commandId);
                          const field = numberFields?.[childRow.item.commandId];
                          if (field && onNumberCommit) {
                            // Option rows hosting a numeric field: the button
                            // toggles the option, the input edits its value.
                            // Keystrokes stay inside the input so menu
                            // navigation never hijacks typing.
                            const fieldId = rowId(menu.id, childRow.item.commandId);
                            return (
                              <div
                                key={childRow.item.commandId}
                                className={childIdx === focusIdx ? 'app-menu-field focused' : 'app-menu-field'}
                                onMouseEnter={() => setFocusIdx(childIdx)}
                              >
                                <button
                                  id={fieldId}
                                  type="button"
                                  role="menuitem"
                                  className="app-menu-item app-menu-field-toggle"
                                  aria-disabled={!childEnabled}
                                  tabIndex={-1}
                                  onClick={() => activateRow(childIdx)}
                                >
                                  <span className="app-menu-icon" aria-hidden="true">
                                    {checkedCommands.has(childRow.item.commandId)
                                      ? <CheckGlyph />
                                      : ((childRow.item.icon && MENU_ICONS[childRow.item.icon]) ?? null)}
                                  </span>
                                  <span className="app-menu-label">
                                    {labelWithDetail(childRow.item)}
                                  </span>
                                </button>
                                <span onKeyDown={(e) => e.stopPropagation()}>
                                  <SnapNumInput
                                    label={field.label}
                                    value={field.value}
                                    min={field.min}
                                    max={field.max}
                                    step={field.step}
                                    disabled={field.disabled || !childEnabled}
                                    onCommit={(n) => onNumberCommit(childRow.item.commandId, n)}
                                  />
                                </span>
                              </div>
                            );
                          }
                          return (
                            <button
                              key={childRow.item.commandId}
                              id={rowId(menu.id, childRow.item.commandId)}
                              type="button"
                              role="menuitem"
                              className={childIdx === focusIdx ? 'app-menu-item focused' : 'app-menu-item'}
                              aria-disabled={!childEnabled}
                              tabIndex={-1}
                              onMouseEnter={() => setFocusIdx(childIdx)}
                              onClick={() => activateRow(childIdx)}
                            >
                              <span className="app-menu-icon" aria-hidden="true">
                                {checkedCommands.has(childRow.item.commandId)
                                  ? <CheckGlyph />
                                  : ((childRow.item.icon && MENU_ICONS[childRow.item.icon]) ?? null)}
                              </span>
                              <span className="app-menu-label">
                                {labelWithDetail(childRow.item)}
                              </span>
                              {childRow.item.shortcut && (
                                <span className="app-menu-shortcut">
                                  <kbd>{childRow.item.shortcut}</kbd>
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}
