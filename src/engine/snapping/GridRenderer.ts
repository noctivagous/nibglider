import type { GridType } from '../types';

type Item = any;

export type GridStyle = 'dots' | 'lines';

export interface GridDrawOptions {
  /** Minor dots at spacing / subdivisions between majors (1 = off). */
  subdivisions?: number;
  /** Dots at every lattice point, or full lattice lines at spacing
   * (subdivisions stay dots either way). */
  style?: GridStyle;
  /** CSS hex colour for majors; minors reuse it at reduced alpha. */
  color?: string;
  /** Overall opacity 0..1 (the colour's alpha). */
  opacity?: number;
}

const DEFAULT_COLOR = '#8c9eb8';
const DEFAULT_OPACITY = 0.55;
/** Minor dots smaller than this on screen are skipped: at fine
 * spacings the subdivision lattice would otherwise flood the layer. */
const MIN_MINOR_PX = 3;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export class GridRenderer {
  private readonly scope: paper.PaperScope;
  private layer: paper.Layer | null = null;
  private cursor: Item = null;
  constructor(scope: paper.PaperScope) { this.scope = scope; }
  get gridLayer(): paper.Layer | null { return this.layer; }
  get gridCursor(): Item { return this.cursor; }

  draw(type: GridType, spacing: number, options: GridDrawOptions = {}): void {
    if (!(Number.isFinite(spacing) && spacing > 0)) return;
    const scope = this.scope; const active = scope.project.activeLayer;
    if (!this.layer || this.layer.project !== scope.project) {
      this.layer = new scope.Layer(); this.layer.name = 'gridLayer'; scope.project.addLayer(this.layer);
    }
    const layer = this.layer;
    (layer as any).guide = true; layer.locked = true; layer.activate(); layer.removeChildren();
    const bounds = scope.view.bounds; const zoom = scope.view.zoom || 1;
    const radius = 1.5 / zoom;
    const subdivisions = Math.max(1, Math.min(10, Math.floor(options.subdivisions ?? 1)));
    const style = options.style ?? 'dots';
    const opacity = Math.max(0, Math.min(1, options.opacity ?? DEFAULT_OPACITY));
    const rgb = hexToRgb(options.color ?? DEFAULT_COLOR) ?? hexToRgb(DEFAULT_COLOR)!;
    const color = new scope.Color(rgb.r, rgb.g, rgb.b, opacity);
    const minorColor = new scope.Color(rgb.r, rgb.g, rgb.b, opacity * 0.55);
    const dot = (x: number, y: number, minor: boolean) => {
      const item: Item = new scope.Shape.Circle(new scope.Point(x, y), minor ? radius * 0.6 : radius);
      item.fillColor = minor ? minorColor : color; item.strokeColor = null; item.guide = true; item.locked = true; layer.addChild(item);
    };
    const line = (x1: number, y1: number, x2: number, y2: number) => {
      const item: Item = new scope.Path({ segments: [new scope.Point(x1, y1), new scope.Point(x2, y2)], insert: false });
      item.strokeColor = color; item.strokeWidth = 1 / zoom; item.fillColor = null; item.guide = true; item.locked = true; layer.addChild(item);
    };
    const minorPx = (spacing / subdivisions) * zoom;
    // Cap the minor lattice: subdivisions multiply the dot count by
    // up to N², and Paper items are not free.
    const minorEstimate = (bounds.width / (spacing / subdivisions)) * (bounds.height / (spacing / subdivisions));
    const showMinors = subdivisions > 1 && minorPx >= MIN_MINOR_PX && minorEstimate <= 40000;
    if (type === 'diamond') {
      const d = spacing / Math.SQRT2; const step = spacing * Math.SQRT2;
      const iMin = Math.floor((bounds.x + bounds.y) / step); const iMax = Math.ceil((bounds.x + bounds.width + bounds.y + bounds.height) / step);
      const jMin = Math.floor((bounds.x - (bounds.y + bounds.height)) / step); const jMax = Math.ceil((bounds.x + bounds.width - bounds.y) / step);
      if (style === 'lines') {
        // Lattice lines run along both diagonal families through the
        // lattice rows: x + y = 2kd and x - y = 2kd.
        const x0 = bounds.x; const x1 = bounds.x + bounds.width;
        for (let i = iMin; i <= iMax; i++) {
          const c = 2 * i * d;
          line(x0, c - x0, x1, c - x1);
        }
        for (let j = jMin; j <= jMax; j++) {
          const c = 2 * j * d;
          line(x0, x0 - c, x1, x1 - c);
        }
      } else {
        for (let i = iMin; i <= iMax; i++) for (let j = jMin; j <= jMax; j++) dot((i + j) * d, (i - j) * d, false);
      }
      if (showMinors) {
        const md = d / subdivisions;
        for (let i = iMin * subdivisions; i <= iMax * subdivisions; i++) {
          for (let j = jMin * subdivisions; j <= jMax * subdivisions; j++) {
            if (i % subdivisions === 0 && j % subdivisions === 0) continue;
            dot((i + j) * md, (i - j) * md, true);
          }
        }
      }
    } else {
      const xMin = Math.floor(bounds.x / spacing) * spacing; const xMax = Math.ceil((bounds.x + bounds.width) / spacing) * spacing;
      const yMin = Math.floor(bounds.y / spacing) * spacing; const yMax = Math.ceil((bounds.y + bounds.height) / spacing) * spacing;
      if (style === 'lines') {
        for (let x = xMin; x <= xMax; x += spacing) line(x, bounds.y, x, bounds.y + bounds.height);
        for (let y = yMin; y <= yMax; y += spacing) line(bounds.x, y, bounds.x + bounds.width, y);
      } else {
        for (let x = xMin; x <= xMax; x += spacing)
          for (let y = yMin; y <= yMax; y += spacing) dot(x, y, false);
      }
      if (showMinors) {
        const minorStep = spacing / subdivisions;
        for (let x = xMin; x <= xMax; x += minorStep)
          for (let y = yMin; y <= yMax; y += minorStep) {
            const onMajor = Math.abs(x / spacing - Math.round(x / spacing)) < 1e-6
              && Math.abs(y / spacing - Math.round(y / spacing)) < 1e-6;
            if (!onMajor) dot(x, y, true);
          }
      }
    }
    layer.sendToBack(); if (active && active !== layer) active.activate(); scope.view.update();
  }
  clear(): void { this.layer?.removeChildren(); if (this.cursor) this.cursor.visible = false; this.scope.view.update(); }
  updateCursor(point: paper.Point | null, show: boolean, mount: (item: paper.Item) => void): void {
    if (!show || !point) { if (this.cursor) this.cursor.visible = false; return; }
    if (!this.cursor) {
      this.cursor = new this.scope.Shape.Circle(point, 5);
      this.cursor.fillColor = new this.scope.Color(1, 0, 0, 0.9); this.cursor.strokeColor = new this.scope.Color(0, 0, 0, 1); this.cursor.strokeWidth = 2;
    }
    this.cursor.position = point; this.cursor.visible = true; mount(this.cursor);
  }
}
