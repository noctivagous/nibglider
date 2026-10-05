import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { DropController } from '../src/engine/document/DropController.ts';
import { editableBaselines } from '../src/engine/snapping/textSnap.ts';

function setup() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  const engine = new NibGliderEngine(scope, () => {});
  const rect = (x) => new scope.Path.Rectangle({ from: [x, 10], to: [x + 30, 40] });
  return { scope, engine, rect, cleanup: () => scope.project.remove() };
}

test('select-all selects every content item and nothing when empty', () => {
  const { engine, rect, cleanup } = setup();
  try {
    assert.equal(engine.canSelectAll(), false);
    assert.equal(engine.selectAll(), false);
    const a = rect(10); const b = rect(80);
    assert.equal(engine.canSelectAll(), true);
    assert.equal(engine.selectAll(), true);
    assert.deepEqual(new Set(engine.selectedItems), new Set([a, b]));
  } finally { cleanup(); }
});

test('copy and cut fill the internal buffer; paste round-trips with undo', () => {
  const { engine, rect, cleanup } = setup();
  try {
    assert.equal(engine.copySelection(), false);
    const a = rect(10);
    engine.addItemToSelection(a);
    assert.equal(engine.copySelection(), true);
    const buffer = engine.clipboardSceneJson();
    assert.ok(buffer && buffer.includes('nibglider-scene'));
    // Cut removes with one history entry and keeps the buffer.
    assert.equal(engine.cutSelection(), true);
    assert.equal(engine.selectedItems.length, 0);
    assert.ok(engine.clipboardSceneJson());
    engine.undo();
    assert.equal(engine.documentStats().objectCount, 1);
    engine.redo();
    assert.equal(engine.documentStats().objectCount, 0);
    // Paste restores the cut artwork and selects it.
    assert.equal(engine.pasteSceneJson(buffer), true);
    assert.equal(engine.documentStats().objectCount, 1);
    assert.equal(engine.selectedItems.length, 1);
    engine.undo();
    assert.equal(engine.documentStats().objectCount, 0);
    engine.redo();
    assert.equal(engine.documentStats().objectCount, 1);
  } finally { cleanup(); }
});

test('plain text pastes as display or body editable text', () => {
  const { engine, cleanup } = setup();
  try {
    assert.equal(engine.pastePlainText('  '), false);
    assert.equal(engine.pasteTextPayload('**Hello**'), true);
    const display = engine.selectedItems[0];
    assert.equal(display.className, 'PointText');
    assert.equal(display.content, 'Hello');
    assert.equal(display.data.textKind, 'display');
    assert.equal(display.data.editableText, true);
    assert.equal(engine.pasteTextPayload('<p>one</p><p>two</p>'), true);
    const body = engine.selectedItems[0];
    assert.equal(body.className, 'Group');
    assert.equal(body.data.textKind, 'body');
    assert.equal(body.data.editableText, true);
    assert.deepEqual(body.children.map((c) => c.content), ['one', 'two']);
    engine.undo();
    assert.equal(engine.selectedItems[0], display);
  } finally { cleanup(); }
});

