import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { looksLikeRaster, looksLikeSvg, viewFitScale } from '../src/engine/document/DropController.ts';

test('drop classification and view fit scale', () => {
  assert.equal(looksLikeSvg({ name: 'mark.svg', type: '' }), true);
  assert.equal(looksLikeSvg({ name: 'mark.txt', type: 'image/svg+xml' }), true);
  assert.equal(looksLikeRaster({ name: 'photo.JPEG', type: '' }), true);
  assert.equal(looksLikeRaster({ name: 'photo.png', type: 'image/png' }), true);
  assert.equal(looksLikeSvg({ name: 'photo.png', type: 'image/png' }), false);
  assert.equal(looksLikeRaster({ name: 'notes.txt', type: 'text/plain' }), false);
  assert.equal(viewFitScale({ width: 10, height: 10 }, { width: 200, height: 100 }), 1);
  assert.equal(viewFitScale({ width: 400, height: 100 }, { width: 200, height: 100 }), 0.375);
  assert.equal(viewFitScale({ width: 0, height: 10 }, { width: 200, height: 100 }), 1);
});

test('node Paper has no DOMParser, so SVG import is checked in the browser', () => {
  const s = new paper.PaperScope();
  s.setup(new s.Size(200, 200));
  try {
    assert.throws(
      () => s.project.importSVG('<svg xmlns="http://www.w3.org/2000/svg"/>', () => {}),
      /DOMParser/,
    );
  } finally {
    s.project.remove();
  }
});
