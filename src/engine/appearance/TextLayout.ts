// Body text, boundary glyphs, and shape+text grouping.
// Owns no text settings. Reads TextLayoutConfig and FontMetrics supplied by
// the caller. Mutates only the Paper items it creates (and opacity on fade/reset).
// Preview parenting stays on the engine. Font measurement stays in FontMetrics.
// Tested from tests/text-layout.test.mjs and tests/display-text-layout.test.mjs.
import type { FontMetrics } from '../fontMetrics';
import type {
  DisplayFlow,
  GlyphOrientation,
  SplineTextPlacement,
  TextMode,
  TextSpec,
} from '../types';

type Item = any;

export interface TextLayoutConfig {
  spec: TextSpec;
  textModeEnabled: boolean;
  textMode: TextMode;
  displayFlow: DisplayFlow;
  glyphOrientation: GlyphOrientation;
  splineTextPlacement: SplineTextPlacement;
  displayOffset: number;
  circumferenceGap: number;
  circumferenceAngleOffset: number;
  fillEnabled: boolean;
  fillColor: string;
  strokeColor: string;
}

interface StraightBoundaryEdge {
  start: number;
  length: number;
}

export class TextLayout {
  private readonly scope: paper.PaperScope;
  private readonly config: () => TextLayoutConfig;
  private readonly metrics: FontMetrics;
  constructor(scope: paper.PaperScope, config: () => TextLayoutConfig, metrics: FontMetrics) {
    this.scope = scope;
    this.config = config;
    this.metrics = metrics;
  }

  shapePartOf(item: Item): Item {
    if (item && item.data && item.data.shapeTextGroup && Array.isArray(item.children)) {
      const geo = item.children.find((c: Item) => !(c.data && c.data.isShapeText));
      if (geo) return geo;
    }
    return item;
  }

  withShapeText(path: Item, isPreview: boolean, textRotation = 0, center: Item = null): Item {
    const cfg = this.config();
    if (!path || !cfg.textModeEnabled) return path;
    const text = cfg.textMode === 'body' ? this.createBodyTextFor(path) : this.createBoundaryText(path);
    if (!text) return path;
    if (Number.isFinite(textRotation) && textRotation !== 0 && center && text.children) {
      text.rotate(textRotation, center);
    }
    const group: Item = new this.scope.Group();
    group.addChild(path);
    group.addChild(text);
    group.data.shapeTextGroup = true;
    if (isPreview) this.fadeShapeText(text);
    return group;
  }

  /** Text derived from a boundary the caller will discard, such as a bare rect frame. */
  textForBoundary(boundary: Item, isPreview: boolean): Item | null {
    if (!this.config().textModeEnabled) return null;
    const text = this.config().textMode === 'body'
      ? this.createBodyTextFor(boundary)
      : this.createBoundaryText(boundary);
    if (text && isPreview) this.fadeShapeText(text);
    return text;
  }

  fadeShapeText(item: Item): void {
    if (!item) return;
    if (item.className === 'PointText') {
      item.opacity = 0.7;
      return;
    }
    if (Array.isArray(item.children)) item.children.forEach((c: Item) => this.fadeShapeText(c));
  }

  resetStampedText(item: Item): void {
    if (!item) return;
    item.opacity = 1;
    if (Array.isArray(item.children)) item.children.forEach((c: Item) => this.resetStampedText(c));
  }

