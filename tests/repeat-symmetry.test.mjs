import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import {
  applyAffine,
  copyTransforms,
  symmetryTransforms,
  WALLPAPER_GROUP_IDS,
} from '../src/engine/repeat/symmetry.ts';

function makeEngine() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(900, 700));
  const engine = new NibGliderEngine(scope, () => {});
  return { scope, engine, layer: scope.project.activeLayer };
}

test('wallpaper p1 is plain translation (Repeat Grid)', () => {
  const spec = { family: 'wallpaper', group: 'p1', origin: { x: 0, y: 0 }, basisA: { x: 100, y: 0 }, basisB: { x: 0, y: 80 }, cols: 2, rows: 2 };
  const all = symmetryTransforms(spec);
  assert.equal(all.length, 4);
  const copies = copyTransforms(spec);
  assert.equal(copies.length, 3);
  const targets = copies.map((t) => applyAffine(t, { x: 10, y: 10 }));
  assert.deepEqual(
    targets.map((p) => `${p.x},${p.y}`).sort(),
    ['10,90', '110,10', '110,90'],
  );
});

test('wallpaper pgg generates glide reflections and half-turns', () => {
  const spec = { family: 'wallpaper', group: 'pgg', origin: { x: 0, y: 0 }, basisA: { x: 100, y: 0 }, basisB: { x: 0, y: 80 }, cols: 1, rows: 1 };
  const all = symmetryTransforms(spec);
  assert.equal(all.length, 4);
  const images = all.map((t) => applyAffine(t, { x: 10, y: 5 }));
  // identity, glide along a (x+50, -y), glide along b (-x, y+40), half-turn (50-x, 40-y)
  assert.deepEqual(
    images.map((p) => `${p.x},${p.y}`).sort(),
    ['-10,45', '10,5', '40,35', '60,-5'],
  );
});

test('wallpaper p4 rotates the motif within a square cell', () => {
  const spec = { family: 'wallpaper', group: 'p4', origin: { x: 0, y: 0 }, basisA: { x: 100, y: 0 }, basisB: { x: 0, y: 100 }, cols: 1, rows: 1 };
  const all = symmetryTransforms(spec);
  assert.equal(all.length, 4);
  const images = all.map((t) => applyAffine(t, { x: 10, y: 0 }));
  assert.deepEqual(
    images.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).sort(),
    ['-10,0', '0,-10', '0,10', '10,0'],
  );
});

test('every wallpaper group generates a full, distinct transform set', () => {
  for (const group of WALLPAPER_GROUP_IDS) {
    const spec = { family: 'wallpaper', group, origin: { x: 0, y: 0 }, basisA: { x: 100, y: 0 }, basisB: { x: 50, y: 87 }, cols: 1, rows: 1 };
    const all = symmetryTransforms(spec);
    const keys = new Set(all.map((t) => [t.a, t.b, t.c, t.d, t.tx, t.ty].map((v) => v.toFixed(4)).join(',')));
    assert.equal(keys.size, all.length, `${group}: transforms distinct`);
    assert.ok(all.length >= 1 && all.length <= 12, `${group}: motif count ${all.length} within per-cell bounds (x2 if centred)`);
  }
});

test('frieze p11g alternates glides along the band', () => {
  const spec = { family: 'frieze', group: 'p11g', origin: { x: 0, y: 0 }, step: { x: 60, y: 0 }, count: 3 };
  const all = symmetryTransforms(spec);
  assert.equal(all.length, 6);
  const images = all.map((t) => applyAffine(t, { x: 10, y: 5 }));
  assert.deepEqual(
    images.map((p) => `${p.x},${p.y}`).sort(),
    ['10,5', '40,-5', '70,5', '100,-5', '130,5', '160,-5'].sort(),
  );
});

test('polar repeat rotates and reflects (dihedral)', () => {
  const spec = { family: 'polar', center: { x: 0, y: 0 }, count: 4, reflect: false };
  assert.equal(symmetryTransforms(spec).length, 4);
  const reflected = { ...spec, reflect: true };
  const all = symmetryTransforms(reflected);
  assert.equal(all.length, 8);
  const images = new Set(all.map((t) => {
    const p = applyAffine(t, { x: 10, y: 4 });
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }));
  assert.equal(images.size, 8, 'all eight dihedral images distinct for an asymmetric point');
});

test('engine applies a wallpaper repeat to the selection in one undo step', () => {
  const { engine, layer, scope } = makeEngine();
  try {
    const rect = new scope.Path.Rectangle({ from: [0, 0], to: [40, 30], fillColor: 'black' });
    engine.addItemToSelection(rect);
    engine.setRepeatFamily('wallpaper');
    engine.setRepeatWallpaperGroup('p1');
    engine.setRepeatRows(2);
    engine.setRepeatCols(2);
    const placed = engine.applySymmetryRepeat();
    assert.equal(placed, 3);
    assert.equal(layer.children.length, 4);
    const centers = layer.children.map((c) => `${Math.round(c.bounds.center.x)},${Math.round(c.bounds.center.y)}`).sort();
    assert.deepEqual(centers, ['20,15', '20,45', '60,15', '60,45']);
    engine.undo();
    assert.equal(layer.children.length, 1);
  } finally { scope.project.remove(); }
});

test('engine polar repeat places rotated copies about an explicit centre', () => {
  const { engine, layer, scope } = makeEngine();
  try {
    const rect = new scope.Path.Rectangle({ from: [100, -10], to: [120, 10], fillColor: 'black' });
    engine.addItemToSelection(rect);
    const placed = engine.applySymmetryRepeat({ family: 'polar', center: { x: 0, y: 0 }, count: 4, reflect: false });
    assert.equal(placed, 3);
    assert.equal(layer.children.length, 4);
    const centers = layer.children.map((c) => `${Math.round(c.bounds.center.x)},${Math.round(c.bounds.center.y)}`).sort();
    assert.deepEqual(centers, ['-110,0', '0,-110', '0,110', '110,0']);
  } finally { scope.project.remove(); }
});

test('Repeat Grid and Repeat Circle menu presets apply', () => {
  const { engine, layer, scope } = makeEngine();
  try {
    const rect = new scope.Path.Rectangle({ from: [0, 0], to: [40, 30], fillColor: 'black' });
    engine.addItemToSelection(rect);
    engine.setRepeatRows(1);
    engine.setRepeatCols(3);
    assert.equal(engine.applyRepeatGrid(), 2);
    assert.equal(layer.children.length, 3);
    engine.undo();
    assert.equal(layer.children.length, 1);
    engine.setRepeatSymmetryCount(6);
    assert.equal(engine.applyRepeatCircle(), 5);
    assert.equal(layer.children.length, 6);
  } finally { scope.project.remove(); }
});
