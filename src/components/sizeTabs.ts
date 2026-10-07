// Size-picker tab model shared by the New Document dialog and the
// Document Size editor. Plain data and parsing only (no JSX), so it lives
// in a .ts module while the controls live in sizeControls.tsx.

export type TabId = 'workspace' | 'print' | 'image' | 'ratio';

export const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'print', label: 'Print' },
  { id: 'image', label: 'Image' },
  { id: 'ratio', label: 'Ratio' },
];

export function parsePositive(raw: string): number | null {
  const value = Number(raw.trim());
  return raw.trim() !== '' && Number.isFinite(value) && value > 0 ? value : null;
}
