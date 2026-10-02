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

## Geometry and page-item foundations

The detailed design references for this plan are:

- `refs/ngpath-fmstroke-composite-path-study.md` — semantic `NGPath` modes,
  composite spline/corner conventions, live-path sessions, and derived Bezier
  output.
- `refs/ngdrawable-page-item-architecture.md` — `NGDrawable` as the common
  document/page-item model for paths, semantic shapes, text, images, and
  groups.

Adopt these boundaries before extending path tools or adding document
persistence:

```text
Document -> Layer -> NGDrawable -> source model -> resolved geometry -> Paper.js item
```

`NGDrawable` owns common page-item identity, layer membership, transform,
visibility, locking, selection identity, style reference, and serialization.
It has source kinds for path, semantic shape, text, image, and group.

`NGPath` is the semantic vector-path source model, with modes such as Bezier,
B-spline, composite path, and smoothed polyline. Semantic shapes derive an
`NGPath`; text and images resolve geometry only when an operation needs it.
Paper.js items are derived scene/render objects, not the authoritative
document model.

Boolean operations are a deliberate conversion boundary: a result that no
longer satisfies a rectangle, polygon, live-text, or composite-path invariant
becomes an ordinary `NGPathDrawable` or compound path. Raster-image operations
use a boundary or clipping-mask policy instead of pretending pixels are vector
geometry.

## Target structure

```text
src/engine/
  engine.ts                 # Public facade and composition root
  types.ts                  # Shared types and unit conversion helpers
  EngineContext.ts          # Shared state, PaperScope, notify(), services

  model/
    NGDrawable.ts           # Shared page-item metadata and source-kind union
    NGPath.ts               # Bezier, bSpline, ngComposite, smooth-path model
    NGShape.ts              # Parametric semantic shapes and invariants
    NGText.ts               # Live text source and outline resolution
    NGImage.ts              # Image asset, boundary, and masking source
    NGGroup.ts              # Ordered child references
    geometryResolution.ts   # Path, compound-path, and mask result types

  input/
    InputManager.ts         # Register/unregister browser and Paper events
    KeyboardController.ts   # Keymap, live-key bindings, keyboard routing
    PointerController.ts    # Pointer drawing, selection, drag, and pan
    DropController.ts       # SVG/raster drag-and-drop

  scene/
    DrawableRenderer.ts     # NGDrawable -> derived Paper.js item(s)
    SceneRepository.ts      # Content items, scene membership, item ordering
    SelectionManager.ts     # Selection, groups, duplicate, reorder
    TransformManager.ts     # Move, scale, rotate, drag gestures
    HistoryManager.ts       # Scene-aware undo/redo commands

  document/
    DocumentManager.ts      # Document lifecycle, page metadata, active page
    LayerManager.ts         # Semantic layers mapped to Paper.js layers
    CoordinateManager.ts    # Canonical units and page/view/SVG conversion
    ViewportManager.ts      # Zoom, pan, and view/project conversion
    PersistenceManager.ts   # New/open/save/import/export and serialization

  drawing/
    DrawingSession.ts       # Active path/shape/quad state and lifecycle
    PathDrawingSession.ts   # In-progress NGPath and rubber-band point state
    PathTool.ts             # Polyline, spline, composite-path commands
    PathRenderer.ts         # Live/final NGPath -> Paper.js path construction
    CircleTool.ts           # Circle and radial-stamp tools
    RectangleTool.ts        # Rectangle drawing modes
    QuadTool.ts             # Four-point tool
    PreviewRenderer.ts      # Live preview construction and cleanup

  geometry/
    ShapeFactory.ts         # Polygon, supershape, sector, inner-shape paths
    RectangleGeometry.ts    # Rectangle frame basis and fitted geometry
    compositeExpansion.ts   # Composite points -> segment/control conventions
    splineInterpolation.ts  # Pure B-spline/Catmull-Rom sampling
    pathResolver.ts         # NGPath / NGShape -> resolved geometry
    booleanResolver.ts      # Boolean operand resolution and result lowering
    SnappingManager.ts      # Grid, angle, length, aspect, path, point snap
    CombinatoricsManager.ts # Union, subtract, intersect

  appearance/
    StyleManager.ts         # Stroke, fill, dash, cap, join
    TextLayout.ts           # Display, body, and circumference text
    GridRenderer.ts         # Grid and snap-cursor rendering

src/ui/
    GUIManager.ts           # App-wide UI state and view-model coordination
    PanelsManager.ts        # Panel-section state, commands, and view models
    panels/
      PanelSection.tsx      # Shared section shell, menus, collapse behavior
      StrokePanel.tsx       # Stroke and fill controls
      ShapePanel.tsx        # Circle Keys and Rect Keys configuration
      OperationsPanel.tsx   # Selection, transform, and combinatorics controls
      TextPanel.tsx         # Text-mode configuration
    OnscreenKeyboard.tsx    # Visual keyboard, key layout, and key actions
    KeyboardViewModel.ts    # Maps keymap/status state to keycap presentation
    StatusPresenter.ts      # StatusSchema and status content
    PreviewBoxPresenter.ts  # Shape preview SVG updates
```

