# Archived: panel rail menus

The panel-side vertical menu rail (`SHOW_MENU_RAIL`, always `false` — the
rail never rendered) carried its own Document / Operations / Layers /
Sections / Debug selects duplicating the horizontal application menu bar.
The rail was removed and the menu bar is the live menu surface. Not
compiled, not imported.

Where each action lives now:

- **Document** — length-unit switching survives in the Snapping section icon
  menu and as wired `length-unit-*` options in the top Document menu. The
  `doc-canvas` entry was a disabled placeholder.
- **Operations** — delete/duplicate/group/ungroup/front/back are all wired
  in the top Edit and Layers menus. `op-scale` / `op-rotate` opened the
  `OperationDialog` live-preview modal (which stays in `ControlPanel` for
  future wiring); the rail card was its only trigger, so Scale…/Rotate…
  are unreachable until the top Operations `scale-dialog` / `rotate-dialog`
  entries are wired.
- **Layers** — all six actions are wired in the top Layers menu.
- **Sections** — the restore-removed-sections list; per-section show/expand
  toggles remain in the top menus' Panel groups for mapped sections.
- **Debug** — reset-all-settings is wired in the top Debug menu.

## Rail flag (`ControlPanel.tsx`)

```tsx
// Vertical menu rail: not launched. The rail markup below (including the
// File card-grid layout) stays in place for later reuse; the horizontal
// application menu bar is the live menu surface.
const SHOW_MENU_RAIL = false;
```

## Rail select state (`ControlPanel.tsx`)

```tsx
const [docValue, setDocValue] = useState('doc-none');
const [opValue, setOpValue] = useState('ops-none');
const [layersValue, setLayersValue] = useState('layers-none');
const [sectionsValue, setSectionsValue] = useState('sections-none');
const [debugValue, setDebugValue] = useState('debug-none');
```

## Operations dispatch (`ControlPanel.tsx`)

```tsx
const handleOperation = useCallback(
  (v: string) => {
    if (v === 'ops-none') return;
    dismissSelects();
    switch (v) {
      case 'op-delete':
        engine.removeAllSelectedItemsAndReset();
        break;
      case 'op-duplicate':
        engine.duplicateSelection();
        break;
      case 'op-group':
        engine.groupSelection();
        break;
      case 'op-ungroup':
        engine.ungroupSelected();
        break;
      case 'op-front':
        engine.bringSelectionToFront();
        break;
      case 'op-back':
        engine.sendSelectionToBack();
        break;
      case 'op-scale':
        openOpDialog('scale');
        break;
      case 'op-rotate':
        openOpDialog('rotate');
        break;
      // (opener, archived with the rail card)
      // const openOpDialog = (kind: 'scale' | 'rotate') => {
      //   if (!engine.canTransformSelection()) return;
      //   dismissSelects();
      //   setOpDialog(
      //     kind === 'scale'
      //       ? { kind, draft: 100, applied: 1 }
      //       : { kind, draft: 0, applied: 0 },
      //   );
      // };
      default:
        break;
    }
    // Reset to the placeholder label after acting.
    setOpValue('ops-none');
  },
  [engine, dismissSelects, openOpDialog],
);
```

## Document options and dispatch (`ControlPanel.tsx`)

```tsx
const DOCUMENT_OPTIONS: CustomSelectOption[] = [
  { value: 'doc-canvas', label: 'Canvas size…', disabled: true, title: 'Canvas size settings are not available yet' },
  {
    value: 'grp-doc-unit',
    label: 'Length unit',
    children: [
      { value: 'doc-unit-pt', label: 'Points (pt)' },
      { value: 'doc-unit-inch', label: 'Inches' },
      { value: 'doc-unit-cm', label: 'Centimeters (cm)' },
    ],
  },
];
const handleDocument = useCallback(
  (value: string) => {
    dismissSelects();
    if (value === 'doc-unit-pt') engine.setLengthUnit('pt');
    else if (value === 'doc-unit-inch') engine.setLengthUnit('inch');
    else if (value === 'doc-unit-cm') engine.setLengthUnit('cm');
    setDocValue('doc-none');
  },
  [engine, dismissSelects],
);
```

## Sections restore list and Debug (`ControlPanel.tsx`)

```tsx
// Sections menu: restore removed panel sections.
const removedOptions: CustomSelectOption[] = [
  ...(removedList.length > 0
    ? [
        {
          value: 'grp-removed',
          label: 'Restore',
          children: removedList.map((id) => ({
            value: `restore:${id}`,
            label: sectionLabel(id),
          })),
        },
      ]
    : []),
];
const DEBUG_OPTIONS: CustomSelectOption[] = [
  { value: 'debug-reset-settings', label: 'Reset all settings' },
];
const handleDebug = useCallback((value: string) => {
  setDebugValue('debug-none');
  if (value !== 'debug-reset-settings') return;
  try {
    clearNibGliderSettings(localStorage);
  } catch { /* Storage can be unavailable in private browsing. */ }
  window.location.reload();
}, []);
```

## Operations and Layers options (`ControlPanel.tsx`)

