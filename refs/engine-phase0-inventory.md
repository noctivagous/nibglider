# Phase 0 baseline and inventory

Recorded 2026-10-01 against `src/engine/engine.ts` (6,375 lines) before any
extraction. Behavior and the `NibGliderEngine` facade name are unchanged.
Phase 1 then moved the shared type block into `src/engine/types.ts` and
re-exported it from `engine.ts`.

## Baseline checks

- `npm run build` (`tsc -b && vite build`) succeeded. Vite reported the
  existing chunk-size warning on the app bundle (about 887 kB).
- `npm run lint` (`oxlint`) finished with 0 errors and 1 existing warning:
  `typescript(no-this-alias)` at `src/engine/engine.ts` (`const self = this`
  inside `createSupershape`).

Manual regression checks for later phases live in
`refs/engine-smoke-checklist.md`.

## Who imports the engine

| File | Imports | Engine use |
| --- | --- | --- |
| `src/App.tsx` | `NibGliderEngine`, `KeyActivity` | Constructs the engine, `attach` / `detach`, reads `isDrawingPath` so J/K/L overlay toggles skip path drawing |
| `src/components/ControlPanel.tsx` | class plus `CircleInnerShape`, `CombineMode`, `FillSpec`, `FillType`, `GridType`, `InnerShapeParams`, `LengthUnit`, `RectangleInnerShape`, `StrokeCap`, `StrokeJoin`, `TextJustification`, `TextSpec` | All panel commands and live control values |
| `src/components/StatusOverlay.tsx` | class plus `StatusLine`, `StatusRun` | `subscribe`, `getVersion`, `getStatusSchema` |
| `src/components/Keyboard.tsx` | none | Display-only keycaps. App feeds `activeCode` from the engine's `KeyActivity` callback |

`Keyboard.tsx` does not call the engine. The only clickable keycap is
KeyL (`STATUS TOGGLE`), which calls App's `onStatusToggle`. Physical keys
are handled by `NibGliderEngine.handleKeyDown`. App owns three extra
document listeners that the engine deliberately does not:

- J toggles the control panel (`nibglider.controlsVisible`), unless a path
  is being drawn (J then changes spline tension).
- K toggles the on-screen keyboard (`nibglider.keyboardVisible`), unless a
  path is being drawn (K then changes spline tension).
- L toggles the status overlay (`nibglider.statusVisible`). The on-screen
  L keycap calls the same setter. Skipped while drawing a path.

`window.setSpacebarVisible`, `setKeyboardVisible`, `setControlsVisible`,
and `setStatusVisible` are assigned by App for console parity. The
on-screen spacebar starts hidden; the physical spacebar still toggles
drag-lock.

## React subscription

`subscribe(fn)` and `getVersion()` are the `useSyncExternalStore` bridge.
`notify()` bumps `version`. ControlPanel and StatusOverlay both subscribe.
There is one engine instance, created once in App state.

## Public state read by React

Fields (all public on the class today):

- Drawing gate: `isDrawingPath`
- Stroke globals, used when nothing is selected: `strokeEnabled`,
  `globalStrokeColor`, `globalStrokeWidth`, `globalStrokeCap`,
  `globalStrokeJoin`, `globalMiterLimit`, `globalDashLength`,
  `globalGapLength`
- Fill globals: `fillEnabled`, `globalFillColor` (gradient detail comes
  from `fillSpec()`)
- Text: `textModeEnabled`, `globalText`, `textMode`, `displayFlow`,
  `glyphOrientation`, `splineTextPlacement`, `displayOffset`,
  `circumferenceGap`, `circumferenceAngleOffset`
- Circle Keys: `circleInnerShapeType`, `circleInnerShapeParams`
- Rect Keys: `rectangleInnerShapeType`, `rectangleInnerShapeParams`,
  `rectangleOrientation`
