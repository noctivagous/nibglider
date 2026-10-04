# Floating Marker feature opportunities for NibGlider

Reviewed 2026-10-03 against `external-proj/Floating Marker/Floating Marker/`.

This note records implemented or substantially implemented Floating Marker
systems that could materially improve NibGlider. It is a feature assessment,
not a porting plan: Floating Marker is an AppKit/PencilKit application and
NibGlider is a browser-based TypeScript/Paper.js application. The valuable
parts are the interaction and domain-model ideas, which should be rebuilt in
NibGlider's engine rather than copied from the Swift code.

The associated composite-path investigation already lives in
[`ngpath-fmstroke-composite-path-study.md`](ngpath-fmstroke-composite-path-study.md).
It remains the first recommended path feature and is summarized below only so
the priorities in this document make sense.

## Current NibGlider baseline

NibGlider already has a useful base for keyboard-led drawing: dedicated input
controllers, a configurable on-screen keyboard, live shape previews, a
scene/selection/history service split, groups, Paper.js boolean operations,
and grid, point, path, angle, length, and aspect snapping. It already accepts
SVG and raster file drops and has an SVG-capable Paper.js render path, but has
no durable native document file format. `NGPath` already defines serializable
Bezier, B-spline, smoothed-polyline, and composite-path records;
`DocumentManager` manages page settings and dirty state; `LayerManager`
currently manages Paper.js layers, rather than a user-visible document layer
model.

That means the best Floating Marker ideas are those that preserve authoring
intent or make a keyboard-first interaction faster. Reimplementing AppKit
panels, PencilKit rendering, or its older NSBezierPath object hierarchy would
not help.

## Recommended sequence

| Priority | Opportunity | User benefit | Why now |
| --- | --- | --- | --- |
| 1 | Semantic composite paths | Corners, lines, rounded corners, and curves can be laid continuously with key-clicks. | This is central to NibGlider's interaction premise and has an existing design study. |
| 2 | Live procedural replication | A single drawing action previews and deposits radial, mirror, or grid copies. | It compounds the value of every existing shape and path tool. |
| 3 | Native document plus interoperable clipboard | A drawing can retain NibGlider-only semantics through save, copy, paste, and export. | Semantic paths and procedural effects need persistent data before they are broadly useful. |
| 4 | Explicit document layers and pages | Authors can organize, lock, hide, and reorder work without losing keyboard flow. | This turns the current render-layer foundation into an editor document model. |
| 5 | Path cleanup and fitted-curve import | Imported or freehand input becomes editable vector geometry at a chosen error tolerance. | It makes NibGlider a better destination for external geometry. |
| 6 | Constraint guides and pattern tools | Perspective alignment and repeated design motifs become fast to establish. | Valuable for illustration and hard-surface work after the core model is stable. |

## 1. Semantic composite paths — adopt first

Floating Marker stores an `FMStrokePoint` for each deposited authoring point.
The point records position, a point/segment type, azimuth, altitude, brush
size, bowed-segment data, and rounded-corner data. Its types include
`bSpline`, `roundedCorner`, `hardCorner`, bowed variants, staged three-point
arc points, and a Bezier-fit point. See:

- `FMDrawable/FMStroke.swift` — `FMStrokePointType` and `FMStrokePoint` near
  line 5168.
- `LineWorkInteractionEntity.swift` — live drawing modes and `BowedInfo`.
- `FMDrawable/FMStroke.swift` — separate live and final stroke generation,
  including `makeFMStrokeLive2` and `makeFMStrokeFinalSegmentBased`.

The transferable behavior is that the cursor controls a trailing rubber-band
point and a key-click retypes the preceding point as a corner or outgoing
segment convention. The user stays in one continuous path operation. A hard
corner can be expanded into repeated spline controls, while a rounded corner,
arc, or bowed segment has a distinct expansion rule.

NibGlider should implement this as serializable `NGPath` semantic data with
derived Paper.js geometry. The detailed data model, expansion pipeline, and a
small first release are in the existing composite-path study. Do not use
PencilKit or make Paper.js items authoritative.

## 2. Live procedural replication — high-value keyboard multiplier

