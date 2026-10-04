import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTutorial } from '../src/tutorial/tutorialSchema.ts';
import { parseTutorialText } from '../src/tutorial/tutorialLoader.ts';
import { DemonstrationPlayer, prepareDemoWorkspace } from '../src/tutorial/demonstrationPlayer.ts';
import { TutorialRunner } from '../src/tutorial/TutorialRunner.ts';

function demoStep(partial = {}) {
  const checked = validateTutorial({
    id: 'demo-t',
    title: 'Demo T',
    steps: [
      {
        id: 'watch',
        bubble: { title: 'Watch', body: 'Watch this.' },
        preconditions: { normalZoom: true, showKeyboard: true, expandSections: ['rectFrameControls'], cancelDrawing: true },
        demo: [
          { kind: 'narrate', title: 'Hi', body: 'Here is how to draw.' },
          { kind: 'move-cursor-xy', x: 0.3, y: 0.4, durationMs: 5 },
          { kind: 'move-cursor', to: 'key-i', durationMs: 5 },
          { kind: 'press-key', key: 'i', holdMs: 5 },
          { kind: 'open-popover', key: 'i' },
          { kind: 'point-at', target: 'key-i', label: 'Diagonal mode' },
          { kind: 'set-param', settingsId: 'rect-diagonal-tool', field: 'rect-diagonal-mode', value: 'full' },
          { kind: 'close-popover' },
          { kind: 'wait', ms: 5 },
        ],
        ...partial,
      },
    ],
  });
  assert.equal(checked.ok, true);
  assert.ok(checked.ok && checked.tutorial);
  return checked.ok ? checked.tutorial.steps[0] : null;
}

function fakeHooks(log) {
  return {
    pressKey: (key, holdMs) => { log.push(['pressKey', key, holdMs]); },
    moveCursorToTarget: (target, durationMs) => { log.push(['moveCursorToTarget', target, durationMs]); },
    moveCursorToXY: (x, y, durationMs) => { log.push(['moveCursorToXY', x, y, durationMs]); },
    openPopover: (key) => { log.push(['openPopover', key]); },
    pointAt: (target, label) => { log.push(['pointAt', target, label ?? null]); },
    setParam: (settingsId, field, value) => { log.push(['setParam', settingsId, field, value]); },
    closePopover: () => { log.push(['closePopover']); },
    showNarration: () => { log.push(['showNarration']); },
  };
}

function fakeWorkspace(log) {
  return {
    resetZoom: () => { log.push('resetZoom'); },
    cancelDrawing: () => { log.push('cancelDrawing'); },
    setKeyboardVisible: (v) => { log.push(['setKeyboardVisible', v]); },
    setPanelVisible: (v) => { log.push(['setPanelVisible', v]); },
    setStatusVisible: (v) => { log.push(['setStatusVisible', v]); },
    expandSections: (ids) => { log.push(['expandSections', ids]); },
  };
}

test('validator accepts every demo action kind with preconditions', () => {
  const step = demoStep();
  assert.ok(step.demo && step.demo.length === 9);
  assert.deepEqual(step.preconditions, {
    normalZoom: true,
    showKeyboard: true,
    expandSections: ['rectFrameControls'],
    cancelDrawing: true,
  });
});

test('validator rejects bad demo scripts and preconditions', () => {
  const bad = (demo, preconditions) => validateTutorial({
    id: 'x',
    title: 'X',
    steps: [{ id: 's', bubble: { title: 'T', body: 'B' }, ...(demo === undefined ? {} : { demo }), ...(preconditions === undefined ? {} : { preconditions }) }],
  });
  assert.equal(bad([{ kind: 'teleport' }]).ok, false);
  assert.equal(bad([]).ok, false);
  assert.equal(bad([{ kind: 'move-cursor-xy', x: 2, y: 0.5 }]).ok, false);
  assert.equal(bad([{ kind: 'press-key' }]).ok, false);
  assert.equal(bad([{ kind: 'wait', ms: -1 }]).ok, false);
  assert.equal(bad([{ kind: 'narrate', title: 'T' }]).ok, false);
  assert.equal(bad([{ kind: 'set-param', settingsId: 's', field: 'f', value: null }]).ok, false);
  assert.equal(bad(undefined, { normalZoom: 'yes' }).ok, false);
  assert.equal(bad(undefined, { expandSections: [''] }).ok, false);
  // Steps without demo stay valid (v0 backward compatibility).
  assert.equal(bad(undefined, undefined).ok, true);
});

