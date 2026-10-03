# Drawable model foundations

`NGDrawable` records are authoritative page-item data. Paper.js items and
resolved geometry are derived and may be discarded/rebuilt. These foundations
provide the Phase 4 model boundary. The opt-in composite path tool uses these
sources while the engine bridges deposits to its existing Paper.js scene,
selection, and history flows.

## Record contracts

- `NGDrawable.ts` supplies the source-kind union and shared identity, layer ID,
  style ID, affine transform, visibility, opacity, and lock state. A drawable's
  ID is its selection identity; ephemeral selection flags are not serialized.
- `NGPath.ts` stores exact Bezier anchors and relative handle offsets in one
  or more contours. Each contour owns closure; the source owns its fill rule.
  Semantic B-spline, composite, and smoothed-polyline modes retain their own
  authoring parameters. B-spline and composite interpolation are supported;
  smoothed-polyline interpolation is deferred.
- `NGShape.ts` preserves shape parameters. Circles, polygon-family records, and
  supershapes resolve to paths. Supershapes sample the Gielis formula into a
  closed polyline and leave the source parameters unchanged.
- `NGText.ts`, `NGImage.ts`, and `NGGroup.ts` retain live text, asset/boundary/
  mask references, and ordered child identities. Their specialized rendering,
  asset resolution, outlining, and cross-record validation are later work.
- `geometryResolution.ts` describes vector paths, compound paths with holes,
  and image-mask boundaries. A mask does not convert raster pixels into vector
  geometry. Bounds and resolution caches belong to services, not these records.

Coordinates and lengths are document points. Affine transforms use
`x' = a*x + c*y + tx`, `y' = b*x + d*y + ty`. Circle output uses the usual
four cubic Bezier approximation while retaining the exact semantic radius.

## Validation and serialization

`serialization.ts` validates plain records with known fields, finite numeric
values, valid mode parameters, unique semantic point identities, and paired
arc markers. `serializeDrawable()` rejects non-model properties and Paper
objects. `deserializeDrawable()` accepts JSON only after the same validation.

This is record serialization, not a native document format or file service.
Schema versions, migrations, document-wide ID/reference checks, and assets
will be defined with document/persistence services. Group validation currently
rejects direct self references and repeated child IDs; indirect cycles require
document-wide validation.

## Geometry and scene boundary

`geometry/pathResolver.ts` reads source data and creates independent geometry
without changing the source. Unimplemented semantic modes and text/image/group
resolution throw `GeometryResolutionError` rather than silently flattening or
relabeling them.

`scene/DrawableRenderer.ts` receives a PaperScope and explicit layer/style
lookup callbacks. `render()` resolves geometry, builds an uninserted item,
applies metadata/style/transform, and replaces the prior derived item only
after success. Layer objects must belong to the injected scope's project.

The renderer owns only an ID-to-derived-item map. It neither stores a second
copy of the document nor emits engine commands/history entries. `getItem()`,
`drawableIdOf()`, `remove()`, and `clear()` provide its narrow lookup/lifecycle
surface. Roots and compound children carry `item.data.drawableId`; mapping
rejects stale roots and foreign clones. Caller mutations to Paper segments or
resolved geometry cannot change the retained source. Re-rendering from the
record restores geometry and applies its transform once.

## Composite path drawing

Choose Composite path in the F/G/H key settings popover. Current path remains
the default. F selects sharp corners, G selects B-spline points, and H selects
rounded corners with the configured radius. A ends, R closes, W stamps, and
Q cancels. Mode changes require finishing or canceling the live session.

`drawing/PathDrawingSession.ts` owns semantic points and the trailing cursor
point, including live scale/rotate and corner-radius changes. A point command
sets the previous committed point's convention before committing the cursor.
`PathTool.ts` owns session lifecycle and returns independent source/geometry
deposits; the engine owns placement and history.

