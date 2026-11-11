// Tier Two, Slice 6: text completeness.
// Full shipped weight ranges per family, tracking + paragraph
// spacing in model/layout/serialization, Convert to Outlines from
// real parsed glyphs, and user-added fonts (parse + register +
// settings persistence of the family list).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import paper from 'paper';
import opentype from 'opentype.js';

const { FontMetrics, weightsForFamily, numericWeight, weightBucket } = await import('../src/engine/fontMetrics.ts');
const { TextLayout } = await import('../src/engine/appearance/TextLayout.ts');
const { outlineText } = await import('../src/engine/text/textOutline.ts');
const { validateDrawable } = await import('../src/engine/model/serialization.ts');
const { NibGliderEngine } = await import('../src/engine/engine.ts');
const { snapshotEngineSettings, applyEngineSettings } = await import('../src/engine/engineSettings.ts');

function fontBytes(name) {
  const buf = readFileSync(new URL(`../public/fonts/${name}`, import.meta.url));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function barlow() {
  return opentype.parse(fontBytes('BarlowCondensed-Regular.ttf'));
}

function makeEngine() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  return { scope, engine: new NibGliderEngine(scope, () => {}) };
}

function spec(overrides = {}) {
  return {
    content: 'aa bb', line2: '', fontFamily: 'Helvetica', fontSize: 10,
    fontWeight: 'normal', italic: false, justification: 'center', leading: 1.2,
    letterSpacing: 0, paragraphSpacing: 0, ...overrides,
  };
}

// --- weights -----------------------------------------------------------------

test('weights: numeric parsing and measurement buckets', () => {
  assert.equal(numericWeight('normal'), 400);
  assert.equal(numericWeight('bold'), 700);
  assert.equal(numericWeight('600'), 600);
  assert.equal(numericWeight('junk'), 400);
  assert.equal(weightBucket('500'), 'normal');
  assert.equal(weightBucket('600'), 'bold');
  assert.equal(weightBucket('bold'), 'bold');
});

test('weights: families expose the range they actually ship', () => {
  const variable = weightsForFamily('Exo 2').map((w) => w.numeric);
  assert.deepEqual(variable, [100, 200, 300, 400, 500, 600, 700, 800, 900]);
  assert.deepEqual(weightsForFamily('Barlow Condensed').map((w) => w.numeric), [400, 700]);
  assert.deepEqual(weightsForFamily('Some System Font').map((w) => w.numeric), [400, 700]);
  // A parsed variable font reports its own fvar range.
  const exo = opentype.parse(fontBytes('Exo2-wght.ttf'));
  const fromFont = weightsForFamily('Exo 2', exo).map((w) => w.numeric);
  assert.ok(fromFont.length >= 5 && fromFont.includes(400) && fromFont.includes(900 - 100));
  // Engine surface agrees.
  const { engine } = makeEngine();
  assert.equal(engine.textWeightOptions('JetBrains Mono').length, 9);
  assert.deepEqual(engine.textWeightOptions('Chakra Petch').map((w) => w.value), ['400', '700']);
});

// --- tracking + paragraph spacing ----------------------------------------------

test('metrics: tracking widens advance between glyphs only', () => {
  const metrics = new FontMetrics();
  const plain = metrics.advance('abcd', 'Helvetica', 10, 'normal', 0);
  const tracked = metrics.advance('abcd', 'Helvetica', 10, 'normal', 2);
  assert.equal(tracked - plain, 6, '3 inter-glyph gaps × 2pt');
  assert.equal(metrics.advance('a', 'Helvetica', 10, 'normal', 5), metrics.advance('a', 'Helvetica', 10, 'normal', 0));
});

