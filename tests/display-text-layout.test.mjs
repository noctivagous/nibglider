import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';

test('display text keeps each word on one straight boundary edge', () => {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(300, 300));
  const engine = new NibGliderEngine(scope, () => {});
  try {
    engine.setTextContent('AA BB CC DD');
    engine.setTextFontSize(24);
    const boundary = new scope.Path.Rectangle({ from: [50, 50], to: [110, 110] });
    const text = engine.createBoundaryText(boundary);
    assert.ok(text);
    assert.equal(text.children.length, 8);
    for (let i = 0; i < text.children.length; i += 2) {
      const first = text.children[i].position;
      const second = text.children[i + 1].position;
      assert.ok(
        Math.abs(first.x - second.x) < 1e-6 || Math.abs(first.y - second.y) < 1e-6,
        `word ${i / 2 + 1} crossed a vertex`,
      );
    }
  } finally {
    scope.project.remove();
  }
});
