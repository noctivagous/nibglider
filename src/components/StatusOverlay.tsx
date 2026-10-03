import { useSyncExternalStore } from 'react';
import { keyboardPlatform } from '../engine/input/keymap';
import { resolveKeyboardLayout } from '../engine/input/KeyboardLayoutResolver';
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
  const modifiers = useSyncExternalStore(engine.subscribeModifiers, engine.getModifiers);
  const schema = engine.getStatusSchema();
  const resolved = resolveKeyboardLayout(modifiers, keyboardPlatform(), engine.getKeyState());
  const primary = modifiers.control || modifiers.meta;
  const adjustmentIds = ['scale-down', 'scale-up', 'rotate-ccw', 'rotate-cw', 'tension-down', 'tension-up', 'tension-reset'];
  const chordHints: StatusLine[] = resolved
    .filter((cap) => cap.available && cap.variant && (primary || adjustmentIds.includes(cap.commandId ?? '')))
    .map((cap) => ({ kind: 'hint', runs: [
      { t: 'key', s: cap.dataKey.toUpperCase(), g: cap.variant!.command.group },
      { t: 'text', s: ` ${cap.description}` },
    ] }));
  const steps = primary ? chordHints : [...schema.steps, ...chordHints];
  if (schema.state.length === 0 && steps.length === 0) return null;
  return (
    <div
      id="statusOverlay"
      className={hidden ? 'status-hidden' : undefined}
      aria-hidden="true"
    >
      <div className="status-table">
        <Section lines={schema.state} />
        {schema.state.length > 0 && steps.length > 0 && (
          <span className="st-sep st-divider" aria-hidden="true"> | </span>
        )}
        <Section lines={steps} />
      </div>
    </div>
  );
}
