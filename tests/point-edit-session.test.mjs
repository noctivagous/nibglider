// PointEditSession + engine point-edit integration: drags and
// operations commit one history entry each; a shape edited at point
// level lowers to a plain Bézier path in the catalog; join stitches
// two open paths and undo restores both.
import test from 'node:test';
import assert from 'node:assert/strict';

import paper from 'paper';

const { PointEditSession, snapshotItem, applySnapshots } = await import('../src/engine/scene/PointEditSession.ts');
const { NibGliderEngine } = await import('../src/engine/engine.ts');

function makeSession() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  const layer = new scope.Layer();
  const path = new scope.Path({
    segments: [
      new scope.Segment(new scope.Point(0, 0), new scope.Point(0, 0), new scope.Point(30, 0)),
      new scope.Segment(new scope.Point(100, 0), new scope.Point(-30, 0), new scope.Point(30, 0)),
      new scope.Segment(new scope.Point(200, 0), new scope.Point(-30, 0), new scope.Point(0, 0)),
    ],
  });
  layer.addChild(path);
  const overlays = new scope.Layer();
  const commits = [];
  const session = new PointEditSession({
    scope,
    mountOverlay: (item) => overlays.addChild(item),
    removeOverlay: (item) => { try { item.remove(); } catch { /* gone */ } },
    commit: (label, item, before, after) => commits.push({ label, item, before, after }),
    notify: () => {},
  });
  return { scope, path, session, commits, overlays };
}

test('session drags an anchor and commits exactly one entry', () => {
  const { path, session, commits, overlays } = makeSession();
  assert.equal(session.attach(path), true);
  assert.ok(overlays.children.length >= 3, 'anchor overlays mounted');
  assert.equal(session.pointerDown({ x: 100, y: 0 }, 8, false), true);
  assert.equal(session.pointerDrag({ x: 100, y: 50 }), true);
  assert.equal(session.pointerUp(), true);
  assert.equal(commits.length, 1);
  assert.equal(commits[0].label, 'Move Point');
  assert.deepEqual(
    { x: path.segments[1].point.x, y: path.segments[1].point.y },
    { x: 100, y: 50 },
  );
  // Undo restores the before snapshot.
  const scope = path.project.view._scope ?? null;
  void scope;
  applySnapshots(commits[0].item.project._scope ?? paper, path, commits[0].before);
  assert.equal(path.segments[1].point.y, 0);
});

test('session handle drag keeps a smooth point coupled; Alt breaks it', () => {
  const { path, session, commits } = makeSession();
  session.attach(path);
  session.selectAt({ x: 100, y: 0 }, 8);
  // Out handle knob sits at (130, 0).
  assert.equal(session.pointerDown({ x: 130, y: 0 }, 8, false), true);
  session.pointerDrag({ x: 130, y: 40 });
  session.pointerUp();
  assert.equal(commits.at(-1).label, 'Move Handle');
  const seg = path.segments[1];
  assert.equal(seg.handleOut.y, 40);
  assert.equal(seg.handleIn.y, -40, 'coupled mirror');
  // Alt drag moves only the dragged handle.
  session.pointerDown({ x: 130, y: 40 }, 8, true);
  session.pointerDrag({ x: 130, y: 80 });
  session.pointerUp();
  assert.equal(path.segments[1].handleOut.y, 80);
  assert.equal(path.segments[1].handleIn.y, -40, 'broken: in-handle untouched');
});

test('session operations: split, delete, convert, close', () => {
  const { path, session, commits } = makeSession();
  session.attach(path);
  assert.equal(session.insertPointAt({ x: 50, y: 0 }), true);
  assert.equal(path.segments.length, 4);
  session.selection = { pathIndex: 0, segmentIndex: 1, handle: null };
  assert.equal(session.convertSelected('corner'), true);
  const seg = path.segments[1];
  assert.deepEqual([seg.handleIn.x, seg.handleIn.y, seg.handleOut.x, seg.handleOut.y], [0, 0, 0, 0]);
  assert.equal(session.deleteSelectedPoint(), true);
  assert.equal(path.segments.length, 3);
  assert.equal(session.closeSelectedContour(), true);
  assert.equal(path.closed, true);
  assert.deepEqual(commits.map((c) => c.label), ['Split Point', 'Corner Point', 'Delete Point', 'Close Path']);
});

