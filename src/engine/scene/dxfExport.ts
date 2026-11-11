// Minimal ASCII DXF writer (Tier Two, Slice 9c). Emits an
// AC1015 file with a single layer and one LWPOLYLINE per contour.
// Curves arrive pre-flattened to polylines by the caller (the
// engine samples Paper curves); coordinates are already in DXF
// space (y-up, origin at the export box's lower-left). Text and
// raster items are not represented — a documented limit of the
// minimal writer.
import type { Vec2 } from '../model/geometryResolution';

export interface DxfPolyline {
  points: Vec2[];
  closed: boolean;
}

function num(n: number): string {
  const rounded = Math.round(n * 10000) / 10000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** Serialize polylines into a complete DXF document string. */
export function dxfDocument(polylines: DxfPolyline[]): string {
  const lines: string[] = [];
  const pair = (code: number, value: string | number): void => {
    lines.push(String(code), String(value));
  };
  pair(0, 'SECTION'); pair(2, 'HEADER');
  pair(9, '$ACADVER'); pair(1, 'AC1015');
  pair(9, '$INSUNITS'); pair(70, 1); // inches-neutral: unitless points scale
  pair(0, 'ENDSEC');
  pair(0, 'SECTION'); pair(2, 'TABLES');
  pair(0, 'TABLE'); pair(2, 'LAYER'); pair(70, 1);
  pair(0, 'LAYER'); pair(2, '0'); pair(70, 0); pair(62, 7); pair(6, 'CONTINUOUS');
  pair(0, 'ENDTAB');
  pair(0, 'ENDSEC');
  pair(0, 'SECTION'); pair(2, 'ENTITIES');
  for (const poly of polylines) {
    if (poly.points.length < 2) continue;
    pair(0, 'LWPOLYLINE');
    pair(100, 'AcDbEntity'); pair(8, '0');
    pair(100, 'AcDbPolyline');
    pair(90, poly.points.length);
    pair(70, poly.closed ? 1 : 0);
    for (const p of poly.points) {
      pair(10, num(p.x));
      pair(20, num(p.y));
    }
  }
  pair(0, 'ENDSEC');
  pair(0, 'EOF');
  return lines.join('\n') + '\n';
}

/** Convert document-space (y-down) polylines into DXF space for an
 * export box: origin moves to the box's lower-left, y flips up. */
export function toDxfSpace(polylines: DxfPolyline[], box: { x: number; y: number; height: number }): DxfPolyline[] {
  return polylines.map((poly) => ({
    closed: poly.closed,
    points: poly.points.map((p) => ({
      x: p.x - box.x,
      y: box.height - (p.y - box.y),
    })),
  }));
}
