import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import {
  applyAffine,
  copyTransforms,
  FRIEZE_GROUP_IDS,
  FRIEZE_ORBIFOLD,
  GOLDEN_ANGLE_DEG,
  polylineStations,
  progressionValue,
  symmetryTransforms,
  WALLPAPER_GROUP_IDS,
  WALLPAPER_ORBIFOLD,
} from '../src/engine/repeat/symmetry.ts';
import { isReplicationRecord } from '../src/engine/repeat/replication.ts';

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

// --- Slice 10 (revised): orbifold labels, polar modes, progressions ---

test('orbifold tables cover all 17 wallpaper and 7 frieze groups, distinctly', () => {
  assert.equal(WALLPAPER_GROUP_IDS.length, 17);
  assert.equal(FRIEZE_GROUP_IDS.length, 7);
  const wallpaperLabels = WALLPAPER_GROUP_IDS.map((id) => WALLPAPER_ORBIFOLD[id]);
  const friezeLabels = FRIEZE_GROUP_IDS.map((id) => FRIEZE_ORBIFOLD[id]);
  for (const label of [...wallpaperLabels, ...friezeLabels]) {
    assert.equal(typeof label, 'string');
    assert.ok(label.length > 0);
  }
  assert.equal(new Set(wallpaperLabels).size, 17, 'wallpaper orbifold labels distinct');
  assert.equal(new Set(friezeLabels).size, 7, 'frieze orbifold labels distinct');
  assert.equal(WALLPAPER_ORBIFOLD.p4m, '*442');
  assert.equal(WALLPAPER_ORBIFOLD.pgg, '22×');
  assert.equal(WALLPAPER_ORBIFOLD.p1, 'o');
  assert.equal(FRIEZE_ORBIFOLD.p11g, '∞×');
  assert.equal(FRIEZE_ORBIFOLD.pm11, '*∞∞');
});

test('polar division N=7 and degrees 50x5 give distinct transform sets', () => {
  const division = { family: 'polar', center: { x: 0, y: 0 }, count: 7, reflect: false, mode: 'division' };
  const degrees = { family: 'polar', center: { x: 0, y: 0 }, count: 5, reflect: false, mode: 'degrees', stepDeg: 50 };
  const divT = symmetryTransforms(division);
  const degT = symmetryTransforms(degrees);
  assert.equal(divT.length, 7);
  assert.equal(degT.length, 5);
  const key = (t) => [t.a, t.b, t.c, t.d].map((v) => v.toFixed(6)).join(',');
  assert.notDeepEqual(divT.map(key), degT.map(key));
  // Division step is 360/7: the second copy turns a point by that much.
  const p = applyAffine(divT[1], { x: 10, y: 0 });
  assert.ok(Math.abs(Math.hypot(p.x, p.y) - 10) < 1e-9);
  assert.ok(Math.abs(Math.atan2(p.y, p.x) - (360 / 7) * Math.PI / 180) < 1e-9);
  // Degrees step is exactly 50 even though 50 does not divide 360.
  const q = applyAffine(degT[1], { x: 10, y: 0 });
  assert.ok(Math.abs(Math.atan2(q.y, q.x) - 50 * Math.PI / 180) < 1e-9);
  // Switching N re-derives the division step.
  const eight = symmetryTransforms({ ...division, count: 8 });
  const p8 = applyAffine(eight[1], { x: 10, y: 0 });
  assert.ok(Math.abs(Math.atan2(p8.y, p8.x) - Math.PI / 4) < 1e-9);
});

