import test from 'node:test';
import assert from 'node:assert/strict';
import { DrawableCatalog } from '../src/engine/document/DrawableCatalog.ts';

const identity = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const bezier = (id, end = 20) => ({
  id, kind: 'path', layerId: 'layer-1',
  source: {
    id: `source-${id}`, mode: 'bezier', fillRule: 'nonzero',
    contours: [{ closed: false, segments: [
      { point: { x: 0, y: 0 }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } },
      { point: { x: end, y: 0 }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } },
    ] }],
  },
  transform: { ...identity }, opacity: 1, visible: true, locked: false,
});
const circle = (id) => ({
  id, kind: 'shape', layerId: 'layer-1',
  source: { type: 'circle', center: { x: 120, y: 80 }, radius: 30 },
  transform: { ...identity }, opacity: 0.8, visible: true, locked: false,
});

test('upsert appends new ids in order and isolates stored records from callers', () => {
  const catalog = new DrawableCatalog();
  const input = bezier('a');
  catalog.upsert('page-1', input);
  catalog.upsert('page-1', circle('b'));
  assert.deepEqual(catalog.ordered('page-1').map((d) => d.id), ['a', 'b']);
  assert.equal(catalog.has('a'), true);
  assert.equal(catalog.has('missing'), false);
  assert.equal(catalog.pageOf('b'), 'page-1');
  assert.equal(catalog.pageOf('missing'), null);
  input.transform.tx = 999;
  input.source.contours[0].segments[1].point.x = 999;
  assert.equal(catalog.get('a').transform.tx, 0);
  assert.equal(catalog.get('a').source.contours[0].segments[1].point.x, 20);
  catalog.get('a').transform.tx = 555;
  assert.equal(catalog.get('a').transform.tx, 0);
  assert.equal(catalog.get('missing'), null);
});

test('re-upsert keeps the id and its draw position through transform and style edits', () => {
  const catalog = new DrawableCatalog();
  catalog.upsert('page-1', bezier('a'));
  catalog.upsert('page-1', circle('b'));
  catalog.upsert('page-1', bezier('c'));
  const edited = { ...bezier('b', 40), opacity: 0.5 };
  edited.transform = { ...identity, tx: 30 };
  catalog.upsert('page-1', edited);
  assert.deepEqual(catalog.ordered('page-1').map((d) => d.id), ['a', 'b', 'c']);
  assert.equal(catalog.get('b').source.contours[0].segments[1].point.x, 40);
  assert.equal(catalog.get('b').transform.tx, 30);
  assert.equal(catalog.get('b').opacity, 0.5);
});

test('pages isolate ordering, removal, and clearing', () => {
  const catalog = new DrawableCatalog();
  catalog.upsert('page-1', bezier('a'));
  catalog.upsert('page-2', circle('b'));
  catalog.upsert('page-2', bezier('c'));
  assert.deepEqual(catalog.ordered('page-1').map((d) => d.id), ['a']);
  assert.deepEqual(catalog.ordered('page-2').map((d) => d.id), ['b', 'c']);
  assert.deepEqual(catalog.pageIds().sort(), ['page-1', 'page-2']);
  assert.equal(catalog.remove('missing'), false);
  assert.equal(catalog.remove('b'), true);
  assert.deepEqual(catalog.ordered('page-2').map((d) => d.id), ['c']);
  assert.equal(catalog.pageOf('b'), null);
  catalog.clearPage('page-2');
  assert.deepEqual(catalog.ordered('page-2'), []);
  assert.deepEqual(catalog.ordered('page-1').map((d) => d.id), ['a']);
  catalog.clearPage('page-2');
  catalog.clearPage('never-created');
});

test('upsert to a new page moves the id and appends it there', () => {
  const catalog = new DrawableCatalog();
  catalog.upsert('page-1', bezier('a'));
  catalog.upsert('page-1', bezier('b'));
  catalog.upsert('page-2', { ...bezier('a', 60) });
  assert.deepEqual(catalog.ordered('page-1').map((d) => d.id), ['b']);
  assert.deepEqual(catalog.ordered('page-2').map((d) => d.id), ['a']);
  assert.equal(catalog.pageOf('a'), 'page-2');
  assert.equal(catalog.get('a').source.contours[0].segments[1].point.x, 60);
});

test('replaceAll swaps the page atomically and rejects duplicates', () => {
  const catalog = new DrawableCatalog();
  catalog.upsert('page-1', bezier('a'));
  catalog.upsert('page-1', bezier('b'));
  catalog.replaceAll('page-1', [circle('c'), bezier('d')]);
  assert.deepEqual(catalog.ordered('page-1').map((d) => d.id), ['c', 'd']);
  assert.equal(catalog.has('a'), false);
  assert.throws(() => catalog.replaceAll('page-1', [bezier('e'), bezier('e')]), /Duplicate drawable id/);
  assert.deepEqual(catalog.ordered('page-1').map((d) => d.id), ['c', 'd']);
});

test('invalid records throw before any state changes', () => {
  const catalog = new DrawableCatalog();
  catalog.upsert('page-1', bezier('a'));
  const bad = bezier('b');
  bad.transform.a = NaN;
  assert.throws(() => catalog.upsert('page-1', bad));
  assert.deepEqual(catalog.ordered('page-1').map((d) => d.id), ['a']);
  const alsoBad = bezier('c');
  alsoBad.opacity = 2;
  assert.throws(() => catalog.replaceAll('page-1', [bezier('x'), alsoBad]));
  assert.deepEqual(catalog.ordered('page-1').map((d) => d.id), ['a']);
  assert.throws(() => catalog.upsert('', bezier('z')));
  assert.throws(() => catalog.ordered(''));
});

test('mutations emit one change event each and silent no-ops emit none', () => {
  const catalog = new DrawableCatalog();
  const events = [];
  const unsubscribe = catalog.subscribe((change) => events.push(change));
  catalog.upsert('page-1', bezier('a'));
  catalog.upsert('page-1', bezier('a'));
  catalog.remove('missing');
  catalog.remove('a');
  catalog.clearPage('page-1');
  catalog.replaceAll('page-2', [circle('b')]);
  catalog.clearPage('page-2');
  assert.deepEqual(events, [
    { type: 'upsert', pageId: 'page-1', id: 'a' },
    { type: 'upsert', pageId: 'page-1', id: 'a' },
    { type: 'remove', pageId: 'page-1', id: 'a' },
    { type: 'replace', pageId: 'page-2' },
    { type: 'clear', pageId: 'page-2' },
  ]);
  unsubscribe();
  catalog.upsert('page-1', bezier('z'));
  assert.equal(events.length, 5);
});
