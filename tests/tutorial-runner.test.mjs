import test from 'node:test';
import assert from 'node:assert/strict';
import { TutorialRunner } from '../src/tutorial/TutorialRunner.ts';
import {
  attachTutorialKeyListener,
  bridgeEngineToRunner,
  emitTutorialCommand,
  subscribeTutorialCommands,
} from '../src/tutorial/completionDetectors.ts';
import { getTutorialTargetRect, resolveTutorialTarget } from '../src/tutorial/TargetResolver.ts';
import { validateTutorial } from '../src/tutorial/tutorialSchema.ts';

function tutorial() {
  const checked = validateTutorial({
    id: 't',
    title: 'T',
    steps: [
      { id: 'info', bubble: { title: 'Info', body: 'Read me.' } },
      { id: 'press', bubble: { title: 'Press', body: 'Press I.' }, expect: { kind: 'press-key', key: 'i' } },
      {
        id: 'locked',
        bubble: { title: 'Locked', body: 'Run toggle-status.' },
        expect: { kind: 'run-command', command: 'toggle-status' },
        skippable: false,
      },
      { id: 'scene', bubble: { title: 'Scene', body: 'Change the canvas.' }, expect: { kind: 'scene-changed' } },
    ],
  });
  assert.equal(checked.ok, true);
  assert.ok(checked.ok && checked.tutorial);
  return checked.ok ? checked.tutorial : null;
}

test('runner advances manually and finishes on the last step', () => {
  const runner = new TutorialRunner();
  assert.equal(runner.currentStep, null);
  runner.load(tutorial());
  runner.start();
  assert.equal(runner.currentStep?.id, 'info');
  runner.next();
  assert.equal(runner.currentStep?.id, 'press');
  runner.back();
  assert.equal(runner.currentStep?.id, 'info');
  runner.next();
  runner.next();
  runner.next();
  runner.next();
  assert.equal(runner.getSnapshot().status, 'done');
  assert.equal(runner.currentStep, null);
});

test('runner advances on a matching key press, case-insensitively', () => {
  const runner = new TutorialRunner();
  runner.load(tutorial());
  runner.start();
  runner.next();
  assert.equal(runner.notify({ type: 'key', key: 'x' }), false);
  assert.equal(runner.currentStep?.id, 'press');
  assert.equal(runner.notify({ type: 'key', key: 'I' }), true);
  assert.equal(runner.currentStep?.id, 'locked');
});

test('info steps never auto-advance and skip respects skippable=false', () => {
  const runner = new TutorialRunner();
  runner.load(tutorial());
  runner.start();
  assert.equal(runner.notify({ type: 'engine' }), false);
  assert.equal(runner.currentStep?.id, 'info');
  runner.next();
  runner.next();
  assert.equal(runner.currentStep?.id, 'locked');
  runner.skip();
  assert.equal(runner.currentStep?.id, 'locked');
  runner.abort();
  assert.equal(runner.getSnapshot().status, 'idle');
});

test('engine bridge notifies command, key, and scene events', () => {
  const runner = new TutorialRunner();
  runner.load(tutorial());
  runner.start();
  const seen = [];
  const stopListening = runner.subscribe(() => {
    seen.push(runner.getSnapshot().stepIndex);
  });

  let engineFn = null;
  const engine = {
    subscribe(fn) {
      engineFn = fn;
      return () => {
        engineFn = null;
      };
    },
  };
  const stopBridge = bridgeEngineToRunner(engine, runner);
  assert.equal(typeof engineFn, 'function');

  const keys = new Set();
  const fakeDocument = {
    addEventListener(type, fn) {
      if (type === 'keydown') keys.add(fn);
    },
    removeEventListener(type, fn) {
      if (type === 'keydown') keys.delete(fn);
    },
  };
  const stopKeys = attachTutorialKeyListener(runner, fakeDocument);

  // info -> press via manual next, then key bridge advances to locked.
  runner.next();
  for (const fn of keys) fn({ key: 'i' });
  assert.equal(runner.currentStep?.id, 'locked');

  // Locked step advances only through the command bus with the right id.
  emitTutorialCommand('toggle-panel');
  assert.equal(runner.currentStep?.id, 'locked');
  emitTutorialCommand('toggle-status');
  assert.equal(runner.currentStep?.id, 'scene');

  // Scene step advances through the engine subscription.
  engineFn();
  assert.equal(runner.getSnapshot().status, 'done');
  assert.ok(seen.length > 0);

  stopKeys();
  stopBridge();
  stopListening();
  assert.equal(keys.size, 0);
});

test('command bus unsubscribe stops delivery', () => {
  let count = 0;
  const stop = subscribeTutorialCommands(() => {
    count += 1;
  });
  emitTutorialCommand('toggle-status');
  stop();
  emitTutorialCommand('toggle-status');
  assert.equal(count, 1);
});

function fakeRoot(ids) {
  return {
    querySelector(selector) {
      const match = selector.match(/data-tutorial-id="([^"]+)"/);
      const id = match ? match[1] : null;
      if (!id || !(id in ids)) return null;
      const rect = ids[id];
      if (!rect) return null;
      return { getBoundingClientRect: () => rect };
    },
  };
}

test('target resolver returns rects and null for missing or zero-area targets', () => {
  const root = fakeRoot({
    'menu-file': { x: 10, y: 20, width: 100, height: 30 },
    hidden: { x: 0, y: 0, width: 0, height: 0 },
  });
  assert.deepEqual(getTutorialTargetRect('menu-file', root), { x: 10, y: 20, width: 100, height: 30 });
  assert.equal(resolveTutorialTarget('missing', root), null);
  assert.equal(getTutorialTargetRect('missing', root), null);
  assert.equal(getTutorialTargetRect('hidden', root), null);
  assert.equal(getTutorialTargetRect('menu-file', null), null);
});
