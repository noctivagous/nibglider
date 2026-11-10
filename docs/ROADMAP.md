# NibGlider Roadmap — Towards a Vector-Drawing Program People Can Use

Written 2026-11-10 from a full read of the repo at `2fd0f76`
(163 source files, ~41k lines, 60 test files). This document is a
sequenced plan, not a task list: `TASKS.txt` and `TASKS-FMStroke.md`
remain the item-level backlogs, and each milestone below names the
TASKS entries it absorbs. Nothing here is built yet; this is the
order to build in, and why.

## The goal, stated plainly

NibGlider's thesis is already built: a vector editor where mouse
clicks are replaced by key-clicks, with the whole interaction model
redesigned around that. What is missing is not more drawing power —
it is the surrounding apparatus every other vector editor gives a
user for granted: editing what you drew, organising it, saving it
to a file, arranging it precisely, and learning the program without
its author in the room.

**Usable v1 means:** a person who has never seen NibGlider can
install/run it, work through the tutorials, draw a simple poster or
logo, fix their mistakes at the point level, organise the drawing
into layers, save it as a file, reopen it later with nothing lost,
print it, and export it — without reading the source or `TASKS.txt`.

## What already works (do not rebuild)

- **Drawing:** Rect, Circle, Quad and Path key tools; legacy path
  plus the composite semantic path (B-spline / hard corner /
  rounded corner), with endpoint joining, stamping, and undo that
  retains the semantic source.
- **Shapes:** rectangle, circle, semicircle, sector, segment,
  regular polygon, supershape, trapezoid, parallelogram, right
  triangle, rhombus, kite — parametric, with live preview.
- **Paint:** solid, linear and radial gradient fills (two stops);
  stroke width, cap, join, miter, dash/gap, stroke position.
- **Operations:** combinatorics (union, subtract, intersect,
  crop, interlace — baked and grouped), group/ungroup, duplicate,
  whole-object transform handles (8 scale + rotate), scale/rotate
  dialogs, shear keys.
- **Text:** Display Text and Body Text, text on a path, a bundled
  display-font set plus system fonts, justification, leading.
- **Snapping:** grid, path, points (including centroids and path
  intersections), angle, length, aspect.
- **Documents:** IndexedDB gallery with autosave, new-document
  dialog with workspace/print/image presets and SI/English units,
  export frames (permanent, per-frame format/scale/background).
- **Files out/in:** PNG/JPG and SVG/PDF export in document /
  viewport / selection scopes; SVG, PDF and raster import; drop
  and clipboard ingest; Printify garment export.
- **Learning surface:** tutorial engine with demonstrations,
  on-screen keyboard, status box, keys table, config summary box.

The engine is genuinely deep. The gaps below are ranked by how
early a new user hits them, not by how interesting they are to
build.

## Principles for the work ahead

1. **Surfacing before new machinery.** The document model already
   carries fields the UI never touches (`layerId`, `opacity`,
   `visible`, `locked`, `name`, `styleId` on every `NGDrawable`).
   Milestones 1 and 4 are mostly UI over existing data — take that
   win before inventing anything.
2. **The model is the document.** The NGDrawable records are the
   authoritative form (see `src/engine/model/README.md`); Paper.js
   items are derived. New work should move persistence and editing
   towards the model, never further into Paper-only state.
3. **Key-click first, mouse as fallback.** Conventional mouse
   behaviour is added where a new user reflexively expects it
   (it already exists for selection/drag), never as a parallel
   drawing system that competes with the key tools.
4. **Each milestone ends shippable.** Gate per milestone: full
   test suite (`npm test`), typecheck/build, and the acceptance
   scenario at the end of this document re-run by hand.
5. **`TASKS.txt` stays the backlog.** When a milestone absorbs
   TASKS items, check them off there as they land; do not fork a
   second item list into this document.

---

## Milestone 0 — The front door (small, do anytime, ideally first)