test('pasted text pins its box corners to the target', () => {
  const { scope, engine, cleanup } = setup();
  try {
    const close = (actual, expected, label) => {
      assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} ~= ${expected}`);
    };
    // Fresh engine: first paste cascades one step (16, 16).
    // Single line lands its lower-left box corner on the target.
    const at = new scope.Point(100, 200);
    assert.equal(engine.pastePlainText('hi', at), true);
    const display = engine.selectedItems[0];
    close(display.bounds.bottomLeft.x, at.x + 16, 'display left');
    close(display.bounds.bottomLeft.y, at.y + 16, 'display bottom');
    // Second paste cascades two steps (32, 32).
    // Multiline lands its ascender top-left corner on the target.
    const at2 = new scope.Point(50, 60);
    assert.equal(engine.pastePlainText('one\ntwo', at2), true);
    const body = engine.selectedItems[0];
    const firstBaseline = editableBaselines(scope, body)[0].point.y;
    const leading = body.children[0].leading;
    close(body.bounds.left, at2.x + 32, 'body left');
    close(firstBaseline - 0.75 * leading, at2.y + 32, 'body ascender');
  } finally { cleanup(); }
});

test('text paste location setting chooses crosshair or view center', () => {
  const first = setup();
  try {
    first.engine.mousePt = new first.scope.Point(500, 500);
    assert.equal(first.engine.textPasteLocation, 'crosshair');
    assert.equal(first.engine.pastePlainText('hi'), true);
    const crossItem = first.engine.selectedItems[0];
    assert.ok(Math.abs(crossItem.bounds.bottomLeft.x - 516) < 1e-6);
    assert.ok(Math.abs(crossItem.bounds.bottomLeft.y - 516) < 1e-6);
    first.engine.setTextPasteLocation('view-center');
    assert.equal(first.engine.textPasteLocation, 'view-center');
    // Invalid values are ignored.
    first.engine.setTextPasteLocation('elsewhere');
    assert.equal(first.engine.textPasteLocation, 'view-center');
  } finally { first.cleanup(); }
  const second = setup();
  try {
    second.engine.mousePt = new second.scope.Point(500, 500);
    second.engine.setTextPasteLocation('view-center');
    assert.equal(second.engine.pastePlainText('hi'), true);
    const centerItem = second.engine.selectedItems[0];
    const viewCenter = second.scope.view.center;
    assert.ok(Math.abs(centerItem.bounds.bottomLeft.x - (viewCenter.x + 16)) < 1e-6);
    assert.ok(Math.abs(centerItem.bounds.bottomLeft.y - (viewCenter.y + 16)) < 1e-6);
  } finally { second.cleanup(); }
});

test('editable text selection loads into selectionText and setters apply', () => {
  const { engine, rect, cleanup } = setup();
  try {
    assert.equal(engine.selectionText(), null);
    assert.equal(engine.selectedEditableKind(), null);
    const path = rect(10);
    engine.addItemToSelection(path);
    assert.equal(engine.selectionText(), null);
    engine.clearOutSelection();
    assert.equal(engine.pastePlainText('hello'), true);
    const spec = engine.selectionText();
    assert.equal(spec.content, 'hello');
    assert.equal(engine.selectedEditableKind(), 'display');
    engine.setTextFontSize(48);
    assert.equal(engine.selectedItems[0].fontSize, 48);
    assert.equal(engine.globalText.fontSize, 48);
    engine.setTextContent('bye');
    assert.equal(engine.selectedItems[0].content, 'bye');
    assert.equal(engine.selectionText().content, 'bye');
    engine.setTextFontFamily('Courier');
    assert.equal(engine.selectedItems[0].fontFamily, 'Courier');
    engine.setTextFontWeight('bold');
    assert.equal(engine.selectedItems[0].fontWeight, 'bold');
    engine.setTextJustification('left');
    assert.equal(engine.selectedItems[0].justification, 'left');
    engine.setTextLeading(2);
    assert.ok(Math.abs(engine.selectedItems[0].leading - 96) < 1e-6);
    engine.setTextItalic(true);
    assert.equal(engine.selectedItems[0].data.italic, true);
    engine.setTextItalic(false);
    assert.equal(engine.selectedItems[0].data.italic, false);
  } finally { cleanup(); }
});

test('body text edits rebuild lines and keep the top-left pin', () => {
  const { engine, cleanup } = setup();
  try {
    assert.equal(engine.pastePlainText('one\ntwo'), true);
    assert.equal(engine.selectedEditableKind(), 'body');
    assert.equal(engine.selectionText().content, 'one\ntwo');
    const before = engine.selectedItems[0].bounds.topLeft;
    engine.setTextContent('a\nb\nc');
    const group = engine.selectedItems[0];
    assert.deepEqual(group.children.map((c) => c.content), ['a', 'b', 'c']);
    assert.equal(engine.selectionText().content, 'a\nb\nc');
    const after = group.bounds.topLeft;
    assert.ok(Math.abs(after.x - before.x) < 1e-6, `x pinned: ${after.x} ~= ${before.x}`);
    assert.ok(Math.abs(after.y - before.y) < 1e-6, `y pinned: ${after.y} ~= ${before.y}`);
    engine.setTextFontSize(40);
    assert.ok(group.children.every((c) => c.fontSize === 40));
  } finally { cleanup(); }
});

test('drop string routing matches paste classification', () => {
  const { scope, cleanup } = setup();
  try {
    const seen = [];
    const host = {
      scope: () => scope,
      zoom: () => 1,
      clearSelection: () => {},
      selectedItems: () => [],
      addToSelection: () => {},
      setDropNote: () => {},
      recordDrop: () => {},
      depositTextPayload: (text, at) => { seen.push(['text', text, !!at]); },
      depositImageUrl: (url) => { seen.push(['url', url]); },
      updateTextContent: () => {},
      notify: () => {},
    };
    const drops = new DropController(host);
    const drop = (data) => drops.handle({
      preventDefault: () => {},
      clientX: 10,
      clientY: 10,
      dataTransfer: { files: [], getData: (type) => data[type] ?? '' },
    });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    drop({ 'text/plain': svg, 'text/html': '<a>link card</a>' });
    assert.deepEqual(seen[0], ['text', svg, true]);
    drop({ 'text/plain': 'hello', 'text/html': '<p>hello</p>' });
    assert.equal(seen[1][0], 'text');
    assert.equal(seen[1][1], '<p>hello</p>');
    drop({ 'text/uri-list': 'https://example.com/a.png\n' });
    assert.deepEqual(seen[2], ['url', 'https://example.com/a.png\n']);
    assert.equal(seen.length, 3);
  } finally { cleanup(); }
});