This is a target structure, not a requirement to create every file
immediately. Closely related helpers can remain together until their
boundaries are clear.

`GUIManager` is intentionally a small application/UI coordinator, not a
replacement for React or a second engine. It owns app-wide UI preferences and
view-model composition: panel, keyboard, and status visibility; keyboard
width; menu layout; popovers; modal and overlay state. It persists those
preferences and routes UI commands to the engine facade.

`PanelsManager` remains focused on panel sections and does not become a
catch-all UI service. Neither manager imperatively owns the DOM; React
components remain responsible for rendering. Likewise, `KeyboardController`
handles physical keyboard events while `OnscreenKeyboard.tsx` handles the
visible, clickable keyboard. Both use the same declarative keymap so the two
input paths cannot drift apart.

## Future UI constraints to preserve

The panel architecture needs to support these future requirements without
moving them into drawing tools or duplicating command logic:

### Application-menu layouts

The application menu area must support both stacked and grid layouts while
keeping the same menu definitions and hover behavior. The intended grid is:

```text
File                  Document and Settings
Operations and Modes  Layers and Objects
```

Each menu item should carry its optional keyboard shortcut as command metadata,
not as presentation-only text. This lets the stacked menu, grid menu, visible
keyboard, command bar, and status hints display one authoritative shortcut.

`PanelsManager` should therefore own a serializable `menuLayout` preference
such as `'stack' | 'grid'`, plus menu/view-model definitions. Individual menu
components should render those definitions without embedding drawing commands.

### Transform controls

When the user invokes Control/Command + T for a selection, the application
will eventually display conventional transform controls with rotate and scale
operations. Shift-drag should support constrained scale or interval rotation.

Keep this as a separate `TransformControls` UI feature:

- `TransformManager` owns selection geometry, preview transforms, constraints,
  commit/cancel behavior, and undoable commands.
- `PointerController` routes pointer gestures to active transform controls
  before ordinary selection drag behavior.
- `KeyboardController` maps Control/Command + T to a transform-control
  command.
- `PanelsManager` or a dedicated overlay controller owns whether the controls
  are shown and their current UI mode.
- A future `TransformControls.tsx` renders handles and operation affordances;
  it must not implement geometry or history itself.

This separation allows transform handles to be added without making the
Control Panel, keyboard routing, pointer routing, and undo system each invent
their own transform state.

## Document and layer architecture

The drawing must be modeled as a user document rather than only as the current
Paper.js project. Add a document subsystem before adding save/export, named
layers, pages, or document settings.

- `DocumentManager` owns document lifecycle and metadata: document ID/title,
  dirty state, page size, orientation, units, active page, and requests to
  create/open/close a document.
- `LayerManager` owns the semantic layer list: name, order, active layer,
  visibility, lock state, and layer operations. It maps those records to
  Paper.js layers but does not expose Paper.js details to panels.
- `ViewportManager` owns zoom, pan, and project/view coordinate conversion.
  These are document-view concerns, not input-routing concerns.
- `PersistenceManager` owns serialization and file boundaries: new/open/save,
  import, export, format versions, and migration. SVG/raster drop remains an
  input adapter that delegates placement/import work to document services.
- `SceneRepository` remains the low-level adapter for artwork within the
  active semantic layer.
- `HistoryManager` remains separate. It records undoable document mutations,
  including layer operations and artwork changes; it is not owned by a
  persistence service.

The **Document and Settings** menu reads and updates `DocumentManager`.
The **Layers and Objects** menu reads and updates `LayerManager` and
selection/scene commands. `GUIManager` and `PanelsManager` only present their
view models and invoke their public commands.

## Suggested extraction order

[x] ### Phase 0: Baseline and inventory

- Record the current `engine.ts` public methods and public state consumed by
  React components.
- Inventory `ControlPanel.tsx`, `Keyboard.tsx`, and `StatusOverlay.tsx`:
  their section state, command handlers, keyboard layouts, and direct reads
  from the engine.
