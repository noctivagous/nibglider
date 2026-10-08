import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine, typeAnchorPoint } from '../src/engine/engine.ts';
import { resolveKeyVariants } from '../src/engine/input/KeyboardLayoutResolver.ts';
import { buildStatusSchema } from '../src/engine/appearance/statusSchema.ts';
import { buildKeymapRows } from '../src/engine/appearance/keymapSchema.ts';
import { applyEngineSettings, snapshotEngineSettings } from '../src/engine/engineSettings.ts';

function setup() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  const engine = new NibGliderEngine(scope, () => {});
  engine.mousePt = new scope.Point(100, 200);
  return { scope, engine, cleanup: () => scope.project.remove() };
}

function keydown(engine, { code, key, altKey = false, shiftKey = false }) {
  engine.handleKeyDown({
    code,
    key,
    shiftKey,
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
    assert.ok(ids.includes('typed-newline'));
    assert.ok(ids.includes('stamp-typed-text'));
    assert.ok(ids.includes('typed-font-size'));
    assert.ok(ids.includes('typed-rotate'));
    assert.ok(ids.includes('typed-bold'));
    assert.ok(ids.includes('cancel-typing'));
    const schema = JSON.stringify(buildStatusSchema(snap({ typingText: true, typingMode: 'new' })));
    assert.ok(schema.includes('Typing Text at Cursor'));
    assert.ok(schema.includes('Alt+W'));
    assert.ok(schema.includes('Alt+B'));
    assert.ok(schema.includes('Alt+Return'));
    engine.startTypeText();
    assert.equal(engine.isTypingText, true);
    engine.cancelTypingText();
  } finally { cleanup(); }
});

test('no command resolves while typing, so caps stay honest', () => {
  const typing = { ...idleState, isTypingText: true, selectedCount: 0 };
  assert.deepEqual(resolveKeyVariants('KeyP', NO_MODS, typing), []);
  assert.deepEqual(resolveKeyVariants('BracketLeft', NO_MODS, typing), []);
});

test('anchor helper maps all nine box points', () => {
  const rect = { left: 10, top: 20, right: 110, bottom: 60 };
  assert.deepEqual(typeAnchorPoint(rect, 'top-left'), { x: 10, y: 20 });
  assert.deepEqual(typeAnchorPoint(rect, 'top-center'), { x: 60, y: 20 });
  assert.deepEqual(typeAnchorPoint(rect, 'top-right'), { x: 110, y: 20 });
  assert.deepEqual(typeAnchorPoint(rect, 'middle-left'), { x: 10, y: 40 });
  assert.deepEqual(typeAnchorPoint(rect, 'center'), { x: 60, y: 40 });
  assert.deepEqual(typeAnchorPoint(rect, 'middle-right'), { x: 110, y: 40 });
  assert.deepEqual(typeAnchorPoint(rect, 'bottom-left'), { x: 10, y: 60 });
  assert.deepEqual(typeAnchorPoint(rect, 'bottom-center'), { x: 60, y: 60 });
  assert.deepEqual(typeAnchorPoint(rect, 'bottom-right'), { x: 110, y: 60 });
});

test('anchor setting persists and rejects unknown values', () => {
  const { engine, cleanup } = setup();
  try {
    assert.equal(engine.typeCursorAnchor, 'bottom-left');
    engine.setTypeCursorAnchor('center');
    assert.equal(engine.typeCursorAnchor, 'center');
    const values = snapshotEngineSettings(engine);
    assert.equal(values['text.typeAnchor'], 'center');
    engine.setTypeCursorAnchor('bottom-left');
    applyEngineSettings(engine, values);
    assert.equal(engine.typeCursorAnchor, 'center');
    applyEngineSettings(engine, { 'text.typeAnchor': 'nope' });
    assert.equal(engine.typeCursorAnchor, 'center');
    engine.setTypeCursorAnchor('nope');
    assert.equal(engine.typeCursorAnchor, 'center');
  } finally { cleanup(); }
});

