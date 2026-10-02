# NGDrawable Page-Item Architecture

## Relationship to the NGPath Composite Path Study

This document is the companion to
`refs/ngpath-fmstroke-composite-path-study.md`.

That study defines `NGPath` as an editable semantic path model, especially for
Bezier, B-spline, and `ngComposite` authoring. This document defines the
higher-level object that belongs in a NibGlider document, can be selected,
transformed, styled, layered, serialized, and used in combinatorics:
`NGDrawable`.

```text
Document
  -> Layer
    -> NGDrawable
      -> source model and resolved geometry
```

NGDrawable can unify the code that truly applies to everything:

ID, transform, opacity, visibility, lock state
layer membership, ordering, selection, bounds
styles where applicable
hit testing
undo/redo identity
serialization
a common resolveBooleanGeometry() capability
NGPath then represents genuinely vector geometry: its own points, curves, semantic shape parameters, or compound paths.

This preserves your desired uniformity: the selection system and combinatorics system work with NGDrawable. But it does not pretend a live text run or raster image is already a sequence of path points.

For a boolean operation:

NGShape → resolves to its derived vector path.
NGText → resolves to glyph outlines, then the boolean result becomes NGPath.
NGImage → generally receives a path mask/clip, unless explicitly vectorized.
NGPath → operates directly.
Result → normally becomes an unconstrained NGPath or compound path.


## Floating Marker precedent

Floating Marker uses a common `FMDrawable` superclass:

```swift
class FMDrawable: NSBezierPath, NSPasteboardWriting, NSPasteboardReading
```

Both `FMStroke` and `FMImageDrawable` inherit from it:

```swift
class FMStroke: FMDrawable
class FMImageDrawable: FMDrawable
```

This gave Floating Marker one shared drawable surface: its stroke and image
objects both carried path bounds, transforms, paint-related settings, SVG/XML
import/export behavior, and selection/document identity.

It is a useful precedent for NibGlider's desired uniform object behavior.
The web implementation should retain that unification, while avoiding a
dependency on a single mutable Paper.js path as the authoritative data model.
Paper.js items should be derived render/scene objects.

## Core decision

Use `NGDrawable` as the common page-item base or common discriminated record.
`NGPath` is a drawable subtype/source kind for vector geometry, rather than
the root name for every conceivable object.

```text
NGDrawable
├── NGPathDrawable
│   ├── NGBezierPath
│   ├── NGBSplinePath
│   ├── NGCompositePath
│   ├── NGSmoothedPolyline
│   └── NGShape
│       ├── NGPolygon
│       │   ├── NGRegularPolygon
│       │   ├── NGTriangle
│       │   └── NGQuadrilateral
│       │       ├── NGRectangle
│       │       ├── NGParallelogram
│       │       ├── NGTrapezoid
│       │       ├── NGRhombus
│       │       └── NGKite
│       ├── NGCircle / NGEllipse
│       ├── NGArc
│       └── NGSupershape
├── NGTextDrawable
├── NGImageDrawable
└── NGGroupDrawable
```

The diagram is a semantic hierarchy. In TypeScript, it should normally be
implemented as a discriminated union or composable records, rather than a deep
runtime class tree. The term “inherits” means “shares a common drawable
contract,” not necessarily `class Child extends Parent`.

## Why NGDrawable is the shared base

The following are page-object concerns, independent of whether an item begins
as a path, parametric shape, text string, image asset, or group:

- stable object ID
- layer membership and z-order
- affine transform
- opacity, visibility, lock state, and name
- selection and hit-testing identity
- style/appearance references
- bounds
- document serialization
- undo/redo identity
- copy, duplicate, group, and reorder behavior
- operation eligibility and conversion policy

Putting these on `NGDrawable` keeps the selection manager, layer manager,
history manager, and UI from branching on every geometry subtype.

## Source model versus resolved geometry

Every drawable has authoring data and may have derived geometry:

```text
NGDrawable
  sourceKind + sourceData       authoritative editable meaning
  resolvedGeometry              derived path/compound path/mask
  sceneItem                     derived Paper.js item
```

Examples:

