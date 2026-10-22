// Printify REST helpers. Pure request builders only: no fetch, no token
// storage, no side effects. The caller supplies the personal access token
// (Settings, never committed) and performs the fetch, so these builders stay
// unit-testable and the secret never lands in document truth.
// Endpoints per https://developers.printify.com/ (V1): catalog blueprints,
// print providers, variants with placeholders, uploads, shop products.
import type { PrintifyGarmentRecord } from '../model/NGPrintifyGarment';

export const PRINTIFY_API_BASE = 'https://api.printify.com/v1';
export const PRINTIFY_GLOBAL_RATE_LIMIT_PER_MIN = 600;
export const PRINTIFY_CATALOG_RATE_LIMIT_PER_MIN = 100;

export function catalogBlueprintsUrl(): string {
  return `${PRINTIFY_API_BASE}/catalog/blueprints.json`;
}

export function catalogVariantsUrl(blueprintId: number, printProviderId: number): string {
  if (!Number.isSafeInteger(blueprintId) || blueprintId <= 0) throw new Error('blueprintId: expected positive integer');
  if (!Number.isSafeInteger(printProviderId) || printProviderId <= 0) throw new Error('printProviderId: expected positive integer');
  return `${PRINTIFY_API_BASE}/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`;
}

export function shopProductsUrl(shopId: string | number): string {
  if ((typeof shopId !== 'string' && typeof shopId !== 'number') || String(shopId).trim().length === 0) {
    throw new Error('shopId: expected non-empty shop id');
  }
  return `${PRINTIFY_API_BASE}/shops/${shopId}/products.json`;
}

export function uploadsUrl(): string {
  return `${PRINTIFY_API_BASE}/uploads.json`;
}

export interface PrintifyUploadPayload {
  file_name: string;
  contents: string;
}

/** Upload payload for one exported area PNG. Contents is base64 without the
 * data-url prefix; file_name carries garment + position for traceability. */
export function uploadPayloadForArea(
  garmentName: string,
  position: string,
  pngBase64: string,
): PrintifyUploadPayload {
  if (pngBase64.length === 0) throw new Error('pngBase64: expected non-empty base64');
  const stem = `${garmentName}-${position}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'printify-area';
  return { file_name: `${stem}.png`, contents: pngBase64 };
}

export interface PrintifyProductImageRef {
  id: string;
  x: number;
  y: number;
  scale: number;
  angle: number;
}

export interface PrintifyProductPayload {
  title: string;
  description: string;
  blueprint_id: number;
  print_provider_id: number;
  variants: { id: number; price: number; is_enabled: boolean }[];
  print_areas: {
    variant_ids: number[];
    placeholders: { position: string; images: PrintifyProductImageRef[] }[];
  }[];
}

/** Product create payload wiring each garment area to its Printify
 * placeholder position. One image per area, centered at full-area scale;
 * priceCents applies to every enabled variant. */
export function productPayloadForGarment(
  garment: PrintifyGarmentRecord,
  uploadsByPosition: Record<string, string>,
  opts?: { title?: string; description?: string; priceCents?: number },
): PrintifyProductPayload {
  const price = opts?.priceCents ?? 2000;
  if (!Number.isSafeInteger(price) || price <= 0) throw new Error('priceCents: expected positive integer cents');
  const placeholders = garment.areas.map((area) => {
    const id = uploadsByPosition[area.position];
    if (!id) throw new Error(`Missing upload id for position "${area.position}"`);
    return { position: area.position, images: [{ id, x: 0.5, y: 0.5, scale: 1, angle: 0 }] };
  });
  return {
    title: opts?.title ?? garment.name,
    description: opts?.description ?? `Designed in NibGlider: ${garment.name}`,
    blueprint_id: garment.blueprintId,
    print_provider_id: garment.printProviderId,
    variants: garment.variantIds.map((id) => ({ id, price, is_enabled: true })),
    print_areas: [{ variant_ids: [...garment.variantIds], placeholders }],
  };
}
