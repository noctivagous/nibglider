import test from 'node:test';
import assert from 'node:assert/strict';
import { CoordinateManager } from '../src/engine/document/CoordinateManager.ts';
import { DocumentManager } from '../src/engine/document/DocumentManager.ts';
import {
  IMAGE_PRESETS,
  PRINT_PRESETS,
  RATIO_PRESETS,
  WORKSPACE_PRESETS,
  formatInUnit,
  imagePresetToPoints,
  pagePresetToPoints,
  parseUnitSystem,
  pointsToUnit,
  resolveRatioToPoints,
  systemUnits,
  unitLabel,
  unitToPoints,
} from '../src/engine/document/MeasurementUnits.ts';

function approx(actual, expected, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to approximate ${expected}`,
  );
}

test('unit table converts pt, pica, inch, ft, mm, cm, m through points', () => {
  assert.equal(unitToPoints(1, 'pt'), 1);
  assert.equal(unitToPoints(1, 'pica'), 12);
  assert.equal(unitToPoints(1, 'inch'), 72);
  assert.equal(unitToPoints(1, 'ft'), 864);
  approx(unitToPoints(2.54, 'cm'), 72);
  approx(unitToPoints(25.4, 'mm'), 72);
  approx(unitToPoints(1, 'm'), 7200 / 2.54);
  assert.equal(pointsToUnit(72, 'inch'), 1);
  assert.equal(pointsToUnit(864, 'ft'), 1);
  assert.equal(pointsToUnit(12, 'pica'), 1);
  approx(pointsToUnit(72, 'mm'), 25.4);
  assert.throws(() => unitToPoints(1, 'bad'), /Unsupported length unit/);
  assert.throws(() => pointsToUnit(1, 'bad'), /Unsupported length unit/);
  assert.throws(() => unitToPoints(Infinity, 'pt'));
  assert.throws(() => pointsToUnit(NaN, 'pt'));
});

test('coordinate manager delegates the widened unit set', () => {
  const c = new CoordinateManager();
  assert.equal(c.toPoints(1, 'ft'), 864);
  assert.equal(c.toPoints(6, 'pica'), 72);
  approx(c.toPoints(100, 'mm'), 100 * 72 / 25.4);
  approx(c.toPoints(1, 'm'), 7200 / 2.54);
  assert.equal(c.fromPoints(864, 'ft'), 1);
  assert.equal(c.toPoints(1, 'inch'), 72);
  assert.equal(c.toPoints(2.54, 'cm'), 72);
});

test('document manager accepts SI and English page sizes', () => {
  const document = new DocumentManager();
  document.setPageSize(210, 297, 'mm');
  const a4 = document.pageSettings;
  approx(a4.widthPt, 210 * 72 / 25.4);
  approx(a4.heightPt, 297 * 72 / 25.4);
  assert.equal(a4.orientation, 'portrait');
  assert.equal(a4.unit, 'mm');
  document.setPageSize(8.5, 11, 'inch');
  assert.deepEqual(
    { w: document.pageSettings.widthPt, h: document.pageSettings.heightPt },
    { w: 612, h: 792 },
  );
  document.setDisplayUnit('ft');
  assert.equal(document.pageSettings.unit, 'ft');
  assert.equal(document.pageSettings.widthPt, 612);
});

test('workspace default is a 16:9 canvas of 1920x1080pt', () => {
  const preset = WORKSPACE_PRESETS.find((p) => p.id === 'canvas-16-9');
  assert.ok(preset);
  const dims = pagePresetToPoints(preset);
  assert.deepEqual(dims, { widthPt: 1920, heightPt: 1080 });
});

test('print presets cover ISO vs US sizes with orientation', () => {
  const iso = PRINT_PRESETS.filter((p) => p.family === 'iso');
  const us = PRINT_PRESETS.filter((p) => p.family === 'us');
  assert.ok(iso.length >= 3 && us.length >= 3);
  const a4 = PRINT_PRESETS.find((p) => p.id === 'iso-a4');
  const letter = PRINT_PRESETS.find((p) => p.id === 'us-letter');
  const a4pt = pagePresetToPoints(a4);
  approx(a4pt.widthPt, 210 * 72 / 25.4, 1e-6);
  approx(a4pt.heightPt, 297 * 72 / 25.4, 1e-6);
  assert.deepEqual(pagePresetToPoints(letter), { widthPt: 612, heightPt: 792 });
  assert.deepEqual(pagePresetToPoints(letter, 'landscape'), { widthPt: 792, heightPt: 612 });
  const square = { id: 'sq', label: 'sq', width: 100, height: 100, unit: 'pt' };
  assert.deepEqual(pagePresetToPoints(square, 'landscape'), { widthPt: 100, heightPt: 100 });
  assert.throws(() => pagePresetToPoints({ ...letter, width: 0 }));
});

test('image presets convert pixels at 96 dpi', () => {
  const hd = IMAGE_PRESETS.find((p) => p.id === 'img-hd');
  assert.deepEqual(imagePresetToPoints(hd), { widthPt: 1440, heightPt: 810 });
  assert.throws(() => imagePresetToPoints({ id: 'x', label: 'x', widthPx: 0, heightPx: 10 }));
});

test('ratio tab multiplies a ratio by a unit length', () => {
  assert.deepEqual(resolveRatioToPoints(16, 9, 120, 'pt'), { widthPt: 1920, heightPt: 1080 });
  assert.deepEqual(resolveRatioToPoints(16, 9, 1, 'inch'), { widthPt: 1152, heightPt: 648 });
  approx(resolveRatioToPoints(1, 1, 100, 'mm').widthPt, 100 * 72 / 25.4);
  assert.ok(RATIO_PRESETS.some((r) => r.a === 16 && r.b === 9));
  assert.throws(() => resolveRatioToPoints(0, 9, 1, 'pt'));
  assert.throws(() => resolveRatioToPoints(16, 9, -1, 'pt'));
  assert.throws(() => resolveRatioToPoints(16, 9, 1, 'bad'));
});

test('unit systems default to English with SI and English ranges', () => {
  assert.equal(parseUnitSystem(null), 'english');
  assert.equal(parseUnitSystem('nope'), 'english');
  assert.equal(parseUnitSystem('si'), 'si');
  assert.equal(parseUnitSystem('english'), 'english');
  const english = systemUnits('english');
  const si = systemUnits('si');
  assert.ok(english.includes('inch') && english.includes('ft'));
  assert.ok(si.includes('mm') && si.includes('m') && si.includes('cm'));
  assert.equal(unitLabel('inch'), 'in');
  assert.equal(unitLabel('mm'), 'mm');
  assert.ok(formatInUnit(72, 'inch').includes('1'));
  assert.ok(formatInUnit(1920, 'pt').includes('1,920') || formatInUnit(1920, 'pt').includes('1920'));
});
