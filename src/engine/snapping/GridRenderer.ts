import type { GridType } from '../types';

type Item = any;
export class GridRenderer {
  private readonly scope: paper.PaperScope;
  private layer: paper.Layer | null = null;
  private cursor: Item = null;
  constructor(scope: paper.PaperScope) { this.scope = scope; }
  get gridLayer(): paper.Layer | null { return this.layer; }
  get gridCursor(): Item { return this.cursor; }

  draw(type: GridType, spacing: number): void {
    if (!(Number.isFinite(spacing) && spacing > 0)) return;
    const scope = this.scope; const active = scope.project.activeLayer;
    if (!this.layer || this.layer.project !== scope.project) {
      this.layer = new scope.Layer(); this.layer.name = 'gridLayer'; scope.project.addLayer(this.layer);
    }
    const layer = this.layer;
    (layer as any).guide = true; layer.locked = true; layer.activate(); layer.removeChildren();
    const bounds = scope.view.bounds; const radius = 1.5 / (scope.view.zoom || 1);
    const color = new scope.Color(0.55, 0.62, 0.72, 0.55);
    const dot = (x: number, y: number) => {
      const item: Item = new scope.Shape.Circle(new scope.Point(x, y), radius);
      item.fillColor = color; item.strokeColor = null; item.guide = true; item.locked = true; layer.addChild(item);
    };
    if (type === 'diamond') {
      const d = spacing / Math.SQRT2; const step = spacing * Math.SQRT2;
      const iMin = Math.floor((bounds.x + bounds.y) / step); const iMax = Math.ceil((bounds.x + bounds.width + bounds.y + bounds.height) / step);
      const jMin = Math.floor((bounds.x - (bounds.y + bounds.height)) / step); const jMax = Math.ceil((bounds.x + bounds.width - bounds.y) / step);
      for (let i = iMin; i <= iMax; i++) for (let j = jMin; j <= jMax; j++) dot((i + j) * d, (i - j) * d);
    } else {
      for (let x = Math.floor(bounds.x / spacing) * spacing; x <= Math.ceil((bounds.x + bounds.width) / spacing) * spacing; x += spacing)
        for (let y = Math.floor(bounds.y / spacing) * spacing; y <= Math.ceil((bounds.y + bounds.height) / spacing) * spacing; y += spacing) dot(x, y);
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
