# NGPath Composite Path Study

## Purpose

This document evaluates a semantic `NGPath` model for NibGlider based on the
`FMStroke` approach in the vendored Floating Marker project:

```text
external-proj/Floating Marker/Floating Marker/
```

The goal is not to port PencilKit or `FMStroke` directly. The goal is to give
NibGlider a path-authoring model that is faster and more intentional than
raw spline mathematics while still producing ordinary editable Bezier/vector
geometry for rendering and export.

The earlier NibGlider design document identifies the intended path modes:

```text
NGPath
  mode: bezier, b-spline, ngComposite, smoothed polyline
```

`ngComposite` should become the semantic authoring mode. It records what the
user meant at each point and derives the temporary/final Bezier geometry from
that meaning.

## Main conclusion

Adopt a two-tier path model:

```text
Semantic NGPath points
        |
        v
NGPath expansion / interpolation
        |
        +--> live preview centerline or outline
        |
        +--> finalized Bezier path(s)
        |
        +--> SVG/export geometry
```

Persist the semantic points and their parameters in the NibGlider document.
Treat the sampled spline, Paper.js path, preview geometry, and SVG `d` data as
derived outputs that may be regenerated.

This is the transferable insight from Floating Marker. Its use of PencilKit is
an implementation detail: PencilKit supplies its spline interpolation, but
its authoring truth is a semantic list of `FMStrokePoint` values.

## What FMStroke does

Floating Marker uses a composite stroke made from `FMStrokePoint` records.
Each record carries more than a coordinate:

- point position
- point/corner type
- outgoing segment convention
- rounded-corner parameters
- bowed-line parameters
- calligraphic-tip parameters such as azimuth, altitude, and brush size

Representative point types include:

```text
bSpline
roundedCorner
hardCorner
hardCornerBowedLine
roundedCornerBowedLine
arcByThreeP1
arcByThreeP2
bezierFitCurve
```

The model expands each semantic point into one or more low-level spline
control points. Its especially useful convention is point multiplicity:

| Semantic point | Low-level expansion | Result |
|---|---:|---|
| B-spline point | one point | flexible continuous spline |
| Hard corner | three coincident points | a cusp / hard corner |
| Rounded corner | two coincident or offset points | softened transition |
| Rounded corner with radius | points offset along adjacent legs, optionally arc samples | controlled rounded join |
| Bowed segment | corner points plus normal-offset controls | a curved outgoing segment |
| Three-point arc | staged points, later replaced by arc samples | a deliberate circular arc |

The key interaction convention is also important:

1. The final deposited point is a rubber-band point moved by the cursor.
2. On a key-click, the previous point is retyped as the requested corner or
   segment convention.
3. A new trailing B-spline point is deposited at the cursor.
4. Mouse movement updates only that trailing point.

This allows a user to choose a hard corner, rounded corner, or curve segment
as part of a continuous sequence rather than interrupting the drawing process
to switch tools or edit Bezier handles.

## Why raw spline drawing is insufficient

A standard B-spline produces smooth curvature by default. That is useful for
free curves, but it does not communicate author intent:

- A drafter may want the next point to be a true corner.
- A corner may need a specified rounding radius rather than a generic smooth
  transition.
- A segment may be a line, a bowed line, or an arc even though each begins at
  the same coordinate.
- The interaction needs predictable key-click semantics before the user
  commits the path.

With only raw Paper.js `Path` segments, NibGlider must infer this intent from
handles after the fact. `NGPath` should retain that intent explicitly.

## Recommended NibGlider model

Do not make `NGPath` a subclass of `paper.Path`. Paper.js objects are render
and scene objects; they should be replaceable derived geometry. Keep `NGPath`
as a serializable domain model.