test('anchor helper pins the bottom row to an overriding baseline', () => {
  const rect = { left: 10, top: 20, right: 110, bottom: 60 };
  assert.deepEqual(typeAnchorPoint(rect, 'bottom-left', 50), { x: 10, y: 50 });
  assert.deepEqual(typeAnchorPoint(rect, 'bottom-center', 50), { x: 60, y: 50 });
  assert.deepEqual(typeAnchorPoint(rect, 'bottom-right', 50), { x: 110, y: 50 });
  // Other rows ignore the override; a missing override keeps the box bottom.
  assert.deepEqual(typeAnchorPoint(rect, 'top-left', 50), { x: 10, y: 20 });
  assert.deepEqual(typeAnchorPoint(rect, 'center', 50), { x: 60, y: 40 });
  assert.deepEqual(typeAnchorPoint(rect, 'bottom-left'), { x: 10, y: 60 });
  assert.deepEqual(typeAnchorPoint(rect, 'bottom-left', Number.NaN), { x: 10, y: 60 });
});

test('bottom edge defaults to baseline, persists, and rejects unknown values', () => {
  const { engine, cleanup } = setup();
  try {
    assert.equal(engine.typeCursorBottomEdge, 'baseline');
    engine.setTypeCursorBottomEdge('descender');
    assert.equal(engine.typeCursorBottomEdge, 'descender');
    const values = snapshotEngineSettings(engine);
    assert.equal(values['text.typeAnchorBottom'], 'descender');
    engine.setTypeCursorBottomEdge('baseline');
    applyEngineSettings(engine, values);
    assert.equal(engine.typeCursorBottomEdge, 'descender');
    applyEngineSettings(engine, { 'text.typeAnchorBottom': 'nope' });
    assert.equal(engine.typeCursorBottomEdge, 'descender');
    engine.setTypeCursorBottomEdge('nope');
    assert.equal(engine.typeCursorBottomEdge, 'descender');
  } finally { cleanup(); }
});

test('bottom anchors pin the baseline by default and the descender on request', () => {
  const { scope, engine, cleanup } = setup();
  try {
    press(engine, 'KeyP', 'p');
    typeWord(engine, 'Hi');
    const preview = () => scope.project.getItems({
      match: (item) => !!(item && item.data && item.data.typingPreview),
    })[0];
    const baselineOf = (item) => item.localToGlobal(new scope.Point(0, 0)).y;
    // Default anchor is bottom-left on the baseline box.
    let item = preview();
    assert.ok(item);
    assert.ok(Math.abs(item.bounds.left - 100) < 1e-6);
    assert.ok(Math.abs(baselineOf(item) - 200) < 1e-6);
    // Switching to the descender re-pins the live preview to the box bottom.
    engine.setTypeCursorBottomEdge('descender');
    item = preview();
    assert.ok(Math.abs(item.bounds.left - 100) < 1e-6);
    assert.ok(Math.abs(item.bounds.bottom - 200) < 1e-6);
    // The baseline box also serves the bottom-right corner.
    engine.setTypeCursorBottomEdge('baseline');
    engine.setTypeCursorAnchor('bottom-right');
    item = preview();
    assert.ok(Math.abs(item.bounds.right - 100) < 1e-6);
    assert.ok(Math.abs(baselineOf(item) - 200) < 1e-6);
  } finally { cleanup(); }
});

test('double-click opens an editable text object for retyping', () => {
  const { engine, cleanup } = setup();
  try {
    assert.equal(engine.pastePlainText('Hello'), true);
    const root = engine.selectedItems[0];
    const center = root.bounds.center;
    engine.clearOutSelection();
    assert.equal(engine.isTypingText, false);
    engine.pointer.onDoubleClick(center, 0);
    assert.equal(engine.isTypingText, true);
    assert.equal(engine.typedTextMode, 'edit');
    assert.equal(engine.typedText(), 'Hello');
    assert.deepEqual(engine.selectedItems, [root]);
    typeWord(engine, '!');
    assert.equal(root.content, 'Hello!');
    press(engine, 'Enter', 'Enter');
    assert.equal(engine.isTypingText, false);
    assert.equal(engine.selectionText().content, 'Hello!');
  } finally { cleanup(); }
});

