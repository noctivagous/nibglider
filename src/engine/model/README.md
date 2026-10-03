# Drawable model foundations

`NGDrawable` records are authoritative page-item data. Paper.js items and
resolved geometry are derived and may be discarded/rebuilt. These foundations
are an isolated Phase 4 proof; existing engine tools still use their current
Paper.js drawing, selection, and history flows.

## Record contracts

- `NGDrawable.ts` supplies the source-kind union and shared identity, layer ID,
  style ID, affine transform, visibility, opacity, and lock state. A drawable's
  ID is its selection identity; ephemeral selection flags are not serialized.
- `NGPath.ts` stores exact Bezier anchors and relative handle offsets in one
  or more contours. Each contour owns closure; the source owns its fill rule.
  Semantic B-spline, composite, and smoothed-polyline modes retain their own
  authoring parameters. Interpolation is deferred to Phase 4b.
- `NGShape.ts` preserves shape parameters. Circles and polygon-family records
  resolve to Bezier paths; supershape resolution is deferred to Phase 8.
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

## Verification

Run `npm test` for fixture round trips, model validation, and geometry-only
Paper.js integration tests. Run `npm run build` for TypeScript checking and
`npm run lint` for source checks. The test runner uses the existing TypeScript
compiler and Node's module hooks (Node 22.15+); no external reference projects
or additional test dependencies are loaded. Fixtures under `tests/fixtures/`
include exact Bezier handles, a semantic circle, and composite corner intent.
