import type { LengthUnit } from '../types';

export interface DocumentPoint { x: number; y: number }
export type SVGLengthUnit = 'px' | 'pt' | 'pc' | 'in' | 'cm' | 'mm' | 'q';
export const PT_PER_INCH = 72;
export const PT_PER_CM = PT_PER_INCH / 2.54;
export const SVG_PX_PER_INCH = 96;

// Document geometry is measured in points. Paper's SVG importer handles full
// SVG transforms; these scalar conversions define the app's unit boundary.
export class CoordinateManager {
  documentPoint(point: DocumentPoint): DocumentPoint {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Invalid document point');
    return { x: point.x, y: point.y };
  }

  toPoints(value: number, unit: LengthUnit): number {
    this.finite(value);
    if (unit === 'inch') return value * PT_PER_INCH;
    if (unit === 'cm') return value * PT_PER_CM;
    if (unit === 'pt') return value;
    throw new Error(`Unsupported length unit: ${unit}`);
  }

  fromPoints(points: number, unit: LengthUnit): number {
    this.finite(points);
    if (unit === 'inch') return points / PT_PER_INCH;
    if (unit === 'cm') return points / PT_PER_CM;
    if (unit === 'pt') return points;
    throw new Error(`Unsupported length unit: ${unit}`);
  }

  svgToPoints(value: number, unit: SVGLengthUnit = 'px'): number {
    this.finite(value);
    switch (unit) {
      case 'px': return value * PT_PER_INCH / SVG_PX_PER_INCH;
      case 'pt': return value;
      case 'pc': return value * 12;
      case 'in': return value * PT_PER_INCH;
      case 'cm': return value * PT_PER_CM;
      case 'mm': return value * PT_PER_INCH / 25.4;
      case 'q': return value * PT_PER_INCH / 101.6;
    }
  }

  pointsToSvg(value: number, unit: SVGLengthUnit = 'px'): number {
    this.finite(value);
    return value / this.svgToPoints(1, unit);
  }

  roundPoints(value: number, decimals = 6): number {
    this.finite(value);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 12) throw new Error('Invalid point precision');
    const scale = 10 ** decimals;
    const rounded = Math.round(value * scale) / scale;
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  private finite(value: number): void {
    if (!Number.isFinite(value)) throw new Error('Document length must be finite');
  }
}

export const coordinates = new CoordinateManager();
