import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { resolveKeyVariants } from '../src/engine/input/KeyboardLayoutResolver.ts';
import { buildStatusSchema } from '../src/engine/appearance/statusSchema.ts';
import { buildKeymapRows } from '../src/engine/appearance/keymapSchema.ts';

function setup() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  const engine = new NibGliderEngine(scope, () => {});
  engine.mousePt = new scope.Point(100, 200);
  return { scope, engine, cleanup: () => scope.project.remove() };
}

function keydown(engine, { code, key, altKey = false }) {
  engine.handleKeyDown({
    code,
    key,
    shiftKey: false,
    altKey,
    ctrlKey: false,
    metaKey: false,
    target: null,
    preventDefault() {},
  });
}

const press = (engine, code, key) => keydown(engine, { code, key });
const typeWord = (engine, word) => {
  for (const ch of word) {
    press(engine, `Key${ch.toUpperCase()}`, ch);
  }
};

const NO_MODS = { shift: false, alt: false, control: false, meta: false, capsLock: false };
const idleState = {
  isDrawingPath: false,
  isDrawingShape: false,
  isDrawingQuad: false,
  isLiveDrawing: false,
  shapeType: null,
  selectedCount: 0,
  isTypingText: false,
  isInDragLock: false,
  liveAdjustApplies: false,
  isTransformMode: false,
};

function snap(over = {}) {
  return {
    selectedCount: 0, gridEnabled: false, gridType: 'square', dropNote: '', dragLock: false, panLock: false,
    drawingPath: false, composite: false, cornerRadius: 12, splineTension: 0.4,
    drawingShape: false, shapeType: null, circleRadiusAnchor: 'origin', radialStampLockedRadius: null,
    rectDiagonalMode: 'full', shapeWidth: 40, aspectLabel: null, hasSecondEdge: false,
    drawingQuad: false, quadPointCount: 0, typingText: false, typingMode: null, liveHints: [], ...over,
  };
}

test('P with no selection starts Type At Cursor without touching the scene', () => {
  const { scope, engine, cleanup } = setup();
  try {
    press(engine, 'KeyP', 'p');
    assert.equal(engine.isTypingText, true);
    assert.equal(engine.typedTextMode, 'new');
    assert.equal(engine.typedText(), '');
    assert.equal(scope.project.activeLayer.children.length, 0);
    const previews = scope.project.getItems({ match: (item) => !!(item && item.data && item.data.typingPreview) });
    assert.equal(previews.length, 1);
  } finally { cleanup(); }
});

test('typing captures letters (including w) and Backspace deletes', () => {
  const { scope, engine, cleanup } = setup();
  try {
    press(engine, 'KeyP', 'p');
    typeWord(engine, 'Hiw');
    assert.equal(engine.typedText(), 'Hiw');
    // w must type, not stamp: nothing deposited and the session continues.
    assert.equal(scope.project.activeLayer.children.length, 0);
    assert.equal(engine.isTypingText, true);
    keydown(engine, { code: 'Backspace', key: 'Backspace' });
    assert.equal(engine.typedText(), 'Hi');
    // Drawing keys stay parked while typing.
    assert.equal(engine.isDrawingPath, false);
    assert.equal(engine.isDrawingShape, false);
  } finally { cleanup(); }
});

test('Return places the typed line as editable text with undo', () => {
  const { scope, engine, cleanup } = setup();
  try {
    press(engine, 'KeyP', 'p');
    typeWord(engine, 'Hi');
    press(engine, 'Enter', 'Enter');
    assert.equal(engine.isTypingText, false);
    const items = scope.project.activeLayer.children;
    assert.equal(items.length, 1);
    assert.equal(items[0].content, 'Hi');
    assert.equal(items[0].data.editableText, true);
    assert.deepEqual(engine.selectedItems, [items[0]]);
    engine.undo();
    assert.equal(scope.project.activeLayer.children.length, 0);
    engine.redo();
    assert.equal(scope.project.activeLayer.children.length, 1);
  } finally { cleanup(); }
});