- Grid: `isGridEnabled`, `gridType`
- Snapping: `isGridSnappingEnabled`, `isPathSnappingEnabled`,
  `isPointSnappingEnabled`, `isAngleSnappingEnabled`, `angleSnapDegrees`,
  `isLengthSnappingEnabled`, `isAspectSnappingEnabled`, `lengthUnit`
- Combinatorics: `combineMode`, `lastCombineNote`

`selectionPaint()` overrides the stroke/fill globals in the panel while a
selection exists. It returns the first selected item's paint, or `null`.

Other public fields (grid layers, cursors, drawing session, selection
array, snap steps in points, spline tension, live scale, and so on) are
not read by React. They stay on the class. Do not copy them into a second
state object.

## React-facing commands

These are the methods ControlPanel, StatusOverlay, or App call. Later
extractions should keep these names on the facade.

Lifecycle and bridge: `attach`, `detach`, `subscribe`, `getVersion`,
`getStatusSchema`.

Stroke and fill: `setStrokeEnabled`, `setStrokeColor`, `setStrokeWidth`,
`setStrokeDash`, `setStrokeCap`, `setStrokeJoin`, `setMiterLimit`,
`setFillEnabled`, `setFillColor`, `setFillType`, `setFillEndColor`,
`setFillAngle`, `setFillInner`, `fillSpec`, `selectionPaint`.

Text: `setTextModeEnabled`, `setTextMode`, `setDisplayFlow`,
`setGlyphOrientation`, `setSplineTextPlacement`, `setDisplayOffset`,
`setCircumferenceGap`, `setCircumferenceAngleOffset`, `setTextContent`,
`setTextLine2`, `setTextFontFamily`, `setTextFontSize`,
`setTextFontWeight`, `setTextItalic`, `setTextJustification`,
`setTextLeading`.

Shapes: `setCircleInnerShapeType`, `setCircleSides`, `setCircleAngle`,
`setCircleSector`, `setSupershapeParam`, `setRectangleInnerShapeType`,
`setRectangleSides`, `setRectangleAngle`, `setRectangleOrientation`,
`setRectangleSupershapeParam`, `innerShapePreviewPath`.

Grid and snapping: `setGridEnabled`, `setGridType`,
`setGridSnappingEnabled`, `setPathSnappingEnabled`,
`setPointSnappingEnabled`, `setAngleSnappingEnabled`,
`setAngleSnapDegrees`, `setLengthSnappingEnabled`,
`setLengthSnapStepFromUnit`, `lengthSnapStepInUnit`, `setLengthUnit`,
`setAspectSnappingEnabled`, `setAspectRatioKey`, `aspectRatioKey`.

Selection, history, transform: `canUndo`, `undo`, `undoLabel`, `canRedo`,
`redo`, `redoLabel`, `canGroupSelection`, `groupSelection`,
`canUngroupSelection`, `ungroupSelected`, `canTransformSelection`,
`removeAllSelectedItemsAndReset`, `duplicateSelection`,
`bringSelectionToFront`, `sendSelectionToBack`, `scaleSelectionPreview`,
`rotateSelectionPreview`, `pushUndoCommand`.

Combinatorics: `setCombineMode`, `canCombineSelection`, `combineSelection`.

## Other public methods

Public on the class, not called from React. Keyboard dispatch and drawing
code call them. They are part of the compatibility surface until a later
phase narrows it.

Style helpers: `thinStrokeWidth`, `thickenStrokeWidth`,
`strokeDashArrayValue`, `applyStrokeDash`, `fillSpecOf`, `applyFillSpec`,
`applyStrokeGeometry`, `applyCurrentStyles`, `updateCurrentDrawingStyles`.

Snapping and grid: `setLengthSnapStep`, `toggleGrid`, `drawGrid`,
`clearGrid`, `snapToGrid`, `updateGridCursor`, `applyAngleSnapping`,
`applyLengthSnapping`, `applyAspectSnapping`, `applyPathSnapping`,
`applyPointSnapping`, `updatePreviewBox`.

