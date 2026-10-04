import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Guards the custom select scrollbar: native scrollbars stay hidden on the
// row scroller while the menu's own track + thumb is always painted, so
// overflow is visible on every platform (including overlay scrollbars).
test('custom select uses its own always-visible scrollbar', () => {
  const css = readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf8');

  const block = (selector) => {
    const match = css.match(new RegExp(`${selector}\\s*\\{[^}]*\\}`, 'g'));
    assert.ok(match && match.length > 0, `missing rule: ${selector}`);
    return match.join('\n');
  };

  // Row scroller hides every native scrollbar flavor.
  const scroller = block('\\.cs-scroll');
  assert.match(scroller, /scrollbar-width\s*:\s*none/);
  assert.match(block('\\.cs-scroll::-webkit-scrollbar'), /display\s*:\s*none/);

  // Track is a fixed overlay with a painted background (never transparent).
  const track = block('\\.cs-scrollbar');
  assert.match(track, /position\s*:\s*absolute/);
  assert.match(track, /background\s*:\s*rgba\(255,\s*255,\s*255,\s*0\.0[1-9]/);

  // Thumb is painted and signals draggability.
  const thumb = block('\\.cs-thumb');
  assert.match(thumb, /background\s*:\s*#4b5866/);
  assert.match(thumb, /cursor\s*:\s*pointer/);
});
