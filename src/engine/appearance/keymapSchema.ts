// Keymap rows for the keymap table widget.
// Owns nothing. Reads the snapshot the engine passes in.
// Adjust rows (scale/rotate/tension) come from the canonical ADJUST_ACTIONS
// descriptors: static rows are skipped when a live hint already covers the
// action, so each binding renders exactly once.
// Public: buildKeymapRows.
// Tested from tests/ui-state.test.mjs. The ui module re-exports this file.

import { ADJUST_ACTIONS, commandKeycap, keyGroupForLabel, type AdjustAction } from '../input/keymap';
import type { KeymapRow, StatusKeyGroup } from '../types';
import type { StatusSnapshot } from './statusSchema';

function caps(ids: string[]): { labels: string[]; group: StatusKeyGroup } {
  const labels = ids.map((id) => commandKeycap(id));
  return { labels, group: keyGroupForLabel(labels[0] ?? '') };
}

function row(ids: string[], label: string, section: KeymapRow['section'] = 'guide'): KeymapRow {
  const { labels, group } = caps(ids);
  return { keys: labels, label, group, ids: [...ids], section };
}

function actionRow(action: AdjustAction): KeymapRow {
  const { labels, group } = caps(action.commandIds);
  return {
    keys: labels,
    label: action.label,
    group,
    ids: [...action.commandIds],
    section: action.section,
  };
}

function actionById(id: string): AdjustAction | undefined {
  return ADJUST_ACTIONS.find((a) => a.id === id);
}