History and selection internals that are still public:
`depositWithCombine`, `addItemToSelection`, `removeItemFromSelection`,
`collectiveBounds`, `collectiveCenter`, `clearOutSelection`,
`setIsInDragLock`, `hasSelection`, `canDuplicateSelection`,
`canReorderSelection`, `selectionCenter`.

Shape construction: `clampShapeAngle`, `snapShapeAngle`,
`clampSectorAngle`, `setSplineTension`, `decreaseSplineTension`,
`increaseSplineTension`, `setPolygonRadiusMode`,
`togglePolygonRadiusMode`, `rotateShapeToMouseDirection`,
`circleInnerShapeUnitPoints`, `createCircumShape`, `sectorPreviewPath`,
`createSectorShape`, `segmentPreviewPath`, `createSegmentShape`,
`createBodyTextFor`, `createBoundaryText`, `createInnerShape`,
`drawInnerShape`, `createRectFrameShape`, `createRegularPolygon`,
`supershapeRadius`, `createSupershape`.

Drawing sessions and keys: `rectCenterlineKC`, `rectTwoEdgesKC`,
`quadPointKC`, `stampCurrentPreview`, `endPathOrShape`, `polyLineKC`,
`splinePointKC`, `completeShapeWithSpline`, `registerLiveKeyBinding`,
`toggleRadialStampRadiusLock`, `circleKC`, `radialStampKC`,
`finishRadialStamp`, `rectDiagonalKC`, `endShapeAsStroke`,
`stampItems`, `cancelCurrentDrawingOperation`, `findOpenEndpointNear`,
`statusKeyGroup`, `hitTestUnderCursor`, `updateShapePreview`,
`handleKeyDown`, `updateTextContent`.

Getter: `isLiveDrawing` (`isDrawingPath || isDrawingShape || isDrawingQuad`).

## Control panel inventory

`ControlPanel` owns its chrome. The engine does not. Sections render from
`PANEL_SECTIONS` and three groups in `DEFAULT_SECTION_GROUPS`.

| Group | Sections |
| --- | --- |
| paint | Stroke, Fill, Text |
| keys | Circle Keys, Rect Keys, Combinatorics, History |
| snap | Grid, Snapping |

Persisted in `localStorage` (React only):

| Key | What it stores |
| --- | --- |
| `nibglider.panelCollapsed` | section id to collapsed boolean |
| `nibglider.panelRemoved` | removed section ids |
| `nibglider.panelOrder` | per-group section order |
| `nibglider.snapVisibility` | which snap rows the Snapping section shows |
| `nibglider.historySegments` | Undo/Redo, Grouping, and History row visibility |
| `nibglider.lengthUnit` | `pt` / `inch` / `cm`; hydrated into `engine.lengthUnit` on mount |

Section chrome: left drag bar toggles collapse and reorders sections;
right-click opens remove / collapse; the title icon opens
`SectionIconMenu`. Every icon menu ends with Collapse to icon / Expand
section. Snapping's menu also toggles snap-row visibility and sets the
length unit. History's menu toggles the three history segments. Other
sections have only the collapse item.

Default visible snap rows: grid, path, points, angle, length. Aspect is
hidden until the menu opts in. Aspect presets are `1:1`, `3:4`, `2:3`,
`16:9` (default engine ratio 3:4).

The rail has two selects that are not engine sections:

- Operations: delete, duplicate, group, ungroup, bring to front, send to
  back, plus Scale and Rotate dialogs. Dialogs call
  `scaleSelectionPreview` / `rotateSelectionPreview` live and commit with
  `pushUndoCommand`.
- Sections: restores a removed section.

Stroke, Fill, and the two shape previews open portaled flyouts
(`ShapeParamsFlyout` and the stroke/fill param popovers). Escape is
captured so it closes the flyout without cancelling a drawing.