test('shipped tutorial files parse, including demo scripts', () => {
  for (const file of ['hello-rectangle.tutorial.json', 'demo-rectangle.tutorial.json']) {
    const loaded = parseTutorialText(readFileSync(new URL(`../tutorials/${file}`, import.meta.url), 'utf8'));
    assert.equal(loaded.ok, true, file);
    assert.ok(loaded.tutorial);
  }
  const hello = parseTutorialText(
    readFileSync(new URL('../tutorials/hello-rectangle.tutorial.json', import.meta.url), 'utf8'),
  );
  assert.ok(hello.ok && hello.tutorial.steps.some((step) => step.demo && step.demo.length > 0));
});

test('player runs actions in order, suspends the runner, then resumes', async () => {
  const suspended = [];
  const player = new DemonstrationPlayer((value) => suspended.push(value));
  const hookLog = [];
  const wsLog = [];
  const seen = [];
  player.subscribe(() => seen.push(player.getSnapshot().status));

  const status = await player.play(demoStep(), fakeHooks(hookLog), fakeWorkspace(wsLog));
  assert.equal(status, 'done');
  assert.deepEqual(suspended, [true, false]);
  assert.deepEqual(wsLog, ['resetZoom', 'cancelDrawing', ['setKeyboardVisible', true], ['expandSections', ['rectFrameControls']]]);
  assert.deepEqual(
    hookLog.map((entry) => entry[0]),
    ['showNarration', 'moveCursorToXY', 'moveCursorToTarget', 'pressKey', 'openPopover', 'pointAt', 'setParam', 'closePopover', 'pointAt'],
  );
  assert.ok(seen.includes('playing') && seen.includes('done'));
  assert.equal(player.getSnapshot().narration?.title, 'Hi');
});

test('player with no demo actions leaves state untouched', async () => {
  const checked = validateTutorial({
    id: 'x',
    title: 'X',
    steps: [{ id: 's', bubble: { title: 'T', body: 'B' } }],
  });
  assert.equal(checked.ok, true);
  assert.ok(checked.ok && checked.tutorial);
  const player = new DemonstrationPlayer();
  const status = await player.play(checked.tutorial.steps[0], fakeHooks([]), fakeWorkspace([]));
  assert.equal(status, 'idle');
  assert.equal(player.getSnapshot().status, 'idle');
});

test('stop() aborts mid-play and clears the pointer layer', async () => {
  const player = new DemonstrationPlayer();
  const hookLog = [];
  const hooks = {
    ...fakeHooks(hookLog),
    moveCursorToXY: async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    },
  };
  const pending = player.play(demoStep(), hooks, fakeWorkspace([]));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(player.isPlaying, true);
  player.stop();
  const status = await pending;
  assert.equal(status, 'aborted');
  assert.equal(player.getSnapshot().status, 'aborted');
  // stop() withdraws narration and the arrow through the hooks.
  assert.ok(hookLog.some((entry) => entry[0] === 'showNarration'));
  assert.ok(hookLog.some((entry) => entry[0] === 'pointAt' && entry[1] === null));
  // pressKey after the aborted move never runs.
  assert.ok(!hookLog.some((entry) => entry[0] === 'pressKey'));
});

test('prepareDemoWorkspace is idempotent and skips absent fields', () => {
  const log = [];
  const ws = fakeWorkspace(log);
  prepareDemoWorkspace(undefined, ws);
  assert.deepEqual(log, []);
  prepareDemoWorkspace({ showStatus: false }, ws);
  assert.deepEqual(log, [['setStatusVisible', false]]);
});

test('suspended runner ignores observed events until resumed', () => {
  const checked = validateTutorial({
    id: 'x',
    title: 'X',
    steps: [
      { id: 'a', bubble: { title: 'T', body: 'B' }, expect: { kind: 'press-key', key: 'i' } },
    ],
  });
  assert.equal(checked.ok, true);
  const runner = new TutorialRunner();
  assert.ok(checked.ok && checked.tutorial);
  runner.load(checked.tutorial);
  runner.start();
  runner.setSuspended(true);
  assert.equal(runner.isSuspended, true);
  assert.equal(runner.notify({ type: 'key', key: 'i' }), false);
  runner.setSuspended(false);
  assert.equal(runner.notify({ type: 'key', key: 'i' }), true);
  assert.equal(runner.getSnapshot().status, 'done');
});
