// Global stroke and fill, plus paint read back from a selection.
// Owns no copy of the settings. Reads and writes the StyleState the engine
// passes in, and paints items through applyToSelection / live item callbacks.
// Does not notify React or publish status. The facade does that after each setter.
// Tested from tests/style-manager.test.mjs.
import { clampStrokeWidth } from '../input/KeySettingsRegistry';
import type { FillSpec, FillType, StrokeCap, StrokeJoin } from '../types';

type Item = any;

export interface StyleState {
  globalStrokeWidth: number;
  maxStrokeWidth: number;
  globalStrokeColor: string;
  globalFillColor: string;
  globalFillType: FillType;
  globalFillEndColor: string;
  globalFillAngle: number;
  globalFillInner: number;
  globalStrokeCap: StrokeCap;
  globalStrokeJoin: StrokeJoin;
  globalMiterLimit: number;
  globalDashLength: number;
  globalGapLength: number;
  strokeEnabled: boolean;
  fillEnabled: boolean;
}

export interface SelectionPaint {
  strokeOn: boolean;
  strokeColor: string;
  strokeWidth: number;
  strokeCap: StrokeCap;
  strokeJoin: StrokeJoin;
  miterLimit: number;
  dashLength: number;
  gapLength: number;
  fillOn: boolean;
  fillColor: string;
  fillSpec: FillSpec;
}

export interface StyleHost {
  state(): StyleState;
  hasSelection(): boolean;
  applyToSelection(fn: (item: Item) => void): void;
  liveItems(): Item[];
  livePath(): Item;
  isDrawingShape(): boolean;
  updateShapePreview(): void;
}

export class StyleManager {
  private readonly scope: paper.PaperScope;
  private readonly host: StyleHost;
  constructor(scope: paper.PaperScope, host: StyleHost) {
    this.scope = scope;
    this.host = host;
  }

  setStrokeWidth(strokeVal: number): void {
    const state = this.host.state();
    const v = clampStrokeWidth(strokeVal, state.maxStrokeWidth);
    if (this.host.hasSelection()) {
      this.host.applyToSelection((item) => { item.strokeWidth = v; });
    } else {
      state.globalStrokeWidth = v;
    }
    this.updateCurrentDrawingStyles();
  }

  setStrokeColor(colorVal: string): void {
    const state = this.host.state();
    if (this.host.hasSelection()) {
      this.host.applyToSelection((item) => {
        item.strokeColor = colorVal;
        if (!(item.strokeWidth > 0)) item.strokeWidth = state.globalStrokeWidth;
      });
    } else {
      state.globalStrokeColor = colorVal;
    }
    this.updateCurrentDrawingStyles();
  }

  setStrokeCap(cap: StrokeCap): void {
    const state = this.host.state();
    if (this.host.hasSelection()) this.host.applyToSelection((item) => { item.strokeCap = cap; });
    else state.globalStrokeCap = cap;
    this.updateCurrentDrawingStyles();
  }

  setStrokeJoin(join: StrokeJoin): void {
    const state = this.host.state();
    if (this.host.hasSelection()) this.host.applyToSelection((item) => { item.strokeJoin = join; });
    else state.globalStrokeJoin = join;
    this.updateCurrentDrawingStyles();
  }

  setMiterLimit(limit: number): void {
    const state = this.host.state();
    let v = limit;
    if (!(v >= 1)) v = 1;
    if (v > 40) v = 40;
    if (this.host.hasSelection()) this.host.applyToSelection((item) => { item.miterLimit = v; });
    else state.globalMiterLimit = v;
    this.updateCurrentDrawingStyles();
  }

  setStrokeDash(dash: number, gap: number): void {
    const state = this.host.state();
    const d = clampDash(dash);
    const g = clampDash(gap);
    if (this.host.hasSelection()) {
      this.host.applyToSelection((item) => { this.applyStrokeDash(item, d, g); });
    } else {
      state.globalDashLength = d;
      state.globalGapLength = g;
    }
    this.updateCurrentDrawingStyles();
  }

  setFillColor(colorVal: string): void {
    const state = this.host.state();
    if (this.host.hasSelection()) {
      this.host.applyToSelection((item) => {
        const spec = this.fillSpecOf(item) ?? this.fillSpec();
        spec.color = colorVal;
        this.applyFillSpec(item, spec);
      });
    } else {
      state.globalFillColor = colorVal;
    }
    this.updateCurrentDrawingStyles();
  }

  setFillType(t: FillType): void {
    if (t !== 'solid' && t !== 'linear' && t !== 'radial') return;
    const state = this.host.state();
    if (this.host.hasSelection()) {
      this.host.applyToSelection((item) => {
        if (!item.fillColor) return;
        const spec = this.fillSpecOf(item) ?? this.fillSpec();
        spec.type = t;
        this.applyFillSpec(item, spec);
      });
    } else {
      state.globalFillType = t;
    }
    this.updateCurrentDrawingStyles();
  }