| Source kind | Authoring truth | Resolved form |
|---|---|---|
| `path` | `NGPath` points/segments | vector path or compound path |
| `shape` | type plus parametric values | vector path/compound path |
| `text` | content, font, size, layout | glyph-outline path(s) when needed |
| `image` | raster/SVG asset plus image transform | boundary path, vector geometry, or clipping mask |
| `group` | ordered drawable IDs | scene group/bounds |

This preserves the simplification goal: every visible thing is an
`NGDrawable`, and each can participate in the same document and command
systems. The source kind only determines how it resolves geometry and how a
destructive operation affects editability.

## Suggested common contract

```ts
type DrawableKind = 'path' | 'shape' | 'text' | 'image' | 'group';

interface NGDrawableBase {
  id: string;
  kind: DrawableKind;
  name?: string;
  layerId: string;
  transform: AffineTransform;
  opacity: number;
  visible: boolean;
  locked: boolean;
  styleId?: string;
}

interface BooleanResolution {
  geometry: ResolvedGeometry | null;
  policy: 'vectorize' | 'mask' | 'boundary' | 'unsupported';
}

interface NGDrawable {
  base: NGDrawableBase;
  bounds(): Bounds;
  resolveGeometry(): ResolvedGeometry | null;
  resolveBooleanGeometry(): BooleanResolution;
}
```

`ResolvedGeometry` represents one path, multiple disjoint paths, holes, or a
compound path. It is not limited to a single simple polygon.

The specific TypeScript representation can be a union:

```ts
type NGDrawable =
  | NGPathDrawable
  | NGShapeDrawable
  | NGTextDrawable
  | NGImageDrawable
  | NGGroupDrawable;
```

This is preferable to relying on casts or optional fields everywhere.

## Geometric shape hierarchy

`NGShapeDrawable` preserves geometric intent and derives an `NGPath`:

```text
NGShapeDrawable
  -> toNGPath(resolution)
  -> resolved geometry
  -> Paper.js scene item
```

Recommended semantic types:

```text
Shape
├── Circle / Ellipse
├── Arc / Sector / Segment
├── Supershape
├── Polygon
│   ├── RegularPolygon
│   ├── Triangle
│   │   ├── RightTriangle
│   │   └── RegularTriangle
│   └── Quadrilateral
│       ├── Rectangle
│       ├── Parallelogram
│       ├── Trapezoid
│       ├── Rhombus
│       └── Kite
└── ParametricShapeComponent
```

`ParametricShapeComponent` may create one geometry, multiple geometries, or a
group. A grid repeat, split rectangle, or live component should not be forced
to masquerade as a single simple path.

## Boolean/combinatorics policy

All `NGDrawable` objects can appear in a common combinatorics command, but
they do not all resolve the same way.

| Drawable kind | Before boolean operation | Typical result |
|---|---|---|
| `path` | its existing vector geometry | `NGPathDrawable` or compound path |
| `shape` | generated geometry from its parameters | regular `NGPathDrawable` / compound path |
| `text` | vectorized glyph outlines | regular `NGPathDrawable` / compound path |
| vector image/SVG | imported vector geometry | regular `NGPathDrawable` / compound path |
| raster image | clipping boundary or image mask | masked image or boundary-path result |
| group | explicitly flatten/resolve children | resulting paths or group, by operation policy |

For most boolean operations, the source semantic type is intentionally lowered:

```text
Rectangle + subtraction -> NGPathDrawable / compound path
Text + union            -> NGPathDrawable / compound path
Composite NGPath + cut  -> NGPathDrawable / compound path
```

The operation result should not falsely remain a `Rectangle`, live text
object, or `ngComposite` path when its resulting geometry no longer preserves
those semantics.

Future non-destructive combinatorics can instead retain operands and create a
`BooleanResultDrawable` with operation metadata, but that is a separate
feature. The initial model should favor explicit destructive conversion.

## Text policy

`NGTextDrawable` retains text content, font, layout, and styling while it is
live text. It resolves glyph outlines only for operations that require vector
geometry:

```text
live NGTextDrawable
  -> resolve glyph outlines
  -> boolean operation
  -> NGPathDrawable result
```