test('a stored polar descriptor round-trips its configuration mode', () => {
  const record = {
    version: 2,
    spec: { family: 'polar', center: { x: 5, y: 6 }, count: 5, reflect: true, mode: 'degrees', stepDeg: 50 },
  };
  assert.equal(isReplicationRecord(record), true);
  assert.equal(isReplicationRecord(JSON.parse(JSON.stringify(record))), true);
  // The mode survives as data, not as a derived step.
  assert.equal(JSON.parse(JSON.stringify(record)).spec.mode, 'degrees');
  // A wallpaper descriptor carrying a progression is invalid (Amendment C boundary).
  const bad = {
    version: 2,
    spec: {
      family: 'wallpaper', group: 'p1', origin: { x: 0, y: 0 }, basisA: { x: 10, y: 0 }, basisB: { x: 0, y: 10 },
      cols: 1, rows: 1, progressions: [{ target: 'radius', kind: 'arithmetic', start: 0, step: 1 }],
    },
  };
  assert.equal(isReplicationRecord(bad), false);
});

test('p1 with a 30 degree motif offset turns copies in place on the lattice', () => {
  const base = { family: 'wallpaper', group: 'p1', origin: { x: 0, y: 0 }, basisA: { x: 100, y: 0 }, basisB: { x: 0, y: 80 }, cols: 2, rows: 1 };
  const plain = copyTransforms(base);
  const turned = copyTransforms({ ...base, motifOffsetDeg: 30 });
  assert.equal(plain.length, 1);
  // With an offset, the home cell's transform is a rotation rather
  // than the identity, so it also yields a (turned) copy.
  assert.equal(turned.length, 2);
  const home = turned.find((t) => Math.abs(applyAffine(t, { x: 0, y: 0 }).x) < 1e-9);
  const shifted = turned.find((t) => Math.abs(applyAffine(t, { x: 0, y: 0 }).x - 100) < 1e-9);
  assert.ok(home && shifted, 'home and translated copies both present');
  // A point on the motif's x-axis is rotated by 30 degrees about the pivot.
  const homeAxis = applyAffine(home, { x: 10, y: 0 });
  assert.ok(Math.abs(homeAxis.x - 10 * Math.cos(Math.PI / 6)) < 1e-9);
  assert.ok(Math.abs(homeAxis.y - 10 * Math.sin(Math.PI / 6)) < 1e-9);
  const axis = applyAffine(shifted, { x: 10, y: 0 });
  assert.ok(Math.abs(axis.x - (100 + 10 * Math.cos(Math.PI / 6))) < 1e-9);
  assert.ok(Math.abs(axis.y - 10 * Math.sin(Math.PI / 6)) < 1e-9);
  const axisPlain = applyAffine(plain[0], { x: 10, y: 0 });
  assert.ok(Math.abs(axisPlain.x - 110) < 1e-9 && Math.abs(axisPlain.y) < 1e-9);
});

test('whorl outcome: polar degrees mode + arithmetic radius progression is Archimedean', () => {
  const spec = {
    family: 'polar', center: { x: 0, y: 0 }, count: 6, reflect: false,
    mode: 'degrees', stepDeg: 30,
    progressions: [{ target: 'radius', kind: 'arithmetic', start: 0, step: 10 }],
  };
  const all = symmetryTransforms(spec);
  assert.equal(all.length, 6);
  for (let k = 0; k < 6; k++) {
    const image = applyAffine(all[k], { x: 0, y: 0 });
    assert.ok(Math.abs(Math.hypot(image.x, image.y) - 10 * k) < 1e-9, `copy ${k} radius ${10 * k}`);
  }
});

