// Canvas OS-cursor resolution. Pure: a hover/drag/pan context in, a CSS
// cursor value out. The engine applies the result to the view element after
// pointer events; nothing here touches Paper, the DOM, or engine state, so
// the priority order unit-tests without a canvas.
// Priority (first true wins): pan/pan-lock, selection drag, snap point,
// snap path, snap grid, live drawing, hover over content, idle. Snapping
// outranks drawing because a snap cursor tells the user the preview will
// land on the constraint. Every SVG cursor keeps a keyword fallback for
// browsers that reject the file; hotspot coordinates live with each value.
export type CanvasCursorKind =
  'pan' | 'drag' | 'snapPoint' | 'snapPath' | 'snapGrid' | 'draw' | 'hover' | 'idle';

export interface CanvasCursorContext {
  panning: boolean;
  panLocked: boolean;
  dragging: boolean;
  drawing: boolean;
  snapPoint: boolean;
  snapPath: boolean;
  snapGrid: boolean;
  hoverContent: boolean;
}

export interface ResolvedCursor {
  kind: CanvasCursorKind;
  /** Full CSS cursor value, SVG with hotspot plus keyword fallback. */
  css: string;
}

const IDLE = 'url("/cursors/idle.svg") 12 12, crosshair';
const DRAW = 'url("/cursors/draw.svg") 5 19, crosshair';
const SNAP_POINT = 'url("/cursors/snap-point.svg") 12 12, crosshair';
const SNAP_PATH = 'url("/cursors/snap-path.svg") 12 12, crosshair';
const SNAP_GRID = 'url("/cursors/snap-grid.svg") 12 12, crosshair';

export function idleCursorContext(): CanvasCursorContext {
  return {
    panning: false, panLocked: false, dragging: false, drawing: false,
    snapPoint: false, snapPath: false, snapGrid: false, hoverContent: false,
  };
}

export function resolveCanvasCursor(context: CanvasCursorContext): ResolvedCursor {
  if (context.panning || context.panLocked) return { kind: 'pan', css: 'grabbing' };
  if (context.dragging) return { kind: 'drag', css: 'move' };
  if (context.snapPoint) return { kind: 'snapPoint', css: SNAP_POINT };
  if (context.snapPath) return { kind: 'snapPath', css: SNAP_PATH };
  if (context.snapGrid) return { kind: 'snapGrid', css: SNAP_GRID };
  if (context.drawing) return { kind: 'draw', css: DRAW };
  if (context.hoverContent) return { kind: 'hover', css: 'pointer' };
  return { kind: 'idle', css: IDLE };
}
