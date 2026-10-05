import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { ENGINE_SETTINGS_KEY } from '../src/engine/engineSettings.ts';
import { clearNibGliderSettings } from '../src/tutorial/tutorialProgress.ts';
import { schemaById } from '../src/engine/input/KeySettingsRegistry.ts';

function store(seed = {}) {
  const mem = new Map(Object.entries(seed));
  return {
    getItem: (key) => (mem.has(key) ? mem.get(key) : null),
    setItem: (key, value) => { mem.set(key, value); },
    removeItem: (key) => { mem.delete(key); },
    key: (index) => [...mem.keys()][index] ?? null,
    get length() { return mem.size; },
  };
}

function openEngine(shared) {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  const engine = new NibGliderEngine(scope, () => {}, shared);
  return { scope, engine, cleanup: () => scope.project.remove() };
}

function mutate(engine) {
  engine.setStrokeWidth(12);
  engine.setStrokeColor('#ff0000');
  engine.setStrokeCap('round');
  engine.setStrokeDash(6, 3);
  engine.setFillType('radial');
  engine.setFillEndColor('#00ff00');
  engine.setFillAngle(45);
  engine.setGridEnabled(true);
  engine.setGridType('diamond');
  engine.setAngleSnapDegrees(30);
  engine.setLengthSnapStep(25);
  engine.setLengthUnit('cm');
  engine.setAspectRatioKey('16:9');
  engine.setCircleInnerShapeType('sector');
  engine.setCircleSides(5);
  engine.setCircleSector(120);
  engine.setRectangleInnerShapeType('kite');
  engine.setRectangleOrientation(1);
  engine.setRectangleSides(8);
  engine.setPolygonRadiusMode('circumradius');
  engine.setCircleRadiusAnchor('circumference');
  engine.setRectDiagonalMode('half');
  engine.setPathDrawingMode('ngComposite');
  engine.setSplineTension(0.7);
  engine.setTextContent('Persisted');
  engine.setTextFontSize(36);
  engine.setTextModeEnabled(true);
  engine.setDisplayFlow('interior');
  engine.setCircumferenceGap(5);
  engine.setCombineMode('union');
  engine.setQuadMapping('projective');
  engine.setPerspectiveCircle(true);
}

function checkMutated(e) {
  assert.equal(e.globalStrokeWidth, 12);
  assert.equal(e.globalStrokeColor, '#ff0000');
  assert.equal(e.globalStrokeCap, 'round');
  assert.deepEqual(e.strokeDashArrayValue(), [6, 3]);
  assert.equal(e.globalFillType, 'radial');
  assert.equal(e.globalFillEndColor, '#00ff00');
  assert.equal(e.globalFillAngle, 45);
  assert.equal(e.isGridEnabled, true);
  assert.equal(e.gridType, 'diamond');
  assert.equal(e.angleSnapDegrees, 30);
  assert.equal(e.lengthSnapStep, 25);
  assert.equal(e.lengthUnit, 'cm');
  assert.equal(e.aspectRatioKey(), '16:9');
  assert.equal(e.circleInnerShapeType, 'sector');
  assert.equal(e.circleInnerShapeParams.sides, 5);
  assert.equal(e.circleInnerShapeParams.sector, 120);
  assert.equal(e.rectangleInnerShapeType, 'kite');
  assert.equal(e.rectangleOrientation, 1);
  assert.equal(e.rectangleInnerShapeParams.sides, 8);
  assert.equal(e.polygonRadiusMode, 'circumradius');
  assert.equal(e.circleRadiusAnchor, 'circumference');
  assert.equal(e.rectDiagonalMode, 'half');
  assert.equal(e.pathDrawingMode, 'ngComposite');
  assert.equal(e.splineTension, 0.7);
  assert.equal(e.globalText.content, 'Persisted');
  assert.equal(e.globalText.fontSize, 36);
  assert.equal(e.textModeEnabled, true);
  assert.equal(e.displayFlow, 'interior');
  assert.equal(e.circumferenceGap, 5);
  assert.equal(e.combineMode, 'union');
  assert.equal(e.quadMapping, 'projective');
  assert.equal(e.perspectiveCircle, true);
}