```ts
type NGPathMode = 'bezier' | 'bSpline' | 'ngComposite' | 'smoothedPolyline';

type NGPointKind =
  | 'bSpline'
  | 'hardCorner'
  | 'roundedCorner'
  | 'line'
  | 'bowedLine'
  | 'arcByThreeStart'
  | 'arcByThreeEnd';

interface NGCornerParams {
  rounding?: 'arc' | 'bSpline' | 'bevel';
  radius?: number;
}

interface NGSegmentParams {
  kind?: 'inherit' | 'line' | 'bSpline' | 'bowedLine' | 'arc';
  bowOffset?: number;
  bowFacing?: 'left' | 'right';
}

interface NGPathPoint {
  id: string;
  x: number;
  y: number;
  kind: NGPointKind;
  corner?: NGCornerParams;
  outgoing?: NGSegmentParams;
}

interface NGPath {
  id: string;
  mode: NGPathMode;
  closed: boolean;
  points: NGPathPoint[];
}
```

The exact fields may evolve, but these principles should not:

1. A point owns the behavior at its vertex.
2. A point can also describe its outgoing segment.
3. Segment-local parameters are persisted with that point.
4. The model is independent of Paper.js, React, and browser events.
5. Render geometry can be discarded and regenerated from the semantic path.

## First usable scope

Start narrower than FMStroke. The first `ngComposite` release should support:

| Command | Semantic result |
|---|---|
| spline point | `bSpline` corner with spline outgoing segment |
| hard corner point | `hardCorner` with line or spline outgoing segment |
| rounded corner point | `roundedCorner` with configurable radius |
| complete / close path | finalizes the rubber-band point and closes the semantic path |
| cancel | discards the in-progress semantic path and derived preview |

Defer these until the core interaction is reliable:

- bowed segments
- three-point arcs
- calligraphic brush footprints
- pressure/tilt/azimuth point data
- noise or natural-media outlines
- advanced Bezier-fitting import/export

A uniform centerline rendered with the existing stroke style is enough to
prove the semantic-point model.

## Expansion pipeline

Use distinct functions for semantic expansion and rendering:

```text
NGPath
  -> expandCompositePoints()
  -> interpolateCenterline()
  -> buildPaperPreviewPath()
  -> finalizePaperPath()
  -> serialize/export SVG
```

Suggested responsibilities:

### `expandCompositePoints(path)`

Converts `NGPathPoint[]` into a low-level sequence suitable for interpolation.
For example:

- B-spline: emit one control point.
- Hard corner: emit three coincident controls.
- Rounded corner: emit a pair of controls, or points offset along the incoming
  and outgoing legs according to its configured radius.
- Line segment: emit a segment that bypasses spline smoothing.

The first implementation can output an intermediate, engine-independent type:

```ts
type CenterlineCommand =
  | { kind: 'move'; point: Vec2 }
  | { kind: 'line'; from: Vec2; to: Vec2 }
  | { kind: 'splineControls'; points: Vec2[] }
  | { kind: 'arc'; start: Vec2; through: Vec2; end: Vec2 };
```

Do not force every segment through one interpolation algorithm. A composite
path deliberately mixes straight, rounded, spline, and arc behavior.

### `interpolateCenterline()`

For B-spline runs, use a TypeScript implementation of a cubic B-spline or
centripetal Catmull-Rom spline and sample at a screen-aware tolerance. This
replaces Floating Marker’s use of `PKStrokePath`.

The algorithm must:

- preserve hard-corner breaks
- avoid zero-length output segments
- be stable while the last point moves every frame
- choose sampling density from zoom/tolerance rather than a fixed count

### `buildPaperPreviewPath()`

Creates ephemeral Paper.js preview geometry from the sampled centerline:

- a normal `paper.Path` for the initial uniform-stroke mode
- optionally a separate guide for semantic point/corner indicators
- never the authoritative storage object

### `finalizePaperPath()`

Builds the finished Paper.js geometry, applies style, creates text if
appropriate, deposits it through current scene/history flows, and associates
it with the retained `NGPath` data.