  setFillEndColor(colorVal: string): void {
    const state = this.host.state();
    if (this.host.hasSelection()) {
      this.host.applyToSelection((item) => {
        if (!item.fillColor) return;
        const spec = this.fillSpecOf(item) ?? this.fillSpec();
        spec.endColor = colorVal;
        if (spec.type === 'solid') spec.type = 'linear';
        this.applyFillSpec(item, spec);
      });
    } else {
      state.globalFillEndColor = colorVal;
      if (state.globalFillType === 'solid') state.globalFillType = 'linear';
    }
    this.updateCurrentDrawingStyles();
  }

  setFillAngle(deg: number): void {
    const state = this.host.state();
    const a = Number.isFinite(deg) ? deg : 0;
    if (this.host.hasSelection()) {
      this.host.applyToSelection((item) => {
        if (!item.fillColor) return;
        const spec = this.fillSpecOf(item) ?? this.fillSpec();
        spec.angle = a;
        if (spec.type === 'solid') spec.type = 'linear';
        this.applyFillSpec(item, spec);
      });
    } else {
      state.globalFillAngle = a;
    }
    this.updateCurrentDrawingStyles();
  }

  setFillInner(f: number): void {
    const state = this.host.state();
    const v = clampFillInner(f);
    if (this.host.hasSelection()) {
      this.host.applyToSelection((item) => {
        if (!item.fillColor) return;
        const spec = this.fillSpecOf(item) ?? this.fillSpec();
        spec.inner = v;
        if (spec.type === 'solid') spec.type = 'radial';
        this.applyFillSpec(item, spec);
      });
    } else {
      state.globalFillInner = v;
    }
    this.updateCurrentDrawingStyles();
  }

  setStrokeEnabled(enabled: boolean): void {
    const state = this.host.state();
    if (this.host.hasSelection()) {
      this.host.applyToSelection((item) => {
        if (enabled) {
          if (!item.strokeColor) item.strokeColor = state.globalStrokeColor;
          if (!(item.strokeWidth > 0)) item.strokeWidth = state.globalStrokeWidth;
        } else {
          item.strokeColor = null;
        }
      });
    } else {
      state.strokeEnabled = enabled;
      if (!state.strokeEnabled && !state.fillEnabled) state.fillEnabled = true;
    }
    this.updateCurrentDrawingStyles();
  }

  setFillEnabled(enabled: boolean): void {
    const state = this.host.state();
    if (this.host.hasSelection()) {
      this.host.applyToSelection((item) => {
        if (enabled) {
          if (!item.fillColor) this.applyFillSpec(item, this.fillSpec());
        } else {
          item.fillColor = null;
        }
      });
    } else {
      state.fillEnabled = enabled;
      if (!state.fillEnabled && !state.strokeEnabled) state.strokeEnabled = true;
    }
    this.updateCurrentDrawingStyles();
  }

  fillSpec(): FillSpec {
    const state = this.host.state();
    return {
      type: state.globalFillType,
      color: state.globalFillColor,
      endColor: state.globalFillEndColor,
      angle: state.globalFillAngle,
      inner: state.globalFillInner,
    };
  }

  strokeDashArrayValue(dash?: number, gap?: number): number[] | null {
    const state = this.host.state();
    const d = clampDash(dash ?? state.globalDashLength);
    const g = clampDash(gap ?? state.globalGapLength);
    if (d <= 0 && g <= 0) return null;
    return [d, g];
  }

  applyStrokeDash(item: Item, dash?: number, gap?: number): void {
    if (!item) return;
    const state = this.host.state();
    const arr = this.strokeDashArrayValue(dash ?? state.globalDashLength, gap ?? state.globalGapLength);
    item.dashArray = arr ? arr.slice() : [];
    item.strokeDashArray = arr;
    item.strokeDasharray = arr;
  }

  applyStrokeGeometry(item: Item): void {
    if (!item) return;
    const state = this.host.state();
    item.strokeCap = state.globalStrokeCap;
    item.strokeJoin = state.globalStrokeJoin;
    item.miterLimit = state.globalMiterLimit;
  }

  applyCurrentStyles(item: Item): void {
    if (!item) return;
    const state = this.host.state();
    item.strokeColor = state.strokeEnabled ? state.globalStrokeColor : null;
    item.strokeWidth = state.strokeEnabled ? state.globalStrokeWidth : 0;
    if (state.fillEnabled) this.applyFillSpec(item, this.fillSpec());
    else item.fillColor = null;
    this.applyStrokeGeometry(item);
    this.applyStrokeDash(item);
  }

