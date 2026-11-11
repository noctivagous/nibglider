import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { traceBitmap } from '../src/engine/image/tracer.ts';
import { isImageMaskGroup, imageContentOf } from '../src/engine/image/imageMask.ts';

function makeEngine() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  const engine = new NibGliderEngine(scope, () => {});
  return { scope, engine, layer: scope.project.activeLayer };
}

/** Build an RGBA bitmap: white background, black shapes drawn by fn. */
function bitmap(width, height, draw) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 255; data[i * 4 + 1] = 255; data[i * 4 + 2] = 255; data[i * 4 + 3] = 255;
  }
  const set = (x, y, v = 0) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
  };
  draw(set);
  return { data, width, height };
}

test('tracer finds the outer contour and the hole of a ring', () => {
  const bmp = bitmap(24, 24, (set) => {
    for (let y = 4; y < 20; y++) for (let x = 4; x < 20; x++) set(x, y);
    for (let y = 9; y < 15; y++) for (let x = 9; x < 15; x++) set(x, y, 255);
  });
  const contours = traceBitmap(bmp, { threshold: 128, smoothing: 0 });
  assert.equal(contours.length, 2);
  const outer = contours.find((c) => c.area > 0);
  const hole = contours.find((c) => c.area < 0);
  assert.ok(outer && hole, 'one outer contour and one hole');
  assert.ok(Math.abs(outer.area) > 200 && Math.abs(outer.area) < 300, `outer area ${outer.area}`);
  assert.ok(Math.abs(hole.area) > 25 && Math.abs(hole.area) < 64, `hole area ${hole.area}`);
});

test('tracer respects the threshold and smoothing simplifies', () => {
  const gray = bitmap(16, 16, (set) => {
    for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) set(x, y, 200);
  });
  assert.equal(traceBitmap(gray, { threshold: 128, smoothing: 0 }).length, 0);
  assert.equal(traceBitmap(gray, { threshold: 250, smoothing: 0 }).length, 1);

  const square = bitmap(20, 20, (set) => {
    for (let y = 4; y < 16; y++) for (let x = 4; x < 16; x++) set(x, y);
  });
  const raw = traceBitmap(square, { threshold: 128, smoothing: 0 });
  const smooth = traceBitmap(square, { threshold: 128, smoothing: 1.5 });
  assert.equal(raw.length, 1);
  assert.equal(smooth.length, 1);
  assert.ok(smooth[0].points.length < raw[0].points.length, 'smoothing reduces points');
  assert.ok(smooth[0].points.length >= 4);
});

test('depositTrace places an editable retained CompoundPath', () => {
  const { engine, layer, scope } = makeEngine();
  try {
    const bmp = bitmap(20, 20, (set) => {
      for (let y = 4; y < 16; y++) for (let x = 4; x < 16; x++) set(x, y);
    });
    const item = engine.depositTrace(bmp, { threshold: 128, smoothing: 0.5 }, { origin: { x: 100, y: 50 }, scale: 2 });
    assert.ok(item);
    assert.equal(item.className, 'CompoundPath');
    assert.ok(layer.children.includes(item));
    // Square spans pixels 4..16 -> doc (100+8) .. (100+32), (50+8) .. (50+32)
    assert.ok(Math.abs(item.bounds.x - 107.5) < 1.5, `bounds.x ${item.bounds.x}`);
    assert.ok(Math.abs(item.bounds.width - 25) < 2, `bounds.width ${item.bounds.width}`);
    assert.equal(item.fillRule, 'evenodd');
    assert.ok(engine.getRetainedPathDrawable(item.data.drawableId), 'trace result retained as a model path');
  } finally { scope.project.remove(); }
});