The final output may remain a sampled Bezier/Paper path initially. A later
pass can fit cubic Bezier segments to the sampled centerline if compact,
editable SVG output becomes important.

## Live interaction protocol

The current NibGlider path flow directly mutates `this.path` through
`polyLineKC()`, `splinePointKC()`, mouse movement, and
`completeShapeWithSpline()`. `PathTool` should instead operate on a
`PathDrawingSession`:

```ts
interface PathDrawingSession {
  semanticPath: NGPath;
  trailingPointId: string | null;
  preview: paper.Path | null;
  cache: CenterlineCache | null;
}
```

For a key-click while a composite path is active:

```text
1. Locate the trailing/rubber-band point.
2. Retype the previous committed point for the chosen corner/segment command.
3. Commit the trailing point at its current cursor location.
4. Append a new trailing point at the same cursor location.
5. Invalidate derived centerline and preview caches.
6. Render the new preview.
```

For mouse move:

```text
1. Snap the cursor point through the active snapping pipeline.
2. Update only the trailing semantic point.
3. Invalidate the live cache.
4. Render on the next animation frame.
```

For finalize:

```text
1. Remove a duplicate/zero-length trailing point if necessary.
2. Resolve closing-corner semantics when closing the path.
3. Build final derived geometry.
4. Store NGPath metadata with the deposited item/document model.
5. Create one undoable deposit command.
```

## Storage, editing, and export

There are two legitimate representations, each with a different purpose:

| Representation | Purpose | Persist? |
|---|---|---|
| `NGPath` semantic points and params | editable authoring truth | yes |
| sampled centerline/cache | responsive preview | no |
| Paper.js item | current scene/render integration | reconstructable |
| SVG Bezier/path data | interoperable export | yes for export; optional cache |

For NibGlider’s native document format, persist semantic `NGPath` data
alongside the visible geometry. For plain SVG export, emit standard path data;
external SVG consumers should not require NibGlider metadata.

A future NibGlider SVG extension namespace could preserve editability for
round-trip imports:

```xml
<path d="..."
  ng:path-mode="ngComposite"
  ng:points="...serialized semantic points..." />
```

This must be optional. Stripping `ng:*` metadata must still leave valid SVG.

## Rendering and performance

Floating Marker separates a cheap live representation from a more expensive
final representation. NibGlider should do the same:

- Render only once per `requestAnimationFrame`, even if pointer events arrive
  more frequently.
- Recompute only segments affected by the trailing point when practical.
- Cache centerline samples and invalidate them on point move/type/parameter
  changes.
- Use coarser sampling for live preview and tighter tolerance for final
  geometry/export.
- Move expensive final fitting or outline construction to a Web Worker or
  idle task only when profiling shows it is necessary.

Do not begin with PencilKit-like calligraphic footprint unions. They are a
separate rendering feature from the semantic `NGPath` interaction model.

## Paper.js integration rules

- `NGPath` must not import Paper.js.
- `PathTool` owns the active `PathDrawingSession`.
- `PathRenderer` converts semantic/model output into Paper.js previews and
  final items.
- `SnappingManager` returns coordinates; it does not assign point semantics.
- `StyleManager` applies paint after final geometry is built.
- `HistoryManager` records a semantic path deposit/edit as one command.
- `SelectionManager` selects final Paper.js scene items, not live previews.
- `TextLayout` derives text from final geometry; it should not run on every
  raw pointer event unless preview text is explicitly enabled.

## Proposed modules

```text
src/engine/path/
  NGPath.ts                 # Types, validation, serialization
  compositeExpansion.ts     # Semantic point -> segment/control expansion
  splineInterpolation.ts    # Pure B-spline/Catmull-Rom sampling
  PathDrawingSession.ts     # In-progress semantic path + trailing point
  PathTool.ts               # Key commands and session transitions
  PathRenderer.ts           # Live and final Paper.js geometry
  pathExport.ts             # SVG conversion and optional metadata
```

