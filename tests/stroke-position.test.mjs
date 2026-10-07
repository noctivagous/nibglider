import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import {
  displayedStrokePosition,
  installStrokePositionRenderer,
  setStrokePosition,
  strokePositionOf,
} from '../src/engine/appearance/strokePosition.ts';

function scopeOf() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(200, 160));
  installStrokePositionRenderer(scope);
  return scope;
}

function recordingContext() {
  const calls = [];
  const ctx = {
    canvas: { width: 200, height: 160 },
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    beginPath() { calls.push('begin'); },
    closePath() { calls.push('close'); },
    moveTo() {},
    lineTo() {},
    bezierCurveTo() {},
    quadraticCurveTo() {},
    arc() {},
    rect() { calls.push('rect'); },
    clip(rule) { calls.push('clip:' + (rule || '')); },
    fill() { calls.push('fill'); },
    stroke() { calls.push('stroke'); },
    setLineDash() {},
    measureText() { return { width: 0 }; },
  };
  return {
    calls,
    ctx: new Proxy(ctx, {
      get(target, key) {
        if (key in target) return target[key];
        if (typeof key === 'symbol') return undefined;
        return () => {};
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    }),
  };
}

function draw(scope) {
  const recorded = recordingContext();
  scope.project.draw(recorded.ctx, new scope.Matrix(), 1);
  return recorded.calls;
}

test('changing stroke position marks the view dirty and a repeat edit does not', () => {
  const scope = scopeOf();
  try {
    const path = new scope.Path.Rectangle(new scope.Point(30, 20), new scope.Size(80, 40));
    path.strokeColor = 'black';
    path.strokeWidth = 20;
    scope.view._needsUpdate = false;
    setStrokePosition(path, 'inside');
    assert.equal(scope.view._needsUpdate, true);
    assert.equal(strokePositionOf(path), 'inside');
    scope.view._needsUpdate = false;
    setStrokePosition(path, 'inside');
    assert.equal(scope.view._needsUpdate, false);
  } finally { scope.project.remove(); }
});

test('inside and outside clip a closed path, and an open path stays centered', () => {
  const scope = scopeOf();
  try {
    const inside = new scope.Path.Rectangle(new scope.Point(30, 20), new scope.Size(80, 40));
    inside.strokeColor = 'black';
    inside.strokeWidth = 20;
    inside.fillColor = 'white';
    setStrokePosition(inside, 'inside');
    const insideCalls = draw(scope);
    assert.equal(insideCalls.filter((call) => call.startsWith('clip:')).join(','), 'clip:nonzero');
    inside.remove();

    const outside = new scope.Path.Rectangle(new scope.Point(30, 20), new scope.Size(80, 40));
    outside.strokeColor = 'black';
    outside.strokeWidth = 20;
    setStrokePosition(outside, 'outside');
    const outsideCalls = draw(scope);
    assert.ok(outsideCalls.includes('rect'));
    assert.ok(outsideCalls.includes('clip:evenodd'));
    outside.remove();

    const open = new scope.Path({ segments: [[10, 10], [80, 10], [80, 40]], strokeColor: 'black', strokeWidth: 10 });
    setStrokePosition(open, 'outside');
    const openCalls = draw(scope);
    assert.equal(openCalls.filter((call) => call.startsWith('clip:')).length, 0);
    assert.ok(openCalls.includes('stroke'));
  } finally { scope.project.remove(); }
});

test('circle and rectangle shapes clip, and a group tag overrides the child', () => {
  const scope = scopeOf();
  try {
    const shape = new scope.Shape.Rectangle(new scope.Rectangle(new scope.Point(30, 20), new scope.Size(80, 40)));
    shape.strokeColor = 'black';
    shape.strokeWidth = 20;
    setStrokePosition(shape, 'inside');
    assert.equal(draw(scope).filter((call) => call.startsWith('clip:')).length, 1);
    shape.remove();

    const path = new scope.Path.Circle(new scope.Point(40, 40), 20);
    path.strokeColor = 'black';
    path.strokeWidth = 10;
    setStrokePosition(path, 'center');
    const group = new scope.Group([path]);
    assert.equal(displayedStrokePosition(group), 'center');
    setStrokePosition(group, 'outside');
    assert.equal(strokePositionOf(path), 'outside');
    assert.equal(path.data['nibglider.strokePosition'], 'outside');
    assert.equal(draw(scope).filter((call) => call.startsWith('clip:')).length, 1);
    group.remove();

    const compound = new scope.CompoundPath({
      children: [
        new scope.Path.Circle(new scope.Point(50, 50), 30),
        new scope.Path.Circle(new scope.Point(50, 50), 12),
      ],
    });
    compound.strokeColor = 'black';
    compound.strokeWidth = 8;
    compound.fillColor = 'white';
    setStrokePosition(compound, 'inside');
    assert.equal(draw(scope).filter((call) => call.startsWith('clip:')).length, 1);
  } finally { scope.project.remove(); }
});

test('a shape+text group reports the geometry tag before the group is edited', () => {
  const scope = scopeOf();
  try {
    const path = new scope.Path.Rectangle(new scope.Point(0, 0), new scope.Size(20, 10));
    path.strokeColor = 'black';
    setStrokePosition(path, 'inside');
    const text = new scope.PointText(new scope.Point(0, 0));
    text.content = 'a';
    text.data = { isShapeText: true };
    const group = new scope.Group([path, text]);
    group.data = { shapeTextGroup: true };
    assert.equal(displayedStrokePosition(group), 'inside');
    assert.equal(strokePositionOf(path), 'inside');
  } finally { scope.project.remove(); }
});
