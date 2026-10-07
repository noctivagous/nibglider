// Live grid-repeat coordinator: preview clones during a draw, copy fan-out
// on deposit. Owns no settings truth (the engine holds the fields so
// engineSettings entries keep working) and no tool math. Preview clones are
// guide items, so snapping, hit-testing, content counts, serialization, and
// undo snapshots all skip them like grid dots. Deposited copies are real
// content and join the draw's single history entry.
// Tested from tests/repeat-drawing.test.mjs.
import { createGrid } from '../geometry/GridGeometry';
import {
  clampRepeatCount,
  repeatPositions,
  type RepeatAnchor,
  type RepeatDirection,
} from '../geometry/RepeatGeometry';
import type { DrawingSession } from '../drawing/DrawingSession';

type Item = any;

export type RepeatFamily = 'rect' | 'circle' | 'path';

export interface RepeatSettings {
  enabled: boolean;
  rows: number;
  cols: number;
  anchor: RepeatAnchor;
  direction: RepeatDirection;
  rectKeys: boolean;
  circleKeys: boolean;
  paths: boolean;
}

export interface RepeatHost {
  scope(): paper.PaperScope;
  session(): DrawingSession;
  settings(): RepeatSettings;
  setRows(rows: number): void;
  setCols(cols: number): void;
  addToActive(item: Item): void;
  place(item: Item): Item | null;
}

/** Preview and deposit copies share one cap; rows/cols already clamp to 12. */
export const REPEAT_COPY_CAP = 200;

export class RepeatManager {
  private readonly host: RepeatHost;
  private clones: Item[] = [];

  constructor(host: RepeatHost) {
    this.host = host;
  }

  previewClones(): Item[] {
    return [...this.clones];
  }

  /** Which repeat family the live session belongs to, or null when none. */
  family(): RepeatFamily | null {
    const session = this.host.session();
    const type = session.shapeType;
    if (session.isDrawingShape && type) {
      if (type === 'rectangle_select' || type === 'rectangle_export_frame') return null;
      if (type.startsWith('rectangle_')) return 'rect';
      if (type.startsWith('circle_')) return 'circle';
    }
    if (session.isDrawingPath && session.path) return 'path';
    return null;
  }

  /** True when repeat is on and covers the live tool. */
  applies(): boolean {
    const settings = this.host.settings();
    if (!settings.enabled) return false;
    const family = this.family();
    if (!family) return false;
    if (family === 'rect') return settings.rectKeys;
    if (family === 'circle') return settings.circleKeys;
    return settings.paths;
  }

  adjustRows(delta: number): void {
    const settings = this.host.settings();
    const rows = clampRepeatCount(settings.rows + delta, settings.rows);
    if (rows === settings.rows) return;
    this.host.setRows(rows);
  }

  adjustCols(delta: number): void {
    const settings = this.host.settings();
    const cols = clampRepeatCount(settings.cols + delta, settings.cols);
    if (cols === settings.cols) return;
    this.host.setCols(cols);
  }

  /**
   * Copy offsets relative to the live bounds center. Index zero (the drawn
   * object itself under cell-center/cell-origin) is skipped so the base is
   * never double-stamped. Empty when repeat does not apply or the live
   * bounds are degenerate.
   */
  copyOffsets(): Array<{ x: number; y: number }> {
    if (!this.applies()) return [];
    const bounds = this.liveBounds();
    if (!bounds || !(bounds.width > 0) || !(bounds.height > 0)) return [];
    const settings = this.host.settings();
    const positions = repeatPositions(
      createGrid({
        origin: { x: bounds.x, y: bounds.y },
        rows: settings.rows,
        cols: settings.cols,
        cellW: bounds.width,
        cellH: bounds.height,
      }),
      settings.anchor,
      settings.direction,
    );
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const offsets: Array<{ x: number; y: number }> = [];
    for (const point of positions) {
      const dx = point.x - center.x;
      const dy = point.y - center.y;
      if (Math.hypot(dx, dy) < 1e-6) continue;
      offsets.push({ x: dx, y: dy });
      if (offsets.length >= REPEAT_COPY_CAP) break;
    }
    return offsets;
  }

  /** Rebuild guide-flagged preview clones from the live item. */
  refreshPreview(): void {
    this.clearPreview();
    if (!this.applies()) return;
    const sources = this.liveSources();
    if (!sources.length) return;
    const offsets = this.copyOffsets();
    if (!offsets.length) return;
    const scope = this.host.scope();
    for (const source of sources) {
      for (const offset of offsets) {
        let clone: Item = null;
        try {
          clone = source.clone();
        } catch {
          continue;
        }
        if (!clone) continue;
        clone.guide = true;
        try {
          clone.position = clone.position.add(new scope.Point(offset.x, offset.y));
        } catch {
          continue;
        }
        this.host.addToActive(clone);
        this.clones.push(clone);
      }
    }
  }

  clearPreview(): void {
    for (const clone of this.clones) {
      try {
        if (clone.parent != null) clone.remove();
      } catch {
        // Already detached.
      }
    }
    this.clones = [];
  }

  /**
   * Snapshot copy offsets while the session is still live. Tools clear the
   * session during finish, so the offsets must be captured first.
   */
  beginDeposit(): Array<{ x: number; y: number }> {
    return this.copyOffsets();
  }

  /**
   * Clone each deposited base item across pre-captured offsets and place the
   * copies. The caller includes the result in the draw's single history
   * entry. Clears the live preview clones.
   */
  finishDeposit(base: Item[], offsets: Array<{ x: number; y: number }>): Item[] {
    this.clearPreview();
    const placed = base.filter((item) => !!item && !!item.bounds);
    if (!placed.length || !offsets.length) return [];
    const copies: Item[] = [];
    const scope = this.host.scope();
    for (const item of placed) {
      for (const offset of offsets) {
        let clone: Item = null;
        try {
          clone = item.clone();
        } catch {
          continue;
        }
        if (!clone) continue;
        try {
          clone.position = clone.position.add(new scope.Point(offset.x, offset.y));
        } catch {
          continue;
        }
        clone.selected = false;
        const deposited = this.host.place(clone);
        if (deposited) {
          deposited.selected = false;
          copies.push(deposited);
        }
      }
      if (copies.length >= REPEAT_COPY_CAP) break;
    }
    return copies;
  }

  private liveSources(): Item[] {
    const session = this.host.session();
    const candidates = [
      session.path,
      session.previewShape,
      session.previewRect,
      session.previewInner,
      session.previewPath,
    ];
    return candidates.filter((item) => !!item && !!item.bounds);
  }

  private liveBounds(): { x: number; y: number; width: number; height: number } | null {
    const sources = this.liveSources();
    if (!sources.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const source of sources) {
      let bounds: Item = null;
      try {
        bounds = source.bounds;
      } catch {
        continue;
      }
      if (!bounds) continue;
      if (bounds.x < minX) minX = bounds.x;
      if (bounds.y < minY) minY = bounds.y;
      if (bounds.x + bounds.width > maxX) maxX = bounds.x + bounds.width;
      if (bounds.y + bounds.height > maxY) maxY = bounds.y + bounds.height;
    }
    if (!(maxX > minX) || !(maxY > minY)) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
}
