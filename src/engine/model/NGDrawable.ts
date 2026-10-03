// Common durable page-item contract. Owns identity and authoring data only.
// Selection maps through id; bounds, geometry, and Paper items are derived.
// No independent manager state, browser objects, or cached geometry live here.
import type { AffineTransform } from './geometryResolution';
import type { NGPath } from './NGPath';
import type { NGShape } from './NGShape';
import type { NGText } from './NGText';
import type { NGImage } from './NGImage';
import type { NGGroup } from './NGGroup';

export interface NGDrawableBase {
  id: string;
  layerId: string;
  transform: AffineTransform;
  opacity: number;
  visible: boolean;
  locked: boolean;
  name?: string;
  styleId?: string;
}
export interface NGPathDrawable extends NGDrawableBase { kind: 'path'; source: NGPath }
export interface NGShapeDrawable extends NGDrawableBase { kind: 'shape'; source: NGShape }
export interface NGTextDrawable extends NGDrawableBase { kind: 'text'; source: NGText }
export interface NGImageDrawable extends NGDrawableBase { kind: 'image'; source: NGImage }
export interface NGGroupDrawable extends NGDrawableBase { kind: 'group'; source: NGGroup }
export type NGDrawable = NGPathDrawable | NGShapeDrawable | NGTextDrawable
  | NGImageDrawable | NGGroupDrawable;
