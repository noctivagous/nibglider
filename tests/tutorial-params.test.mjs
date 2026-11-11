import test from 'node:test';
import assert from 'node:assert/strict';
import { readParam, writeParam } from '../src/engine/input/ParamAddress.ts';

// Slice 22: the (settingsId, field) addressing shared by setting-is
// expects and demo set-param actions resolves both the per-key popover
// schemas and the panel-param table, through the target's own setters.

function fakeTarget() {
  return {
    // Selection paint (Slice 25): null unless a test installs _paint.
    _paint: null,
    selectionPaint() { return this._paint; },
    // Per-key settings schemas (SettingsTarget).
    pathDrawingMode: 'legacy',
    compositeCornerRadius: 0,
    setPathDrawingMode(m) { this.pathDrawingMode = m; },
    setCompositeCornerRadius(r) { this.compositeCornerRadius = r; },
    circleRadiusAnchor: 'origin',
    rectDiagonalMode: 'full',
    polygonRadiusMode: 'inradius',
    setCircleRadiusAnchor(a) { this.circleRadiusAnchor = a; },
    setRectDiagonalMode(m) { this.rectDiagonalMode = m; },
    setPolygonRadiusMode(m) { this.polygonRadiusMode = m; },
    // Stroke.
    strokeEnabled: true,
    globalStrokeWidth: 4,
    globalStrokeColor: '#107cff',
    globalDashLength: 0,
    globalGapLength: 0,
    globalStrokeCap: 'round',
    globalStrokeJoin: 'round',
    setStrokeEnabled(v) { this.strokeEnabled = v; },
    setStrokeWidth(v) { this.globalStrokeWidth = v; },
    setStrokeColor(v) { this.globalStrokeColor = v; },
    setStrokeDash(d, g) { this.globalDashLength = d; this.globalGapLength = g; },
    setStrokeCap(v) { this.globalStrokeCap = v; },
    setStrokeJoin(v) { this.globalStrokeJoin = v; },
    // Fill.
    fillEnabled: false,
    globalFillType: 'solid',
    globalFillColor: '#000000',
    globalFillEndColor: '#ffffff',
    globalFillAngle: 0,
    setFillEnabled(v) { this.fillEnabled = v; },
    setFillType(v) { this.globalFillType = v; },
    setFillColor(v) { this.globalFillColor = v; },
    setFillEndColor(v) { this.globalFillEndColor = v; },
    setFillAngle(v) { this.globalFillAngle = v; },
    // Grid.
    isGridEnabled: false,
    gridSpacing: 20,
    gridSubdivisions: 1,
    gridStyle: 'dots',
    gridType: 'square',
    setGridEnabled(v) { this.isGridEnabled = v; },
    setGridSpacing(v) { this.gridSpacing = v; },
    setGridSubdivisions(v) { this.gridSubdivisions = v; },
    setGridStyle(v) { this.gridStyle = v; },
    setGridType(v) { this.gridType = v; },
    // Snapping + guides.
    isGridSnappingEnabled: false,
    isPathSnappingEnabled: false,
    isPointSnappingEnabled: true,
    isAngleSnappingEnabled: false,
    isLengthSnappingEnabled: false,
    isAspectSnappingEnabled: false,
    guideSnapping: true,
    guidesVisible: true,
    setGridSnappingEnabled(v) { this.isGridSnappingEnabled = v; },
    setPathSnappingEnabled(v) { this.isPathSnappingEnabled = v; },
    setPointSnappingEnabled(v) { this.isPointSnappingEnabled = v; },
    setAngleSnappingEnabled(v) { this.isAngleSnappingEnabled = v; },
    setLengthSnappingEnabled(v) { this.isLengthSnappingEnabled = v; },
    setAspectSnappingEnabled(v) { this.isAspectSnappingEnabled = v; },
    setGuideSnapping(v) { this.guideSnapping = v; },
    setGuidesVisible(v) { this.guidesVisible = v; },
    // Repeat.
    repeatFamily: 'wallpaper',
    repeatWallpaperGroup: 'p1',
    repeatFriezeGroup: 'p11g',
    repeatSymmetryCount: 6,
    repeatPolarMode: 'division',
    liveSymmetryArmed: false,
    isRepeatEnabled: false,
    setRepeatFamily(v) { this.repeatFamily = v; },
    setRepeatWallpaperGroup(v) { this.repeatWallpaperGroup = v; },
    setRepeatFriezeGroup(v) { this.repeatFriezeGroup = v; },
    setRepeatSymmetryCount(v) { this.repeatSymmetryCount = v; },
    setRepeatPolarMode(v) { this.repeatPolarMode = v; },
    setLiveSymmetryArmed(v) { this.liveSymmetryArmed = v; },
    setRepeatEnabled(v) { this.isRepeatEnabled = v; },
    // Combinatorics.
    combineMode: 'none',
    combineTool: 'union',
    setCombineMode(v) { this.combineMode = v; },
    setCombineTool(v) { this.combineTool = v; },
    // Text.
    globalText: { fontFamily: 'Helvetica', fontSize: 24, fontWeight: 'normal', italic: false, letterSpacing: 0 },
    setTextFontFamily(v) { this.globalText.fontFamily = v; },
    setTextFontSize(v) { this.globalText.fontSize = v; },
    setTextFontWeight(v) { this.globalText.fontWeight = v; },
    setTextItalic(v) { this.globalText.italic = v; },
    setTextLetterSpacing(v) { this.globalText.letterSpacing = v; },
    // Shapes.
    rectangleInnerShapeType: 'rectangle',
    circleInnerShapeType: 'circle',
    setRectangleInnerShapeType(v) { this.rectangleInnerShapeType = v; },
    setCircleInnerShapeType(v) { this.circleInnerShapeType = v; },
  };
}

