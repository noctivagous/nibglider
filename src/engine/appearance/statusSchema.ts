// Status schema for the canvas overlay.
// Owns nothing. Reads the snapshot the engine passes in.
// Emits state (what is true) plus plain-text instruction steps. It carries
// no key references; keys live in the keymap table (see keymapSchema).
// Does not touch the DOM, modifiers, or undo labels.
// Public: buildStatusSchema.
// Tested from tests/ui-state.test.mjs. The ui module re-exports this file.

import type { StatusLine, StatusRun, StatusSchema } from '../types';
import type { CircleRadiusAnchor, GridType, RectDiagonalMode, ShapeType } from '../types';

export interface StatusSnapshot {
  selectedCount: number;
  gridEnabled: boolean;
  gridType: GridType;
  dropNote: string;
  dragLock: boolean;
  panLock: boolean;
  drawingPath: boolean;
  composite: boolean;
  cornerRadius: number;
  splineTension: number;
  drawingShape: boolean;
  shapeType: ShapeType | null;
  circleRadiusAnchor: CircleRadiusAnchor;
  radialStampLockedRadius: number | null;
  rectDiagonalMode: RectDiagonalMode;
  shapeWidth: number;
  aspectLabel: string | null;
  hasSecondEdge: boolean;
  drawingQuad: boolean;
  quadPointCount: number;
  liveHints: Array<{ label: string; keys: string[]; actionId?: string }>;
}