test('layout: paragraphs wrap independently and stack with paragraph spacing', () => {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(400, 400));
  try {
    const config = {
      spec: spec({ content: 'aa bb cc\ndd ee', paragraphSpacing: 9 }),
      textModeEnabled: true, textMode: 'body', displayFlow: 'exterior',
      glyphOrientation: 'outward', splineTextPlacement: 'above',
      displayOffset: 18, circumferenceGap: 2, circumferenceAngleOffset: -90,
      fillEnabled: false, fillColor: '#000000', strokeColor: '#107cff',
    };
    const layout = new TextLayout(scope, () => config, new FontMetrics());
    assert.deepEqual(layout.layoutBodyParagraphs(config.spec, 30), [['aa bb', 'cc'], ['dd ee']]);
    assert.deepEqual(layout.layoutBodyLines(config.spec, 30), ['aa bb', 'cc', 'dd ee'], 'flat view preserved');
    const boundary = new scope.Path.Rectangle({ from: [0, 0], to: [40, 200] });
    const text = layout.createBodyTextFor(boundary);
    const lines = text.children.filter((c) => c.className === 'PointText');
    assert.equal(lines.length, 3);
    const ys = lines.map((l) => l.point.y);
    // leading = 1.2 * 10 = 12; third line is a new paragraph: +12 +9.
    assert.ok(Math.abs((ys[1] - ys[0]) - 12) < 1e-6, `line gap 1: ${ys[1] - ys[0]}`);
    assert.ok(Math.abs((ys[2] - ys[1]) - 21) < 1e-6, `paragraph gap: ${ys[2] - ys[1]}`);
  } finally { scope.project.remove(); }
});

test('layout: tracked body lines render per-glyph at tracked advances', () => {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(400, 400));
  try {
    const metrics = new FontMetrics();
    const config = {
      spec: spec({ content: 'ab', letterSpacing: 3, justification: 'left' }),
      textModeEnabled: true, textMode: 'body', displayFlow: 'exterior',
      glyphOrientation: 'outward', splineTextPlacement: 'above',
      displayOffset: 18, circumferenceGap: 2, circumferenceAngleOffset: -90,
      fillEnabled: false, fillColor: '#000000', strokeColor: '#107cff',
    };
    const layout = new TextLayout(scope, () => config, metrics);
    const boundary = new scope.Path.Rectangle({ from: [0, 0], to: [120, 200] });
    const text = layout.createBodyTextFor(boundary);
    const glyphs = text.children.filter((c) => c.className === 'PointText');
    assert.equal(glyphs.length, 2, 'one PointText per glyph when tracked');
    const gap = glyphs[1].point.x - glyphs[0].point.x;
    const expected = metrics.advance('a', 'Helvetica', 10, 'normal') + 3;
    assert.ok(Math.abs(gap - expected) < 1e-6, `glyph gap ${gap} vs ${expected}`);
  } finally { scope.project.remove(); }
});

test('model: NGText serialization accepts tracking and paragraph spacing', () => {
  const drawable = {
    id: 't1', kind: 'text', layerId: 'l1',
    transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    opacity: 1, visible: true, locked: false,
    source: {
      content: 'Hi', fontFamily: 'Exo 2', fontSize: 24, fontWeight: '600',
      italic: true, layout: 'display', letterSpacing: 1.5, paragraphSpacing: 6,
    },
  };
  assert.doesNotThrow(() => validateDrawable(drawable));
  assert.throws(() => validateDrawable({
    ...drawable,
    source: { ...drawable.source, paragraphSpacing: -2 },
  }), /paragraphSpacing/);
});

// --- convert to outlines ---------------------------------------------------------

test('outline: glyph geometry from a real font, tracking widens the line', () => {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(400, 400));
  try {
    const font = barlow();
    const plain = outlineText(scope, font, 'HI', 40, 0);
    assert.ok(plain);
    const advance = font.getAdvanceWidth('HI', 40, { kerning: true });
    assert.ok(Math.abs(plain.width - advance) < 0.6, `width ${plain.width} vs advance ${advance}`);
    const contours = plain.item.className === 'CompoundPath' ? plain.item.children : [plain.item];
    assert.ok(contours.length >= 2, 'H and I produce separate contours');
    for (const contour of contours) assert.ok(contour.segments.length >= 4);
    const bounds = plain.item.bounds;
    assert.ok(bounds.height > 20 && bounds.height <= 40.5, `cap height ~ ${bounds.height}`);
    const tracked = outlineText(scope, font, 'HI', 40, 5);
    assert.ok(Math.abs((tracked.width - plain.width) - 5) < 1e-6, 'one inter-glyph gap of tracking');
    assert.equal(outlineText(scope, font, '   ', 40, 0), null, 'spaces outline to nothing');
  } finally { scope.project.remove(); }
});

