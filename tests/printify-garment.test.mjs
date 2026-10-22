import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createPrintifyGarment,
  exportPngSizeForArea,
  exportScaleForArea,
  placeholderRectPoints,
  validatePrintifyGarment,
  PrintifyGarmentValidationError,
} from '../src/engine/model/NGPrintifyGarment.ts';
import {
  garmentAreaArtwork,
  isNonArtworkItem,
  isPrintifyAreaItem,
  isPrintifyGarmentItem,
  PRINTIFY_AREA_DATA_KEY,
  PRINTIFY_GARMENT_DATA_KEY,
} from '../src/engine/scene/printifyGarment.ts';
import {
  catalogBlueprintsUrl,
  catalogVariantsUrl,
  productPayloadForGarment,
  shopProductsUrl,
  uploadPayloadForArea,
  uploadsUrl,
} from '../src/engine/document/printifyClient.ts';
import { PRINTIFY_COMMANDS } from '../src/ui/fileCommands.ts';
import { parseInCanvasXML } from '../src/ui/inCanvasGui.ts';

function garment() {
  return createPrintifyGarment({
    name: 'Tee',
    blueprintId: 6,
    printProviderId: 1,
    variantIds: [101, 102],
    templateSrcs: ['https://example.com/tee-front.svg'],
    areas: [
      { position: 'front', decorationMethod: 'dtg', requiredPx: { width: 4500, height: 5700 } },
      { position: 'back', decorationMethod: 'dtg', requiredPx: { width: 4500, height: 5700 } },
    ],
    origin: { x: 0, y: 0 },
  });
}

test('placeholder scale math round-trips to exact Printify pixels', () => {
  const requiredPx = { width: 4500, height: 5700 };
  const rect = placeholderRectPoints(requiredPx, 360);
  assert.ok(Math.abs((rect.width / rect.height) - (4500 / 5700)) < 1e-9);
  const scale = exportScaleForArea(rect, requiredPx);
  assert.deepStrictEqual(exportPngSizeForArea(rect, scale), requiredPx);
  assert.throws(() => placeholderRectPoints({ width: 0, height: 10 }), PrintifyGarmentValidationError);
  assert.throws(() => exportScaleForArea({ width: 0, height: 10 }, requiredPx), PrintifyGarmentValidationError);
});

test('garment records validate strictly with unique areas and variants', () => {
  const g = garment();
  assert.doesNotThrow(() => validatePrintifyGarment(g));
  assert.equal(g.areas.length, 2);
  assert.throws(() => validatePrintifyGarment({ ...g, blueprintId: 0 }), PrintifyGarmentValidationError);
  assert.throws(() => validatePrintifyGarment({ ...g, areas: [] }), PrintifyGarmentValidationError);
  assert.throws(() => validatePrintifyGarment({ ...g, variantIds: [1, 1] }), PrintifyGarmentValidationError);
  assert.throws(() => validatePrintifyGarment({ ...g, sceneItem: {} }), PrintifyGarmentValidationError);
  const dup = structuredClone(g);
  dup.areas[1].id = dup.areas[0].id;
  assert.throws(() => validatePrintifyGarment(dup), PrintifyGarmentValidationError);
});

test('garment scene tags partition artwork from outlines and areas', () => {
  const outline = { data: { [PRINTIFY_GARMENT_DATA_KEY]: true } };
  const area = { data: { [PRINTIFY_AREA_DATA_KEY]: true } };
  const frame = { data: { isExportFrame: true } };
  const art = { data: {}, bounds: { x: 10, y: 10, width: 20, height: 20 } };
  assert.equal(isPrintifyGarmentItem(outline), true);
  assert.equal(isPrintifyAreaItem(area), true);
  assert.equal(isNonArtworkItem(frame), true);
  assert.equal(isNonArtworkItem(art), false);
  const items = [
    outline,
    { data: { [PRINTIFY_AREA_DATA_KEY]: true }, bounds: { x: 0, y: 0, width: 400, height: 360 } },
    { data: {}, bounds: { x: 10, y: 10, width: 20, height: 20 } },
    { data: {}, bounds: { x: 900, y: 900, width: 10, height: 10 } },
  ];
  const hit = garmentAreaArtwork({ x: 0, y: 0, width: 400, height: 360 }, items);
  assert.equal(hit.length, 1);
});

test('printify client builds catalog, upload, and product payloads', () => {
  assert.equal(catalogBlueprintsUrl(), 'https://api.printify.com/v1/catalog/blueprints.json');
  assert.equal(catalogVariantsUrl(6, 1), 'https://api.printify.com/v1/catalog/blueprints/6/print_providers/1/variants.json');
  assert.equal(shopProductsUrl(123), 'https://api.printify.com/v1/shops/123/products.json');
  assert.equal(uploadsUrl(), 'https://api.printify.com/v1/uploads.json');
  const upload = uploadPayloadForArea('Tee', 'front', 'aGVsbG8=');
  assert.equal(upload.file_name, 'tee-front.png');
  assert.throws(() => uploadPayloadForArea('Tee', 'front', ''), /non-empty/);
  const payload = productPayloadForGarment(garment(), { front: 'u1', back: 'u2' }, { priceCents: 2500 });
  assert.equal(payload.blueprint_id, 6);
  assert.equal(payload.variants.length, 2);
  assert.equal(payload.print_areas[0].placeholders.length, 2);
  assert.deepEqual(payload.print_areas[0].placeholders[0].images[0], { id: 'u1', x: 0.5, y: 0.5, scale: 1, angle: 0 });
  assert.throws(() => productPayloadForGarment(garment(), { front: 'u1' }), /back/);
});

test('printify file commands and in-canvas spec exist', () => {
  assert.ok(PRINTIFY_COMMANDS.includes('export-printify-area'));
  assert.ok(PRINTIFY_COMMANDS.includes('export-printify-product'));
  const xml = readFileSync(new URL('../src/ui/inCanvas/printifyGarment.xml', import.meta.url), 'utf8');
  const parsed = parseInCanvasXML(xml);
  assert.ok('spec' in parsed);
  if ('spec' in parsed) assert.equal(parsed.spec.id, 'printifyGarment');
});
