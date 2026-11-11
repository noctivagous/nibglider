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
  // FLAGGED EDIT (Slice 22): the generic { type: 'engine' } event was
  // removed from the vocabulary — precise selection/scene events replace
  // it. The assertion's meaning is unchanged: an info step ignores events.
  assert.equal(runner.notify({ type: 'selection' }), false);
  assert.equal(runner.notify({ type: 'scene' }), false);
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
  let documentFn = null;
  const engine = {
    subscribe(fn) {
      engineFn = fn;
      return () => {
        engineFn = null;
      };
    },
    subscribeDocumentChanges(fn) {
      documentFn = fn;
      return () => {
        documentFn = null;
      };
    },
  };
  const stopBridge = bridgeEngineToRunner(engine, runner);
  assert.equal(typeof engineFn, 'function');
  assert.equal(typeof documentFn, 'function');

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

  // FLAGGED EDIT (Slice 22): a bare engine notification no longer counts
  // as scene activity — that was the conflation this slice removes. The
  // scene step now advances through the document-changes channel only,
  // and a 'clean' change (save) does not count either.
  engineFn();
  assert.equal(runner.currentStep?.id, 'scene');
  documentFn({ reason: 'clean' });
  assert.equal(runner.currentStep?.id, 'scene');
  documentFn({ reason: 'scene' });
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

// --- Slice 22: precise detectors and state predicates -------------------

function stateWith({ selectionCount = 0, objectCount = 0, settings = {} } = {}) {
  return {
    selectionCount,
    objectCount,
    settingValue: (settingsId, field) => settings[`${settingsId}.${field}`],
  };
}

function runnerFor(steps) {
  const checked = validateTutorial({ id: 't2', title: 'T2', steps });
  assert.equal(checked.ok, true);
  const runner = new TutorialRunner();
  runner.load(checked.tutorial);
  runner.start();
  return runner;
}

test('press-key with count=2 needs two presses of the key', () => {
  const runner = runnerFor([
    { id: 'two', bubble: { title: 'T', body: 'B' }, expect: { kind: 'press-key', key: 'i', count: 2 } },
    { id: 'after', bubble: { title: 'T', body: 'B' } },
  ]);
  assert.equal(runner.notify({ type: 'key', key: 'i' }), false);
  assert.equal(runner.currentStep?.id, 'two');
  // A different key neither advances nor resets the count.
  assert.equal(runner.notify({ type: 'key', key: 'x' }), false);
  assert.equal(runner.notify({ type: 'key', key: 'I' }), true);
  assert.equal(runner.currentStep?.id, 'after');
});

test('press-key count resets when the step changes', () => {
  const runner = runnerFor([
    { id: 'two', bubble: { title: 'T', body: 'B' }, expect: { kind: 'press-key', key: 'i', count: 2 } },
    { id: 'again', bubble: { title: 'T', body: 'B' }, expect: { kind: 'press-key', key: 'i', count: 2 } },
  ]);
  runner.notify({ type: 'key', key: 'i' });
  runner.notify({ type: 'key', key: 'i' });
  assert.equal(runner.currentStep?.id, 'again');
  // Back on the first step, one press must not suffice.
  runner.back();
  assert.equal(runner.notify({ type: 'key', key: 'i' }), false);
  assert.equal(runner.currentStep?.id, 'two');
});

test('selection-count completes only when the selection size is in range', () => {
  const runner = runnerFor([
    { id: 'two', bubble: { title: 'T', body: 'B' }, expect: { kind: 'selection-count', min: 2, max: 2 } },
    { id: 'after', bubble: { title: 'T', body: 'B' } },
  ]);
  // Events never satisfy a state predicate.
  assert.equal(runner.notify({ type: 'scene' }), false);
  assert.equal(runner.notify({ type: 'selection' }), false);
  assert.equal(runner.notifyState(stateWith({ selectionCount: 1 })), false);
  assert.equal(runner.currentStep?.id, 'two');
  assert.equal(runner.notifyState(stateWith({ selectionCount: 3 })), false);
  assert.equal(runner.notifyState(stateWith({ selectionCount: 2 })), true);
  assert.equal(runner.currentStep?.id, 'after');
});

test('object-count already true when the step is reached completes immediately', () => {
  const runner = runnerFor([
    { id: 'one', bubble: { title: 'T', body: 'B' }, expect: { kind: 'object-count', min: 1 } },
    { id: 'after', bubble: { title: 'T', body: 'B' } },
  ]);
  // The step-entry evaluation: the predicate is already satisfied.
  assert.equal(runner.notifyState(stateWith({ objectCount: 1 })), true);
  assert.equal(runner.currentStep?.id, 'after');
});

test('setting-is compares the addressed param value', () => {
  const runner = runnerFor([
    {
      id: 'grid-on',
      bubble: { title: 'T', body: 'B' },
      expect: { kind: 'setting-is', settingsId: 'grid', field: 'enabled', value: true },
    },
    { id: 'after', bubble: { title: 'T', body: 'B' } },
  ]);
  assert.equal(runner.notifyState(stateWith({ settings: { 'grid.enabled': false } })), false);
  assert.equal(runner.currentStep?.id, 'grid-on');
  assert.equal(runner.notifyState(stateWith({ settings: { 'grid.enabled': true } })), true);
  assert.equal(runner.currentStep?.id, 'after');
});