test('phyllotaxis outcome: golden-angle steps and geometric radii', () => {
  const growth = { target: 'radius', kind: 'geometric', start: 3, step: 1.16 };
  const spec = {
    family: 'polar', center: { x: 0, y: 0 }, count: 10, reflect: false,
    mode: 'degrees', stepDeg: GOLDEN_ANGLE_DEG,
    progressions: [growth],
  };
  const all = symmetryTransforms(spec);
  assert.equal(all.length, 10);
  for (let k = 0; k < 10; k++) {
    const image = applyAffine(all[k], { x: 0, y: 0 });
    const expected = progressionValue(growth, k);
    assert.ok(Math.abs(Math.hypot(image.x, image.y) - expected) < 1e-7, `copy ${k} radius ${expected}`);
    const angleDeg = ((Math.atan2(image.y, image.x) * 180 / Math.PI) + 360) % 360;
    const expectedAngle = (k * GOLDEN_ANGLE_DEG) % 360;
    assert.ok(Math.abs(angleDeg - expectedAngle) < 1e-6, `copy ${k} angle ${expectedAngle}`);
  }
  // Changing the ratio or the divergence changes the transform set (no stale geometry).
  const otherRatio = symmetryTransforms({ ...spec, progressions: [{ ...growth, step: 1.2 }] });
  const otherAngle = symmetryTransforms({ ...spec, stepDeg: 40 });
  const key = (t) => [t.tx, t.ty].map((v) => v.toFixed(6)).join(',');
  assert.notDeepEqual(all.map(key), otherRatio.map(key));
  assert.notDeepEqual(all.map(key), otherAngle.map(key));
});

test('along-stroke stations: division, spacing, and gap progression', () => {
  const line = [{ x: 0, y: 0 }, { x: 300, y: 0 }];
  const division = polylineStations(line, false, 'division', 4, 0);
  assert.deepEqual(division.map((s) => Math.round(s.point.x)), [0, 75, 150, 225]);
  const spacing = polylineStations(line, false, 'spacing', 4, 100);
  assert.deepEqual(spacing.map((s) => Math.round(s.point.x)), [0, 100, 200]);
  const gaps = polylineStations(line, false, 'progression', 4, 0, { target: 'gap', kind: 'arithmetic', start: 50, step: 25 });
  assert.deepEqual(gaps.map((s) => Math.round(s.point.x)), [0, 50, 125, 225]);
});

test('along-stroke copies ride the tangent or take an orientation offset', () => {
  const guide = [{ x: 0, y: 0 }, { x: 300, y: 0 }];
  const base = { family: 'alongStroke', guide, closed: false, count: 2, spacing: 0, pivot: { x: 5, y: 5 }, alignToTangent: true };
  const aligned = symmetryTransforms(base);
  // Station 1 sits at x=150; the pivot lands exactly on it.
  const landed = applyAffine(aligned[1], { x: 5, y: 5 });
  assert.ok(Math.abs(landed.x - 150) < 1e-9 && Math.abs(landed.y) < 1e-9);
  const turned = symmetryTransforms({ ...base, alignToTangent: false, orientationOffsetDeg: 90 });
  const tip = applyAffine(turned[1], { x: 15, y: 5 });
  assert.ok(Math.abs(tip.x - 150) < 1e-9 && Math.abs(tip.y - 10) < 1e-9, 'offset turns the copy 90 degrees about the station');
});

test('normals reflector mirrors the source across each station tangent line', () => {
  // An L-shaped guide: two stations share the x-axis tangent, the
  // third station's tangent is the vertical line x=100.
  const guide = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  const spec = { family: 'normals', guide, closed: false, stations: 3, pivot: { x: 10, y: 10 } };
  const all = symmetryTransforms(spec);
  assert.equal(all.length, 3);
  const acrossBase = applyAffine(all[0], { x: 10, y: 10 });
  assert.ok(Math.abs(acrossBase.x - 10) < 1e-9 && Math.abs(acrossBase.y + 10) < 1e-9, 'reflected across y=0');
  const acrossVertical = applyAffine(all[2], { x: 10, y: 10 });
  assert.ok(Math.abs(acrossVertical.x - 190) < 1e-9 && Math.abs(acrossVertical.y - 10) < 1e-9, 'reflected across x=100');
  // Reflection is an involution: applying a transform twice restores the point.
  const twice = applyAffine(all[2], acrossVertical);
  assert.ok(Math.abs(twice.x - 10) < 1e-9 && Math.abs(twice.y - 10) < 1e-9);
});
