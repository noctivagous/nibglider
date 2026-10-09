import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PDF_IMPORT_PAGE_CAP,
  parsePdfPageSpec,
  pdfPagesForChoice,
} from '../src/engine/document/pdfPageRange.ts';

test('parsePdfPageSpec accepts singles, ranges, and comma lists', () => {
  assert.deepEqual(parsePdfPageSpec('1', 4), [1]);
  assert.deepEqual(parsePdfPageSpec('1-3', 4), [1, 2, 3]);
  assert.deepEqual(parsePdfPageSpec('2, 4', 4), [2, 4]);
  assert.deepEqual(parsePdfPageSpec('3-3, 1', 4), [1, 3]);
});

test('parsePdfPageSpec rejects empty, backwards, and out-of-range specs', () => {
  assert.equal(parsePdfPageSpec('', 4), null);
  assert.equal(parsePdfPageSpec('2-1', 4), null);
  assert.equal(parsePdfPageSpec('0', 4), null);
  assert.equal(parsePdfPageSpec('5', 4), null);
  assert.equal(parsePdfPageSpec('1-3, x', 4), null);
  assert.equal(parsePdfPageSpec('1', 0), null);
});

test('pdfPagesForChoice covers first, all, and range', () => {
  assert.deepEqual(pdfPagesForChoice('first', '', 3), [1]);
  assert.deepEqual(pdfPagesForChoice('all', '', 3), [1, 2, 3]);
  assert.deepEqual(pdfPagesForChoice('range', '2-3', 3), [2, 3]);
  assert.equal(pdfPagesForChoice('range', '9', 3), null);
  assert.equal(pdfPagesForChoice('first', '', 0), null);
  assert.ok(PDF_IMPORT_PAGE_CAP >= 1);
});