Floating Marker supplies a replication mode with a live image preview and a
final operation that creates ordinary independent copies. Its implemented
modes include radial rotation, rectangular two-dimensional repetition,
reflection around an anchor, and phyllotactic whorls. The enum also reserves
stroke-following, normal-reflection, branching, L-system, and frame modes.

Evidence:

- `Drawing Entities/ReplicationConfigurationViewController.swift` —
  `ReplicationMode`, live-preview construction, and
  `replicatedFMDrawable(_:replicationMode:)`.
- `FMDocument Views/PaperLayer.swift` — replication and layer insertion
  methods near lines 432–444.
- `LineWorkInteractionEntity.swift` and `InputInteractionManager.swift` —
  key-driven replication toggles.

### NibGlider version

Introduce a non-destructive `ReplicationEffect` attached to a selected item,
group, or in-progress drawing:

```ts
type ReplicationEffect =
  | { kind: 'radial'; anchor: Vec2; count: number; startDeg: number; sweepDeg: number }
  | { kind: 'mirror'; anchor: Vec2; axisDeg: number; copies: 2 | 4 }
  | { kind: 'grid'; columns: number; rows: number; spacing: Vec2 };
```

Render effect instances as a temporary derived group while the user adjusts
settings through a key popover. A confirm command may either retain the
effect, for later editing, or explicitly expand it into normal scene items.
Start with radial, mirror, and grid. The whorl is attractive but should wait
until the basic anchor and preview interaction is reliable.

This differs from ordinary duplicate-and-transform: it lets one key-click
deposit a symmetric result while the pointer remains the spatial control.

## 3. Native semantic documents and a dual clipboard format

Floating Marker writes both a custom pasteboard type and standard SVG-like
text. Its custom data wraps SVG with application-specific XML tags, so a
copy/paste within Floating Marker retains `FMStroke` point types and settings;
an external application can still receive usable ordinary vector paths.

Evidence:

- `FMDrawable/FMDrawable.swift` — XML/SVG encoding and custom pasteboard
  support.
- `FMDrawable/FMStroke.swift` — custom
  `com.noctivagous.floating-marker.fmstroke` clipboard type, SVG fallback,
  and reconstruction of semantic stroke data.
- `SVGPath.swift` — SVG path parsing.

### NibGlider version

Define a versioned `.nibglider.json` document schema now, even if the first
UI only supports Save and Open locally. It should contain pages, logical
layers, scene order, semantic shape/path models, paint, effects, and document
metadata. Keep Paper.js project items rebuildable cache/render objects.

For clipboard and future SVG export:

1. Put standards-compatible SVG on `text/plain` or `image/svg+xml`.
2. Put NibGlider JSON on an application MIME type such as
   `application/x-nibglider+json` where the platform permits it.
3. Include a small metadata reference in SVG only when it is safe and useful;
   never require an external SVG reader to preserve it.

This will preserve composite paths, semantic shapes, and replication effects
across NibGlider copy/paste while still allowing a flattened vector result to
leave the application.

## 4. Logical pages and layers above the renderer

Floating Marker separates a drawing page, paper layers, an active pen layer,
and a user-facing layers panel. Its page controller supports layer add/remove
and export-frame setup; its `PaperLayer` owns selection, ordering, grouping,
and per-layer object insertion.

Evidence:

- `FMDocument Views/DrawingPage.swift` — page state, a background grid, and
  perspective-guide stamping.
- `FMDocument Views/PaperLayer.swift` — item ownership, selection, stacking,
  grouping, and logical drawing operations.
- `FMDocument Views/NCTDrawingPageController.swift` — layer and export-frame
  actions.
- `Keyboard/FMKeyboardPanel.swift` — a compact attached layers panel.

NibGlider already has `DocumentManager` and `LayerManager`, so the engine
seams exist. Promote them from Paper.js project/layer helpers to a serializable
domain model:

```ts
interface NGPage { id: string; name: string; size: Size; layers: NGLayer[] }
interface NGLayer {
  id: string; name: string; visible: boolean; locked: boolean;
  opacity: number; itemIds: string[];
}
```

Keep one active logical layer and make selection/hit testing ignore locked or
hidden layers. A small keyboard-triggered layer tray can provide switch, add,
rename, visibility, lock, and reorder without introducing mouse-dependent
menus. Page and artboard handling should come after a single-page layer model
works.

