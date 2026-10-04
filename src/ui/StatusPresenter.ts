// Status schema for the canvas overlay.
// Owns nothing. Reads the snapshot the engine passes in.
// Does not touch the DOM, modifiers, or undo labels. Chord hints stay in StatusOverlay.
// Public: buildStatusSchema.
// Tested from tests/ui-state.test.mjs.

import { commandKeycap, keyGroupForLabel } from '../engine/input/keymap';
import type { CircleRadiusAnchor, GridType, RectDiagonalMode, ShapeType, StatusLine, StatusRun, StatusSchema } from '../engine/types';

export interface StatusSnapshot {
  selectedCount: number;
  gridEnabled: boolean;
  gridType: GridType;
  dropNote: string;
  dragLock: boolean;
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
  liveHints: Array<{ label: string; keys: string[] }>;
}

export function buildStatusSchema(snap: StatusSnapshot): StatusSchema {
  const T = (s: string): StatusRun => ({ t: 'text', s });
  const K = (id: string): StatusRun => {
    const s = commandKeycap(id);
    return { t: 'key', s, g: keyGroupForLabel(s) };
  };
  const state: StatusLine[] = [];
  const steps: StatusLine[] = [];
  const L = (kind: StatusLine['kind'], runs: StatusRun[]): StatusLine => ({ kind, runs });
  if (snap.gridEnabled) {
    state.push(L('meta', [
      T(`Grid: ON · ${snap.gridType === 'diamond' ? 'Diamond' : 'Square'} (`),
      K('toggle-status'),
      T(' to toggle)'),
    ]));
  }
  if (snap.dropNote) state.push(L('meta', [T(snap.dropNote)]));
  if (snap.selectedCount) {
    state.push(L('title', [T('Selected Objects: ' + snap.selectedCount)]));
    if (snap.dragLock === false) {
      steps.push(L('hint', [K('drag-lock'), T(' to begin Drag-Lock')]));
      steps.push(L('hint', [
        K('scale-down'), T(' and '), K('scale-up'), T(' to Scale, '),
        K('rotate-ccw'), T(' and '), K('rotate-cw'), T(' to Rotate'),
      ]));
    }
  }
  if (snap.dragLock) {
    state.push(L('title', [T('Drag-Lock On ')]));
    steps.push(L('hint', [T('Move mouse to drag all selected.  '), K('drag-lock'), T(' to release.')]));
    steps.push(L('hint', [
      K('stamp'), T(' to Stamp, '), K('scale-down'), T(' and '), K('scale-up'), T(' to Scale, '),
      K('rotate-ccw'), T(' and '), K('rotate-cw'), T(' to Rotate'),
    ]));
  }
  if (snap.drawingPath) {
    state.push(L('title', [T(snap.composite ? 'Drawing Composite Path' : 'Drawing Path')]));
    if (snap.composite) {
      steps.push(L('hint', [
        K('sharp-point'), T(' sharp, '), K('spline-point'), T(' B-spline, '),
        K('rounded-point'), T(` rounded (${snap.cornerRadius}pt), `),
        K('finish-r'), T(' close, '), K('finish-a'), T(' end, '), K('cancel'), T(' cancel'),
      ]));
    } else {
      steps.push(L('hint', [T('Move mouse to adjust path.')]));
      steps.push(L('hint', [
        K('sharp-point'), T(' = sharp point, '),
        K('spline-point'), T(' = spline (tension:' + snap.splineTension.toFixed(1) + '), '),
        K('finish-r'), T(' = complete shape'),
      ]));
      steps.push(L('hint', [K('finish-a'), T(' = end, '), K('tension-down'), T('/'), K('tension-up'), T('/'), K('tension-reset'), T(' = adjust tension')]));
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
        state.push(L('meta', [T(`Radius locked at ${Math.round(snap.radialStampLockedRadius)}pt (0 to unlock)`)]));
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
    }
    if (snap.aspectLabel) state.push(L('meta', [T('Aspect ' + snap.aspectLabel)]));
    if (shapeType != null && shapeType.startsWith('circle_')) {
      if (shapeType === 'circle_radial_stamp') {
        steps.push(L('hint', [T('Press '), K('radial-stamp'), T(' or '), K('stamp'), T(' to stamp. Move mouse to orbit the origin.')]));
        steps.push(L('hint', [K('finish-a'), T(' / '), K('finish-r'), T(' to deposit + finish, '), K('cancel'), T(' to cancel.')]));
      } else {
        const finishKey = shapeType === 'circle_diameter' ? 'circle-diameter' : 'circle-radius';
        steps.push(L('hint', [T('Press '), K(finishKey), T(' to finish or '), K('stamp'), T(' to stamp.')]));
      }
    } else if (shapeType === 'rectangle_diagonal') {
      steps.push(L('hint', [T('Press '), K('rect-diagonal'), T(' to finish or '), K('stamp'), T(' to stamp.')]));
    } else if (shapeType === 'rectangle_two_edges') {
      if (!snap.hasSecondEdge) {
        steps.push(L('hint', [T('1. Move mouse to adjust this first edge.')]));
        steps.push(L('hint', [T('2. Press '), K('rect-two-edges'), T(' again to start the second edge')]));
      } else {
        steps.push(L('hint', [T('1. Move mouse to adjust the second edge.')]));
        steps.push(L('hint', [T('2. Press '), K('rect-two-edges'), T(' to finish or '), K('stamp'), T(' to stamp.')]));
      }
    } else if (shapeType === 'rectangle_centerline') {
      steps.push(L('hint', [T('1. Move mouse to adjust the rectangle.')]));
      steps.push(L('hint', [K('scale-down'), T(': thin width, '), K('scale-up'), T(': thicken width,')]));
      steps.push(L('hint', [K('rect-centerline'), T(': finish, '), K('stamp'), T(': stamp, '), K('cancel'), T(': cancel')]));
    }
  }
  if (snap.drawingQuad) {
    state.push(L('title', [T('Drawing Quadrilateral (' + snap.quadPointCount + '/4)')]));
    steps.push(L('hint', [T('Press '), K('quad'), T(' to add next point. '), K('cancel'), T(': cancel')]));
  }
  for (const hint of snap.liveHints) {
    const runs: StatusRun[] = [];
    hint.keys.forEach((key, i) => {
      if (i > 0) runs.push(T(' / '));
      runs.push(K(key));
    });
    runs.push(T(` ${hint.label}`));
    steps.push(L('hint', runs));
  }
  return { state, steps };
}