test('double-click ignores empty canvas, shapes, right button, and active typing', () => {
  const { scope, engine, cleanup } = setup();
  try {
    engine.pointer.onDoubleClick(new scope.Point(400, 500), 0);
    assert.equal(engine.isTypingText, false);
    const rect = new scope.Path.Rectangle({ from: [10, 10], to: [40, 40] });
    engine.pointer.onDoubleClick(new scope.Point(25, 25), 0);
    assert.equal(engine.isTypingText, false);
    assert.deepEqual(engine.selectedItems, []);
    rect.remove();
    assert.equal(engine.pastePlainText('Hi'), true);
    const root = engine.selectedItems[0];
    engine.clearOutSelection();
    engine.pointer.onDoubleClick(root.bounds.center, 2);
    assert.equal(engine.isTypingText, false);
    press(engine, 'KeyP', 'p');
    assert.equal(engine.isTypingText, true);
    engine.pointer.onDoubleClick(root.bounds.center, 0);
    assert.equal(engine.typedTextMode, 'new');
    engine.cancelTypingText();
  } finally { cleanup(); }
});

test('Alt+Return inserts a newline and Return still places multiline text', () => {
  const { scope, engine, cleanup } = setup();
  const altReturn = (shiftKey) => engine.handleKeyDown({
    code: 'Enter', key: 'Enter', shiftKey: !!shiftKey,
    altKey: true, ctrlKey: false, metaKey: false, target: null,
    preventDefault() {},
  });
  try {
    press(engine, 'KeyP', 'p');
    typeWord(engine, 'Hi');
    altReturn(false);
    assert.equal(engine.typedText(), 'Hi\n');
    assert.equal(engine.isTypingText, true);
    altReturn(true);
    assert.equal(engine.typedText(), 'Hi\n\n');
    typeWord(engine, 'Yo');
    press(engine, 'Enter', 'Enter');
    assert.equal(engine.isTypingText, false);
    const placed = scope.project.activeLayer.children[0];
    assert.equal(placed.content, 'Hi\n\nYo');
  } finally { cleanup(); }
});

test('Alt+Return inserts a newline while retyping an object', () => {
  const { engine, cleanup } = setup();
  try {
    assert.equal(engine.pastePlainText('Hello'), true);
    press(engine, 'KeyP', 'p');
    assert.equal(engine.typedTextMode, 'edit');
    engine.handleKeyDown({
      code: 'Enter', key: 'Enter', shiftKey: false,
      altKey: true, ctrlKey: false, metaKey: false, target: null,
      preventDefault() {},
    });
    assert.equal(engine.typedText(), 'Hello\n');
    press(engine, 'Enter', 'Enter');
    assert.equal(engine.selectionText().content, 'Hello\n');
  } finally { cleanup(); }
});

test('Alt+Ctrl steps typed size and rotation finely, Alt+Shift steps big', () => {
  const { scope, engine, cleanup } = setup();
  const chord = (code, key, mods) => engine.handleKeyDown({
    code, key, shiftKey: false, altKey: false,
    ctrlKey: false, metaKey: false, target: null,
    preventDefault() {}, ...mods,
  });
  try {
    press(engine, 'KeyP', 'p');
    const base = engine.globalText.fontSize;
    chord('BracketRight', ']', { altKey: true, ctrlKey: true });
    assert.equal(engine.globalText.fontSize, base + 0.5);
    chord('BracketRight', ']', { altKey: true, shiftKey: true });
    assert.equal(engine.globalText.fontSize, base + 10.5);
    typeWord(engine, 'Tilt');
    chord('Quote', "'", { altKey: true, ctrlKey: true });
    chord('Quote', "'", { altKey: true, shiftKey: true });
    press(engine, 'Enter', 'Enter');
    const placed = scope.project.activeLayer.children[0];
    const angle = (Math.atan2(placed.matrix.b, placed.matrix.a) * 180) / Math.PI;
    assert.ok(Math.abs(angle - 46) < 1e-6, `expected 46deg, got ${angle}`);
  } finally { cleanup(); }
});