`PathTool.ts` in the broader engine-refactor plan should become this focused
feature boundary, not a file that also owns all generic drawing state.

## Migration plan

### Phase A: Model and pure tests

1. Add `NGPath`, `NGPathPoint`, and point/segment parameter types.
2. Add validation: no invalid coordinates, no invalid radius, no dangling arc
   pair, and no unsupported mode combination.
3. Implement pure expansion tests for B-spline, hard corner, and rounded
   corner semantics.
4. Do not alter the existing Paper.js drawing behavior.

### Phase B: Render a non-interactive NGPath

1. Convert a fixed `NGPath` fixture into a Paper.js preview path.
2. Verify hard corners remain sharp and B-spline runs remain smooth.
3. Compare output at multiple zoom levels and path lengths.
4. Confirm the renderer produces no duplicate/zero-length segments.

### Phase C: Add the composite drawing session

1. Add an opt-in `ngComposite` path mode.
2. Implement the trailing/rubber-band point.
3. Route existing spline and sharp key commands to semantic point commands
   only while this mode is active.
4. Keep the legacy path tool available as the fallback.
5. Add an explicit mode indicator in the status overlay.

### Phase D: Finalization, history, and document persistence

1. Deposit final Paper.js geometry from `NGPath`.
2. Record one undoable command containing enough semantic data to restore the
   deposited item.
3. Persist `NGPath` with the native document model.
4. Export ordinary SVG path data.
5. Add optional NibGlider metadata only after native import/export exists.

### Phase E: Expand conventions

After the initial interaction is stable, add one convention at a time:

1. configurable rounded-corner radius and rounding method
2. line-versus-spline outgoing behavior
3. bowed-line segments
4. three-point arc sequence
5. calligraphic/path-outline rendering

## Acceptance checks

- A B-spline point stays smooth under live cursor movement.
- A hard-corner command yields a visible cusp, with no Bezier-handle editing.
- A rounded-corner command has stable, configurable rounding.
- Changing a point type updates only derived geometry; semantic data remains
  the authoring truth.
- Snapping affects the trailing semantic coordinate before expansion.
- Cancel leaves no scene item or leaked preview.
- Finalize creates one scene item and one undoable action.
- Undo/redo restores both scene geometry and editable NGPath semantics.
- Plain SVG export is valid without NibGlider extensions.
- The path remains responsive with long live strokes at typical zoom levels.

## Risks and decisions to make before implementation

1. **Interpolation choice:** cubic uniform B-spline and centripetal
   Catmull-Rom have different endpoint/corner behavior. Prototype both against
   the desired FMStroke feel before committing to one.
2. **Hard-corner representation:** repeated controls are a useful convention,
   but the NibGlider expansion layer must own it. Do not rely on undocumented
   Paper.js duplicate-point behavior as the primary semantic contract.
3. **Bezier output:** “stored output is a Bezier” can mean exported SVG only,
   or it can mean native document geometry. Prefer semantic NGPath storage plus
   derived Bezier geometry until a concrete interoperability requirement says
   otherwise.
4. **Editing:** decide whether direct node editing modifies semantic points,
   derived Bezier handles, or both. The initial release should expose semantic
   points only; arbitrary Bezier-handle editing needs an explicit conversion
   policy.
5. **Text and boolean operations:** final geometry must remain compatible with
   existing text layout and combinatorics. Keep NGPath semantics attached as
   metadata when those operations preserve meaningful editability; otherwise
   explicitly rasterize/vectorize or discard semantics.

## Source observations

The reviewed Floating Marker implementation uses `FMStroke.swift` as its
semantic composite stroke model, `LineWorkInteractionEntity.swift` for
key-click and trailing-point interaction, and `ActivePenLayer.swift` for
live drawing. It synthesizes PencilKit control points for interpolation rather
than storing `PKStroke` as the document model. Its platform-specific
PencilKit/AppKit layers should not be copied into the TypeScript web app; the
semantic-point model and live/final separation should.
