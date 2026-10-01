# Engine Refactor and Restructure Plan

## Goal

Reduce `src/engine/engine.ts` from an all-purpose implementation into a
small orchestration facade. Keep the current behavior and public API stable
while moving cohesive responsibilities into modules that are easier to test,
understand, and modify with agentic AI.

The existing `nibglider-futuresoftarch.txt` describes the intended manager
architecture. This plan adapts that architecture to the current
`NibGliderEngine` implementation and prioritizes low-risk, incremental
extraction.

## Guiding principles

1. Preserve behavior after every extraction.
2. Keep one authoritative state object; do not create copies of engine state
   in individual managers.
3. Keep `NibGliderEngine` as the compatibility facade used by `App.tsx`,
   `ControlPanel.tsx`, and `StatusOverlay.tsx`.
4. Separate browser/Paper.js event plumbing from application decisions.
5. Prefer cohesive modules over many small files.
6. Make pure geometry, snapping, and validation functions independently
   testable.
7. Give each module a narrow public interface and explicit dependencies.
8. Avoid circular imports between managers.

## Target structure

```text
src/engine/
  engine.ts                 # Public facade and composition root
  types.ts                  # Shared types and unit conversion helpers
  EngineContext.ts          # Shared state, PaperScope, notify(), services

  input/
    InputManager.ts         # Register/unregister browser and Paper events
    KeyboardController.ts   # Keymap, live-key bindings, keyboard routing
    PointerController.ts    # Pointer drawing, selection, drag, and pan
    DropController.ts       # SVG/raster drag-and-drop

  scene/
    SceneRepository.ts      # Content items, scene membership, item ordering
    SelectionManager.ts     # Selection, groups, duplicate, reorder
    TransformManager.ts     # Move, scale, rotate, drag gestures
    HistoryManager.ts       # Scene-aware undo/redo commands

  drawing/
    DrawingSession.ts       # Active path/shape/quad state and lifecycle
    PathTool.ts             # Polyline, spline, joins, completion
    CircleTool.ts           # Circle and radial-stamp tools
    RectangleTool.ts        # Rectangle drawing modes
    QuadTool.ts             # Four-point tool
    PreviewRenderer.ts      # Live preview construction and cleanup

  geometry/
    ShapeFactory.ts         # Polygon, supershape, sector, inner-shape paths
    RectangleGeometry.ts    # Rectangle frame basis and fitted geometry
    SnappingManager.ts      # Grid, angle, length, aspect, path, point snap
    CombinatoricsManager.ts # Union, subtract, intersect

  appearance/
    StyleManager.ts         # Stroke, fill, dash, cap, join
    TextLayout.ts           # Display, body, and circumference text
    GridRenderer.ts         # Grid and snap-cursor rendering

  ui/
    StatusPresenter.ts      # StatusSchema and status content
    PreviewBoxPresenter.ts  # Shape preview SVG updates
```

This is a target structure, not a requirement to create every file
immediately. Closely related helpers can remain together until their
boundaries are clear.

## Suggested extraction order

### Phase 0: Baseline and inventory

- Record the current `engine.ts` public methods and public state consumed by
  React components.
- Run `npm run build` and `npm run lint`.
- Add or update a short manual smoke-test checklist for drawing, selection,
  keyboard shortcuts, snapping, text, combinatorics, import, and undo/redo.
- Do not change behavior or rename the public facade yet.

### Phase 1: Extract shared types

Create `src/engine/types.ts` and move:

- `ShapeType`
- `LiveKeyBinding`
- `TextSpec` and text-related unions
- `FillSpec`, `FillType`, stroke unions
- `GridType`
- `LengthUnit`
- `InnerShapeParams`
- status overlay types
- point/unit conversion helpers

Re-export these types from `engine.ts` temporarily so existing imports do not
break.

### Phase 2: Extract input lifecycle

Create `InputManager.ts` first because `attach()` and `detach()` currently
mix several unrelated concerns.

Move:

- Paper.js mouse event registration
- DOM keyboard listeners
- canvas focus behavior
- wheel listener
- dragover/drop listener registration
- document mouseup handling
- print listener registration
- cleanup functions

`InputManager` should only translate events into callbacks. It should not
decide whether a key means “draw a circle” or “undo”.

### Phase 3: Extract keyboard and pointer controllers

Create:

- `KeyboardController.ts` for `handleKeyDown`, live-key bindings, shortcut
  dispatch, text-entry filtering, and key activity reporting.
- `PointerController.ts` for mouse down/move/drag/up, hit testing, pan,
  selection, and drag-lock decisions.

Keep the current key behavior unchanged. This phase should make input
behavior independently traceable without moving drawing algorithms yet.

### Phase 4: Extract scene and selection services

Create `SceneRepository.ts` and `SelectionManager.ts`.

Move:

- `contentItems`
- `isInScene`
- `insertContentAt`
- selection add/remove/clear/restore
- collective bounds and center
- grouping and ungrouping
- duplicate and z-order operations
- non-content-item filtering

The selection service should expose intent-level methods such as
`clear()`, `group()`, `duplicate()`, and `bringToFront()`, rather than expose
Paper.js collection details to every other module.