```tsx
// Operations menu: flat grouped areas (headers, not collapsible parents)
// so every entry is one hover away. Shortcuts shown where a binding exists.
const OPERATIONS_OPTIONS: CustomSelectOption[] = [
  { value: 'hdr-ops-immediate', label: 'Immediate', header: true },
  { value: 'op-delete', label: 'Delete selection', shortcut: 'Backspace' },
  { value: 'op-duplicate', label: 'Duplicate selection' },
  { value: 'op-group', label: 'Group selection', shortcut: primaryShortcut('G') },
  { value: 'op-ungroup', label: 'Ungroup selection', shortcut: primaryShortcut('G', true) },
  { value: 'op-front', label: 'Bring to front' },
  { value: 'op-back', label: 'Send to back' },
  { value: 'hdr-ops-dialog', label: 'With dialog', header: true },
  { value: 'op-scale', label: 'Scale…' },
  { value: 'op-rotate', label: 'Rotate…' },
];
// Layers and Objects menu: ordering and selection operations.
const LAYERS_OPTIONS: CustomSelectOption[] = [
  { value: 'hdr-layers-order', label: 'Order', header: true },
  { value: 'layer-front', label: 'Bring to front' },
  { value: 'layer-back', label: 'Send to back' },
  { value: 'hdr-layers-selection', label: 'Selection', header: true },
  { value: 'layer-group', label: 'Group selection', shortcut: primaryShortcut('G') },
  { value: 'layer-ungroup', label: 'Ungroup selection', shortcut: primaryShortcut('G', true) },
  { value: 'layer-duplicate', label: 'Duplicate selection' },
  { value: 'layer-delete', label: 'Delete selection', shortcut: 'Backspace' },
];
const handleLayers = useCallback(
  (v: string) => {
    if (v === 'layers-none') return;
    dismissSelects();
    switch (v) {
      case 'layer-delete':
        engine.removeAllSelectedItemsAndReset();
        break;
      case 'layer-duplicate':
        engine.duplicateSelection();
        break;
      case 'layer-group':
        engine.groupSelection();
        break;
      case 'layer-ungroup':
        engine.ungroupSelected();
        break;
      case 'layer-front':
        engine.bringSelectionToFront();
        break;
      case 'layer-back':
        engine.sendSelectionToBack();
        break;
      default:
        break;
    }
    // Reset to the placeholder label after acting.
    setLayersValue('layers-none');
  },
  [engine, dismissSelects],
);
```

## Rail mount (`ControlPanel.tsx`)

```tsx
{SHOW_MENU_RAIL && (
<div className="panel-rail" role="group" aria-label="Panel tools">
  <WidgetHandle widget="menus" label="Application menus" />
  <div
    className="doc-label"
    title={docDirty ? `${docName} (unsaved changes)` : docName}
    aria-live="polite"
  >
    {docName}
    {docDirty ? ' •' : null}
  </div>
  <div className="rail-box" title="Document and Settings" data-tutorial-id="menu-document">
    <CustomSelect
      id="panelDocumentSelect"
      ariaLabel="Document and Settings"
      placeholder="Document"
      value={docValue}
      options={DOCUMENT_OPTIONS}
      onChange={handleDocument}
      openOnHover
      stickyOnClick
      onHoverOpen={handleSelectHoverOpen}
      forceCloseKey={selectCloseKey}
    />
  </div>
  <div className="rail-box" title="Operations on the selection" data-tutorial-id="menu-operations">
    <CustomSelect
      id="panelOperationsSelect"
      ariaLabel="Operations on the selection"
      placeholder="Operations"
      value={opValue}
      options={OPERATIONS_OPTIONS}
      onChange={handleOperation}
      openOnHover
      stickyOnClick
      onHoverOpen={handleSelectHoverOpen}
      forceCloseKey={selectCloseKey}
    />
  </div>
  <div className="rail-box" title="Layers and Objects" data-tutorial-id="menu-layers">
    <CustomSelect
      id="panelLayersSelect"
      ariaLabel="Layers and Objects"
      placeholder="Layers"
      value={layersValue}
      options={LAYERS_OPTIONS}
      onChange={handleLayers}
      openOnHover
      stickyOnClick
      onHoverOpen={handleSelectHoverOpen}
      forceCloseKey={selectCloseKey}
    />
  </div>
  <div className="rail-box" title="Panel sections" data-tutorial-id="menu-sections">
    <CustomSelect
      id="panelSectionsSelect"
      ariaLabel="Panel sections"
      placeholder="Sections"
      value={sectionsValue}
      options={removedOptions}
      onChange={(v) => {
        if (v.startsWith('restore:')) restoreSection(v.slice(8));
        setSectionsValue('sections-none');
      }}
      openOnHover
      stickyOnClick
      onHoverOpen={handleSelectHoverOpen}
      forceCloseKey={selectCloseKey}
    />
  </div>
  <div className="rail-box" title="Debug settings" data-tutorial-id="menu-debug">
    <CustomSelect
      id="panelDebugSelect"
      ariaLabel="Debug settings"
      placeholder="Debug"
      value={debugValue}
      options={DEBUG_OPTIONS}
      onChange={handleDebug}
      openOnHover
      stickyOnClick
      onHoverOpen={handleSelectHoverOpen}
      forceCloseKey={selectCloseKey}
    />
  </div>
</div>
)}
```

Note: the `menu-document`, `menu-operations`, and `menu-layers` tutorial
targets resolve to the menu bar triggers (`AppMenu` renders
`data-tutorial-id="menu-<id>"`), so no tutorial step loses its target.