test('crop wraps the image in a mask group and clearing unwraps it', () => {
  const { engine, layer, scope } = makeEngine();
  try {
    // A Path stands in for the Raster (headless Paper cannot build one);
    // the mask machinery is content-agnostic.
    const content = new scope.Path.Rectangle({ from: [0, 0], to: [100, 80], fillColor: 'gray' });
    const group = engine.applyImageCrop(content, { x: 10, y: 10, width: 50, height: 40 });
    assert.ok(isImageMaskGroup(group));
    assert.deepEqual(
      { x: group.data.imageCrop.x, y: group.data.imageCrop.y, width: group.data.imageCrop.width, height: group.data.imageCrop.height },
      { x: 10, y: 10, width: 50, height: 40 },
    );
    const maskItem = group.children.find((c) => c.data?.imageMaskPath === true);
    assert.ok(maskItem && maskItem.clipMask === true);
    assert.equal(Math.round(maskItem.bounds.width), 50);
    assert.equal(Math.round(maskItem.bounds.height), 40);
    assert.equal(imageContentOf(group), content);
    assert.ok(engine.getRetainedPathDrawable(maskItem.data.drawableId), 'mask retained as NGPath');

    const back = engine.applyImageCrop(group, null);
    assert.equal(back, content);
    assert.ok(layer.children.includes(content));
    assert.ok(!layer.children.includes(group));
  } finally { scope.project.remove(); }
});

test('shape mask consumes the shape and removal restores the bare image', () => {
  const { engine, layer, scope } = makeEngine();
  try {
    const content = new scope.Path.Rectangle({ from: [0, 0], to: [100, 80], fillColor: 'gray' });
    const circle = new scope.Path.Circle({ center: [50, 40], radius: 30, fillColor: 'black' });
    const group = engine.applyImageShapeMask(content, circle);
    assert.ok(isImageMaskGroup(group));
    assert.ok(typeof group.data.imageMaskPathData === 'string' && group.data.imageMaskPathData.length > 20);
    assert.ok(!layer.children.includes(circle), 'shape consumed into the mask record');
    const maskItem = group.children.find((c) => c.data?.imageMaskPath === true);
    assert.ok(maskItem.clipMask === true);
    assert.ok(Math.abs(maskItem.bounds.width - 60) < 1, 'mask has the circle bounds');

    const back = engine.applyImageMaskRemoval(group);
    assert.equal(back, content);
    assert.ok(layer.children.includes(content));
  } finally { scope.project.remove(); }
});

test('combine against an image rewrites its mask, never the content', () => {
  const { engine, layer, scope } = makeEngine();
  try {
    const content = new scope.Path.Rectangle({ from: [0, 0], to: [100, 80], fillColor: 'gray' });
    const group = engine.applyImageCrop(content, { x: 0, y: 0, width: 100, height: 80 });
    const tool = new scope.Path.Rectangle({ from: [50, 0], to: [100, 80], fillColor: 'red' });
    engine.addItemToSelection(group);
    engine.addItemToSelection(tool);
    engine.combineSelection('subtract');
    assert.equal(engine.lastCombineNote, '');
    // Right half subtracted from the mask: effective mask is 50 wide.
    const maskItem = group.children.find((c) => c.data?.imageMaskPath === true);
    assert.ok(maskItem);
    assert.ok(Math.abs(maskItem.bounds.width - 50) < 1.5, `mask width ${maskItem.bounds.width}`);
    assert.ok(!layer.children.includes(tool), 'tool consumed');
    assert.equal(imageContentOf(group), content, 'content item untouched');
    assert.deepEqual(
      { width: content.bounds.width, height: content.bounds.height },
      { width: 100, height: 80 },
    );
  } finally { scope.project.remove(); }
});

test('intersect combine keeps only the overlap region in the mask', () => {
  const { engine, scope } = makeEngine();
  try {
    const content = new scope.Path.Rectangle({ from: [0, 0], to: [100, 80], fillColor: 'gray' });
    const group = engine.applyImageCrop(content, { x: 0, y: 0, width: 100, height: 80 });
    const tool = new scope.Path.Circle({ center: [50, 40], radius: 20, fillColor: 'red' });
    engine.addItemToSelection(group);
    engine.addItemToSelection(tool);
    engine.combineSelection('intersect');
    const maskItem = group.children.find((c) => c.data?.imageMaskPath === true);
    assert.ok(Math.abs(maskItem.bounds.width - 40) < 1.5, `mask width ${maskItem.bounds.width}`);
    assert.ok(Math.abs(maskItem.bounds.height - 40) < 1.5);
  } finally { scope.project.remove(); }
});