- Run `npm run build` and `npm run lint`.
- Add or update a short manual smoke-test checklist for drawing, selection,
  keyboard shortcuts, snapping, text, combinatorics, import, and undo/redo.
- Do not change behavior or rename the public facade yet.

[x] ### Phase 1: Extract shared types

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

[x] ### Phase 2: Extract input lifecycle

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

[x] ### Phase 3: Extract keyboard and pointer controllers

Create:

- `KeyboardController.ts` for `handleKeyDown`, live-key bindings, shortcut
  dispatch, text-entry filtering, and key activity reporting. It handles
  physical keyboard input only.
- `PointerController.ts` for mouse down/move/drag/up, hit testing, pan,
  selection, and drag-lock decisions.

Keep the current key behavior unchanged. This phase should make input
behavior independently traceable without moving drawing algorithms yet.

[x] ### Phase 3b: Establish one declarative keymap

Before separating the visible keyboard, introduce a shared keymap definition
that describes each command once:

- physical key matching (`KeyboardEvent.code` and modifiers)
- displayed keycap label and keyboard group
- command identifier
- availability predicate (for example, a live-drawing-only command)
- status/help text

`KeyboardController` dispatches browser events through this map.
`OnscreenKeyboard.tsx` renders the same map and invokes its command IDs.
The status overlay reads the same labels and availability data. This prevents
the physical keyboard, visible keyboard, and status hints from maintaining
three inconsistent copies of shortcut logic.

### Phase 4: Establish page-item and geometry models

Before moving drawing tools onto new behaviors, introduce the serializable
document model described in the two geometry references:

- `NGDrawableBase` for shared page-item identity, layer membership, transform,
  visibility, locking, and style references.
- `NGDrawable` source-kind union for path, semantic shape, text, image, and
  group items.
- `NGPath` with existing-compatible Bezier/path behavior first, followed by
  B-spline, `ngComposite`, and smoothed-polyline modes.
- `NGShape` records for parameter-preserving shapes such as circle, polygon,
  quadrilateral, trapezoid, parallelogram, and supershape.
- `ResolvedGeometry` as the common result for paths, compound paths, holes,
  and image-mask boundaries.

Do not immediately migrate all existing Paper.js objects. First prove that a
new `NGPathDrawable` can render to a Paper.js item, map back by
`drawableId`, and serialize without retaining a Paper.js object as document
truth. Then introduce one semantic shape type and one composite-path fixture.

### Phase 4b: Establish composite NGPath behavior

Implement the initial composite path model from
`ngpath-fmstroke-composite-path-study.md` as an opt-in path mode:

1. Store semantic points and a trailing rubber-band point in
   `PathDrawingSession`.
2. Support B-spline, hard-corner, and rounded-corner commands.
3. Expand semantic points into low-level segment/control conventions in pure
   functions.
4. Sample B-spline runs in a pure interpolation module and render a derived
   Paper.js preview once per animation frame.
5. Finalize into a regular resolved path while retaining semantic `NGPath`
   data for native-document editing.

Keep the existing Paper.js path tool as the fallback until the composite tool
passes the same drawing, cancel, snap, and undo/redo checks.

### Phase 4c: Extract scene and selection services

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
- `drawableId` mapping between derived Paper.js items and `NGDrawable` records

The selection service should expose intent-level methods such as
`clear()`, `group()`, `duplicate()`, and `bringToFront()`, rather than expose
Paper.js collection details to every other module. `DrawableRenderer` should
be the only service that turns durable `NGDrawable` records into Paper.js
items.

### Phase 4d: Establish the document boundary

Create `DocumentManager.ts`, `LayerManager.ts`, `CoordinateManager.ts`, and
`ViewportManager.ts` with the current single-page, active-layer behavior
represented explicitly. Do not add multi-page support, file formats, or a new
layer UI yet.

Move or wrap:

- active Paper.js layer lookup behind `LayerManager`
- canonical document coordinates, physical units, SVG-unit conversion, and
  precision/rounding rules behind `CoordinateManager`
- zoom and pan state behind `ViewportManager`
- current/future page dimensions, orientation, and units behind
  `DocumentManager`
- document dirty-state notifications after scene mutations

This makes future document settings and layers UI additive rather than a
cross-cutting Paper.js refactor. Add `PersistenceManager.ts` only when a
defined save/open/export format is ready to implement.

### Phase 5: Extract history and transforms

Create `HistoryManager.ts` around the existing `UndoManager`.

Move:

