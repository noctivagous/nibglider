// Tier Four, Slice 19: text styles (app-settings presets) and
// Find & Replace over the current page's text objects.
import test from 'node:test';
import assert from 'node:assert/strict';

import paper from 'paper';

const { NibGliderEngine } = await import('../src/engine/engine.ts');
const { snapshotEngineSettings, applyEngineSettings } = await import('../src/engine/engineSettings.ts');

function makeEngine() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  return { scope, engine: new NibGliderEngine(scope, () => {}) };
}

test('styles: built-ins ship, cannot be deleted or overwritten', () => {
  const { engine } = makeEngine();
  const styles = engine.textStyles();
  assert.deepEqual(styles.map((s) => s.name), ['Headline', 'Body', 'Caption']);
  assert.ok(styles.every((s) => s.builtIn));
  assert.equal(engine.deleteTextStyle('Body'), false);
  assert.equal(engine.saveCurrentTextStyle('Body'), false, 'built-in names are reserved');
  assert.equal(engine.saveCurrentTextStyle('  '), false);
  assert.equal(engine.textStyles().length, 3);
});

test('styles: save current, persist through settings, apply sets creation spec', () => {
  const { engine } = makeEngine();
  engine.setTextFontSize(33);
  engine.setTextFontWeight('bold');
  engine.setTextUnderline(true);
  assert.equal(engine.saveCurrentTextStyle('Poster'), true);
  assert.deepEqual(engine.textStyles().map((s) => s.name), ['Headline', 'Body', 'Caption', 'Poster']);
  // Settings round trip into a fresh engine.
  const snapshot = snapshotEngineSettings(engine);
  const fresh = makeEngine();
  applyEngineSettings(fresh.engine, snapshot);
  const restored = fresh.engine.textStyles().find((s) => s.name === 'Poster');
  assert.ok(restored);
  assert.equal(restored.builtIn, false);
  assert.equal(restored.spec.fontSize, 33);
  assert.equal(restored.spec.underline, true);
  // Apply with no selection: creation spec takes the style, words stay.
  fresh.engine.setTextContent('Keep these words');
  assert.equal(fresh.engine.applyTextStyle('Headline'), true);
  assert.equal(fresh.engine.globalText.fontSize, 48);
  assert.equal(fresh.engine.globalText.fontWeight, 'bold');
  assert.equal(fresh.engine.globalText.content, 'Keep these words', 'a style never applies content');
  assert.equal(fresh.engine.applyTextStyle('Nope'), false);
  // Delete removes a user style.
  assert.equal(fresh.engine.deleteTextStyle('Poster'), true);
  assert.equal(fresh.engine.textStyles().some((s) => s.name === 'Poster'), false);
});

test('styles: applying to a selected object is one undo entry', () => {
  const { scope, engine } = makeEngine();
  engine.setTextFontSize(20);
  assert.equal(engine.pastePlainText('Title', new scope.Point(80, 80)), true);
  const root = engine.editableTextRoots()[0];
  assert.ok(root);
  const undoDepth = engine.historyDepth ? engine.historyDepth() : null;
  assert.equal(engine.applyTextStyle('Headline'), true);
  const line = engine.editableLines(root)[0];
  assert.equal(line.fontSize, 48);
  assert.equal(line.fontWeight, 'bold');
  if (undoDepth !== null) assert.equal(engine.historyDepth(), undoDepth + 1, 'exactly one entry');
  engine.undo();
  const restored = engine.editableLines(engine.editableTextRoots()[0])[0];
  assert.equal(restored.fontSize, 20, 'undo restores the previous size');
});

test('find & replace: counts, case sensitivity, first and all, one undo for all', () => {
  const { scope, engine } = makeEngine();
  assert.equal(engine.pastePlainText('Cat cat CAT', new scope.Point(60, 60)), true);
  assert.equal(engine.pastePlainText('another cat', new scope.Point(60, 140)), true);
  assert.equal(engine.pageTextObjects().length, 2);
  assert.equal(engine.countTextMatches('cat', false), 4, 'case-insensitive by default path');
  assert.equal(engine.countTextMatches('cat', true), 2);
  assert.equal(engine.countTextMatches('', false), 0);
  // Replace first (case-sensitive): only the lowercase 'cat' in line 1.
  assert.equal(engine.replaceFirstTextMatch('cat', 'dog', true), true);
  const first = engine.editableTextRoots();
  const contents = engine.pageTextObjects().map((r) => engine.editableLines(r).map((l) => l.content).join('\n'));
  assert.deepEqual(contents, ['Cat dog CAT', 'another cat']);
  // Replace all case-insensitively: 3 remaining matches, one undo entry.
  assert.equal(engine.replaceAllText('cat', 'fox', false), 3);
  const after = engine.pageTextObjects().map((r) => engine.editableLines(r).map((l) => l.content).join('\n'));
  assert.deepEqual(after, ['fox dog fox', 'another fox']);
  engine.undo();
  const undone = engine.pageTextObjects().map((r) => engine.editableLines(r).map((l) => l.content).join('\n'));
  assert.deepEqual(undone, ['Cat dog CAT', 'another cat'], 'one undo restores every replacement');
  assert.equal(engine.replaceAllText('zebra', 'x', false), 0, 'no match replaces nothing');
  void first;
});