## 5. Tolerance-controlled path cleanup and curve fitting

Floating Marker includes two useful geometry-processing utilities:

- `SwiftSimplify/SwiftSimplify.swift` implements radial-distance plus
  Douglas–Peucker point simplification.
- `Bezier Path Extensions/FitCurves.swift` fits a sequence of points with
  cubic Bezier segments under an error tolerance, including iterative
  reparameterization.

Floating Marker also has an `FMStrokePointType.bezierFitCurve`, showing that
fitted input was conceived as an explicit path convention rather than an
invisible rendering trick.

### NibGlider version

Add a pure geometry module that supports:

- simplify polyline at a document-unit or screen-pixel tolerance;
- fit selected polyline/freehand samples to cubic Beziers at an error bound;
- preview original and result, then commit through `HistoryManager`;
- retain the source data in the native document when the user asks for a
  reversible procedural conversion.

This is useful for SVG import, pasted polylines, future pen input, and
converting sampled composite-path output into compact export geometry. It is
not a replacement for semantic composite paths: fitting should be an explicit
conversion because it discards vertex intent.

## 6. Perspective/vanishing-point guide stamping

Floating Marker can retain a permanent anchor point and stamp vanishing-point
guidelines into the active page. Its guide system uses the current cursor and
sets up rendering that is separate from the actual artwork.

Evidence:

- `LineWorkInteractionEntity.swift` — `stampCurrentVanishingPointGuidelines`.
- `FMDocument Views/DrawingPage.swift` —
  `stampCurrentVanishingPointGuidelines(currentPointInActiveLayer:)`.

### NibGlider version

Build this after logical layers as an unlocked, non-exporting Guide layer:

- set one or more named vanishing points;
- display rays through the pointer or a selected point;
- snap line and shape directions to the active guide;
- allow the guide layer to be temporarily visible while drawing.

NibGlider already has angular snapping. Perspective guides would provide the
missing spatial reference that makes angular choices useful for product,
architectural, and hard-surface sketching.

## 7. Natural-media stroke representations — defer until the path model lands

Floating Marker supports more than a uniform centerline: it has brush-tip
records, elliptical/calligraphic stroke generation, noise settings, and
representation modes for fill, stroke, split fill/stroke, and noise. Some of
these are production code, while several nozzle and substrate modes are only
declared as future directions in `LineWorkInteractionEntity.swift`; they
should not be treated as ready feature specifications.

Evidence:

- `FMDrawable/FMStroke.swift` — brush tips, azimuth/altitude/size point data,
  uniform and ellipse finalization.
- `FMDrawable/FMDrawable.swift` — representation and paint-fill modes.
- `Drawing Entities/NoiseConfigurationViewController.swift` — configurable
  noisy-path preview.

The sensible NibGlider path is narrower: after `ngComposite` is stable, add a
calligraphic stroke appearance that derives a filled outline from a centerline
and stores tip width, aspect ratio, and angle. Add deterministic seed-based
edge noise as an appearance effect only after export and serialization can
reproduce it. Do not try to reproduce Floating Marker's full PencilKit-like
stroke engine in the initial version.

## Features reviewed but not recommended as near-term ports

Floating Marker also contains a custom AppKit UI toolkit, proprietary-style
floating panels, a large NSBezierPath class hierarchy, custom vector-boolean
code, concave-hull code, and experimental nozzle/particle concepts. NibGlider
already has a React UI architecture, Paper.js boolean operations, and an
engine refactor in progress. Replacing those foundations would increase risk
without improving the keyboard-first authoring experience as directly as the
features above.

## Implementation boundaries

- Keep authoring semantics in TypeScript domain objects; Paper.js stays a
  renderer, hit-testing aid, and derived geometry cache.
- Every destructive conversion needs a named user action and an undo record:
  expand replication, flatten an effect, fit curves, or convert a semantic
  shape/path to raw geometry.
- Preview work must remain ephemeral and inexpensive. Commit only when the
  user completes the key-driven interaction.
- Use NibGlider's existing `SceneRepository`, `HistoryManager`,
  `DocumentManager`, `LayerManager`, `KeySettingsRegistry`, and
  `KeyboardController` seams rather than adding parallel state managers.