- `recordSceneCommand`
- move command creation
- move gesture begin/commit
- group/duplicate/delete/reorder history commands
- undo/redo facade methods
- model-first commands that restore `NGDrawable` state before derived Paper.js
  scene items

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
to scene/history services instead of duplicated across tools. `PathTool`
delegates composite-path semantics, interpolation, and live/final rendering to
`PathDrawingSession`, the path resolver, and `PathRenderer`; it does not
persist raw Paper.js segments as the only source of path truth.

### Phase 8: Extract geometry and appearance

Create `ShapeFactory.ts`, `RectangleGeometry.ts`, and `pathResolver.ts` for
semantic shape construction, unit-point calculations, supershapes, sectors,
polygons, rectangle-frame fitting, and conversion of `NGShape`/`NGPath` data
to resolved geometry. Preserve a shape's semantic parameters until an edit or
operation violates its invariants.

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

- `CombinatoricsManager.ts` and `booleanResolver.ts` for selection and
  deposit-time boolean operations. Resolve operands from `NGDrawable` source
  data and deliberately lower non-preservable results to an ordinary
  `NGPathDrawable` or compound path.
- `DropController.ts` for reading files, importing SVG, decoding rasters, and
  recording placed items.
- `GUIManager.ts` to consolidate app-wide React UI state now held by `App.tsx`:
  panel, keyboard, and status visibility; keyboard dimensions; menu layout;
  popovers; and overlays. It is a UI-state/view-model coordinator, not a DOM
  factory and not a Paper.js manager.
- `PanelsManager.ts` to own panel-section state such as layout, collapsed or
  expanded state, active popovers, and panel view models. It translates panel
  interactions into facade commands but does not own Paper.js drawing state.
- Include menu definitions and the `'stack' | 'grid'` application-menu layout
  preference in the panel model from the outset, even if the first extraction
  renders only today’s stacked layout.
- `OnscreenKeyboard.tsx` and `KeyboardViewModel.ts` to render and operate the
  visible keyboard from the shared keymap established in Phase 3b. The
  onscreen keyboard should call command IDs, never duplicate drawing logic.
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
GUIManager / UI view models ---- NibGliderEngine facade
        |
EngineContext + document, scene, and drawing services
        |