test('settings round-trip across paint, shapes, text, grid, and modes', () => {
  const shared = store();
  const first = openEngine(shared);
  try {
    mutate(first.engine);
    assert.ok(shared.getItem(ENGINE_SETTINGS_KEY)?.startsWith('{"version":1'));
  } finally { first.cleanup(); }
  const second = openEngine(shared);
  try {
    checkMutated(second.engine);
  } finally { second.cleanup(); }
});

test('popover schema writes persist through reload', () => {
  const shared = store();
  const first = openEngine(shared);
  try {
    const schema = schemaById('circle-radius-tool');
    assert.ok(schema);
    for (const field of schema.fields) {
      if (field.id === 'circle-radius-anchor') field.write(first.engine, 'circumference');
      if (field.id === 'polygon-radius-mode') field.write(first.engine, 'circumradius');
    }
  } finally { first.cleanup(); }
  const second = openEngine(shared);
  try {
    assert.equal(second.engine.circleRadiusAnchor, 'circumference');
    assert.equal(second.engine.polygonRadiusMode, 'circumradius');
  } finally { second.cleanup(); }
});

test('corrupt, invalid, and unknown stored values fall back to defaults', () => {
  for (const blob of [
    'not json{{{',
    JSON.stringify({ version: 1, values: null }),
    JSON.stringify({ version: 1, values: [] }),
    JSON.stringify({
      version: 1,
      values: {
        'stroke.width': 'wide',
        'stroke.color': 'red',
        'stroke.cap': 'oval',
        'snap.angleStep': Number.NaN,
        'circle.params': { sides: 99, m: 'x', angle: null },
        'quad.mapping': 'fisheye',
        'no.such.key': true,
      },
    }),
  ]) {
    const probed = openEngine(store({ [ENGINE_SETTINGS_KEY]: blob }));
    try {
      const e = probed.engine;
      assert.equal(e.globalStrokeWidth, 4);
      assert.equal(e.globalStrokeColor, '#107cff');
      assert.equal(e.globalStrokeCap, 'butt');
      assert.equal(e.angleSnapDegrees, 15);
      assert.equal(e.circleInnerShapeParams.m, 3);
      assert.equal(e.quadMapping, 'bilinear');
    } finally { probed.cleanup(); }
  }
});

test('clampable stored numbers clamp instead of resetting', () => {
  const probed = openEngine(store({
    [ENGINE_SETTINGS_KEY]: JSON.stringify({
      version: 1,
      values: { 'circle.params': { sides: 99 } },
    }),
  }));
  try {
    assert.equal(probed.engine.circleInnerShapeParams.sides, 12);
  } finally { probed.cleanup(); }
});

test('out-of-range numbers clamp on load', () => {
  const probed = openEngine(store({
    [ENGINE_SETTINGS_KEY]: JSON.stringify({
      version: 1,
      values: { 'stroke.width': 9999, 'text.fontSize': -5, 'snap.angleStep': 0 },
    }),
  }));
  try {
    assert.equal(probed.engine.globalStrokeWidth, 200);
    assert.equal(probed.engine.globalText.fontSize, 4);
    assert.equal(probed.engine.angleSnapDegrees, 1);
  } finally { probed.cleanup(); }
});

test('reset wipes the settings blob and restores defaults on reload', () => {
  const shared = store();
  const first = openEngine(shared);
  try {
    first.engine.setStrokeWidth(12);
    assert.ok(shared.getItem(ENGINE_SETTINGS_KEY));
    clearNibGliderSettings(shared);
    assert.equal(shared.getItem(ENGINE_SETTINGS_KEY), null);
  } finally { first.cleanup(); }
  const second = openEngine(shared);
  try {
    assert.equal(second.engine.globalStrokeWidth, 4);
  } finally { second.cleanup(); }
});
