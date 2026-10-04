import { useSyncExternalStore } from 'react';
import { keyboardPlatform, keyGroupForLabel } from '../engine/input/keymap';
import { resolveKeyboardLayout } from '../engine/input/KeyboardLayoutResolver';
import { buildChordRows } from '../ui/KeymapPresenter';
import type { KeymapRow, NibGliderEngine } from '../engine/engine';

function KeyCell({ row }: { row: KeymapRow }) {
  return (
    <>
      {row.keys.map((k, i) => (
        <kbd key={i} className={`km-key ${keyGroupForLabel(k)}`}>
          {k}
        </kbd>
      ))}
    </>
  );
}

// Display-only keymap table: keys in columns and rows with a
// semitransparent background. Mounted underneath the application menus,
// separate from the status overlay. Pointer events fall through.
export default function KeymapWidget({ engine }: { engine: NibGliderEngine }) {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  useSyncExternalStore(engine.subscribeModifiers, engine.getModifiers);
  const schemaRows = engine.getKeymapRows();
  const modifiers = engine.getModifiers();
  const chords = buildChordRows(
    resolveKeyboardLayout(modifiers, keyboardPlatform(), engine.getKeyState()),
    {
      primary: modifiers.control || modifiers.meta,
      coveredIds: schemaRows.flatMap((r) => r.ids),
    },
  );
  const rows = [...schemaRows, ...chords];
  if (rows.length === 0) return null;
  const guide = rows.filter((r) => r.section !== 'adjust');
  const adjust = rows.filter((r) => r.section === 'adjust');
  return (
    <div id="keymapWidget" aria-hidden="true">
      <table className="keymap-table">
        <tbody>
          {guide.map((r, i) => (
            <tr key={i} className="km-row">
              <td className="km-keys"><KeyCell row={r} /></td>
              <td className="km-action">{r.label}</td>
            </tr>
          ))}
        </tbody>
        {adjust.length > 0 && (
          <tbody className="km-adjust">
            {adjust.map((r, i) => (
              <tr key={i} className="km-row">
                <td className="km-keys"><KeyCell row={r} /></td>
                <td className="km-action">{r.label}</td>
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}
