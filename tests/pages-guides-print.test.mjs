// Tier Two, Slice 5: pages, guides, and print.
// Pages are distinct scenes (own layers/items/guides) sharing the
// document; guides persist through the scene payload and the native
// file; print setup is separate from Document Size; print scope
// resolution is pure and engine print hides non-printing items.
import test from 'node:test';
import assert from 'node:assert/strict';

import paper from 'paper';

const {
  createGuide, moveGuide, setGuideLocked, removeGuide, snapToGuides, guideAtPoint, readGuideRecords,
} = await import('../src/engine/document/guides.ts');
const {
  defaultPrintSetup, printSetupForPaper, printSetupWithOrientation, PAPER_PRESETS,
  printableRect, cropMarkSegments, resolvePrintItemIds, readPrintSetup,
} = await import('../src/engine/document/printSetup.ts');
const { DocumentManager } = await import('../src/engine/document/DocumentManager.ts');
const {
  NATIVE_VERSION, parseNativeDocument, buildNativeDocument, serializeNativeDocument,
} = await import('../src/engine/document/NativeDocument.ts');
const { NibGliderEngine } = await import('../src/engine/engine.ts');
const { encodeSceneDocument, readSceneGuides, readScenePrintSetup } = await import('../src/engine/document/SceneIO.ts');

function makeEngine() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  return { scope, engine: new NibGliderEngine(scope, () => {}) };
}

function depositCircle(scope, engine, x = 120, y = 90, r = 50) {
  engine.mousePt = new scope.Point(x, y);
  engine.circleInnerShapeType = 'circle';
  engine.circleKC('radius');
  engine.pointer.onMouseMove({ point: new scope.Point(x + r, y) });
  engine.endPathOrShape();
}

// --- guides: pure model ---------------------------------------------------

test('guides: create, lock blocks move, remove, defensive read', () => {
  const g = createGuide('g1', 'x', 42);
  assert.equal(g.locked, false);
  assert.equal(moveGuide(g, 100).position, 100);
  const locked = setGuideLocked(g, true);
  assert.equal(moveGuide(locked, 100).position, 42, 'locked guide refuses to move');
  assert.deepEqual(removeGuide([g], 'g1'), []);
  assert.throws(() => createGuide('g2', 'x', Number.NaN));
  assert.deepEqual(readGuideRecords([{ id: 'a', axis: 'y', position: 5 }, { axis: 'x' }, null]), [
    { id: 'a', axis: 'y', position: 5, locked: false },
  ]);
});

test('guides: snapping moves a point onto the nearest guide per axis', () => {
  const guides = [createGuide('gx', 'x', 100), createGuide('gy', 'y', 50)];
  const snapped = snapToGuides({ x: 103, y: 80 }, guides, 8);
  assert.equal(snapped.point.x, 100);
  assert.equal(snapped.point.y, 80, 'y guide is out of threshold');
  assert.equal(snapped.snappedX?.id, 'gx');
  assert.equal(snapped.snappedY, null);
  assert.equal(snapToGuides({ x: 300, y: 300 }, guides, 8).point.x, 300);
  assert.equal(guideAtPoint({ x: 101, y: 0 }, guides, 4)?.id, 'gx');
  assert.equal(guideAtPoint({ x: 101, y: 0 }, [setGuideLocked(guides[0], true)], 4), null, 'locked guides cannot be grabbed');
});

// --- print setup: pure model ----------------------------------------------

