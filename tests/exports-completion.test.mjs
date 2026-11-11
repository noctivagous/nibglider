import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { dxfDocument, toDxfSpace } from '../src/engine/scene/dxfExport.ts';

function makeEngine() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  const engine = new NibGliderEngine(scope, () => {});
  return { scope, engine, layer: scope.project.activeLayer };
}

test('dxf writer emits a complete AC1015 document', () => {
  const dxf = dxfDocument([
    { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], closed: true },
    { points: [{ x: 1, y: 1 }, { x: 5, y: 1 }], closed: false },
  ]);
  assert.ok(dxf.startsWith('0\nSECTION\n2\nHEADER'));
  assert.ok(dxf.includes('AC1015'));
  assert.ok(dxf.includes('LWPOLYLINE'));
  assert.ok(dxf.trimEnd().endsWith('EOF'));
  // Closed polyline carries flag 70 = 1 and 3 vertices.
  const closedBlock = dxf.split('LWPOLYLINE')[1];
  assert.ok(closedBlock.includes('\n70\n1\n'));
  assert.ok(closedBlock.includes('\n90\n3\n'));
});

test('toDxfSpace flips y around the export box', () => {
  const [poly] = toDxfSpace(
    [{ points: [{ x: 110, y: 120 }], closed: false }],
    { x: 100, y: 100, height: 50 },
  );
  assert.deepEqual(poly.points[0], { x: 10, y: 30 });
});

test('engine DXF export contains the deposited geometry, y flipped', () => {
  const { engine, scope } = makeEngine();
  try {
    const rect = new scope.Path.Rectangle({ from: [10, 10], to: [60, 40], fillColor: 'black' });
    engine.addItemToSelection(rect);
    const out = engine.exportScopeDXF('selection');
    assert.ok(out, 'selection scope exports');
    assert.ok(out.dxf.includes('LWPOLYLINE'));
    // Rectangle corners in DXF space: x in [0, 50], y in [0, 30]
    // (document y 10..40 flipped inside a 30-tall box).
    const xs = [...out.dxf.matchAll(/\n10\n([-\d.]+)/g)].map((m) => Number(m[1]));
    const ys = [...out.dxf.matchAll(/\n20\n([-\d.]+)/g)].map((m) => Number(m[1]));
    assert.ok(Math.min(...xs) >= -0.001 && Math.max(...xs) <= 50.001, `x range ${Math.min(...xs)}..${Math.max(...xs)}`);
    assert.ok(Math.min(...ys) >= -0.001 && Math.max(...ys) <= 30.001, `y range ${Math.min(...ys)}..${Math.max(...ys)}`);
  } finally { scope.project.remove(); }
});

test('engine WebP export returns null headless instead of throwing', async () => {
  const { engine, scope } = makeEngine();
  try {
    const rect = new scope.Path.Rectangle({ from: [10, 10], to: [60, 40], fillColor: 'black' });
    engine.addItemToSelection(rect);
    // No DOM Image/canvas in the test runtime: the exporter must
    // decline cleanly (the browser path passes image/webp to
    // canvas.toBlob through the same rasterizeSvg used by PNG/JPG).
    const out = await engine.exportScopeWEBP('selection', { quality: 90, scale: 1, background: null });
    assert.equal(out, null);
  } finally { scope.project.remove(); }
});
