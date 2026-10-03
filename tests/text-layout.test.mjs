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
