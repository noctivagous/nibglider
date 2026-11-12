// Arrange: a compact titlebar picks the kind of arrangement, and the
// preview flyout holds the icon controls for that kind. Every button
// is one engine operation and one history entry. The same commands
// live in the Object menu.
import type { ReactNode } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import {
  ARRANGE_PREVIEW_LABEL,
  arrangeToolTitle,
  type ArrangeTool,
} from './arrangeTools';

function ArrangeIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 14"
      width="22"
      height="18"
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

const STROKE = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function ArrangePreview({ tool }: { tool: ArrangeTool }) {
  let body: ReactNode;
  if (tool === 'align') {
    body = (
      <>
        <path d="M14 5 H46" />
        <path d="M14 16 H38" />
        <path d="M14 27 H42" />
        <path d="M14 3 V29" opacity="0.55" />
      </>
    );
  } else if (tool === 'document') {
    body = (
      <>
        <rect x="16" y="3" width="32" height="26" />
        <path d="M19 9 H34" />
        <path d="M19 16 H28" />
        <path d="M19 23 H32" />
      </>
    );
  } else if (tool === 'space') {
    body = (
      <>
        <rect x="6" y="9" width="12" height="14" />
        <rect x="26" y="9" width="12" height="14" />
        <rect x="46" y="9" width="12" height="14" />
      </>
    );
  } else if (tool === 'order') {
    body = (
      <>
        <rect x="14" y="6" width="18" height="14" opacity="0.45" />
        <rect x="28" y="12" width="20" height="14" />
      </>
    );
  } else {
    body = (
      <>
        <rect x="18" y="10" width="16" height="12" />
        <path d="M38 8 A12 12 0 0 1 50 18" />
        <path d="M46 18 H50 V14" />
      </>
    );
  }
  return (
    <span className="combine-preview-wrap" aria-hidden="true">
      <svg className="combine-preview" viewBox="0 0 64 32" {...STROKE}>
        {body}
      </svg>
      <span className="combine-preview-label">{ARRANGE_PREVIEW_LABEL[tool]}</span>
    </span>
  );
}

