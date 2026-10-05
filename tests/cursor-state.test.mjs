import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import paper from 'paper';
import {
  idleCursorContext,
  resolveCanvasCursor,
} from '../src/engine/appearance/cursorState.ts';
import { NibGliderEngine } from '../src/engine/engine.ts';

const CURSOR_DIR = path.resolve(import.meta.dirname, '../public/cursors');

test('cursor priority runs pan, drag, snaps, draw, hover, then idle', () => {
  const base = idleCursorContext();
  assert.equal(resolveCanvasCursor(base).kind, 'idle');
  assert.equal(resolveCanvasCursor({ ...base, hoverContent: true }).kind, 'hover');
  assert.equal(resolveCanvasCursor({ ...base, hoverContent: true, drawing: true }).kind, 'draw');
  assert.equal(resolveCanvasCursor({ ...base, drawing: true, snapGrid: true }).kind, 'snapGrid');
  assert.equal(resolveCanvasCursor({ ...base, snapGrid: true, snapPath: true }).kind, 'snapPath');
  assert.equal(resolveCanvasCursor({ ...base, snapPath: true, snapPoint: true }).kind, 'snapPoint');
  assert.equal(resolveCanvasCursor({ ...base, snapPoint: true, dragging: true }).kind, 'drag');
  assert.equal(resolveCanvasCursor({ ...base, dragging: true, panning: true }).kind, 'pan');
  assert.equal(resolveCanvasCursor({ ...base, panLocked: true }).kind, 'pan');
});

test('svg cursors carry hotspots and keyword fallbacks', () => {
  const idle = resolveCanvasCursor(idleCursorContext());
  assert.match(idle.css, /^url\("\/cursors\/idle\.svg"\) 12 12, crosshair$/);
  const draw = resolveCanvasCursor({ ...idleCursorContext(), drawing: true });
  assert.match(draw.css, /^url\("\/cursors\/draw\.svg"\) 5 19, crosshair$/);
  const point = resolveCanvasCursor({ ...idleCursorContext(), snapPoint: true });
  assert.match(point.css, /^url\("\/cursors\/snap-point\.svg"\) 12 12, crosshair$/);
  assert.equal(resolveCanvasCursor({ ...idleCursorContext(), panning: true }).css, 'grabbing');
  assert.equal(resolveCanvasCursor({ ...idleCursorContext(), dragging: true }).css, 'move');
  assert.equal(resolveCanvasCursor({ ...idleCursorContext(), hoverContent: true }).css, 'pointer');
});

test('every referenced svg cursor file exists and parses as a small svg', () => {
  for (const file of ['idle.svg', 'draw.svg', 'snap-point.svg', 'snap-path.svg', 'snap-grid.svg']) {
    const body = fs.readFileSync(path.join(CURSOR_DIR, file), 'utf8');
    assert.ok(body.length > 50, `${file} is non-empty`);
    assert.ok(body.includes('<svg'), `${file} is svg`);
    assert.ok(body.includes('viewBox="0 0 24 24"'), `${file} is cursor-sized`);
  }
});

function engineWithCanvas() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(400, 300));
  const engine = new NibGliderEngine(scope, () => {});
  const element = { style: {} };
  Object.defineProperty(scope.view, 'element', { value: element, configurable: true });
  return { scope, engine, element, cleanup: () => scope.project.remove() };
}

test('hovering a point snap shows the snap-point cursor, empty canvas shows idle', () => {
  const { scope, engine, element, cleanup } = engineWithCanvas();
  try {
    const target = new scope.Path({ segments: [[100, 100], [200, 100]] });
    engine.isPointSnappingEnabled = true;
    engine.pointer.onMouseMove({ point: new scope.Point(102, 101) });
    assert.match(engine.lastCursorCss, /snap-point\.svg/);
    assert.equal(element.style.cursor, engine.lastCursorCss);
    engine.pointer.onMouseMove({ point: new scope.Point(10, 250) });
    assert.match(engine.lastCursorCss, /idle\.svg/);
    assert.equal(element.style.cursor, engine.lastCursorCss);
    target.remove();
  } finally { cleanup(); }
});

test('hovering selectable content shows pointer, panning shows grabbing', () => {
  const { scope, engine, element, cleanup } = engineWithCanvas();
  try {
    const rect = new scope.Path.Rectangle({ from: [50, 50], to: [90, 90] });
    rect.fillColor = new scope.Color('#ffffff');
    engine.pointer.onMouseMove({ point: new scope.Point(70, 70) });
    assert.equal(engine.lastCursorCss, 'pointer');
    assert.equal(element.style.cursor, 'pointer');
    engine.pointer.onMouseDown({ point: new scope.Point(300, 250) });
    assert.equal(engine.lastCursorCss, 'grabbing');
    engine.pointer.releasePointer();
    engine.pointer.onMouseMove({ point: new scope.Point(300, 250) });
    assert.match(engine.lastCursorCss, /idle\.svg/);
    rect.remove();
  } finally { cleanup(); }
});
