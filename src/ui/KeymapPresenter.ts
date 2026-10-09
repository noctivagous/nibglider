// Chord rows for the keymap table widget.
// Derives modifier-dependent rows from a resolved keyboard layout. Rows
// whose command is already covered by schema rows are dropped, so each
// binding renders exactly once.
// Public: buildChordRows.
// Tested from tests/ui-state.test.mjs.

import type { ResolvedKeyCap } from '../engine/input/KeyboardLayoutResolver';
import { COMMON_KEYMAP_IDS } from '../engine/input/keymap';
import type { KeymapRow } from '../engine/types';

// Commands whose chord rows join the recurring adjust cluster; every other
// chord row flows with the contextual guide rows.
export const CHORD_ADJUST_IDS = ['scale-down', 'scale-up', 'rotate-ccw', 'rotate-cw'];

// Without a primary modifier only the adjust cluster (plus tension) resolves
// usefully; every other chord needs Ctrl/Cmd held.
const UNMODIFIED_CHORD_IDS = [
  ...CHORD_ADJUST_IDS,
  'tension-down', 'tension-up', 'tension-reset',
];

export function buildChordRows(
  resolved: ResolvedKeyCap[],
  opts: { primary: boolean; coveredIds: ReadonlySet<string> | readonly string[]; hideCommon?: boolean },
): KeymapRow[] {
  const covered = opts.coveredIds instanceof Set ? opts.coveredIds : new Set(opts.coveredIds);
  return resolved.flatMap((cap): KeymapRow[] => {
    const id = cap.commandId;
    if (!cap.available || !cap.variant || !id) return [];
    if (covered.has(id)) return [];
    if (opts.hideCommon && COMMON_KEYMAP_IDS.includes(id)) return [];
    if (!opts.primary && !UNMODIFIED_CHORD_IDS.includes(id)) return [];
    return [{
      keys: [cap.dataKey.toUpperCase()],
      label: cap.description,
      group: cap.variant.command.group,
      ids: [id],
      section: CHORD_ADJUST_IDS.includes(id) ? 'adjust' : 'guide',
    }];
  });
}