test('print setup: presets, orientation swap, printable rect, crop marks', () => {
  const setup = defaultPrintSetup();
  assert.equal(setup.paperWidthPt, 612);
  const a4 = PAPER_PRESETS.find((p) => p.id === 'a4');
  const withA4 = printSetupForPaper(setup, a4);
  assert.equal(Math.round(withA4.paperWidthPt), 595);
  const landscape = printSetupWithOrientation(withA4, 'landscape');
  assert.equal(landscape.paperWidthPt, withA4.paperHeightPt);
  assert.equal(landscape.orientation, 'landscape');
  const rect = printableRect(setup);
  assert.deepEqual(rect, { x: -270, y: -360, width: 540, height: 720 });
  const marks = cropMarkSegments(612, 792);
  assert.equal(marks.length, 8, 'two marks per corner');
  for (const mark of marks) {
    assert.ok(Math.abs(mark.from.x) >= 306 && Math.abs(mark.from.y) >= 396 - 27 - 1, 'marks sit outside the page');
  }
  assert.equal(readPrintSetup(null), null);
  assert.equal(readPrintSetup(setup)?.paperWidthPt, 612);
  assert.equal(readPrintSetup({ paperWidthPt: -5, paperHeightPt: 10 }), null);
});

test('print scope: page prints all; selection prints selected, falls back to all', () => {
  assert.deepEqual(resolvePrintItemIds(['a', 'b', 'c'], ['b'], 'page'), ['a', 'b', 'c']);
  assert.deepEqual(resolvePrintItemIds(['a', 'b', 'c'], ['b'], 'selection'), ['b']);
  assert.deepEqual(resolvePrintItemIds(['a', 'b'], [], 'selection'), ['a', 'b']);
  assert.deepEqual(resolvePrintItemIds(['a', 'b'], ['zzz'], 'selection'), ['a', 'b']);
});

// --- DocumentManager page ops ----------------------------------------------

test('DocumentManager: duplicate, move, remove pages with names', () => {
  const dm = new DocumentManager();
  dm.setPageSize(612, 792, 'pt');
  const first = dm.pageList[0];
  dm.renamePage(first.id, 'Cover');
  const copy = dm.duplicatePage(first.id);
  assert.ok(copy);
  assert.equal(dm.pageList.length, 2);
  assert.equal(dm.pageName(copy.id), 'Cover copy');
  assert.equal(dm.currentPageId, copy.id);
  const third = dm.addPage(612, 792, 'pt');
  assert.equal(dm.pageList.length, 3);
  assert.equal(dm.movePage(third.id, 'up'), true);
  assert.equal(dm.pageList[1].id, third.id);
  assert.equal(dm.removePage(third.id), true);
  assert.equal(dm.removePage(copy.id), true);
  assert.equal(dm.removePage(first.id), false, 'last page cannot be removed');
});

// --- native format v2 --------------------------------------------------------

test('native v2: pages and print setup round trip; v1 file migrates', () => {
  assert.equal(NATIVE_VERSION, 2);
  const scene = '{"format":"nibglider-scene","version":2,"items":[]}';
  const pageRecord = (id, name) => ({
    id, name,
    page: { widthPt: 612, heightPt: 792, orientation: 'portrait', unit: 'pt' },
    layers: [{ id: 'paper-layer-2', name: 'Layer 1' }],
    activeLayerId: 'paper-layer-2',
    drawables: [], retainedPaths: [], scene,
    guides: [{ id: 'g1', axis: 'x', position: 100, locked: false }],
  });
  const doc = buildNativeDocument({
    name: 'Two Pages', savedAt: '2026-11-10T12:00:00.000Z',
    layers: [{ id: 'paper-layer-2', name: 'Layer 1' }], activeLayerId: 'paper-layer-2',
    drawables: [], retainedPaths: [],
    page: { widthPt: 612, heightPt: 792, orientation: 'portrait', unit: 'pt' },
    view: null, scene,
    pages: [pageRecord('page-1', 'Cover'), pageRecord('page-2', 'Back')],
    activePageId: 'page-2',
    printSetup: { ...defaultPrintSetup(), cropMarks: true },
  });
  assert.equal(doc.version, 2);
  const parsed = parseNativeDocument(serializeNativeDocument(doc));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.doc, doc);
  // A v1 file (single page, top-level sections) migrates to one page.
  const v1 = JSON.stringify({
    format: 'nibglider-document', version: 1, name: 'Old', savedAt: '',
    layers: [{ id: 'paper-layer-2', name: 'Layer 1' }], activeLayerId: 'paper-layer-2',
    drawables: [], retainedPaths: [],
    page: { widthPt: 612, heightPt: 792, orientation: 'portrait', unit: 'pt' },
    view: null, scene,
  });
  const migrated = parseNativeDocument(v1);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.doc.pages.length, 1);
  assert.equal(migrated.doc.activePageId, 'page-1');
  assert.equal(migrated.doc.pages[0].scene, scene);
});