test('engine: convert selected text to outlines is one undo step and keeps geometry', () => {
  const { scope, engine } = makeEngine();
  engine.textMetrics.register('Barlow Condensed', 'normal', barlow());
  engine.setTextFontFamily('Barlow Condensed');
  engine.setTextFontSize(40);
  scope.project.activeLayer.activate();
  assert.equal(engine.pastePlainText('HI', new scope.Point(100, 100)), true);
  const root = engine.editableTextRoots()[0];
  assert.ok(root);
  const result = engine.convertSelectedTextToOutlines();
  assert.deepEqual(result, { converted: 1, skipped: 0 });
  assert.equal(engine.editableTextRoots().length, 0, 'text is no longer editable');
  const outlines = engine.allContentItems().filter((i) => i.className === 'Path' || i.className === 'CompoundPath');
  assert.equal(outlines.length, 1);
  const bounds = outlines[0].bounds;
  const advance = engine.textMetrics.advance('HI', 'Barlow Condensed', 40, 'normal');
  assert.ok(bounds.width < advance && bounds.width > advance * 0.6,
    `ink width ${bounds.width} sits inside the advance ${advance}`);
  assert.ok(bounds.height > 20, 'real cap height');
  // The outline is a retained NGPath in the model.
  const id = outlines[0].data.drawableId;
  assert.ok(typeof id === 'string');
  assert.ok(engine.getRetainedPathDrawable(id), 'retained path drawable exists');
  // One undo restores the live text; redo re-converts.
  engine.undo();
  assert.equal(engine.editableTextRoots().length, 1, 'undo restores live text');
  engine.redo();
  assert.equal(engine.editableTextRoots().length, 0, 'redo converts again');
});

test('engine: convert skips families without a parsed font', () => {
  const { scope, engine } = makeEngine();
  engine.setTextFontFamily('Helvetica');
  assert.equal(engine.pastePlainText('Hi', new scope.Point(50, 50)), true);
  const result = engine.convertSelectedTextToOutlines();
  assert.deepEqual(result, { converted: 0, skipped: 1 });
  assert.equal(engine.editableTextRoots().length, 1, 'system-font text stays live');
});

// --- user fonts --------------------------------------------------------------------

test('user fonts: bytes parse, register, list, and persist by name in settings', async () => {
  const { engine } = makeEngine();
  const family = await engine.addUserFontFromBytes(fontBytes('ChakraPetch-Regular.ttf'), 'file');
  assert.equal(family, 'Chakra Petch');
  assert.deepEqual(engine.userFonts().map((f) => [f.family, f.loaded]), [['Chakra Petch', true]]);
  assert.ok(engine.textMetrics.fontFor('Chakra Petch', 'normal'), 'metrics registered');
  // Settings round trip: the family list survives; a file font comes
  // back remembered-but-not-loaded (bytes are session-only).
  const snapshot = snapshotEngineSettings(engine);
  const fresh = makeEngine();
  applyEngineSettings(fresh.engine, snapshot);
  assert.deepEqual(
    fresh.engine.userFonts().map((f) => [f.family, f.loaded]),
    [['Chakra Petch', false]],
  );
  const bogus = await engine.addUserFontFromBytes(new ArrayBuffer(16), 'file');
  assert.equal(bogus, null, 'garbage bytes refused');
});

test('engine: letter/paragraph spacing setters round-trip through selectionText', () => {
  const { scope, engine } = makeEngine();
  engine.setTextLetterSpacing(2.5);
  engine.setTextParagraphSpacing(8);
  assert.equal(engine.pastePlainText('one\n\ntwo', new scope.Point(60, 60)), true);
  const selected = engine.selectionText();
  assert.equal(selected.letterSpacing, 2.5);
  assert.equal(selected.paragraphSpacing, 8);
  const lines = engine.editableLines(engine.editableTextRoots()[0]);
  assert.equal(lines.length, 3);
  const gap = lines[2].point.y - lines[1].point.y;
  const leading = lines[0].leading;
  assert.ok(Math.abs(gap - (leading + 8)) < 1e-6, `paragraph gap ${gap} vs leading ${leading} + 8`);
});