test('Alt+[ and ] step the font size while typing', () => {
  const { scope, engine, cleanup } = setup();
  try {
    const before = engine.globalText.fontSize;
    press(engine, 'KeyP', 'p');
    // A bare ] types instead of sizing.
    keydown(engine, { code: 'BracketRight', key: ']' });
    assert.equal(engine.typedText(), ']');
    keydown(engine, { code: 'Backspace', key: 'Backspace' });
    keydown(engine, { code: 'BracketRight', key: ']', altKey: true });
    assert.equal(engine.globalText.fontSize, before + 1);
    keydown(engine, { code: 'BracketRight', key: ']', altKey: true, shiftKey: true });
    assert.equal(engine.globalText.fontSize, before + 11);
    keydown(engine, { code: 'BracketLeft', key: '[', altKey: true, shiftKey: true });
    keydown(engine, { code: 'BracketLeft', key: '[', altKey: true });
    assert.equal(engine.globalText.fontSize, before);
    typeWord(engine, 'Sized');
    press(engine, 'Enter', 'Enter');
    const placed = scope.project.activeLayer.children[0];
    assert.equal(placed.content, 'Sized');
    assert.equal(placed.fontSize, before);
  } finally { cleanup(); }
});

test('Alt+; and Alt+\' rotate the placed line about the cursor', () => {
  const { scope, engine, cleanup } = setup();
  try {
    press(engine, 'KeyP', 'p');
    typeWord(engine, 'Tilt');
    keydown(engine, { code: 'Semicolon', key: ';', altKey: true });
    keydown(engine, { code: 'Semicolon', key: ';', altKey: true });
    keydown(engine, { code: 'Quote', key: "'", altKey: true });
    press(engine, 'Enter', 'Enter');
    const placed = scope.project.activeLayer.children[0];
    const angle = (Math.atan2(placed.matrix.b, placed.matrix.a) * 180) / Math.PI;
    assert.ok(Math.abs(angle + 5) < 1e-6, `expected -5deg, got ${angle}`);
    engine.undo();
    assert.equal(scope.project.activeLayer.children.length, 0);
  } finally { cleanup(); }
});

test('Alt+B toggles bold on the draft', () => {
  const { scope, engine, cleanup } = setup();
  try {
    assert.equal(engine.globalText.fontWeight, 'normal');
    press(engine, 'KeyP', 'p');
    keydown(engine, { code: 'KeyB', key: 'b', altKey: true });
    assert.equal(engine.globalText.fontWeight, 'bold');
    keydown(engine, { code: 'KeyB', key: 'b', altKey: true });
    assert.equal(engine.globalText.fontWeight, 'normal');
    keydown(engine, { code: 'KeyB', key: 'b', altKey: true });
    typeWord(engine, 'Bold');
    press(engine, 'Enter', 'Enter');
    assert.equal(scope.project.activeLayer.children[0].fontWeight, 'bold');
  } finally { cleanup(); }
});

test('edit-mode rotation undoes and cancels cleanly', () => {
  const { engine, cleanup } = setup();
  try {
    assert.equal(engine.pastePlainText('Hello'), true);
    const root = engine.selectedItems[0];
    const angleOf = () => (Math.atan2(root.matrix.b, root.matrix.a) * 180) / Math.PI;
    press(engine, 'KeyP', 'p');
    keydown(engine, { code: 'Quote', key: "'", altKey: true });
    assert.ok(Math.abs(angleOf() - 5) < 1e-6, `expected 5deg, got ${angleOf()}`);
    press(engine, 'Escape', 'Escape');
    assert.ok(Math.abs(angleOf()) < 1e-6, `expected 0deg, got ${angleOf()}`);
    assert.equal(engine.selectionText().content, 'Hello');
    press(engine, 'KeyP', 'p');
    keydown(engine, { code: 'Quote', key: "'", altKey: true });
    press(engine, 'Enter', 'Enter');
    assert.ok(Math.abs(angleOf() - 5) < 1e-6);
    engine.undo();
    assert.ok(Math.abs(angleOf()) < 1e-6, `expected 0deg, got ${angleOf()}`);
    engine.redo();
    assert.ok(Math.abs(angleOf() - 5) < 1e-6);
  } finally { cleanup(); }
});
