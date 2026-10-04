import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Guards the reported bug: tutorial bubbles rendering underneath panel
// widgets. The overlay's z-index must stay above every other app layer.
test('tutorial overlay stacks above all other styled layers', () => {
  const dir = new URL('../src/styles/', import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith('.css'));
  assert.ok(files.length > 0);

  const entries = [];
  for (const file of files) {
    const css = readFileSync(new URL(file, dir), 'utf8');
    const blocks = css.match(/[^{}]+\{[^}]*\}/g) ?? [];
    for (const block of blocks) {
      const selector = block.slice(0, block.indexOf('{')).trim().split('\n').pop().trim();
      for (const match of block.matchAll(/z-index\s*:\s*(auto|-?\d+)/g)) {
        if (match[1] === 'auto') continue;
        entries.push({ selector, file, value: Number(match[1]) });
      }
    }
  }

  const overlay = entries.filter((entry) => entry.selector.includes('.tutorial-overlay'));
  assert.ok(overlay.length > 0);
  const overlayTop = Math.max(...overlay.map((entry) => entry.value));
  const others = entries.filter((entry) => !entry.selector.includes('.tutorial-overlay'));
  const below = others.filter((entry) => entry.value >= overlayTop);
  assert.deepEqual(
    below,
    [],
    `tutorial overlay (z-index ${overlayTop}) must top every layer: ${JSON.stringify(below)}`,
  );
});
