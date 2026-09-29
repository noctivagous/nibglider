import { useSyncExternalStore } from 'react';
import type {
  NibGliderEngine,
  StatusLine,
  StatusRun,
} from '../engine/engine';

function Runs({ runs }: { runs: StatusRun[] }) {
  return (
    <>
      {runs.map((r, i) =>
        r.t === 'key' ? (
          <kbd key={i} className={`st-key ${r.g}`}>
            {r.s}
          </kbd>
        ) : (
          <span key={i}>{r.s}</span>
        ),
      )}
    </>
  );
}

function Section({ lines }: { lines: StatusLine[] }) {
  return (
    <>
      {lines.map((l, i) => (
        <span key={i} className={`st-seg st-line-${l.kind}`}>
          {i > 0 && <span className="st-sep" aria-hidden="true"> · </span>}
          <Runs runs={l.runs} />
        </span>
      ))}
    </>
  );
}

// Display-only canvas HUD: state of things, then next steps.
// Pointer events fall through to the canvas like the on-screen keyboard.
export default function StatusOverlay({
  engine,
  hidden,
}: {
  engine: NibGliderEngine;
  hidden?: boolean;
}) {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  const schema = engine.getStatusSchema();
  if (schema.state.length === 0 && schema.steps.length === 0) return null;
  return (
    <div
      id="statusOverlay"
      className={hidden ? 'status-hidden' : undefined}
      aria-hidden="true"
    >
      <div className="status-table">
        <Section lines={schema.state} />
        {schema.state.length > 0 && schema.steps.length > 0 && (
          <span className="st-sep st-divider" aria-hidden="true"> | </span>
        )}
        <Section lines={schema.steps} />
      </div>
    </div>
  );
}