  updateCurrentDrawingStyles(): void {
    const state = this.host.state();
    const strokeWidth = state.strokeEnabled ? state.globalStrokeWidth : 0;
    const strokeColor = state.strokeEnabled ? state.globalStrokeColor : null;
    const fillColor = state.fillEnabled ? state.globalFillColor : null;
    for (const item of this.host.liveItems()) {
      if (!item) continue;
      item.strokeWidth = strokeWidth;
      item.strokeColor = strokeColor;
      item.fillColor = fillColor;
      this.applyStrokeGeometry(item);
    }
    const path = this.host.livePath();
    if (path) this.applyStrokeDash(path);
    if (this.host.isDrawingShape()) this.host.updateShapePreview();
  }

  applyFillSpec(item: Item, spec: FillSpec = this.fillSpec()): void {
    const scope = this.scope;
    if (!item) return;
    if (spec.type === 'solid' || !item.bounds) {
      item.fillColor = spec.color;
      return;
    }
    const b = item.bounds;
    const c = b.center;
    const r = Math.max(1, Math.hypot(b.width, b.height) / 2);
    const gradient = new scope.Gradient();
    gradient.radial = spec.type === 'radial';
    const inner = spec.type === 'radial' ? clampFillInner(spec.inner) : 0;
    gradient.stops = [
      new scope.GradientStop(new scope.Color(spec.color), inner),
      new scope.GradientStop(new scope.Color(spec.endColor), 1),
    ];
    let origin: Item = c;
    let destination: Item = c.add(new scope.Point(r, 0));
    if (spec.type === 'linear') {
      const a = ((spec.angle || 0) * Math.PI) / 180;
      const dir = new scope.Point(Math.cos(a), Math.sin(a));
      origin = c.subtract(dir.multiply(r));
      destination = c.add(dir.multiply(r));
    }
    item.fillColor = { gradient, origin, destination };
  }

  fillSpecOf(item: Item): FillSpec | null {
    const state = this.host.state();
    const fc = item?.fillColor;
    if (!fc) return null;
    const g = fc.gradient;
    const fallback: FillSpec = {
      type: 'solid',
      color: itemHexColor(fc) ?? state.globalFillColor,
      endColor: state.globalFillEndColor,
      angle: state.globalFillAngle,
      inner: state.globalFillInner,
    };
    if (!g) return fallback;
    const stops = g.stops ?? [];
    const c0 = stops.length > 0 ? itemHexColor(stops[0].color) : null;
    const c1 = stops.length > 1 ? itemHexColor(stops[stops.length - 1].color) : null;
    const spec: FillSpec = {
      type: g.radial ? 'radial' : 'linear',
      color: c0 ?? fallback.color,
      endColor: c1 ?? fallback.endColor,
      angle: fallback.angle,
      inner: stops.length > 0 ? clampFillInner(Number(stops[0].offset) || 0) : 0,
    };
    const o = fc.origin;
    const d = fc.destination;
    if (o && d && typeof o.subtract === 'function') {
      const v = d.subtract(o);
      if (v.length > 0) spec.angle = (Math.atan2(v.y, v.x) * 180) / Math.PI;
    }
    return spec;
  }

  selectionPaint(item: Item | null): SelectionPaint | null {
    if (!item) return null;
    const state = this.host.state();
    const sc = itemHexColor(item.strokeColor);
    const fc = itemHexColor(item.fillColor);
    const cap: StrokeCap = item.strokeCap === 'butt' || item.strokeCap === 'square' ? item.strokeCap : 'round';
    const join: StrokeJoin = item.strokeJoin === 'miter' || item.strokeJoin === 'bevel' ? item.strokeJoin : 'round';
    const w = Number(item.strokeWidth);
    const m = Number(item.miterLimit);
    const da = item.dashArray || item.strokeDashArray || item.strokeDasharray;
    let dashLength = 0;
    let gapLength = 0;
    if (Array.isArray(da) && da.length) {
      dashLength = Number(da[0]) || 0;
      gapLength = da.length > 1 ? Number(da[1]) || 0 : dashLength;
    }
    return {
      strokeOn: sc !== null,
      strokeColor: sc ?? state.globalStrokeColor,
      strokeWidth: Number.isFinite(w) && w > 0 ? w : state.globalStrokeWidth,
      strokeCap: cap,
      strokeJoin: join,
      miterLimit: Number.isFinite(m) && m >= 1 ? m : state.globalMiterLimit,
      dashLength,
      gapLength,
      fillOn: fc !== null,
      fillColor: fc ?? state.globalFillColor,
      fillSpec: this.fillSpecOf(item) ?? this.fillSpec(),
    };
  }
}

function clampDash(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 80) return 80;
  return n;
}

function clampFillInner(f: number): number {
  if (!Number.isFinite(f)) return 0;
  return Math.max(0, Math.min(0.95, f));
}

export function itemHexColor(c: Item): string | null {
  if (!c) return null;
  if (typeof c === 'string') return c;
  if (typeof c.toCSS === 'function') {
    try { return c.toCSS(true); } catch { return null; }
  }
  return null;
}