export function buildStatusSchema(snap: StatusSnapshot): StatusSchema {
  const T = (s: string): StatusRun => ({ t: 'text', s });
  const state: StatusLine[] = [];
  const steps: StatusLine[] = [];
  // True once the scale/rotate guidance moves to the keymap table; a
  // degree-ful live Rotate hint would restate it, so it is dropped below.
  let adjustCovered = false;
  const L = (kind: StatusLine['kind'], runs: StatusRun[]): StatusLine => ({ kind, runs });
  if (snap.gridEnabled) {
    state.push(L('meta', [
      T(`Grid: ON · ${snap.gridType === 'diamond' ? 'Diamond' : 'Square'}`),
    ]));
  }
  if (snap.dropNote) state.push(L('meta', [T(snap.dropNote)]));
  if (snap.selectedCount) {
    state.push(L('title', [T('Selected Objects: ' + snap.selectedCount)]));
    // Same idle-selection rule as the keymap rows: while the selection
    // marquee is live, its selection takes no scale/rotate/drag-lock keys.
    if (snap.dragLock === false && snap.shapeType !== 'rectangle_select') {
      steps.push(L('hint', [T('Begin Drag-Lock to move all selected.')]));
      steps.push(L('hint', [T('Scale or rotate the selection.')]));
      adjustCovered = true;
    }
  }
  if (snap.dragLock) {
    state.push(L('title', [T('Drag-Lock On ')]));
    steps.push(L('hint', [T('Move mouse to drag all selected. Release Drag-Lock to drop them.')]));
    steps.push(L('hint', [T('Stamp, scale, or rotate the selection.')]));
    adjustCovered = true;
  }
  if (snap.panLock) {
    state.push(L('title', [T('Pan-Lock On')]));
    steps.push(L('hint', [T('Move mouse to pan. Press any key to release.')]));
  }
  if (snap.drawingPath) {
    state.push(L('title', [T(snap.composite ? 'Drawing Composite Path' : 'Drawing Path')]));
    if (snap.composite) {
      steps.push(L('hint', [T('Add sharp, spline, or rounded points to the path.')]));
      steps.push(L('hint', [T(`Rounded corners use ${snap.cornerRadius}pt. Close the shape, end the drawing, or cancel.`)]));
    } else {
      steps.push(L('hint', [T('Move mouse to adjust path.')]));
      steps.push(L('hint', [T(
        'Add a sharp point, a spline point (tension ' + snap.splineTension.toFixed(1) + '), or complete the shape.',
      )]));
      steps.push(L('hint', [T('Adjust tension, or end the drawing.')]));
      steps.push(L('hint', [T('A near own start closes · A near a path end joins it')]));
    }
  }
  if (snap.drawingShape) {
    const shapeType = snap.shapeType;
    if (shapeType === 'circle_radius' || shapeType === 'circle_diameter') {
      const mode = shapeType === 'circle_radius' ? 'radius' : 'diameter';
      state.push(L('title', [T('Circle by (' + mode + ')')]));
      if (shapeType === 'circle_radius' && snap.circleRadiusAnchor !== 'origin') {
        state.push(L('meta', [T('Start: circumference')]));
      }
    } else if (shapeType === 'circle_radial_stamp') {
      state.push(L('title', [T('Circle Radial Stamp')]));
      if (snap.radialStampLockedRadius != null) {
        state.push(L('meta', [T(`Radius locked at ${Math.round(snap.radialStampLockedRadius)}pt`)]));
      }
    } else if (shapeType === 'rectangle_diagonal') {
      state.push(L('title', [T('Rectangle by Diagonal')]));
      if (snap.rectDiagonalMode !== 'full') {
        state.push(L('meta', [T(`Diagonal: ${snap.rectDiagonalMode} rect`)]));
      }
    } else if (shapeType === 'rectangle_two_edges') {
      state.push(L('title', [T('Rectangle by Two Edges')]));
    } else if (shapeType === 'rectangle_centerline') {
      state.push(L('title', [T('Rectangle by Centerline')]));
      state.push(L('meta', [T('Width: ' + Math.round(snap.shapeWidth) + 'pt')]));
    } else if (shapeType === 'rectangle_select') {
      state.push(L('title', [T('Selection Rectangle')]));
    }
    if (snap.aspectLabel) state.push(L('meta', [T('Aspect ' + snap.aspectLabel)]));
    if (shapeType != null && shapeType.startsWith('circle_')) {
      if (shapeType === 'circle_radial_stamp') {
        steps.push(L('hint', [T('Move mouse to orbit the origin. Stamp to deposit.')]));
        steps.push(L('hint', [T('Deposit and finish, or cancel.')]));
      } else {
        steps.push(L('hint', [T('Finish the circle, or stamp it.')]));
      }
    } else if (shapeType === 'rectangle_diagonal') {
      steps.push(L('hint', [T('Finish the rectangle, or stamp it.')]));
    } else if (shapeType === 'rectangle_two_edges') {
      if (!snap.hasSecondEdge) {
        steps.push(L('hint', [T('1. Move mouse to adjust this first edge.')]));
        steps.push(L('hint', [T('2. Start the second edge.')]));
      } else {
        steps.push(L('hint', [T('1. Move mouse to adjust the second edge.')]));
        steps.push(L('hint', [T('2. Finish the rectangle, or stamp it.')]));
      }
    } else if (shapeType === 'rectangle_centerline') {
      steps.push(L('hint', [T('1. Move mouse to adjust the rectangle.')]));
      steps.push(L('hint', [T('Thin or thicken the width.')]));
      steps.push(L('hint', [T('Finish, stamp, or cancel.')]));
    } else if (shapeType === 'rectangle_select') {
      steps.push(L('hint', [T('Move mouse to adjust the selection.')]));
      steps.push(L('hint', [T('Finish the selection, or cancel.')]));
    }
  }
  if (snap.drawingQuad) {
    state.push(L('title', [T('Drawing Quadrilateral (' + snap.quadPointCount + '/4)')]));
    steps.push(L('hint', [T('Add points to the quadrilateral, or cancel.')]));
  }
  for (const hint of snap.liveHints) {
    if (adjustCovered && hint.label.includes('°') && /rotate/i.test(hint.label)) continue;
    steps.push(L('hint', [T(hint.label)]));
  }
  return { state, steps };
}
