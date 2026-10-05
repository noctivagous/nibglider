// DrawingBoard: the entire working space (the canvas). A centered
// rectangle in document points that the workspace outline, the
// scrollbars, and the Settings window all read. The user page (New
// Document dimensions) renders as a sheet on top of it. Artwork may
// still live outside both (free pan and export frames are unaffected);
// neither is a clip.
// Defaults: 1m x 1m for SI, 3ft x 3ft for English (project default).
// Tested from tests/drawing-board.test.mjs.
import type { LengthUnit } from '../types';
import { pointsPerUnit, type UnitSystem } from './MeasurementUnits';

export interface BoardRect { x: number; y: number; width: number; height: number }

/** Clamp ceiling: 100 m in points, generous enough to never bind real work. */
export const MAX_BOARD_SIZE_PT = (7200 / 2.54) * 100;

export function defaultBoardSizePt(system: UnitSystem): { widthPt: number; heightPt: number } {
  const side = system === 'si' ? pointsPerUnit('m') : 3 * pointsPerUnit('ft');
  return { widthPt: side, heightPt: side };
}

export class DrawingBoard {
  private widthPt: number;
  private heightPt: number;

  constructor(system: UnitSystem = 'english') {
    const init = defaultBoardSizePt(system);
    this.widthPt = init.widthPt;
    this.heightPt = init.heightPt;
  }

  get width(): number { return this.widthPt; }
  get height(): number { return this.heightPt; }

  /** Board rect centered on the project origin. */
  rect(): BoardRect {
    return { x: -this.widthPt / 2, y: -this.heightPt / 2, width: this.widthPt, height: this.heightPt };
  }

  setSizePt(widthPt: number, heightPt: number): void {
    if (!Number.isFinite(widthPt) || !Number.isFinite(heightPt)) {
      throw new Error('Drawing board dimensions must be finite');
    }
    if (widthPt <= 0 || heightPt <= 0) throw new Error('Drawing board dimensions must be positive');
    this.widthPt = Math.min(MAX_BOARD_SIZE_PT, widthPt);
    this.heightPt = Math.min(MAX_BOARD_SIZE_PT, heightPt);
  }

  setSize(width: number, height: number, unit: LengthUnit): void {
    const scale = pointsPerUnit(unit); // Throws for unknown units.
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error('Drawing board dimensions must be finite');
    }
    this.setSizePt(width * scale, height * scale);
  }

  reset(system: UnitSystem = 'english'): void {
    const init = defaultBoardSizePt(system);
    this.widthPt = init.widthPt;
    this.heightPt = init.heightPt;
  }
}