// --- scene payload extras ------------------------------------------------------

test('scene payload carries guides and print setup, older payloads read empty', () => {
  const guides = [{ id: 'g1', axis: 'y', position: 12, locked: true }];
  const setup = { ...defaultPrintSetup(), cropMarks: true };
  const json = encodeSceneDocument([], [{ id: 'l1', name: 'Layer 1' }], null, 'l1', { guides, printSetup: setup });
  assert.deepEqual(readSceneGuides(json), guides);
  assert.equal(readScenePrintSetup(json)?.cropMarks, true);
  const plain = encodeSceneDocument([], [{ id: 'l1', name: 'Layer 1' }], null, 'l1');
  assert.deepEqual(readSceneGuides(plain), []);
  assert.equal(readScenePrintSetup(plain), null);
});

// --- engine: pages hold distinct scenes -----------------------------------------

test('engine: pages keep separate artwork; switching restores each scene', () => {
  const { scope, engine } = makeEngine();
  depositCircle(scope, engine, 120, 90, 40);
  const pageOneItems = engine.allContentItems().length;
  assert.ok(pageOneItems > 0);
  const page2 = engine.addPage();
  assert.ok(page2);
  assert.equal(engine.allContentItems().length, 0, 'new page starts blank');
  depositCircle(scope, engine, 300, 200, 25);
  assert.equal(engine.allContentItems().length, 1);
  const pages = engine.listPages();
  assert.equal(pages.length, 2);
  assert.equal(pages.find((p) => p.id === page2)?.active, true);
  const page1 = pages.find((p) => p.id !== page2);
  assert.equal(engine.switchPage(page1.id), true);
  assert.equal(engine.allContentItems().length, pageOneItems, 'page one artwork restored');
  assert.equal(engine.switchPage(page2), true);
  assert.equal(engine.allContentItems().length, 1, 'page two artwork restored');
  // Duplicating carries the content; deleting the copy returns cleanly.
  const copyId = engine.duplicatePage(page2);
  assert.ok(copyId && copyId !== page2);
  assert.equal(engine.allContentItems().length, 1, 'duplicate carries page two artwork');
  assert.equal(engine.deletePage(copyId), true);
  assert.equal(engine.listPages().length, 2);
  assert.equal(engine.deletePage(page1.id), true);
  assert.equal(engine.listPages().length, 1);
  assert.equal(engine.deletePage(engine.listPages()[0].id), false, 'last page stays');
});

test('engine: multi-page native round trip restores pages and active page', () => {
  const { scope, engine } = makeEngine();
  engine.setPageDimensions(612, 792, 'pt');
  depositCircle(scope, engine, 120, 90, 40);
  const page2 = engine.addPage();
  depositCircle(scope, engine, 300, 200, 25);
  engine.addGuide('x', 222);
  const text = engine.exportNativeDocument('Two Pager');
  const parsed = parseNativeDocument(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.doc.pages.length, 2);
  assert.equal(parsed.doc.activePageId, page2);

  const fresh = makeEngine();
  const opened = fresh.engine.openNativeDocumentText(text);
  assert.equal(opened.ok, true, opened.error ?? '');
  assert.equal(fresh.engine.listPages().length, 2);
  assert.equal(fresh.engine.listPages().find((p) => p.active)?.id, page2);
  assert.equal(fresh.engine.allContentItems().length, 1, 'active page (page two) artwork loaded');
  assert.deepEqual(fresh.engine.listGuides().map((g) => g.position), [222]);
  const other = fresh.engine.listPages().find((p) => p.id !== page2);
  assert.equal(fresh.engine.switchPage(other.id), true);
  assert.equal(fresh.engine.allContentItems().length, 1, 'page one artwork on the other page');
});