A new user currently meets a README whose lower half is still the
stock Vite template (React Compiler and Oxlint instructions), two
short text files in `docs/`, and exactly two tutorials.

- Rewrite `README.md`: what NibGlider is, how to run it, the
  key-click idea in one page, a screenshot, links to the docs.
  Delete the template boilerplate.
- Expand `docs/`: a getting-started guide and a keys reference
  generated from (or checked against) the keymap, so it cannot
  silently drift.
- Tutorials: extend the set beyond hello-rectangle and
  demo-rectangle to cover, in order: drawing and *fixing* a shape,
  fill and stroke, text, grouping and ordering, saving and
  exporting. (TASKS.txt tutorial items, incl. the "Here's How /
  Try it" form.)
- A Help menu entry that opens the docs/tutorials from inside
  the app (Help currently contains only Tutorial).

**Done when:** someone can go from clone to a finished first
drawing using only the README and in-app help.

## Milestone 1 — Layers and an Objects panel

The largest organisational gap. `LayerManager` today returns only
the single active Paper layer and says so in its own comment:
*"creating and editing document layers belongs to a later UI
phase."* There is no object list anywhere in the app.

Scope:

- Real layers in the model: create, delete, rename, reorder,
  set active; `DrawableCatalog` already keys records by
  `layerId`, so this is LayerManager + persistence work, not a
  remodel. Scene save format bumps to carry layers (Milestone 3
  coordinates the format change — do them aware of each other).
- A new panel section, **Layers & Objects**: a tree of layers and
  the objects in them (groups expandable), each row showing the
  object's name, with controls for visible, locked, and opacity —
  all four are existing `NGDrawable` fields with render support
  (`DrawableRenderer` already applies opacity/visibility/lock).
- Clicking a row selects the object (including objects that are
  hard to click on canvas: thin, covered, or tiny). Double-click
  renames (the model has `name`; drawing tools should start
  auto-naming deposits — "Rectangle 3", "Path 1" — so the list
  is readable from the first minute).
- Step ordering: Bring Forward / Send Backward alongside the
  existing Bring to Front / Send to Back, in the panel, the
  Layers and Objects menu (TASKS.txt: "add Move Object Up, Move
  Object Down"), and the context menu.
- Locked objects are unselectable on canvas but selectable in
  the list (so they can be unlocked); hidden objects render
  neither on canvas nor in export/print.

**Done when:** the acceptance scenario's poster can be organised
into Background / Artwork / Text layers, any object can be found,
hidden, locked, renamed and reordered from the panel alone.

## Milestone 2 — Editing points: direct selection

The largest drawing gap. Today a deposited path can be moved,
scaled, rotated, booleaned and deleted — but its points cannot be
touched. Every fix is a redraw. TASKS.txt §PATH KEYS already
names the intended keys: Pick up (point), Move Edge, Split Point,
Join, Select Point.

Scope:

- A point-editing mode for a selected path/shape: anchors and
  Bézier handles become visible and selectable (by click and by
  key-click, consistent with the rest of the program).
- Move anchor; move handle (with the usual coupled / broken /
  mirrored handle behaviours); move an edge (both endpoints
  together).
- Add a point on a segment (Split Point), delete a point, convert
  corner ↔ smooth, close an open path, join two endpoints
  (extending the existing endpoint-join from draw-time to
  edit-time).
- Edits write back to the retained semantic source where the
  source can express them (a moved B-spline control point stays
  a B-spline point); operations the source cannot express lower
  to a plain Bézier `NGPath`, which is the bridge the model
  README already describes. One undo entry per gesture.
- Shapes edited at point level become paths (their parametric
  source is replaced), with the geometry-class note in TASKS.txt
  ("when object changes… then it moves to regular Path") as the
  stated rule.

**Done when:** draw a blob, then fix one bad point and one bad
curve in place, by keys, with undo restoring both steps.

## Milestone 3 — Real files

Saving today means the browser's IndexedDB gallery. That is a
good autosave and a bad filing system: no file the user can keep,
send, back up, or open elsewhere; clearing browser data loses
everything.

Scope:

- **Native format = the NG model.** Define the document file
  (JSON: drawables, layers, document settings, view) with a
  schema version and migrations — the model README explicitly
  defers this to "document/persistence services", which is this
  milestone. The current `nibglider-scene` (Paper `exportJSON`)
  stays readable as a legacy import so existing gallery
  documents survive.
- File menu: **Save to file** (download), **Open file** (picker +
  drag-drop), alongside the gallery (which remains the autosave /
  recent-documents store). Dirty-state and current-file name in
  the config summary box / title area.
- SVG round-trip check: export a document to SVG, re-import it,
  and diff the result — the known clip-mask artefact on import
  (`SceneIO.stripSvgClips`) and gradient/text fidelity get tests,
  not hopes.
- Gallery documents gain export-to-file from the gallery UI, so
  nothing made before this milestone is stranded.

**Done when:** the acceptance poster is saved as a file, the
browser storage is cleared, and the file reopens identical.

## Milestone 4 — Arrange and paint basics

Four small, high-frequency absences that make the app feel
unfinished next to any other editor. All are cheap; three are
pure surfacing.

- **Align & distribute:** align selection to left/centre/right,
  top/middle/bottom (to selection bounds, and to document);
  distribute horizontally/vertically. Keys + a panel section +
  menu entries.
- **Flip:** Flip Horizontal / Flip Vertical as commands (today
  only achievable indirectly, if at all).
- **Opacity in the UI:** one slider/stepper in the panel applying
  to the selection — the model field, renderer support and
  serialization all already exist.
- **Colour you can keep:** a swatches palette (document palette +
  a default palette, TASKS.txt §COLOR PALETTE / palette library),
  recent colours, and an eyedropper that picks fill/stroke from
  any object (and from placed images, by pixel). Multi-stop
  gradients are *not* in this milestone — two stops stay the
  model until a user need argues otherwise.

**Done when:** three shapes can be centred on the page, spaced
evenly, flipped, made 50% opaque, and recoloured from a saved
swatch and from each other — without typing a hex value.

## Milestone 5 — Pages, guides, and print

- **Page Setup separated from Document Size** (TASKS.txt
  §PRINTING AND DOCUMENT SIZE): printer page, margins, crop
  marks preview as its own setting; **Print** and **Print
  Selection** as real File menu commands (today printing is only
  a `beforeprint` cleanup handler).
- **Multiple pages:** the document gains a page list (Document
  Manager currently starts "one unbounded page"); pages are
  listed, added, duplicated, deleted, and printed/exported as a
  set. Export Frames remain the tool for icon-sheet style work —
  pages are for documents that are actually paged.
- **Guides:** draggable ruler guides (horizontal/vertical),
  snappable, lockable, clearable; the ruler and grid renderer
  already provide the substrate. Guide state persists with the
  document.

**Done when:** a two-page document with guides prints to the
intended paper size with margins and crop marks, page 2 alone
can be printed, and Print Selection prints just the selection.

## Milestone 6 — Text and tool completeness

Second-tier drawing completeness, in rough user-frequency order:

- **Text:** more weights than Regular/Bold (the bundled families
  ship several), italic as a first-class toggle (the model has
  the flag), letter-spacing/tracking, paragraph spacing, and
  **Convert to Outlines** (deferred in the model README; needed
  before text can be booleaned, warped, or sent to manufacture).
  User-added fonts (file or URL) beyond the bundled set.
- **Missing tools:** a plain line, an ellipse distinct from the
  circle keys' framing, an arc tool, and a freehand/pencil that
  deposits a smoothed polyline path (the smoothed-polyline mode
  exists in the model as "deferred" — this is where it lands).
- **Stroke finish:** arrowheads (start/end), and stroke-to-outline
  / the outlined-path mode (TASKS.txt §OUTLINED PATH,
  `strokedPath`).
- Enable or remove the disabled export stubs (WebP raster, DXF
  vector) — a shipped program should not show greyed promises in
  its main export path. DXF matters if manufacture (Milestone 8)
  is a real audience.

## Milestone 7 — Images as citizens

- **Trace to Vector:** the menu item exists and is disabled
  ("future"). A potrace-style tracer with a floating panel
  (TASKS.txt: "vectorization — placed in Images") turns a placed
  raster into editable paths.
- **Crop and mask:** crop a placed image; use a shape as an
  image's clipping mask, editable afterwards.
- **Booleans on images:** subtract/crop via combinatorics
  adjusts the image's mask rather than failing or ignoring it
  (TASKS.txt's open decision — clip the mask, not the pixels —
  is the recommended default, recorded here so it stops being
  an open question).

## Milestone 8 — Finish the named subsystems

These exist, are distinctive to NibGlider, and are visibly
half-done; they come after the generic apparatus above because
they delight existing users rather than unblock new ones.

- **FMStroke** (`TASKS-FMStroke.md`): bowed lines and three-point
  arcs currently *throw* in `compositeExpansion.ts`; the swappable
  spline keyboard layout is the gating piece. Follow that
  document's phases and its D1–D4 decisions.
- **Repeat:** Repeat grid / circle are labelled "(future)" in the
  Operations menu while `RepeatManager` exists — wire the menu,
  the panel toggle (TASKS.txt §REPEAT), and live count/scale/
  rotate keys during repeat drawing.
- **Interlace:** live over/under while spline drawing, and
  clicking a group to flip crossings (both open in TASKS.txt
  §INTERLACE).
- **Combinatorics cut mode:** the cookie-cutter split (one shape
  cuts another into kept pieces), and combinatorics applied to
  open paths as slicing.

## Later — deliberately not in usable v1

- Reusable symbols/components and graphic/text styles
  (`styleId` resolution), a shared asset library.
- AI menu / web MCP server for AI composition (TASKS.txt).
- Clickable history panel (history is currently a readout of
  the latest entries).
- Command palette / command bar (TASKS.txt §COMMAND BAR).
- Collaboration, cloud documents, accounts.
- i18n and alternate physical keyboard layouts.
- Grid Paint and other secondary modes with their own keyboard
  layout trees (the FMStroke layout system is their substrate —
  revisit once it exists).

## Open decisions (need the owner's word, not more code)

1. **Native file extension/name** for Milestone 3, and whether
   the gallery remains a separate store or becomes a recents
   view over files.
2. **Multi-page model** (Milestone 5): pages as separate scenes
   in one document vs. regions of one large canvas. The Export
   Frame precedent argues for regions; printing argues for
   scenes. Decide before Milestone 5, not during.
3. **Mouse scope:** which conventional mouse gestures, if any,
   join selection/drag (Milestone 2's point editing is the
   pressure point — handles are traditionally mouse-dragged;
   the key-click answer must be designed, not defaulted).
4. **DXF / manufacture audience:** whether Milestone 6 enables
   DXF depends on whether cutters/plotters are a real target.

## Acceptance scenario — "first poster" (re-run at each milestone)

A fresh user, no coaching:

1. Opens the app, follows the tutorials, draws a poster: a
   background shape, a headline in Display Text, one drawn path
   (a wave, a star) whose points they then correct in place.
2. Organises it into layers; hides the background; locks it.
3. Centres the headline, spaces three shapes evenly, flips one,
   makes one translucent, recolours one from another by eye-
   dropper.
4. Saves the poster as a file; closes everything; reopens the
   file and finds the poster unchanged.
5. Prints it at the intended paper size, and exports a PNG and
   an SVG of the selection.

Usable v1 is done when all five steps pass without the user
opening `TASKS.txt`, the source, or this document.
