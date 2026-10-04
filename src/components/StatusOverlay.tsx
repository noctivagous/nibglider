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
  shiftX,
}: {
  engine: NibGliderEngine;
  hidden?: boolean;
  /** Left offset (px) clearing widgets that hang below the panel. */
  shiftX?: number;
}) {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  const modifiers = useSyncExternalStore(engine.subscribeModifiers, engine.getModifiers);
  const schema = engine.getStatusSchema();
  const resolved = resolveKeyboardLayout(modifiers, keyboardPlatform(), engine.getKeyState());
  const primary = modifiers.control || modifiers.meta;
  const adjustmentIds = ['scale-down', 'scale-up', 'rotate-ccw', 'rotate-cw', 'tension-down', 'tension-up', 'tension-reset'];
  // The recurring adjust cluster: scale + rotate only. Tension hints stay
  // with the contextual guidance (they belong to path drawing, not selection).
  const SCALE_ROTATE_IDS = ['scale-down', 'scale-up', 'rotate-ccw', 'rotate-cw'];
  // Scale/rotate chord hints join the recurring adjust cluster; every other
  // chord hint flows with the contextual guidance.
  const chordHints: StatusLine[] = resolved
    .filter((cap) => cap.available && cap.variant && (primary || adjustmentIds.includes(cap.commandId ?? '')))
    .map((cap) => ({
      kind: SCALE_ROTATE_IDS.includes(cap.commandId ?? '') ? 'adjust' : 'hint',
      runs: [
        { t: 'key', s: cap.dataKey.toUpperCase(), g: cap.variant!.command.group },
        { t: 'text', s: ` ${cap.description}` },
      ],
    }));
  // The short degree-free adjust line wins over a degree-ful rotate chord
  // restatement — but only when that line is actually shown (no modifier).
  const schemaAdjustShown = !primary && schema.steps.some((l) => l.kind === 'adjust');
  const chords = schemaAdjustShown
    ? chordHints.filter((l) => !l.runs.some(
      (r) => r.t === 'text' && r.s.includes('°') && /rotate/i.test(r.s),
    ))
    : chordHints;
  const steps = primary ? chords : [...schema.steps, ...chords];
  const guidance = steps.filter((l) => l.kind !== 'adjust');
  const adjust = steps.filter((l) => l.kind === 'adjust');
  if (schema.state.length === 0 && steps.length === 0) return null;
  return (
    <div
      id="statusOverlay"
      className={hidden ? 'status-hidden' : undefined}
      aria-hidden="true"
      style={shiftX ? { marginLeft: shiftX } : undefined}
    >
      <div className="status-table">
        <Section lines={schema.state} />
        {schema.state.length > 0 && guidance.length > 0 && (
          <span className="st-sep st-divider" aria-hidden="true"> | </span>
        )}
        <Section lines={guidance} />
        {adjust.length > 0 && (
          <span className="st-adjust-row">
            <Section lines={adjust} />
          </span>
        )}
      </div>
    </div>
  );
}
