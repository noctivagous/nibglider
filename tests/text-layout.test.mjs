import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { FontMetrics } from '../src/engine/fontMetrics.ts';
import { TextLayout } from '../src/engine/appearance/TextLayout.ts';

test('body lines wrap on estimated advances without a loaded font', () => {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(200, 200));
  try {
    const config = {
      spec: {
        content: 'aa bb', line2: '', fontFamily: 'Helvetica', fontSize: 10,
        fontWeight: 'normal', italic: false, justification: 'center', leading: 1.2,
      },
      textModeEnabled: true, textMode: 'body', displayFlow: 'exterior',
      glyphOrientation: 'outward', splineTextPlacement: 'above',
      displayOffset: 18, circumferenceGap: 2, circumferenceAngleOffset: -90,
      fillEnabled: false, fillColor: '#000000', strokeColor: '#107cff',
    };
    const layout = new TextLayout(scope, () => config, new FontMetrics());
    assert.deepEqual(layout.layoutBodyLines(config.spec, 20), ['aa', 'bb']);
    const boundary = new scope.Path.Rectangle({ from: [0, 0], to: [16, 40] });
    const text = layout.createBodyTextFor(boundary);
    assert.equal(text.data.textKind, 'body');
    assert.equal(text.children.filter((child) => child.className === 'PointText').length, 2);
  } finally { scope.project.remove(); }
});

// --- Slice 18: justification, decorations, case, spacing, shift ------

function slice18Config(specOverrides = {}, configOverrides = {}) {
  return {
    spec: {
      content: 'aaa bbb ccc ddd eee fff', line2: '', fontFamily: 'Helvetica', fontSize: 20,
      fontWeight: 'normal', italic: false, justification: 'left', leading: 1.2,
      letterSpacing: 0, paragraphSpacing: 0,
      underline: false, strikethrough: false, caseTransform: 'none',
      baselineShift: 0, wordSpacing: 0,
      ...specOverrides,
    },
    textModeEnabled: true, textMode: 'body', displayFlow: 'exterior',
    glyphOrientation: 'outward', splineTextPlacement: 'above',
    displayOffset: 18, circumferenceGap: 2, circumferenceAngleOffset: -90,
    fillEnabled: false, fillColor: '#000000', strokeColor: '#107cff',
    ...configOverrides,
  };
}

function glyphsOf(group) {
  return group.children.filter((c) => c.className === 'PointText');
}

test('justify: non-last lines span the measure, the last line stays left', () => {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(400, 400));
  try {
    const config = slice18Config({ justification: 'justify' });
    const layout = new TextLayout(scope, () => config, new FontMetrics());
    // Boundary 200 wide → wrap measure 150, centered on x=100.
    const boundary = new scope.Path.Rectangle({ from: [0, 0], to: [200, 200] });
    const text = layout.createBodyTextFor(boundary);
    const glyphs = glyphsOf(text);
    assert.ok(glyphs.length > 6, 'two wrapped lines of per-glyph text');
    const ys = [...new Set(glyphs.map((g) => Math.round(g.point.y)))].sort((a, b) => a - b);
    assert.equal(ys.length, 2, 'content wrapped to two lines');
    const line1 = glyphs.filter((g) => Math.round(g.point.y) === ys[0]);
    const line2 = glyphs.filter((g) => Math.round(g.point.y) === ys[1]);
    const charW = 20 * 0.55; // estimated advance at size 20
    assert.ok(Math.abs(line1[0].point.x - 25) < 1, `justified line starts at the left edge: ${line1[0].point.x}`);
    const end1 = line1[line1.length - 1].point.x + charW;
    assert.ok(Math.abs(end1 - 175) < 1.5, `justified line spans the measure: ends ${end1}`);
    assert.ok(Math.abs(line2[0].point.x - 25) < 1, 'last line also starts at the left edge');
    const end2 = line2[line2.length - 1].point.x + charW;
    assert.ok(end2 < 170, `last line is not stretched: ends ${end2}`);
  } finally { scope.project.remove(); }
});

test('underline and strikethrough draw as tagged segments in body and display groups', () => {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(400, 400));
  try {
    const config = slice18Config({ content: 'aa bb', underline: true, strikethrough: true });
    const layout = new TextLayout(scope, () => config, new FontMetrics());
    const boundary = new scope.Path.Rectangle({ from: [0, 0], to: [200, 200] });
    const body = layout.createBodyTextFor(boundary);
    const bodyDeco = body.children.filter((c) => c.data?.textDecoration);
    assert.deepEqual(bodyDeco.map((c) => c.data.textDecoration).sort(), ['strikethrough', 'underline']);
    assert.ok(bodyDeco.every((c) => c.className === 'Path'));
    const displayConfig = slice18Config(
      { content: 'AB', underline: true },
      { textMode: 'display' },
    );
    const displayLayout = new TextLayout(scope, () => displayConfig, new FontMetrics());
    const ring = new scope.Path.Circle({ center: [200, 200], radius: 80 });
    const display = displayLayout.createBoundaryText(ring);
    assert.ok(display);
    const displayDeco = display.children.filter((c) => c.data?.textDecoration === 'underline');
    assert.ok(displayDeco.length >= 2, 'one underline segment per glyph');
  } finally { scope.project.remove(); }
});

test('small caps render lowercase as reduced capitals; upper transforms whole lines', () => {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(400, 400));
  try {
    const boundary = new scope.Path.Rectangle({ from: [0, 0], to: [200, 200] });
    const capsConfig = slice18Config({ content: 'aB c', caseTransform: 'smallCaps' });
    const capsLayout = new TextLayout(scope, () => capsConfig, new FontMetrics());
    const caps = capsLayout.createBodyTextFor(boundary);
    const glyphs = glyphsOf(caps);
    assert.deepEqual(glyphs.map((g) => g.content), ['A', 'B', 'C']);
    assert.deepEqual(glyphs.map((g) => g.fontSize), [15, 20, 15]);
    const upperConfig = slice18Config({ content: 'ab cd', caseTransform: 'upper' });
    const upperLayout = new TextLayout(scope, () => upperConfig, new FontMetrics());
    const upper = upperLayout.createBodyTextFor(boundary);
    assert.deepEqual(glyphsOf(upper).map((g) => g.content), ['AB CD']);
  } finally { scope.project.remove(); }
});

test('word spacing widens space advances and baseline shift raises glyphs', () => {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(400, 400));
  try {
    const boundary = new scope.Path.Rectangle({ from: [0, 0], to: [200, 200] });
    const measure = (overrides) => {
      // Tracking 1 keeps every variant on the per-glyph path.
      const config = slice18Config({ content: 'a b', justification: 'left', letterSpacing: 1, ...overrides });
      const layout = new TextLayout(scope, () => config, new FontMetrics());
      const group = layout.createBodyTextFor(boundary);
      return glyphsOf(group);
    };
    const plain = measure({});
    const spaced = measure({ wordSpacing: 10 });
    assert.ok(Math.abs((spaced[1].point.x - plain[1].point.x) - 10) < 1e-6, 'second glyph moves by the word spacing');
    const shifted = measure({ baselineShift: 6 });
    assert.ok(Math.abs((plain[0].point.y - shifted[0].point.y) - 6) < 1e-6, 'positive shift raises the line');
  } finally { scope.project.remove(); }
});