export default function ArrangePanel({
  engine,
  tool,
}: {
  engine: NibGliderEngine;
  tool: ArrangeTool;
}) {
  const count = engine.selectedItems.length;
  const none = count === 0;
  const few = count < 3;
  const reorderable = engine.canReorderSelection();
  const actions: Array<{
    label: string;
    title: string;
    disabled: boolean;
    icon: ReactNode;
    run: () => void;
  }> = [];
  const align = (mode: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom', target: 'selection' | 'document') =>
    () => engine.alignSelection(mode, target);
  if (tool === 'align' || tool === 'document') {
    const target = tool === 'align' ? 'selection' : 'document';
    const where = tool === 'align' ? 'the selection' : 'the document';
    actions.push(
      { label: 'Left', title: `Align left edges to ${where}`, disabled: none, icon: <path d="M3 2 V12 M5 3 H13 M5 7 H10 M5 11 H12" />, run: align('left', target) },
      { label: 'Centre', title: `Align horizontal centres to ${where}`, disabled: none, icon: <path d="M8 2 V12 M3 3 H13 M4.5 7 H11.5 M3.5 11 H12.5" />, run: align('centerX', target) },
      { label: 'Right', title: `Align right edges to ${where}`, disabled: none, icon: <path d="M13 2 V12 M3 3 H11 M6 7 H11 M4 11 H11" />, run: align('right', target) },
      { label: 'Top', title: `Align top edges to ${where}`, disabled: none, icon: <path d="M2 3 H14 M4 5 V12 M8 5 V9 M12 5 V11" />, run: align('top', target) },
      { label: 'Middle', title: `Align vertical centres to ${where}`, disabled: none, icon: <path d="M2 7 H14 M4 3 V11 M8 4.5 V9.5 M12 3.5 V10.5" />, run: align('centerY', target) },
      { label: 'Bottom', title: `Align bottom edges to ${where}`, disabled: none, icon: <path d="M2 12 H14 M4 3 V10 M8 6 V10 M12 4 V10" />, run: align('bottom', target) },
    );
  } else if (tool === 'space') {
    actions.push(
      { label: 'Dist. H', title: 'Distribute horizontally with equal gaps (needs 3+)', disabled: few, icon: <path d="M2 4 H5 V10 H2 Z M7 4 H10 V10 H7 Z M12 4 H15 V10 H12 Z" />, run: () => engine.distributeSelection('horizontal') },
      { label: 'Dist. V', title: 'Distribute vertically with equal gaps (needs 3+)', disabled: few, icon: <path d="M4 1 H12 V3 H4 Z M4 5.5 H12 V7.5 H4 Z M4 10 H12 V12 H4 Z" />, run: () => engine.distributeSelection('vertical') },
      { label: 'Flip H', title: 'Flip horizontally around the selection centre', disabled: none, icon: <path d="M8 2 V12 M3 4 L6 7 L3 10 M13 4 L10 7 L13 10" />, run: () => engine.flipSelection('horizontal') },
      { label: 'Flip V', title: 'Flip vertically around the selection centre', disabled: none, icon: <path d="M2 7 H14 M4 3 L8 5 L12 3 M4 11 L8 9 L12 11" />, run: () => engine.flipSelection('vertical') },
    );
  } else if (tool === 'order') {
    actions.push(
      { label: 'To Front', title: 'Bring the selection to the front', disabled: !reorderable, icon: <path d="M3 5 H9 V11 H3 Z M7 3 H13 V9 H7 Z" />, run: () => engine.bringSelectionToFront() },
      { label: 'Forward', title: 'Bring the selection one step forward', disabled: !reorderable, icon: <path d="M4 6 H10 V12 H4 Z M8 4 H12 V8" />, run: () => engine.bringSelectionForward() },
      { label: 'Backward', title: 'Send the selection one step backward', disabled: !reorderable, icon: <path d="M6 2 H12 V8 H6 Z M4 6 H8 V12" />, run: () => engine.sendSelectionBackward() },
      { label: 'To Back', title: 'Send the selection to the back', disabled: !reorderable, icon: <path d="M7 3 H13 V9 H7 Z M3 5 H9 V11 H3 Z" />, run: () => engine.sendSelectionToBack() },
    );
  } else {
    actions.push(
      { label: '90° CW', title: 'Rotate the selection 90° clockwise', disabled: none, icon: <path d="M8 3 A5 5 0 1 1 4 9 M8 3 L6 5 M8 3 L10 5" />, run: () => engine.rotateSelectionBy(90) },
      { label: '90° CCW', title: 'Rotate the selection 90° counter-clockwise', disabled: none, icon: <path d="M8 3 A5 5 0 1 0 12 9 M8 3 L6 5 M8 3 L10 5" />, run: () => engine.rotateSelectionBy(-90) },
      { label: 'Group', title: 'Group the selection into one object', disabled: !engine.canGroupSelection(), icon: <path d="M3 3 H7 V7 H3 Z M9 7 H13 V11 H9 Z M2 2 H14 V12 H2 Z" />, run: () => engine.groupSelection() },
      { label: 'Ungroup', title: 'Ungroup the selected group', disabled: !engine.canUngroupSelection(), icon: <path d="M3 3 H7 V7 H3 Z M9 7 H13 V11 H9 Z M2 2 H8 M2 2 V6 M14 8 V12 H8" />, run: () => engine.ungroupSelected() },
    );
  }
  return (
    <div className="arrange-panel">
      <div
        className={'arrange-grid' + (actions.length <= 4 ? ' cols-2' : '')}
        role="group"
        aria-label={arrangeToolTitle(tool)}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className="arrange-action"
            title={action.title}
            aria-label={action.label}
            disabled={action.disabled}
            onClick={action.run}
          >
            <ArrangeIcon>{action.icon}</ArrangeIcon>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
      {none ? <div className="arrange-empty">Select objects to arrange them.</div> : null}
    </div>
  );
}
