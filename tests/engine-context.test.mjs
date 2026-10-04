import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { EngineContext } from '../src/engine/EngineContext.ts';

test('engine subscription goes through EngineContext and stroke width still publishes', () => {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(200, 200));
  const engine = new NibGliderEngine(scope, () => {});
  assert.ok(engine.context instanceof EngineContext);
  const before = engine.getVersion();
  assert.equal(engine.context.getVersion(), before);
  let seen = 0;
  const unsubscribe = engine.subscribe(() => { seen += 1; });
  engine.setStrokeWidth(12);
  assert.equal(engine.globalStrokeWidth, 12);
  assert.ok(engine.getVersion() > before);
  assert.equal(engine.getVersion(), engine.context.getVersion());
  assert.ok(seen >= 1);
  unsubscribe();
  const after = seen;
  engine.context.notify();
  assert.equal(seen, after);
});