## On-screen keyboard layout

`Keyboard.tsx` is a static `KeyDef` board. Rows are `ROW2`, `ROW3`,
`ROW4`, plus an optional spacebar (`showSpacebar`, default false).
Resize limits are 480–1600, default 920, stored by App as
`nibglider.keyboardWidth`. Ghost glyphs are the `GLYPH` map. Circle Keys
(N, M, comma) and Rect Keys (Y, U, I) carry a corner badge.

Labels, not commands (the engine implements the real binding):

| Key | Label |
| --- | --- |
| Tab | Select objects |
| Q | Cancel |
| W | Stamp |
| R | Complete shape |
| Y / U / I | Rect by centerline / two edges / diagonal |
| O | Quad, 4 points |
| [ / ] | Scale − / + |
| A | End |
| S | Toggle stroke |
| D | Toggle fill |
| F | Sharp point |
| G | Spline point |
| J | Panel toggle |
| K | Keyboard toggle |
| L | Status toggle (also clickable) |
| ; / ' | Rotate − / + |
| C / V | Stroke width − / + |
| N / M | Circle by diameter / radius |
| , | Radial stamp |
| / | Grid toggle |
| Space | Drag-lock (hidden on screen by default) |

Empty or hidden keycaps: E, T, P, Backslash (resize anchor only),
Caps Lock, H, Enter, Z, X, B, period, both Shifts.

## Physical shortcut map

`handleKeyDown` ignores events whose target is input, textarea, select, or
contenteditable. Modifier chords:

| Chord | Action |
| --- | --- |
| Ctrl/Cmd+0 | Reset zoom |
| Ctrl/Cmd+- / = | Step zoom |
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y | Redo |
| Ctrl/Cmd+G | Group selection |
| Ctrl/Cmd+Shift+G | Ungroup |

Unmodified keys:

| Key | Action |
| --- | --- |
| Arrows | Nudge selection (Shift ×10, Alt ×0.2). No-op while drawing |
| [ ] | While drawing a centerline rect, change width. While live-drawing, scale the preview (Shift 0.8/1.25, Alt 0.98/1.02, else 0.9/1.1). Otherwise scale the selection. Not recorded as undo |
| ; ' | Same split: live rotate, else selection rotate (Shift 45°, Alt 5°, else 10°) |
| 0 | Lock or unlock radial-stamp radius while that tool is active |
| Space | Toggle drag-lock when a selection exists |
| Backspace | Delete selection |
| Escape | Clear selection and drag-lock, then cancel the current drawing |
| W | Stamp the live preview, or stamp the selection when idle |
| Y / U / I / O | Start or finish rect centerline, rect two-edges, rect diagonal, quad |
| F / G | Sharp path point / spline path point |
| N / M / , | Circle by diameter, circle by radius, radial stamp |
| A / E / S / R while drawing | End the path or shape. R on a path completes with a spline. Radial stamp deposits and finishes |
| J / K / / while drawing a path | Spline tension down, up, reset. Idle / toggles the grid. Idle J and K are App overlay toggles |
| C / V | Thinner / thicker global stroke, and the same on the selection |
| S / D when idle | Toggle stroke / fill, using the selection when one exists |
| Q | Cancel the current drawing |
| Tab | Hit-test under the cursor, unless focus is in a panel control |

Built-in `LiveKeyBinding`s (checked before idle scale/rotate): live scale
`[ ]`, live rotate `; '`, radial-stamp radius lock `0`.

## Status overlay

`getStatusSchema()` returns `{ state, steps }`. Each line is
`title | meta | hint` plus runs of plain text or a keycap
(`circle | rect | quad | op | end | neutral`). The overlay renders nothing
when both arrays are empty. It does not read engine fields itself.
`updateTextContent` rebuilds the schema for grid, drop notes, selection,
drag-lock, path drawing, and shape drawing. Undo/redo labels are not in
this HUD. The History section still shows them.