test('Alt+W stamps a copy and keeps typing', () => {
  const { scope, engine, cleanup } = setup();
  try {
    press(engine, 'KeyP', 'p');
    typeWord(engine, 'AB');
    keydown(engine, { code: 'KeyW', key: 'w', altKey: true });
    assert.equal(engine.isTypingText, true);
    assert.equal(engine.typedText(), 'AB');
    assert.equal(scope.project.activeLayer.children.length, 1);
    assert.equal(scope.project.activeLayer.children[0].content, 'AB');
    typeWord(engine, 'C');
    press(engine, 'Enter', 'Enter');
    const items = scope.project.activeLayer.children;
    assert.equal(items.length, 2);
    assert.equal(items[1].content, 'ABC');
  } finally { cleanup(); }
});

test('Escape cancels the draft and empty Return ends silently', () => {
  const { scope, engine, cleanup } = setup();
  try {
    press(engine, 'KeyP', 'p');
    typeWord(engine, 'nope');
    press(engine, 'Escape', 'Escape');
    assert.equal(engine.isTypingText, false);
    assert.equal(scope.project.activeLayer.children.length, 0);
    press(engine, 'KeyP', 'p');
    assert.equal(engine.isTypingText, true);
    press(engine, 'Enter', 'Enter');
    assert.equal(engine.isTypingText, false);
    assert.equal(scope.project.activeLayer.children.length, 0);
  } finally { cleanup(); }
});

test('P with a non-text selection is a no-op stub', () => {
  const { scope, engine, cleanup } = setup();
  try {
    const rect = new scope.Path.Rectangle({ from: [10, 10], to: [40, 40] });
    engine.addItemToSelection(rect);
    press(engine, 'KeyP', 'p');
    assert.equal(engine.isTypingText, false);
    assert.deepEqual(engine.selectedItems, [rect]);
  } finally { cleanup(); }
});

test('P with a text selection retypes the object with undo', () => {
  const { engine, cleanup } = setup();
  try {
    assert.equal(engine.pastePlainText('Hello'), true);
    const root = engine.selectedItems[0];
    press(engine, 'KeyP', 'p');
    assert.equal(engine.isTypingText, true);
    assert.equal(engine.typedTextMode, 'edit');
    assert.equal(engine.typedText(), 'Hello');
    typeWord(engine, '!');
    assert.equal(root.content, 'Hello!');
    press(engine, 'Enter', 'Enter');
    assert.equal(engine.isTypingText, false);
    assert.equal(engine.selectionText().content, 'Hello!');
    engine.undo();
    assert.equal(engine.selectionText().content, 'Hello');
    engine.redo();
    assert.equal(engine.selectionText().content, 'Hello!');
  } finally { cleanup(); }
});

test('Escape in edit mode restores the original text', () => {
  const { engine, cleanup } = setup();
  try {
    assert.equal(engine.pastePlainText('Hello'), true);
    press(engine, 'KeyP', 'p');
    typeWord(engine, '!');
    press(engine, 'Escape', 'Escape');
    assert.equal(engine.isTypingText, false);
    assert.equal(engine.selectionText().content, 'Hello');
  } finally { cleanup(); }
});

test('keymap and overlays describe the typing session', () => {
  const { engine, cleanup } = setup();
  try {
    assert.deepEqual(resolveKeyVariants('KeyP', NO_MODS, idleState).map((v) => v.commandId), ['type-text']);
    const rows = buildKeymapRows(snap({ typingText: true, typingMode: 'new' }));
    const ids = rows.flatMap((r) => r.ids);
    assert.deepEqual(ids, [...new Set(ids)]);
    assert.ok(ids.includes('finish-typing'));
    assert.ok(ids.includes('stamp-typed-text'));
    assert.ok(ids.includes('cancel-typing'));
    const schema = JSON.stringify(buildStatusSchema(snap({ typingText: true, typingMode: 'new' })));
    assert.ok(schema.includes('Typing Text at Cursor'));
    assert.ok(schema.includes('Alt+W'));
    engine.startTypeText();
    assert.equal(engine.isTypingText, true);
    engine.cancelTypingText();
  } finally { cleanup(); }
});
