import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { applyEngineSettings, snapshotEngineSettings } from '../src/engine/engineSettings.ts';
import { PrintifyApiError } from '../src/engine/document/printifyClient.ts';
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

function engine() {
  const s = new paper.PaperScope();
  s.setup(new s.Size(800, 600));
  const e = new NibGliderEngine(s, () => {});
  return {
    s, e, layer: s.project.activeLayer,
    cleanup: () => { e.cancelCurrentDrawingOperation(); s.project.remove(); },
  };
}

function depositCircle(s, e) {
  e.mousePt = new s.Point(120, 90);
  e.circleInnerShapeType = 'circle';
  e.circleKC('radius');
  e.pointer.onMouseMove({ point: new s.Point(170, 90) });
  e.endPathOrShape();
}

function assertBoxesClose(actual, expected) {
  for (const key of ['x', 'y', 'width', 'height']) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 1e-6, `${key}: ${actual[key]} vs ${expected[key]}`);
  }
}

function garmentSpec() {
  return {
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
  };
}

test('garment deposit, select, update, and delete manage the group lifecycle with undo', () => {
  const { e, layer, cleanup } = engine();
  try {
    assert.equal(e.depositPrintifyGarment({ ...garmentSpec(), blueprintId: 0 }), null);
    const id = e.depositPrintifyGarment(garmentSpec());
    assert.ok(typeof id === 'string');
    assert.equal(e.listPrintifyGarments().length, 1);
    assert.equal(layer.children.length, 3);
    assert.equal(e.getPrintifyGarment(id)?.areas.length, 2);
    assert.equal(e.selectedPrintifyGarment()?.id, id);
    assert.equal(e.updatePrintifyGarment(id, { name: '' }), false);
    assert.equal(e.updatePrintifyGarment('missing', { name: 'x' }), false);
    assert.equal(e.updatePrintifyGarment(id, { name: 'Long Tee' }), true);
    assert.equal(e.getPrintifyGarment(id)?.name, 'Long Tee');
    const before = e.garmentAreaBox(id, 'front');
    assert.equal(e.setPrintifyAreaSize(id, 'front', before.width + 40, before.height + 40), true);
    assert.equal(e.setPrintifyAreaSize(id, 'front', 0, 10), false);
    e.undo();
    assertBoxesClose(e.garmentAreaBox(id, 'front'), before);
    assert.equal(e.deletePrintifyGarment('missing'), false);
    assert.equal(e.deletePrintifyGarment(id), true);
    assert.equal(e.listPrintifyGarments().length, 0);
    assert.equal(layer.children.length, 0);
    e.undo();
    assert.equal(e.listPrintifyGarments().length, 1);
    e.redo();
    assert.equal(e.listPrintifyGarments().length, 0);
  } finally { cleanup(); }
});

test('garment areas scope artwork and export null headless', async () => {
  const { s, e, cleanup } = engine();
  try {
    depositCircle(s, e);
    const id = e.depositPrintifyGarment({
      ...garmentSpec(),
      areas: garmentSpec().areas.map((area) => ({
        ...area,
        rect: { x: 100, y: 70, width: 60, height: 60 },
      })),
    });
    assert.ok(id);
    assert.equal(e.garmentAreaArtworkCount(id, 'front'), 1);
    assert.equal(e.garmentAreaArtworkCount(id, 'missing'), 0);
    assert.equal(e.garmentAreaSVG(id, 'front'), null);
    assert.equal(await e.garmentAreaPNG(id, 'front'), null);
    assert.equal(await e.printifyAreaUploadPayload(id, 'front'), null);
  } finally { cleanup(); }
});

