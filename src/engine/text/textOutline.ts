// Convert live text to outline geometry (Tier Two, Slice 6).
// Walks an opentype.js font glyph by glyph — with kerning and the
// spec's tracking added between glyphs — and rebuilds each glyph's
// contours as Paper paths in "glyph space": origin at the baseline
// start of the line, y growing downward, exactly the space
// opentype's getPath produces. The caller transforms the result by
// the text item's matrix, so rotation and the synthesized italic
// shear carry over. Counters (the hole in 'o') ride as reversed
// contours inside a CompoundPath with nonzero fill.
import type * as opentype from 'opentype.js';

type Font = opentype.Font;
type Item = any;

export interface OutlineResult {
  /** CompoundPath (or single Path) in glyph space. */
  item: Item;
  /** Tracked advance width of the whole string, in points. */
  width: number;
}

interface Cmd { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }

/** Rebuild one glyph path's command list as Paper paths (one per
 * closed/open contour). */
function contoursOf(scope: any, commands: Cmd[]): Item[] {
  const paths: Item[] = [];
  let path: Item = null;
  let current: { x: number; y: number } | null = null;
  const segment = (x: number, y: number, handleIn?: { x: number; y: number }): Item => (
    new scope.Segment(
      new scope.Point(x, y),
      handleIn ? new scope.Point(handleIn.x, handleIn.y) : new scope.Point(0, 0),
      new scope.Point(0, 0),
    )
  );
  for (const cmd of commands) {
    if (cmd.type === 'M') {
      path = new scope.Path({ insert: false });
      path.add(segment(cmd.x ?? 0, cmd.y ?? 0));
      paths.push(path);
      current = { x: cmd.x ?? 0, y: cmd.y ?? 0 };
    } else if (!path || !current) {
      continue;
    } else if (cmd.type === 'L') {
      path.add(segment(cmd.x ?? 0, cmd.y ?? 0));
      current = { x: cmd.x ?? 0, y: cmd.y ?? 0 };
    } else if (cmd.type === 'C') {
      const end = { x: cmd.x ?? 0, y: cmd.y ?? 0 };
      const last = path.lastSegment;
      if (last) {
        last.handleOut = new scope.Point((cmd.x1 ?? 0) - current.x, (cmd.y1 ?? 0) - current.y);
      }
      path.add(segment(end.x, end.y, { x: (cmd.x2 ?? 0) - end.x, y: (cmd.y2 ?? 0) - end.y }));
      current = end;
    } else if (cmd.type === 'Q') {
      // Quadratic → cubic: control points at 2/3 toward the quad CP.
      const end = { x: cmd.x ?? 0, y: cmd.y ?? 0 };
      const cp = { x: cmd.x1 ?? 0, y: cmd.y1 ?? 0 };
      const c1 = { x: current.x + (2 / 3) * (cp.x - current.x), y: current.y + (2 / 3) * (cp.y - current.y) };
      const c2 = { x: end.x + (2 / 3) * (cp.x - end.x), y: end.y + (2 / 3) * (cp.y - end.y) };
      const last = path.lastSegment;
      if (last) last.handleOut = new scope.Point(c1.x - current.x, c1.y - current.y);
      path.add(segment(end.x, end.y, { x: c2.x - end.x, y: c2.y - end.y }));
      current = end;
    } else if (cmd.type === 'Z') {
      path.closed = true;
      current = null;
    }
  }
  return paths.filter((p) => p.segments && p.segments.length >= 2);
}

/**
 * Outline a single line of text. Returns null when the font yields
 * no contours (empty/space-only content). Spaces still advance.
 */
export function outlineText(
  scope: any,
  font: Font,
  text: string,
  size: number,
  letterSpacing = 0,
): OutlineResult | null {
  const px = Math.max(4, size);
  const scale = px / font.unitsPerEm;
  const tracking = Number.isFinite(letterSpacing) ? letterSpacing : 0;
  const contours: Item[] = [];
  let x = 0;
  let prev: opentype.Glyph | null = null;
  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    if (prev) x += font.getKerningValue(prev, glyph) * scale;
    if (ch !== ' ') {
      const path = glyph.getPath(x, 0, px);
      contours.push(...contoursOf(scope, path.commands as Cmd[]));
    }
    x += (glyph.advanceWidth ?? 0) * scale + tracking;
    prev = glyph;
  }
  const width = Math.max(0, x - (text.length > 0 ? tracking : 0));
  if (contours.length === 0) return null;
  let item: Item;
  if (contours.length === 1) {
    item = contours[0];
  } else {
    item = new scope.CompoundPath({ insert: false });
    for (const contour of contours) item.addChild(contour);
    item.fillRule = 'nonzero';
  }
  return { item, width };
}
