import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Guards the panel overlay bounds: the sections grid must scroll inside
// the viewport instead of growing to full screen height and burying the
// canvas and the on-screen keyboard underneath it.
test('panel sections stay bounded instead of full screen height', () => {
  const css = readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf8');

  const block = (selector) => {
    const match = css.match(new RegExp(`${selector}\\s*\\{[^}]*\\}`, 'g'));
    assert.ok(match && match.length > 0, `missing rule: ${selector}`);
    return match.join('\n');
  };

  // The sections grid carries a viewport-relative cap plus its own
  // vertical scroll, so extra rows never spill past the overlay.
  const sections = block('#controlPanel \\.panel-sections');
  assert.match(sections, /max-height\s*:\s*calc\(/);
  assert.match(sections, /overflow-y\s*:\s*auto/);

  // The overlay stack keeps its viewport bound, and section menus keep
  // portaling to document.body so the scroll container never clips them.
  const stack = block('#canvasContainer #topOverlayStack');
  assert.match(stack, /max-height\s*:\s*calc\(/);
});