  layoutBodyLines(spec: TextSpec, maxWidth: number, content?: string): string[] {
    const words = (content ?? spec.content).split(/\s+/).filter(Boolean);
    const size = Math.max(4, spec.fontSize);
    const widthOf = (s: string): number => this.metrics.advance(s, spec.fontFamily, size, spec.fontWeight);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const trial = cur ? `${cur} ${w}` : w;
      if (cur && widthOf(trial) > maxWidth) {
        lines.push(cur);
        cur = w;
      } else {
        cur = trial;
      }
    }
    if (cur) lines.push(cur);
    if (lines.length === 0) lines.push(' ');
    return lines;
  }

  createBodyTextFor(boundary: Item, content?: string): Item | null {
    const scope = this.scope;
    const spec = this.config().spec;
    const bounds = boundary.bounds;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    const size = Math.max(4, spec.fontSize);
    const lines = this.layoutBodyLines(spec, Math.max(8, bounds.width * 0.75), content);
    const leading = Math.max(0.8, spec.leading || 1.2) * size;
    const group: Item = new scope.Group();
    const startY = bounds.center.y - ((lines.length - 1) * leading) / 2;
    lines.forEach((line, i) => {
      const pt: Item = new scope.PointText(new scope.Point(bounds.center.x, startY + i * leading));
      pt.content = line;
      this.styleTextItem(pt, spec);
      pt.data.textKind = 'body';
      group.addChild(pt);
    });
    if (boundary.closed !== false) {
      const mask: Item = boundary.clone();
      mask.clipMask = true;
      group.addChild(mask);
    }
    group.data.isShapeText = true;
    group.data.textKind = 'body';
    return group;
  }

  createBoundaryText(boundary: Item, content?: string, line2?: string): Item | null {
    const scope = this.scope;
    const cfg = this.config();
    const spec = cfg.spec;
    const size = Math.max(4, spec.fontSize);
    const length = boundary.length;
    if (!(length > 0)) return null;
    const lines = [content ?? spec.content, line2 ?? spec.line2].filter((s) => s && s.length > 0);
    if (lines.length === 0) return null;
    const offset = Math.max(0, cfg.displayOffset);
    const start = ((((-cfg.circumferenceAngleOffset % 360) + 360) % 360) / 360) * length;
    let interiorSign = 0;
    if (boundary.closed !== false) {
      const p0 = boundary.getPointAt(0);
      let n0 = boundary.getNormalAt(0);
      if (p0 && n0 && n0.length > 0) {
        n0 = n0.normalize();
        const probeLen = Math.max(1, offset);
        const plusIn = containsPoint(boundary, p0.add(n0.multiply(probeLen)));
        const minusIn = containsPoint(boundary, p0.subtract(n0.multiply(probeLen)));
        if (plusIn !== minusIn) interiorSign = plusIn ? 1 : -1;
        else {
          const b = boundary.bounds;
          const toC = b ? b.center.subtract(p0) : null;
          interiorSign = toC && toC.dot(n0) >= 0 ? 1 : -1;
        }
      }
    }
    const straightEdges = this.straightBoundaryEdges(boundary);
    if (straightEdges.length > 0) {
      const text = this.createEdgeDisplayText(boundary, lines, straightEdges, start, interiorSign, offset, spec);
      if (text) return text;
    }
    const group: Item = new scope.Group();
    lines.forEach((text, li) => {
      const side = cfg.displayFlow === 'interior' ? interiorSign : -interiorSign;
      const ring = offset * (li + 1);
      let d = start;
      let lastTan: number | null = null;
      for (const ch of text) {
        const w = ch === ' ' ? size * 0.4 : this.metrics.advance(ch, spec.fontFamily, size, spec.fontWeight);
        const step = w + cfg.circumferenceGap;
        if (d + step > start + length) break;
        if (ch === ' ') { d += step; continue; }
        const mid = d + w / 2;
        const pos = boundary.getPointAt(mid);
        if (!pos) break;
        const tan = boundary.getTangentAt(mid);
        if (tan && tan.length > 0) lastTan = tan.angle;
        if (lastTan === null) { d += step; continue; }
        let nor = boundary.getNormalAt(mid);
        if (!nor || nor.length === 0) {
          const ra = ((lastTan + 90) * Math.PI) / 180;
          nor = new scope.Point(Math.cos(ra), Math.sin(ra));
        } else nor = nor.normalize();
        const pt: Item = new scope.PointText(new scope.Point(0, 0));
        pt.content = ch;
        this.styleTextItem(pt, spec);
        pt.justification = 'center';
        const at = pos.add(nor.multiply(side * ring));
        pt.position = at;
        const facing = cfg.glyphOrientation === 'outward' ? -interiorSign : interiorSign;
        pt.rotate(facing !== 0 ? nor.multiply(facing).angle + 90 : lastTan, at);
        if (boundary.closed === false) this.anchorSplineGlyph(pt, at, spec, size);
        pt.data.textKind = 'display';
        group.addChild(pt);
        d += step;
      }
    });
    if (group.children.length === 0) {
      group.remove();
      return null;
    }
    group.data.isShapeText = true;
    group.data.textKind = 'display';
    return group;
  }

  private styleTextItem(item: Item, spec: TextSpec): void {
    if (!item) return;
    const cfg = this.config();
    item.fontFamily = spec.fontFamily;
    item.fontSize = Math.max(4, spec.fontSize);
    item.fontWeight = spec.fontWeight;
    item.fillColor = cfg.fillEnabled ? cfg.fillColor : cfg.strokeColor;
    item.strokeColor = null;
    item.justification = spec.justification;
    item.leading = Math.max(0.8, spec.leading || 1.2) * Math.max(4, spec.fontSize);
    item.data.isShapeText = true;
  }

  private straightBoundaryEdges(boundary: Item): StraightBoundaryEdge[] {
    if (boundary.closed === false || !Array.isArray(boundary.segments)) return [];
    const segments = boundary.segments;
    const curves = boundary.curves;
    if (segments.length < 3 || !Array.isArray(curves) || curves.length !== segments.length) return [];
    if (segments.some((segment: Item) =>
      (segment.handleIn?.length ?? 0) > 1e-6 || (segment.handleOut?.length ?? 0) > 1e-6,
    )) return [];
    let start = 0;
    const edges: StraightBoundaryEdge[] = [];
    for (const curve of curves) {
      const length = curve.length;
      if (!(length > 1e-6)) return [];
      edges.push({ start, length });
      start += length;
    }
    return edges;
  }

  private createEdgeDisplayText(
    boundary: Item,
    lines: string[],
    edges: StraightBoundaryEdge[],
    start: number,
    interiorSign: number,
    offset: number,
    spec: TextSpec,
  ): Item {
    const size = Math.max(4, spec.fontSize);
    const length = boundary.length;
    const startAt = ((start % length) + length) % length;
    let firstEdge = edges.findIndex((edge) => startAt >= edge.start && startAt < edge.start + edge.length);
    if (firstEdge < 0) firstEdge = 0;
    const group: Item = new this.scope.Group();
    const cfg = this.config();
    for (let li = 0; li < lines.length; li++) {
      const words = lines[li].trim().split(/\s+/).filter(Boolean);
      let wordIndex = 0;
      const side = cfg.displayFlow === 'interior' ? interiorSign : -interiorSign;
      const ring = offset * (li + 1);
      for (let edgeOffset = 0; edgeOffset < edges.length && wordIndex < words.length; edgeOffset++) {
        const edge = edges[(firstEdge + edgeOffset) % edges.length];
        let text = '';
        while (wordIndex < words.length) {
          const candidate = text ? `${text} ${words[wordIndex]}` : words[wordIndex];
          if (this.displayTextAdvance(candidate, spec, size) > edge.length) break;
          text = candidate;
          wordIndex++;
        }
        if (!text) continue;
        const advance = this.displayTextAdvance(text, spec, size);
        const alignOffset = spec.justification === 'right'
          ? edge.length - advance
          : spec.justification === 'center' ? (edge.length - advance) / 2 : 0;
        this.addDisplayGlyphs(group, boundary, text, edge.start + alignOffset, side, ring, interiorSign, spec, size);
      }
    }
    group.data.isShapeText = true;
    group.data.textKind = 'display';
    return group;
  }

  private displayTextAdvance(text: string, spec: TextSpec, size: number): number {
    let advance = 0;
    for (const ch of text) advance += this.displayGlyphStep(ch, spec, size);
    return advance;
  }

  private displayGlyphStep(ch: string, spec: TextSpec, size: number): number {
    const width = ch === ' ' ? size * 0.4 : this.metrics.advance(ch, spec.fontFamily, size, spec.fontWeight);
    return width + this.config().circumferenceGap;
  }

  private addDisplayGlyphs(
    group: Item, boundary: Item, text: string, start: number, side: number, ring: number,
    interiorSign: number, spec: TextSpec, size: number,
  ): void {
    const scope = this.scope;
    let d = start;
    let lastTan: number | null = null;
    for (const ch of text) {
      const step = this.displayGlyphStep(ch, spec, size);
      if (ch === ' ') { d += step; continue; }
      const mid = d + (step - this.config().circumferenceGap) / 2;
      const pos = boundary.getPointAt(mid);
      if (!pos) break;
      const tan = boundary.getTangentAt(mid);
      if (tan && tan.length > 0) lastTan = tan.angle;
      if (lastTan === null) { d += step; continue; }
      let nor = boundary.getNormalAt(mid);
      if (!nor || nor.length === 0) {
        const ra = ((lastTan + 90) * Math.PI) / 180;
        nor = new scope.Point(Math.cos(ra), Math.sin(ra));
      } else nor = nor.normalize();
      const pt: Item = new scope.PointText(new scope.Point(0, 0));
      pt.content = ch;
      this.styleTextItem(pt, spec);
      pt.justification = 'center';
      const at = pos.add(nor.multiply(side * ring));
      pt.position = at;
      const facing = this.config().glyphOrientation === 'outward' ? -interiorSign : interiorSign;
      pt.rotate(facing !== 0 ? nor.multiply(facing).angle + 90 : lastTan, at);
      pt.data.textKind = 'display';
      group.addChild(pt);
      d += step;
    }
  }

  private anchorSplineGlyph(pt: Item, at: Item, spec: TextSpec, size: number): void {
    try {
      const center = pt.bounds ? pt.bounds.center : null;
      const anchor = pt.point;
      if (!center || !anchor) return;
      const up = center.subtract(anchor);
      const dcb = up.length;
      if (!(dcb > 0)) return;
      const dir = up.normalize();
      const m = this.metrics.vertical(spec.fontFamily, size, spec.fontWeight);
      const placement = this.config().splineTextPlacement;
      const extra = placement === 'above' ? m.desc : placement === 'below' ? -m.asc : 0;
      pt.position = at.add(dir.multiply(dcb + extra));
    } catch {
      // Keep the centered glyph when bounds are unavailable.
    }
  }
}

function containsPoint(boundary: Item, pt: Item): boolean {
  try { return !!boundary.contains(pt); } catch { return false; }
}