Paper.js / browser adapters
```

Preferred dependencies:

- `types.ts` depends on nothing.
- Geometry and validation code depends on types, not React.
- Input adapters depend on callbacks/interfaces, not drawing implementations.
- Document, scene, and history services depend on a Paper.js context.
- `GUIManager`, `PanelsManager`, and `KeyboardViewModel` depend on
  facade-level commands and view data, not on Paper.js items or private
  drawing state.
- React panel and keyboard components render view data and emit narrow
  callbacks; they do not implement drawing behavior.
- React components depend on the facade, not internal managers.

Avoid:

- managers importing `App.tsx` or React components
- services mutating DOM directly except dedicated presenters
- multiple services independently owning `selectedItems`
- UI managers directly reading or mutating Paper.js layers/items
- persistence owning undo/redo history
- keyboard handlers calling arbitrary private methods across modules
- the visible keyboard and physical keyboard maintaining separate command
  definitions
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
- Change an onscreen key layout or keycap: `OnscreenKeyboard.tsx`
- Change app-wide UI preferences or overlays: `GUIManager.ts`
- Change a panel section’s state or command wiring: `PanelsManager.ts`
- Add layer metadata or operations: `LayerManager.ts`
- Add page/document settings: `DocumentManager.ts`
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
- Input, document, model, scene, history, snapping, geometry, text, and
  appearance have explicit boundaries.
- Document-authoritative `NGDrawable`/`NGPath` data can rebuild derived
  Paper.js scene items.
- Semantic shapes and composite paths retain their editable meaning only while
  their invariants remain true; boolean and arbitrary-geometry results lower
  cleanly to regular/compound paths.
- Public React-facing behavior remains compatible.
- Extracted modules have focused tests or documented manual checks.
- An agent can implement a feature by locating one primary module and its
  declared dependencies.

## Open architectural decisions before implementation

The refactor direction is coherent, but the following contracts should be
written before the relevant feature is implemented. Resolve them incrementally;
they are not a reason to block the early extraction phases.

### 1. Document format and persistence

Define a versioned native document schema before implementing save/open:

- store document metadata, pages, layers, `NGDrawable` source data, styles,
  and asset references independently of Paper.js;
- include a schema version and migration pipeline from the first saved format;
- decide whether images are embedded, linked, or both, and define missing-asset
  behavior;
- make save/open/import failures return structured errors without leaving a
  partially modified document.

`PersistenceManager` owns file boundaries and migrations. `DocumentManager`
owns the in-memory document; neither owns undo/redo history.

### 2. Operation and conversion policy

Write an operation matrix for each drawable source kind—path, semantic shape,
text, raster image, SVG image, group, and mask—for:

- transform and direct-node editing;
- union, subtraction, and intersection;
- grouping, clipping, and masking;
- import, export, duplication, and conversion.

Each cell must state whether the operation preserves source semantics, lowers
to `NGPathDrawable`/compound geometry, creates a mask, flattens children, or
is unavailable. `booleanResolver.ts` should implement this policy rather than
scattering special cases through tools and panels.

### 3. Scene synchronization and caches

Define the one-way rendering contract:

```text
NGDrawable model change -> invalidate derived geometry -> render Paper.js item(s)
```

Assign every derived Paper.js item a `drawableId`, centralize creation/removal
in `DrawableRenderer`, and define cache invalidation for geometry, bounds,
text outlines, hit regions, and live previews. Rebuild derived scene items
from the document model after load, undo/redo, or renderer changes.

### 4. History transactions and asynchronous work

Commands must operate on document-model changes first and then re-render their
scene effects. Define transactions for multi-item actions such as group,
boolean operation, import, and transform.

For asynchronous import or expensive path finalization:

- keep a pending operation cancellable;
- commit exactly one undoable command only after success;
- restore the previous model state on failure;
- use explicit coalescing rules for pointer drags and repeated nudges.

`HistoryManager` owns transaction boundaries; importers and renderers report
results but do not push partial history entries.

### 5. Coordinate systems, units, and precision

Make `CoordinateManager` a dedicated document-level service. It should define
one canonical internal coordinate unit—points are the natural current
choice—and explicitly convert among:

- document/page coordinates;
- physical units such as pt, inch, cm, pica, and future SI/US display units;
- viewport/CSS pixels and Paper.js project coordinates;
- SVG/PDF export units;
- snapping and numeric-input precision.

`ViewportManager` owns pan and zoom, but it delegates conversion rules to
`CoordinateManager`. Rounding should occur only at display/input/export
boundaries, not in stored geometry.

### 6. Composite-path semantics

Before enabling `ngComposite` by default, choose and specify:

- B-spline versus centripetal Catmull-Rom interpolation;
- endpoint, closure, and repeated-control-point behavior;
- hard-corner and rounded-corner expansion rules;
- arc and bowed-segment staging rules;
- live-preview versus final-output sampling tolerance;
- Bezier fitting/export policy.

Prototype these as pure geometry functions with fixtures before coupling them
to Paper.js or keyboard behavior.

### 7. Text lifecycle

Define when text remains live and when it becomes outlines:

- layout and font fallback/availability;
- display text, body text, and text-on-path;
- style changes before and after outline conversion;
- boolean operations and direct-node edits;
- native document persistence and plain-SVG export.

`NGTextDrawable` should remain editable until a destructive geometry operation
requires a lowered `NGPathDrawable` result.

### 8. Image and SVG lifecycle

Specify image policies separately for raster and vector assets:

- raster boundary selection, crop, clipping, and mask compositing;
- vector SVG import, retained source versus flattened geometry, and boolean
  eligibility;
- asset embedding/linking, dimensions, color behavior, and export;
- whether an operation is vector geometry, raster compositing, or unsupported.

`NGImageDrawable` must not claim that a raster boolean result is vector data
unless tracing/vectorization was explicitly requested.

### 9. Parametric components and generators

Decide whether a component such as a repeat grid, split rectangle, or
construction widget is:

- one `NGDrawable` that resolves to multiple geometries;
- a group of ordinary child drawables;
- a modifier/generator attached to another drawable; or
- an interactive, uncommitted drawing session.

Define its editable parameters, source dependencies, serialization, bounds,
selection behavior, and the explicit “expand/vectorize” conversion that
lowers it to ordinary paths.

### 10. Test strategy

Use layers of verification rather than relying only on manual canvas testing:

- unit tests for coordinate conversion, path expansion, interpolation, shape
  invariants, and boolean policies;
- model/document tests for serialization, migrations, and history
  transactions;
- Paper.js integration tests for renderer/selection mapping and scene rebuild;
- browser interaction checks for keys, pointer gestures, snapping, panel
  commands, and drag/drop.

Every new semantic geometry or conversion policy should add fixtures that
state both the retained source data and expected resolved geometry.
