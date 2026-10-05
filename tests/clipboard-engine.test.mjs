import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { DropController } from '../src/engine/document/DropController.ts';

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