Ordinary transforms, moves, layer operations, paint changes, and selection do
not need to outline text. This preserves editability until a destructive
geometry operation demands a conversion.

## Image policy

`NGImageDrawable` follows the Floating Marker idea that an image object can
also carry a path boundary. Its source remains the image asset plus transform,
but its resolved geometry depends on the operation:

- use the image boundary path for selection, simple shape operations, and
  clipping;
- use imported vector geometry for SVG sources that are explicitly expanded;
- create a clipping/mask relationship for a raster image cut by vector
  geometry;
- do not claim that raster pixels have become a vector union/subtraction
  result unless a raster-compositing or tracing operation was requested.

This gives images a unified page-object and path-capable interface without
misrepresenting pixels as Bezier data.

## NGPath and NGDrawable relationship

The composite path design remains unchanged:

```text
NGPathDrawable
  source: NGPath { mode: bezier | bSpline | ngComposite | smoothedPolyline }
  resolveGeometry(): ResolvedGeometry
  render(): Paper.js item
```

`ngComposite` keeps semantic point conventions, such as hard corners,
rounded corners, bowed lines, and arcs. If a boolean or arbitrary path edit
destroys the relationship between those conventions and the final geometry,
the resulting object becomes an ordinary `NGPathDrawable` in Bezier/compound
path mode.

## Scene and rendering boundary

The document model must not use a Paper.js `Item` as its only source of truth:

```text
NGDrawable document record
        |
        v
resolver / renderer
        |
        v
Paper.js item(s)
```

The renderer can map `NGDrawable.id` to Paper.js `item.data.drawableId`.
Selection and pointer hit tests map back through that ID to the document
record. This makes it possible to rebuild the Paper.js scene after loading a
document, changing resolution, or updating rendering behavior.

## Recommended module boundaries

```text
src/engine/model/
  NGDrawable.ts             # common types and page-item metadata
  NGPath.ts                 # path modes and semantic path points
  NGShape.ts                # semantic shape union and parameters
  NGText.ts                 # live text model
  NGImage.ts                # asset, boundary, and masking model
  NGGroup.ts                # ordered child references
  geometryResolution.ts     # common resolved-geometry types

src/engine/geometry/
  shapeToPath.ts            # semantic shape -> NGPath
  pathResolver.ts           # NGPath -> resolved geometry
  booleanResolver.ts        # operand resolution and result lowering

src/engine/scene/
  DrawableRenderer.ts       # NGDrawable -> Paper.js item(s)
  SceneRepository.ts        # Paper.js scene lookup/order adapter
```

The existing refactor plan's `DocumentManager`, `LayerManager`,
`SelectionManager`, `HistoryManager`, `CombinatoricsManager`, `PathTool`, and
`ShapeFactory` should use these model contracts instead of exchanging raw
Paper.js items as long-lived state.

## Migration sequence

1. Introduce serializable `NGDrawableBase` metadata without changing current
   Paper.js rendering.
2. Introduce `NGPathDrawable` for new path deposits, retaining a derived
   Paper.js path.
3. Introduce `NGShapeDrawable` for one parametric shape, such as a regular
   polygon, and prove it round-trips through `toNGPath()`.
4. Attach `drawableId` to Paper.js items and route selection through it.
5. Make boolean operations return lowered `NGPathDrawable` results.
6. Add live `NGTextDrawable` outline conversion.
7. Add `NGImageDrawable` boundary/mask behavior.
8. Add non-destructive boolean results only after destructive conversion and
   undo/redo are dependable.

## Invariants

- Every visible document object has exactly one `NGDrawable` identity.
- Every drawable has one layer membership, even when it resolves into several
  Paper.js items.
- `NGPath` and `NGShape` authoring data are serializable without Paper.js.
- Resolved geometry and Paper.js items may be regenerated.
- Boolean results never retain semantic type labels that their geometry no
  longer satisfies.
- Text remains live until an explicitly destructive vector operation.
- Raster images remain images; vector masks/boundaries do not silently turn
  them into vector artwork.
- Undo/redo restores document model state first, then re-renders scene items.