### Phase 5: Extract history and transforms

Create `HistoryManager.ts` around the existing `UndoManager`.

Move:

- `recordSceneCommand`
- move command creation
- move gesture begin/commit
- group/duplicate/delete/reorder history commands
- undo/redo facade methods

Create `TransformManager.ts` for selection movement, scaling, rotation, and
drag gestures. History should record completed intent-level operations, not
every pointer event.

### Phase 6: Extract snapping and grid

Create `SnappingManager.ts` and `GridRenderer.ts`.

Move:

- grid state and grid drawing
- grid cursor
- grid snapping
- angle, length, aspect, path, and point snapping
- snap indicator mounting and visibility
- ignored-item filtering needed by snapping

Keep mathematical calculations as pure functions where possible. Paper.js
objects and cursor rendering should stay in the manager boundary.

### Phase 7: Extract drawing sessions and tools

Create `DrawingSession.ts` for shared live-drawing state and lifecycle:

- active mode
- path, shape, and quad state
- preview references
- mouse point
- live scale/rotation
- cancel/reset behavior

Then extract tools in this order:

1. `PathTool.ts`
2. `CircleTool.ts`
3. `RectangleTool.ts`
4. `QuadTool.ts`

Each tool should own starting, updating, completing, stamping, and cancelling
its own drawing mode. Shared deposit and history behavior should be delegated
to scene/history services instead of duplicated across tools.

### Phase 8: Extract geometry and appearance

Create `ShapeFactory.ts` and `RectangleGeometry.ts` for shape construction,
unit-point calculations, supershapes, sectors, polygons, and rectangle-frame
fitting.

Create `StyleManager.ts` for:

- global stroke/fill settings
- style setters
- applying styles to items
- selection paint inspection

Create `TextLayout.ts` for body text, boundary text, glyph placement, font
metrics, and shape-text grouping.

These modules should receive configuration and dependencies explicitly rather
than reading unrelated engine fields.

### Phase 9: Extract combinatorics, importing, and presenters

Create:

- `CombinatoricsManager.ts` for selection and deposit-time boolean operations.
- `DropController.ts` for reading files, importing SVG, decoding rasters, and
  recording placed items.
- `StatusPresenter.ts` for `StatusSchema`, status text, and key activity
  presentation.
- `PreviewBoxPresenter.ts` for DOM/SVG preview updates.

The engine should no longer directly query DOM elements such as
`shapePreviewPath`; the presenter should receive data and update the view.

### Phase 10: Reduce the facade

At the end, `engine.ts` should primarily:

- construct `EngineContext`
- construct and connect services
- expose the compatibility API used by React
- delegate public commands
- coordinate cross-service operations
- own only genuinely global orchestration state

Avoid making the facade a second implementation layer. Delegating methods
should remain thin and predictable.

## Dependency direction

```text
React components
        |
NibGliderEngine facade
        |
EngineContext + services
        |
Paper.js / browser adapters
```

Preferred dependencies:

- `types.ts` depends on nothing.
- Geometry and validation code depends on types, not React.
- Input adapters depend on callbacks/interfaces, not drawing implementations.
- Scene and history services depend on a Paper.js context.
- UI presenters depend on view data and narrow callbacks.
- React components depend on the facade, not internal managers.

Avoid:

- managers importing `App.tsx` or React components
- services mutating DOM directly except dedicated presenters
- multiple services independently owning `selectedItems`
- keyboard handlers calling arbitrary private methods across modules
- circular dependencies between drawing tools and input controllers

## Agent-oriented module contracts

Each extracted module should document:

- what state it owns
- what state it may read
- what mutations it may perform
- its public methods
- the events or commands it emits
- how it should be tested

Examples:

- Add a shortcut: `KeyboardController.ts`
- Add a snap mode: `SnappingManager.ts`
- Fix undo for grouping: `HistoryManager.ts`
- Add a geometric primitive: `ShapeFactory.ts`
- Fix text wrapping: `TextLayout.ts`
- Fix event cleanup: `InputManager.ts`

This gives an agent a smaller search space without hiding the overall
architecture.

## Verification after each phase

After every extraction:

1. Run `npm run build`.
2. Run `npm run lint`.
3. Confirm existing imports still resolve.
4. Manually test the affected behavior.
5. Inspect the diff for accidental state duplication.
6. Keep the change in a separate, reviewable commit when commits are being
   used.

Critical regression checks:

- keyboard shortcuts and live key remaps
- path, spline, circle, rectangle, and quad drawing
- pan and zoom
- selection, grouping, duplication, and ordering
- undo/redo and move coalescing
- grid and all snap modes
- text previews and finished shape text
- boolean operations
- SVG/raster drop
- canvas attach/detach cleanup

## Definition of done

- `engine.ts` is primarily a facade and composition root.
- No feature requires understanding the entire engine file.
- Input, scene, history, snapping, geometry, text, and appearance have
  explicit boundaries.
- Public React-facing behavior remains compatible.
- Extracted modules have focused tests or documented manual checks.
- An agent can implement a feature by locating one primary module and its
  declared dependencies.