test('variant switch resizes areas preserving centers and rejects bad input', () => {
  const { e, cleanup } = engine();
  try {
    const id = e.depositPrintifyGarment(garmentSpec());
    assert.ok(id);
    const before = e.garmentAreaBox(id, 'front');
    assert.ok(before);
    assert.equal(e.setPrintifyGarmentVariants(id, [201], { back: { width: 4500, height: 5700 } }), false);
    assert.equal(e.setPrintifyGarmentVariants(id, [], {
      front: { width: 3000, height: 3000 }, back: { width: 4500, height: 5700 },
    }), false);
    assert.equal(e.setPrintifyGarmentVariants(id, [201, 201], {
      front: { width: 3000, height: 3000 }, back: { width: 4500, height: 5700 },
    }), false);
    assert.equal(e.setPrintifyGarmentVariants(id, [201], {
      front: { width: 3000, height: 3000 }, back: { width: 4500, height: 5700 },
    }), true);
    const after = e.garmentAreaBox(id, 'front');
    assert.ok(after);
    assert.ok(Math.abs(after.width - after.height) < 1e-6);
    assert.ok(Math.abs((before.x + before.width / 2) - (after.x + after.width / 2)) < 1e-6);
    assert.deepStrictEqual(e.getPrintifyGarment(id)?.areas.find((a) => a.position === 'front')?.requiredPx,
      { width: 3000, height: 3000 });
    e.undo();
    e.undo();
    assertBoxesClose(e.garmentAreaBox(id, 'front'), before);
  } finally { cleanup(); }
});

test('printify account keeps the token out of persisted state', () => {
  const { e, cleanup } = engine();
  try {
    assert.equal(e.setPrintifyToken(''), false);
    assert.equal(e.hasPrintifyToken(), false);
    assert.equal(e.setPrintifyToken('  tok  '), true);
    assert.equal(e.hasPrintifyToken(), true);
    e.setPrintifyShopId('  123  ');
    assert.equal(e.printifyShopId, '123');
    const snap = snapshotEngineSettings(e);
    assert.equal(snap['printify.shopId'], '123');
    assert.ok(!JSON.stringify(snap).includes('tok'));
    assert.ok(!e.exportScene().includes('tok'));
    e.clearPrintifyToken();
    assert.equal(e.hasPrintifyToken(), false);
    const { e: e2, cleanup: cleanup2 } = engine();
    try {
      applyEngineSettings(e2, { 'printify.shopId': '42' });
      assert.equal(e2.printifyShopId, '42');
      assert.equal(e2.hasPrintifyToken(), false);
    } finally { cleanup2(); }
  } finally { cleanup(); }
});

test('printify network uses bearer auth and caches mockups', async () => {
  const { e, cleanup } = engine();
  const realFetch = globalThis.fetch;
  const calls = [];
  try {
    const id = e.depositPrintifyGarment(garmentSpec());
    assert.ok(id);
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({ id: 'prod-1', images: [{ src: 'https://mock/1.jpg' }] }) };
    };
    e.setPrintifyToken('tok');
    e.setPrintifyShopId('123');
    await e.fetchPrintifyBlueprints();
    assert.equal(calls[0].url, 'https://api.printify.com/v1/catalog/blueprints.json');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
    await assert.rejects(() => e.fetchPrintifyVariants(0, 1), /blueprintId/);
    await e.fetchPrintifyVariants(6, 1);
    assert.equal(calls[1].url, 'https://api.printify.com/v1/catalog/blueprints/6/print_providers/1/variants.json');
    const product = await e.createPrintifyProduct(id, { front: 'u1', back: 'u2' }, { priceCents: 2500 });
    assert.equal(calls[2].url, 'https://api.printify.com/v1/shops/123/products.json');
    const body = JSON.parse(calls[2].init.body);
    assert.equal(body.blueprint_id, 6);
    assert.deepStrictEqual(body.print_areas[0].placeholders.map((p) => p.position), ['front', 'back']);
    assert.equal(body.variants[0].price, 2500);
    assert.deepStrictEqual(e.printifyProductMockups('prod-1'), ['https://mock/1.jpg']);
    assert.equal(e.printifyProductMockups('unknown'), null);
    globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({ message: 'slow down' }) });
    await assert.rejects(() => e.fetchPrintifyBlueprints(),
      (err) => err instanceof PrintifyApiError && err.status === 429);
    e.clearPrintifyToken();
    await assert.rejects(() => e.fetchPrintifyBlueprints(), /token/i);
    e.setPrintifyToken('tok');
    await assert.rejects(() => e.uploadPrintifyArea(id, 'front'), /rasterization/i);
    void product;
  } finally {
    globalThis.fetch = realFetch;
    cleanup();
  }
});

test('printify templates come from the garment record', () => {
  const { e, cleanup } = engine();
  try {
    const id = e.depositPrintifyGarment(garmentSpec());
    assert.ok(id);
    assert.deepStrictEqual(e.printifyTemplatesFor(id), ['https://example.com/tee-front.svg']);
    assert.equal(e.printifyTemplatesFor('missing'), null);
  } finally { cleanup(); }
});