test('schema addresses resolve through the popover view model', () => {
  const target = fakeTarget();
  assert.equal(readParam(target, 'rect-diagonal-tool', 'rect-diagonal-mode'), 'full');
  assert.equal(writeParam(target, 'rect-diagonal-tool', 'rect-diagonal-mode', 'half'), true);
  assert.equal(target.rectDiagonalMode, 'half');
  assert.equal(readParam(target, 'rect-diagonal-tool', 'rect-diagonal-mode'), 'half');
});

test('panel params read and write through the engine setters', () => {
  const target = fakeTarget();
  assert.equal(readParam(target, 'grid', 'enabled'), false);
  assert.equal(writeParam(target, 'grid', 'enabled', true), true);
  assert.equal(target.isGridEnabled, true);
  assert.equal(writeParam(target, 'grid', 'spacing', 40), true);
  assert.equal(readParam(target, 'grid', 'spacing'), 40);
  assert.equal(writeParam(target, 'fill', 'type', 'linear'), true);
  assert.equal(target.globalFillType, 'linear');
  assert.equal(writeParam(target, 'repeat', 'family', 'polar'), true);
  assert.equal(writeParam(target, 'repeat', 'armed', true), true);
  assert.equal(target.liveSymmetryArmed, true);
  assert.equal(writeParam(target, 'combinatorics', 'mode', 'union'), true);
  assert.equal(target.combineMode, 'union');
  assert.equal(writeParam(target, 'text', 'weight', 'bold'), true);
  assert.equal(readParam(target, 'text', 'weight'), 'bold');
  assert.equal(writeParam(target, 'rect', 'innerShape', 'polygon'), true);
  assert.equal(target.rectangleInnerShapeType, 'polygon');
});

test('dash and gap writes carry the other half through unchanged', () => {
  const target = fakeTarget();
  assert.equal(writeParam(target, 'stroke', 'dashLength', 8), true);
  assert.equal(target.globalDashLength, 8);
  assert.equal(target.globalGapLength, 0);
  assert.equal(writeParam(target, 'stroke', 'gapLength', 4), true);
  assert.equal(target.globalDashLength, 8);
  assert.equal(target.globalGapLength, 4);
});

test('unresolvable addresses and wrong-shaped values are refused', () => {
  const target = fakeTarget();
  assert.equal(readParam(target, 'nope', 'enabled'), undefined);
  assert.equal(readParam(target, 'grid', 'nope'), undefined);
  assert.equal(writeParam(target, 'nope', 'enabled', true), false);
  assert.equal(writeParam(target, 'grid', 'nope', true), false);
  assert.equal(writeParam(target, 'grid', 'enabled', 'yes'), false);
  assert.equal(writeParam(target, 'fill', 'type', 'plaid'), false);
  assert.equal(writeParam(target, 'combinatorics', 'mode', 'sideways'), false);
  // Nothing was written by the refused calls.
  assert.equal(target.isGridEnabled, false);
  assert.equal(target.globalFillType, 'solid');
  assert.equal(target.combineMode, 'none');
});

test('paint reads are selection-aware, mirroring the panel', () => {
  const target = fakeTarget();
  target._paint = {
    strokeOn: true, strokeColor: '#111111', strokeWidth: 9, strokeCap: 'butt', strokeJoin: 'bevel',
    dashLength: 3, gapLength: 2,
    fillOn: true, fillColor: '#222222',
    fillSpec: { type: 'linear', color: '#222222', endColor: '#333333', angle: 45, inner: 0 },
  };
  // With a selection, reads report the selection's paint, not the globals.
  assert.equal(readParam(target, 'stroke', 'width'), 9);
  assert.equal(readParam(target, 'stroke', 'color'), '#111111');
  assert.equal(readParam(target, 'stroke', 'dashLength'), 3);
  assert.equal(readParam(target, 'fill', 'type'), 'linear');
  assert.equal(readParam(target, 'fill', 'color'), '#222222');
  assert.equal(readParam(target, 'fill', 'endColor'), '#333333');
  // A dash write carries the selection's gap through, not the global's.
  assert.equal(writeParam(target, 'stroke', 'dashLength', 7), true);
  assert.equal(target.globalDashLength, 7);
  assert.equal(target.globalGapLength, 2);
  // Non-paint params are unaffected by the selection.
  assert.equal(readParam(target, 'grid', 'spacing'), 20);
  // Clearing the selection falls back to the globals.
  target._paint = null;
  assert.equal(readParam(target, 'stroke', 'width'), 4);
  assert.equal(readParam(target, 'fill', 'type'), 'solid');
});