`geometry/compositeExpansion.ts` expands hard corners into repeated controls,
keeps explicit line runs exact, and resolves rounded corners through tangent
trimming with arc, bevel, or B-spline treatments. Radius zero gives a sharp
corner. `splineInterpolation.ts` samples clamped open or periodic closed cubic
B-splines adaptively. Bowed lines and staged arcs are not implemented.

`drawing/PathRenderer.ts` coalesces preview updates per animation frame with
a tolerance of 0.5 screen pixels. Final output uses a fixed 0.1 document-point
tolerance, so zoom does not change deposited geometry. Previews are excluded
from content selection and history and removed on cancellation or detach.

The engine retains plain source records separately from derived Paper items
and restores that association with deposit/clone undo and redo. Endpoint joins
and boolean results become Bezier records; arbitrary segment edits also expose
a Bezier source. Whole-item transforms preserve semantic source parameters.
This is a compatibility bridge: document-wide ownership, persistence, and
model-driven transform/history services remain later work. Endpoint joining
currently covers plain top-level paths, excluding grouped and text-wrapped
paths.

`scene/SceneRepository.ts` now owns active-layer content lookup, overlay
filtering, reinsertion, and the retained path source-to-item association.
`DrawableRenderer` can register rendered `NGDrawable` identities with the
repository; lookup rejects stale items and returns independent record copies.
`scene/SelectionManager.ts` owns membership, group/ungroup, duplicate, and
z-order intents. The engine still publishes UI state and holds the undo stack;
the services receive completed commands through a narrow callback. Legacy
Paper drawing tools remain on their existing creation path until their tool
migrations.

## Document boundary

`document/LayerManager.ts` resolves the current active Paper layer and its
project-local ID. `CoordinateManager.ts` treats points as canonical, converts
inch/centimeter inputs and SVG scalar units (96 CSS pixels per inch), and
provides finite coordinate and six-decimal rounding rules. Paper.js still
parses full SVG imports and their transforms.

`ViewportManager.ts` owns zoom limits, wheel zoom at the cursor, reset/step
zoom, and drag-pan anchors. View changes leave document coordinates and dirty
state alone. `DocumentManager.ts` starts with one unbounded page; optional
width/height metadata is stored in points, with orientation and display unit.
The app has no page cropping or page-settings UI yet.

Committed history changes, undo/redo, boolean results, selected-item style
edits, and page metadata edits emit document revision/dirty notifications.
Preview movement and view changes do not. There is no persistence format or
`PersistenceManager` yet.

## History and transforms

`history/HistoryManager.ts` owns the undo stack and constructs scene,
selection, and move commands. It restores retained composite path sources
before their Paper scene items. Its model command interface restores plain
`NGDrawable` records before asking a renderer to rebuild derived items; broader
native document ownership will use this boundary as tools migrate.

`history/TransformManager.ts` applies drag, nudge, scale, rotation, and modal
preview transforms. Drag updates remain live and create one history entry when
the gesture ends. Repeated nudges coalesce; keyboard scale and rotate each
create an undoable intent. Modal previews still commit one net transform
through the existing operations dialog.

## Snapping and grid

`snapping/snappingMath.ts` contains the point-only grid, angle, length, and
aspect constraints. `GridRenderer.ts` owns rendered guide dots and the grid
cursor. `SnappingManager.ts` owns path and point scene searches, ignored
preview/guide items, and indicator mounting. Its point candidates include
segment anchors, curve midpoints, and closed-path centroids. Pointer routing
keeps its established constraint order, with exact point candidates overriding
the prior path candidate.

## Verification

Run `npm test` for fixture round trips, model validation, and geometry-only
Paper.js integration tests. Run `npm run build` for TypeScript checking and
`npm run lint` for source checks. The test runner uses the existing TypeScript
compiler and Node's module hooks (Node 22.15+); no external reference projects
or additional test dependencies are loaded. Fixtures under `tests/fixtures/`
include exact Bezier handles, a semantic circle, and composite corner intent.