// --- engine: guides ---------------------------------------------------------------

test('engine: guides add/move/lock/remove, snap the cursor, survive scene round trip', () => {
  const { scope, engine } = makeEngine();
  const guide = engine.addGuide('x', 100);
  assert.equal(engine.listGuides().length, 1);
  assert.equal(engine.moveGuide(guide.id, 140), true);
  engine.setGuideLocked(guide.id, true);
  assert.equal(engine.moveGuide(guide.id, 200), false, 'locked guide does not move');
  assert.equal(engine.listGuides()[0].position, 140);
  // Cursor snapping: a point 3pt from the guide (zoom 1, threshold 8) snaps on.
  engine.mousePt = new scope.Point(143, 40);
  engine.applyPointSnapping(new scope.Point(143, 40));
  assert.equal(engine.mousePt.x, 140);
  // Scene payload round trip keeps the guide.
  const scene = engine.exportScene();
  assert.deepEqual(readSceneGuides(scene).map((g) => g.position), [140]);
  const fresh = makeEngine();
  fresh.engine.replaceScene('load', scene);
  assert.deepEqual(fresh.engine.listGuides().map((g) => g.position), [140]);
  assert.equal(engine.removeGuide(guide.id), true);
  assert.equal(engine.listGuides().length, 0);
});

test('engine: guide drag from ruler creates and moves a guide', () => {
  const { scope, engine } = makeEngine();
  assert.equal(engine.beginGuideDragFromRuler('y', new scope.Point(10, 77)), true);
  assert.equal(engine.listGuides().length, 1);
  engine.dragGuideTo(new scope.Point(10, 120));
  assert.equal(engine.listGuides()[0].position, 120);
  engine.endGuideDrag();
  assert.equal(engine.isGuideDragging, false);
  // Grabbing an existing guide on canvas: press within threshold.
  assert.equal(engine.beginGuideDragAt(new scope.Point(0, 122)), true);
  engine.dragGuideTo(new scope.Point(0, 200));
  engine.endGuideDrag();
  assert.equal(engine.listGuides()[0].position, 200);
  assert.equal(engine.beginGuideDragAt(new scope.Point(500, 500)), false);
});

// --- engine: print ------------------------------------------------------------------

test('engine: print setup is separate from document size and persists natively', () => {
  const { engine } = makeEngine();
  const setup = { ...defaultPrintSetup(), cropMarks: true, preview: true };
  engine.setPrintSetup(setup);
  assert.equal(engine.getPrintSetup().cropMarks, true);
  const parsed = parseNativeDocument(engine.exportNativeDocument('Setup'));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.doc.printSetup?.cropMarks, true);
});

test('engine: print selection hides non-selected items until finishPrint', () => {
  const { scope, engine } = makeEngine();
  depositCircle(scope, engine, 100, 100, 30);
  depositCircle(scope, engine, 300, 100, 30);
  const items = engine.allContentItems();
  assert.equal(items.length, 2);
  engine.clearOutSelection?.();
  engine.addItemToSelection(items[0]);
  const keep = engine.printDocument('selection');
  assert.deepEqual(keep, [String(items[0].id)]);
  assert.equal(items[0].visible, true);
  assert.equal(items[1].visible, false, 'non-selected item hidden for the print pass');
  engine.finishPrint();
  assert.equal(items[1].visible, true, 'finishPrint restores visibility');
  const all = engine.printDocument('page');
  assert.equal(all.length, 2);
  assert.equal(items[1].visible, true);
  engine.finishPrint();
});