test('satisfied predicate steps chain in a single notifyState', () => {
  const runner = runnerFor([
    { id: 'a', bubble: { title: 'T', body: 'B' }, expect: { kind: 'object-count', min: 1 } },
    { id: 'b', bubble: { title: 'T', body: 'B' }, expect: { kind: 'selection-count', min: 1 } },
    { id: 'c', bubble: { title: 'T', body: 'B' } },
  ]);
  assert.equal(runner.notifyState(stateWith({ objectCount: 2, selectionCount: 1 })), true);
  assert.equal(runner.currentStep?.id, 'c');
});

test('suspended runner ignores state predicates too', () => {
  const runner = runnerFor([
    { id: 'a', bubble: { title: 'T', body: 'B' }, expect: { kind: 'object-count', min: 1 } },
  ]);
  runner.setSuspended(true);
  assert.equal(runner.notifyState(stateWith({ objectCount: 5 })), false);
  runner.setSuspended(false);
  assert.equal(runner.notifyState(stateWith({ objectCount: 5 })), true);
  assert.equal(runner.getSnapshot().status, 'done');
});

/** A fake engine source with a mutable selection, object count, and
 * document channel, for bridge-level precision tests. */
function fakeSource() {
  const subs = { engine: null, document: null };
  const world = { selection: [], objects: 0, settings: {} };
  const source = {
    subscribe(fn) {
      subs.engine = fn;
      return () => { subs.engine = null; };
    },
    subscribeDocumentChanges(fn) {
      subs.document = fn;
      return () => { subs.document = null; };
    },
    selectionIds: () => world.selection,
    objectCount: () => world.objects,
    settingValue: (id, field) => world.settings[`${id}.${field}`],
  };
  return { subs, world, source };
}

test('bridge: scene-changed does not complete on a selection-only change', () => {
  const runner = runnerFor([
    { id: 'scene', bubble: { title: 'T', body: 'B' }, expect: { kind: 'scene-changed' } },
    { id: 'after', bubble: { title: 'T', body: 'B' } },
  ]);
  const { subs, world, source } = fakeSource();
  const stop = bridgeEngineToRunner(source, runner);
  subs.engine(); // baseline snapshot
  world.selection = ['item-1'];
  subs.engine(); // selection changed, document untouched
  assert.equal(runner.currentStep?.id, 'scene');
  subs.document({ reason: 'scene' });
  assert.equal(runner.currentStep?.id, 'after');
  stop();
});

test('bridge: selection-changed does not complete on a scene-only change', () => {
  const runner = runnerFor([
    { id: 'sel', bubble: { title: 'T', body: 'B' }, expect: { kind: 'selection-changed' } },
    { id: 'after', bubble: { title: 'T', body: 'B' } },
  ]);
  const { subs, world, source } = fakeSource();
  const stop = bridgeEngineToRunner(source, runner);
  subs.engine(); // baseline
  world.objects = 3;
  subs.document({ reason: 'scene' }); // scene changed, selection untouched
  assert.equal(runner.currentStep?.id, 'sel');
  world.selection = ['a', 'b'];
  subs.engine();
  assert.equal(runner.currentStep?.id, 'after');
  stop();
});

test('bridge: selection-count is not completed by a scene change alone', () => {
  const runner = runnerFor([
    { id: 'two', bubble: { title: 'T', body: 'B' }, expect: { kind: 'selection-count', min: 2 } },
    { id: 'after', bubble: { title: 'T', body: 'B' } },
  ]);
  const { subs, world, source } = fakeSource();
  const stop = bridgeEngineToRunner(source, runner);
  subs.engine(); // baseline
  world.objects = 5;
  subs.document({ reason: 'scene' }); // scene activity, selection still empty
  assert.equal(runner.currentStep?.id, 'two');
  world.selection = ['a', 'b'];
  subs.engine();
  assert.equal(runner.currentStep?.id, 'after');
  stop();
});

test('bridge: bare engine notifications complete nothing', () => {
  const runner = runnerFor([
    { id: 'scene', bubble: { title: 'T', body: 'B' }, expect: { kind: 'scene-changed' } },
  ]);
  const { subs, source } = fakeSource();
  const stop = bridgeEngineToRunner(source, runner);
  subs.engine();
  subs.engine();
  assert.equal(runner.currentStep?.id, 'scene');
  assert.equal(runner.getSnapshot().status, 'active');
  stop();
});

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

test('runner startAt resumes at a saved step and clamps out-of-range indexes', () => {
  const runner = new TutorialRunner();
  runner.load(tutorial());
  runner.start(2);
  assert.equal(runner.currentStep?.id, 'locked');
  runner.abort();
  runner.start(99);
  assert.equal(runner.currentStep?.id, 'scene');
  runner.abort();
  runner.start(-3);
  assert.equal(runner.currentStep?.id, 'info');
  runner.abort();
  runner.start();
  assert.equal(runner.currentStep?.id, 'info');
});
