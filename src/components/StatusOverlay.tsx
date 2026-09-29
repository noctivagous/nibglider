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
        <tr key={i} className={`st-line-${l.kind}`}>
          <td>
            <Runs runs={l.runs} />
          </td>
        </tr>
      ))}
    </>
  );
}

// Display-only canvas HUD: state of things, then next steps.
// Pointer events fall through to the canvas like the on-screen keyboard.
export default function StatusOverlay({ engine }: { engine: NibGliderEngine }) {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  const schema = engine.getStatusSchema();
  if (schema.state.length === 0 && schema.steps.length === 0) return null;
  return (
    <div id="statusOverlay" aria-hidden="true">
      <table className="status-table">
        <tbody>
          <Section lines={schema.state} />
          {schema.state.length > 0 && schema.steps.length > 0 && (
            <tr className="st-divider" aria-hidden="true">
              <td />
            </tr>
          )}
          <Section lines={schema.steps} />
        </tbody>
      </table>
    </div>
  );
}
