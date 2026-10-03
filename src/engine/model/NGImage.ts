import type { NGPath } from './NGPath';

// Assets are referenced by ID, never by a Paper Raster or browser Image.
// A vector boundary or mask does not turn raster pixels into vector artwork.
export interface NGImage {
  assetId: string;
  assetKind: 'raster' | 'svg';
  width: number;
  height: number;
  boundary?: NGPath;
  mask?: NGPath;
}