test('engine: point-editing a deposited circle retains a Bézier source (the bridge)', () => {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  const engine = new NibGliderEngine(scope, () => {});
  engine.mousePt = new scope.Point(120, 90);
  engine.circleInnerShapeType = 'circle';
  engine.circleKC('radius');
  engine.pointer.onMouseMove({ point: new scope.Point(170, 90) });
  engine.endPathOrShape();
  const item = scope.project.activeLayer.children.find((c) => c.className === 'Path');
  assert.ok(item, 'deposit exists');
  assert.equal(item.data.drawableId, undefined, 'plain deposit starts without a retained source');
  engine.addItemToSelection(item);
  assert.equal(engine.togglePointEdit(), true);
  assert.equal(engine.isPointEditActive, true);
  const anchor = item.segments[0].point;
  engine.mousePt = new scope.Point(anchor.x, anchor.y);
  assert.equal(engine.selectPointAtCursor(), true);
  engine.mousePt = new scope.Point(anchor.x + 40, anchor.y + 40);
  const beforeCount = item.segments.length;
  assert.equal(engine.pointEditInsertPointAtCursor(), true);
  assert.equal(item.segments.length, beforeCount + 1);
  // First point edit retained the path: its current geometry is now
  // exposed as a plain Bézier NGPath (semantic source replaced).
  const id = item.data.drawableId;
  assert.equal(typeof id, 'string');
  const retained = engine.getRetainedPathDrawable(id);
  assert.equal(retained.kind, 'path');
  assert.equal(retained.source.mode, 'bezier');
  assert.equal(retained.source.contours[0].segments.length, item.segments.length);
  engine.undo();
  assert.equal(item.segments.length, beforeCount, 'undo removes the split point');
  assert.equal(
    engine.getRetainedPathDrawable(id).source.contours[0].segments.length,
    item.segments.length,
    'retained source follows the undo',
  );
  engine.exitPointEdit();
  assert.equal(engine.isPointEditActive, false);
});

test('engine: join stitches the nearest open path and undo restores both', () => {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  const engine = new NibGliderEngine(scope, () => {});
  const layer = scope.project.activeLayer;
  const a = new scope.Path({
    segments: [new scope.Point(0, 0), new scope.Point(50, 0)],
  });
  const b = new scope.Path({
    segments: [new scope.Point(55, 0), new scope.Point(100, 0)],
  });
  layer.addChild(a); layer.addChild(b);
  assert.equal(engine.enterPointEdit(a), true);
  assert.equal(engine.pointEditJoin(), true);
  assert.equal(a.segments.length, 3, "segments combined, endpoints welded");
  assert.equal(b.parent, null, 'other path consumed');
  engine.undo();
  assert.equal(a.segments.length, 2, 'undo restores the edited path');
  assert.ok(b.parent, 'undo restores the consumed path');
  engine.exitPointEdit();
});

test('snapshot/apply round-trips a compound path', () => {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  const compound = new scope.CompoundPath({
    children: [
      new scope.Path.Rectangle(new scope.Rectangle(0, 0, 100, 100)),
      new scope.Path.Rectangle(new scope.Rectangle(20, 20, 60, 60)),
    ],
  });
  const snap = snapshotItem(compound);
  assert.equal(snap.length, 2);
  snap[0].segments[0].point = { x: -5, y: -5 };
  applySnapshots(scope, compound, snap);
  assert.equal(compound.children[0].segments[0].point.x, -5);
});