export function buildKeymapRows(snap: StatusSnapshot): KeymapRow[] {
  const rows: KeymapRow[] = [];
  // Type At Cursor owns the keyboard: only its own chords apply.
  if (snap.typingText) {
    rows.push({ keys: ['Return'], label: 'Place the text', group: 'end', ids: ['finish-typing'], section: 'guide' });
    rows.push({ keys: ['Alt', 'W'], label: 'Stamp a copy', group: 'op', ids: ['stamp-typed-text'], section: 'guide' });
    rows.push({ keys: ['Esc'], label: 'Cancel typing', group: 'end', ids: ['cancel-typing'], section: 'guide' });
    return rows;
  }
  // Actions a live hint already covers: no static row for them.
  const liveCovered = new Set(
    snap.liveHints.map((h) => h.actionId).filter((id): id is string => !!id),
  );
  // Command ids with a static row above; live hints restating them are dropped.
  const staticIds = new Set<string>();
  const emitAction = (id: string): void => {
    if (liveCovered.has(id)) return;
    const action = actionById(id);
    if (!action) return;
    rows.push(actionRow(action));
    for (const cid of action.commandIds) staticIds.add(cid);
  };
  if (snap.gridEnabled) {
    rows.push(row(['grid-toggle'], 'Toggle the grid'));
  }
  // The selection marquee live-selects, but its selection is not an idle
  // one: scale/rotate/drag-lock keys are swallowed while it is active.
  if (snap.selectedCount && snap.dragLock === false && snap.shapeType !== 'rectangle_select') {
    rows.push(row(['drag-lock'], 'Begin Drag-Lock'));
    emitAction('scale');
    emitAction('rotate');
  }
  if (snap.dragLock) {
    rows.push(row(['drag-lock'], 'Release Drag-Lock'));
    rows.push(row(['stamp'], 'Stamp'));
    emitAction('scale');
    emitAction('rotate');
  }
  if (snap.transformMode) {
    rows.push(row(['transform-scale'], 'Live scale from the cursor', 'adjust'));
    rows.push(row(['transform-rotate'], 'Live rotation from the cursor', 'adjust'));
    rows.push(row(['transform-shear-h'], 'Live horizontal shear', 'adjust'));
    rows.push(row(['transform-shear-v'], 'Live vertical shear', 'adjust'));
  }
  if (snap.panLock) {
    rows.push(row(['pan-lock'], 'Release Pan-Lock'));
  }
  if (snap.drawingPath) {
    if (snap.composite) {
      rows.push(row(['sharp-point'], 'Sharp point'));
      rows.push(row(['spline-point'], 'B-spline point'));
      rows.push(row(['rounded-point'], `Rounded corner (${snap.cornerRadius}pt)`));
      rows.push(row(['finish-r'], 'Close shape'));
      rows.push(row(['finish-a'], 'End drawing'));
      rows.push(row(['cancel'], 'Cancel drawing'));
    } else {
      rows.push(row(['sharp-point'], 'Sharp point'));
      rows.push(row(['spline-point'], `Spline point (tension ${snap.splineTension.toFixed(1)})`));
      rows.push(row(['finish-r'], 'Complete shape'));
      emitAction('tension');
      rows.push(row(['finish-a'], 'End drawing'));
    }
  }
  if (snap.drawingShape) {
    const shapeType = snap.shapeType;
    if (shapeType != null && shapeType.startsWith('circle_')) {
      if (shapeType === 'circle_radial_stamp') {
        rows.push(row(['radial-stamp', 'stamp'], 'Stamp'));
        rows.push(row(['radial-lock'], 'Lock or unlock the radius'));
        rows.push(row(['finish-a', 'finish-r'], 'Deposit and finish'));
        rows.push(row(['cancel'], 'Cancel drawing'));
      } else {
        const finishKey = shapeType === 'circle_diameter' ? 'circle-diameter' : 'circle-radius';
        rows.push(row([finishKey], 'Finish drawing'));
        rows.push(row(['stamp'], 'Stamp'));
      }
    } else if (shapeType === 'rectangle_diagonal') {
      rows.push(row(['rect-diagonal'], 'Finish drawing'));
      rows.push(row(['stamp'], 'Stamp'));
    } else if (shapeType === 'rectangle_export_frame') {
      rows.push(row(['rect-centerline', 'rect-two-edges', 'rect-diagonal'], 'Finish frame'));
      rows.push(row(['stamp'], 'Stamp'));
    } else if (shapeType === 'rectangle_two_edges') {
      if (!snap.hasSecondEdge) {
        rows.push(row(['rect-two-edges'], 'Start the second edge'));
      } else {
        rows.push(row(['rect-two-edges'], 'Finish drawing'));
        rows.push(row(['stamp'], 'Stamp'));
      }
    } else if (shapeType === 'rectangle_centerline') {
      rows.push(row(['scale-down'], 'Thin width'));
      rows.push(row(['scale-up'], 'Thicken width'));
      rows.push(row(['rect-centerline'], 'Finish drawing'));
      rows.push(row(['stamp'], 'Stamp'));
      rows.push(row(['cancel'], 'Cancel drawing'));
    } else if (shapeType === 'rectangle_select') {
      rows.push(row(['select-rectangle'], 'Finish selection'));
      rows.push(row(['cancel'], 'Cancel selection'));
    }
  }
  if (snap.drawingQuad) {
    rows.push(row(['quad'], 'Add next point'));
    rows.push(row(['cancel'], 'Cancel drawing'));
  }
  for (const hint of snap.liveHints) {
    const action = hint.actionId ? actionById(hint.actionId) : undefined;
    if (action && action.commandIds.some((cid) => staticIds.has(cid))) continue;
    if (
      !action && staticIds.has('rotate-cw') &&
      hint.label.includes('°') && /rotate/i.test(hint.label)
    ) continue;
    if (action) {
      const { labels, group } = caps(action.commandIds);
      rows.push({
        keys: labels,
        label: hint.label,
        group,
        ids: [...action.commandIds],
        section: action.section,
      });
    } else {
      rows.push({
        keys: [...hint.keys],
        label: hint.label,
        group: keyGroupForLabel(hint.keys[0] ?? ''),
        ids: [...hint.keys],
        section: 'guide',
      });
    }
  }
  return rows;
}
