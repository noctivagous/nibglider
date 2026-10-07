import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import {
  EXPORT_COMMANDS,
  RASTER_FORMATS,
  VECTOR_FORMATS,
  exportScopeOf,
} from '../src/ui/fileCommands.ts';

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

test('exportScopeOf splits raster/vector leaves into scopes', () => {
  assert.equal(exportScopeOf('export-raster-canvas'), 'canvas');
  assert.equal(exportScopeOf('export-raster-viewport'), 'viewport');
  assert.equal(exportScopeOf('export-raster-selection'), 'selection');
  assert.equal(exportScopeOf('export-vector-canvas'), 'canvas');
  assert.equal(exportScopeOf('export-vector-viewport'), 'viewport');
  assert.equal(exportScopeOf('export-vector-selection'), 'selection');
  assert.equal(exportScopeOf('export-raster'), null);
  assert.equal(exportScopeOf('export'), null);
  assert.equal(exportScopeOf('import'), null);
  assert.deepEqual([...EXPORT_COMMANDS].sort(), [
    'export-raster-canvas', 'export-raster-viewport', 'export-raster-selection',
    'export-vector-canvas', 'export-vector-viewport', 'export-vector-selection',
  ].sort());
});

test('format lists keep unavailable options visible', () => {
  assert.deepEqual([...RASTER_FORMATS], ['png', 'jpg', 'webp']);
  assert.deepEqual([...VECTOR_FORMATS], ['svg', 'pdf', 'dxf']);
});

test('selection scope follows the live selection, null when empty', () => {
  const { s, e, cleanup } = engine();
  try {
    assert.equal(e.scopeExportBox('selection'), null);
    assert.equal(e.exportScopeSVG('selection'), null);
    depositCircle(s, e);
    assert.equal(e.selectAll(), true);
    assert.ok(e.hasSelection());
    const box = e.scopeExportBox('selection');
    assert.ok(box && box.width > 0 && box.height > 0);
    e.clearOutSelection();
    assert.equal(e.scopeExportBox('selection'), null);
  } finally { cleanup(); }
});

test('canvas scope falls back to artwork bounds without a page', () => {
  const { s, e, cleanup } = engine();
  try {
    assert.equal(e.scopeExportBox('canvas'), null);
    depositCircle(s, e);
    const box = e.scopeExportBox('canvas');
    assert.ok(box && box.width > 0 && box.height > 0);
    // Same headless tolerance as the export-frame suite: null without
    // DOM, one cropped SVG per scope in the browser.
    const output = e.exportScopeSVG('canvas');
    assert.ok(output === null || output.svg.includes('<svg'));
    if (output) assert.deepEqual(output.box, box);
  } finally { cleanup(); }
});

test('viewport scope reads the live view bounds', () => {
  const { e, cleanup } = engine();
  try {
    const box = e.scopeExportBox('viewport');
    assert.ok(box && box.width > 0 && box.height > 0);
  } finally { cleanup(); }
});
