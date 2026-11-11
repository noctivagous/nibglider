# NibGlider UI Audit — panels, text, canvas, menu bar

Read-only audit of main @ `3435e1d` (2026-11-10). Every claim was checked in
code; citations are `file:line`. "Verified" means read in the source, not
inferred from behaviour. Compiled from three audit passes (panel sections,
menu bar + context menu, document canvas) plus a first-hand Text pass.

Baseline fact: the UI layer is unusually free of stubs. Global grep found
exactly one "coming soon" (`WidgetHandle.tsx:18`), no "(future)" labels, no
no-op handlers, and no hard-disabled controls outside state-conditional ones.
The problems are concentrated: three dead menu rows, one unreachable feature,
several model-level absences (text, layers, canvas), and naming/placement
issues.

---

## 1. Dead or unreachable — fix first

1. **Menu: Document → Page Size is permanently disabled and hollow.**
   `menus.xml:82` defines `page-size`; it is not in `MENU_COMMANDS`
   (`src/App.tsx:79–125`) and has no dispatch. The working equivalent is
   Canvas Size (`menus.xml:79`).
2. **Menu: Document → Reset Zoom is permanently disabled.** `menus.xml:88`;
   not in `MENU_COMMANDS`. The function exists only as the ⌘/Ctrl+0 key
   command (`keymap.ts:117–126`).
3. **Menu: Layers and Objects → Select is permanently disabled** — and it is
   the menu's first item. `menus.xml:188`; no dispatch anywhere.
4. **Printify garment export is unreachable from the UI.** `PRINTIFY_COMMANDS`
   (`export-printify-area`, `export-printify-product`, `fileCommands.ts:54–58`)
   appear in no menu and have no dispatch; the engine exists
   (`engine/scene/printifyGarment.ts`) and the Services menu offers only
   Printify *settings* (`menus.xml:94`). A user can configure Printify but
   never send anything to it.
5. **WidgetHandle grip does nothing.** Its tooltip says "drag to move
   (coming soon)"; the keyboard handler only `preventDefault()`s
   (`WidgetHandle.tsx:18, 21–23`). It is mounted on the keymap widget, the
   status overlay, and the control panel.

## 2. Menu bar

Bar order: **File · Edit · Image · Document and Settings · Services ·
Operations · Modes · Layers and Objects · Help · Debug** (menus are
data-driven from `src/ui/menus/menus.xml`; enablement = membership in
`MENU_COMMANDS`, `src/App.tsx:79–125`).

### Missing standards
- **No View menu at all.** Zoom In/Out/Fit exist nowhere as commands (keys
  only); the one zoom row is dead (§1.2). Panel/Keyboard/Status toggles and
  Length Unit are buried in "Document and Settings".
- **No show/hide toggles for rulers, grid, or guides in any menu.** Rulers
  cannot be hidden at all (placement is `viewer | page`, no `off`,
  `engine.ts:384`). Guides have no visibility toggle anywhere in `src/`
  (grep `guidesVisible|showGuides`: zero hits). Grid display is a panel
  checkbox only; the menu's Snapping → Grid is snapping, not display.
- **No Select None / Deselect** in any menu (exists only as empty-canvas
  click / controller path). **No Paste in Place.** **No Lock/Hide** menu
  items (panel-only, though the model carries the flags).
- **No About / version** anywhere. Help → Keys Reference opens a static
  document; the actual per-key rebinding UI lives on the on-screen keyboard
  (`OnscreenKeyboard.tsx:485`) with no menu pointer to it.
- **Context menu lacks the basics**: no Cut/Copy/Paste, Duplicate, Delete,
  or Group/Ungroup (`menus.xml:202–230`), despite all existing as commands.
  Its eight Point Edit rows also stay clickable with nothing selected.

### Organization problems
- **Settings are scattered across four places**: File → Settings,
  Document → Document Settings, Services → Printify…, Debug → Reset all
  settings. File's last item being "Settings" is non-standard placement.
- **Services is a one-item menu** whose only item is settings for the
  unreachable feature in §1.4.
- **Debug ships in the user-facing bar**, after Help, holding two
  destructive actions (Reset all settings wipes settings and reloads,
  `App.tsx:466–471`; Empty Canvas of Objects starts a new document).
- **Duplication**: the four Order commands appear verbatim in Image,
  Layers, and the context menu; Duplicate/Delete in both Edit and Layers;
  Scale… in both Image → Transform and Operations.
- **Document menu has four look-alike rows**: Canvas Size, Document
  Settings, Page Setup…, Page Size (dead). Print is in File but its
  companion Page Setup is in Document.
- **Operations is the longest menu** (21 leaves, 7 groups) and mixes repeat
  presets, dialogs, a text op, and all of Arrange; its Align and Align to
  Document groups repeat identical labels distinguished only by the header.
- **Stale Repeat naming**: Operations rows read "Repeat Grid — wallpaper
  (p1)" / "Repeat Circle — polar" (international notation, `menus.xml:98–99`)
  while the panel now displays Conway orbifold signatures
  (`symmetry.ts:94–100`). Dispatch is still the legacy presets
  (`App.tsx:499–500`).
- **Modes mixes state and action**: persistent option groups beside one-shot
  Draw tool starters. **Help** has a generic "Tutorial" hub plus six
  "Tutorial: …" items.
- Panel-only by pinned product rule (not a defect): `stroke-to-outline` and
  `repeat-apply` are wired commands that appear in no menu.

### Reorganization proposal
- **File**: New · Open Gallery · Open File… · Save Gallery · Save to File… ·
  Rename… — Import ▸ — Export ▸ (Raster / Vector / **Printify ▸** wired) —
  Page Setup… · Print… · Print Selection… — Settings…
- **Edit**: Undo · Redo — Cut · Copy · Paste · Paste in Place (new) —
  Duplicate · Delete — Select All · Select None (new).
- **View (new)**: Zoom In · Zoom Out · Reset Zoom (wire §1.2) · Fit Page —
  Length Unit ▸ — Panel/Keyboard/Status toggles — Rulers ▸ (Viewer / Page /
  Off — needs an `off` value) · Show Grid · Show Guides (needs building).
- **Document**: Canvas Size… (delete dead Page Size) · Document Settings… ·
  Pages & Guides…
- **Object/Arrange** (from Operations + Layers): Order ▸ · Group/Ungroup ·
  Lock · Hide — Align ▸ · Distribute ▸ · Flip ▸ — Scale… · Rotate… —
  Convert Text to Outlines.
- **Operations → "Repeat & Effects"**: Conway-labelled presets; Noise / Fit /
  Hull entries if panel parity is wanted.
- **Layers and Objects**: drop dead Select; add Lock/Hide Selection.
- **Services**: delete the menu; Printify settings moves into the Settings
  window, exports into File → Export.
- **Help**: Tutorials ▸ · Getting Started · Keys Reference · About (new).
- **Debug**: remove from the shipping bar; Reset all settings moves into
  the Settings window behind a confirm.
- **Context menu**: prepend Cut/Copy/Paste, Duplicate, Delete,
  Group/Ungroup.

## 3. Document canvas, grid, rulers, guides

### What a "document canvas" is here
- **A finite sheet centred on the project origin, floating on an infinite
  canvas.** `drawingPageRect` returns `x: -widthPt/2, y: -heightPt/2`
  (`DrawingPage.ts:45–53`). All geometry is stored in points; units are a
  display/entry layer (`MeasurementUnits.ts:1–6`).
- Page record = `{id, widthPt, heightPt, unit, orientation, layerId}`;
  orientation is *derived* from the dimensions, never stored
  (`DrawingPage.ts:14–29`).
- New Document has four tabs (Workspace / Print / Image / Ratio) with
  presets; **the Workspace tab has no Custom size and no orientation
  control** (`NewDocumentDialog.tsx:231–239`) — a custom workspace canvas
  needs the Print tab or a post-creation Document Size edit.
- Creation snaps dimensions to whole grid cells and resets grid spacing to
  a per-unit default (`engine.ts:1226–1240`); the post-creation Document
  Size edit does **not** re-snap — the two paths disagree.
- **Multi-page = one page at a time, never side-by-side**: only the active
  page is loaded into the Paper project; others live as snapshots
  (`engine.ts:3302–3308`). Every page rect is centred at the same origin,
  so artboard-style spreads are impossible in the current model. Pages can
  differ in size; Add Page copies the active size or US Letter.
- An un-dimensioned page is "unbounded": no page chrome draws at all
  (`engine.ts:1313–1318`).
- **No page-background colour setting.** Default page marking is four
  corner brackets (no outline, no shadow). An optional Fill toggle paints
  one fixed dark slate (#29303D), not user-choosable
  (`engine.ts:1343–1350, 6590–6605`) — barely distinguishable from the
  #1A202C canvas surround.
- **No bleed, no slug, no document-page margins anywhere in `src`.**
  Margins exist only as printer-paper margins in Page Setup — so Document
  Size vs Page Setup (paper) vs printable area are three size concepts a
  print user must keep apart, and the Pages panel summary shows only the
  paper.
- Persistence split: page size/unit/guides/print setup persist in the
  `.nibglider` file; grid, ruler and page-display toggles are **global app
  settings** in localStorage, not per-document (`engineSettings.ts:1–8`).

### Grid
- **Types: Square and Diamond only** (`types.ts:171`). It is a **dot grid,
  not a line grid** — one low-alpha dot per lattice point, fixed colour, no
  colour/opacity control (`GridRenderer.ts:17–32`).
- Extent is the **whole viewport**, not the page. Spacing is one value for
  both axes, entered **always in pt** (1–500) even in mm/inch documents
  (`ControlPanel.tsx:4736–4747`). **No subdivisions/minor grid.**
- Origin is the global (0,0); page edges start on grid lines only because
  creation snaps dimensions — a later spacing or size change breaks it.
- Show/hide: Grid section titlebar toggle, key `/`, **default off**. The
  Grid section *body* is empty — all controls live in the titlebar.
- Snap-to-grid is a separate switch (Snapping section), also default off,
  and **works with the grid hidden**; the red snap dot appears only when
  both are on. Grid never prints or exports.

### Rulers
- Top and left edges only; **always visible — no show/hide control exists
  anywhere.** Two placements (viewer edges / page frame) in Document
  Settings.
- **Origin is the page centre**: labels are absolute grid coordinates, so
  the left and top halves of a page read **negative numbers** and 0 sits
  mid-page — not corner-origin like most editors. The code's own comment
  calls the corner "the ruler origin" while labelling absolute values
  (`pageRuler.ts:1–5, 112`). **No origin reset/drag. No cursor-position
  indicator on the rulers.**
- **Tick spacing is the grid spacing** (majors on grid lines, minors are
  quarters) — changing Grid spacing silently re-scales the rulers even
  with the grid hidden (`pageRuler.ts:1–5, 20`).
- Units: the ruler follows the **page's unit** when a page exists, else
  the display length unit — and that display unit is a separate setting
  offering only pt/inches/cm, so three unit notions coexist (New Document
  English/SI preference, page unit, display unit) and don't sync. Document
  Info openly shows both.

### Guides (ruler guides)
- Per-page, persisted in the file; created by **dragging out of a ruler**
  or numerically in Pages & Guides. Draggable on canvas; per-guide
  lock/delete in the panel; Clear removes all.
- **No show/hide toggle, no snap toggle** (locked guides still snap —
  "locking stops editing, not snapping", `guides.ts:46–50`), **no numeric
  repositioning** (panel shows position read-only, pt only regardless of
  document unit), **fixed colour** (blue / grey when locked).
- Span is effectively the whole viewport and beyond, not just the page,
  despite the model comment saying "across the page".

### View odds and ends
- Zoom 10%–1600%; wheel/pinch/step keys/reset key only. **No Fit Page,
  Fit Artwork, or Zoom to Selection command exists.** Zoom readout is a
  read-only percentage in the Config Summary box; no zoom input field.
- Page side ticks exist (off by default). Print-setup preview mixes two
  geometries: the dashed rect is the *printer paper's* printable area
  while the crop marks use the *document page's* size
  (`engine.ts:3695–3725`).
- "Guide lines to canvas edges" (Document Settings) projects *ruler
  majors* as faint lines — its name collides with actual guides.
- Stale comments: `DrawingPage.ts:1–5` and `DocumentManager.ts:20–21`
  still say "only the UI exposes one page today", predating the Pages
  panel. Adding a page to an unbounded document silently assigns the
  implicit first page 612×792 pt (`engine.ts:3424–3432`).
- "Grid" names two unrelated systems: the board dot grid vs
  `GridGeometry.ts` bounded cell grids for repeat/data-tables.

## 4. Text — fill-out list

The Text section is a titlebar; real controls live in a flyout with Style
and Type At Cursor tabs (`TextParams`, `ControlPanel.tsx:2092–2595`).

**Present and working**: Display/Body kinds; Display flow (interior/
exterior), glyph orientation, on-edge position, spline placement
(above/baseline/below), offset/gap/start-angle; typeface picker; add font
by file or URL (file fonts are session-only — the name is remembered, the
file must be re-added); size 4–200; per-family weight list; italic;
leading; tracking; paragraph space (body); alignment; Convert to
Outlines; cursor-pin anchor box + bottom-edge choice for typed text.
Tracking is applied in layout, per-glyph rendering, and outline
conversion (`types.ts:88–91`).

**Missing at the model level** — `TextSpec` (`types.ts:75–95`) has no
fields for these, so they are build items, not just missing buttons:
- **Full justification** — `TextJustification` is literally
  `'left' | 'center' | 'right'` (`types.ts:73`).
- **Underline, strikethrough, all-caps / small-caps, baseline shift, word
  spacing, hyphenation, pair kerning** — none exist anywhere in `src/`.
- **Text styles** (named, reusable character/paragraph presets).
- **Find & replace in text; spellcheck.**
- **A real body-text editor**: the panel's Text field is a single-line
  `<input>`, so multi-paragraph body text is typed at the cursor but
  cannot be edited as text in the panel.

**Doesn't make sense**: alignment is labelled "On Edge" in Display mode
and "Align" in Body mode for the same control; body-only controls
(paragraph space) silently vanish in Display mode rather than disabling.

## 5. Panel sections (remaining findings)

- **Stroke**: complete paint controls, but Tier Three's *path operations*
  (Noise, Simplify, Fit, Concave Hull) live inside the Stroke parameters
  flyout — a user hunting "Simplify" will not look under Stroke. The four
  path-op buttons have no disabled state with an empty selection (they
  report via a feedback line after the fact). Width slider caps at 40
  while both steppers allow 200. Missing at the model level: stroke
  opacity, dash offset, stroke position (inside/centre/outside),
  scale-with-object.
- **Fill**: complete against its model; the model is exactly two gradient
  stops (`FillSpec`, `types.ts:159–169`). Missing: multi-stop gradients,
  reverse/swap, pattern fill, fill opacity, on-canvas gradient handles.
  For Solid, the colour field's title/aria still say "Fill start color".
- **Swatches**: **"Document palette" is not in the document** — it
  persists to localStorage (`ui/swatches.ts:7`), shared across all
  documents and absent from the `.nibglider` file. Removal is Alt+click
  only, discoverable solely from a tooltip. "+ Keep fill" cannot keep a
  stroke colour. Missing: hex/RGB entry, rename, clear recents,
  import/export, gradient swatches.
- **Circle Keys / Rect Keys**: params are complete against the model, but
  the two frames are inconsistent: Rect polygon lacks the Align
  (Vertex/Edge) control Circle has, although the engine's single
  `polygonRadiusMode` applies to both — the setting silently carries over
  from the other flyout (`engine.ts:6500`). Circle has no Orientation
  control; Rect does. Sector and Segment share one angle slider. Plain
  rectangle has no corner-radius field. **"Export Frame" is listed as a
  shape** in the Rect Keys shape menu — a document/export construct in a
  drawing-shape picker.
- **Combinatorics**: six modes (no Exclude/XOR, which Paper.js supports;
  no Divide). A mode click both *arms* the mode and *immediately combines*
  a 2+ selection — dual behaviour explained only in the tooltip. "Crop"
  vs "Cut" are near-synonyms distinguished only by tooltip text.
- **History**: Undo/Redo only, with a one-line readout — **no clickable
  history list**, and the engine exposes no entries API to build one.
  **Group/Ungroup live inside "History"** (`ControlPanel.tsx:2883–2929`)
  — an object operation in a history section.
- **Layers & Objects**: per-object controls are complete (visibility,
  lock, opacity, rename). **Layers themselves have no visibility, lock,
  or opacity** — the model can't hold them: `LayerRecord` is exactly
  `{id, name}` (`layerModel.ts:7–10`). Missing: duplicate layer,
  merge/flatten, drag reorder, move-object-to-layer, layer colour.
- **Pages & Guides**: pages get Add/Duplicate/Delete/rename/reorder with
  sizes shown but **not editable here**; "Page Setup…" opens printer
  paper/margins, which a new user will expect to change the page size
  they just read. No show/hide guides toggle in the section; guide
  position entry is raw points with no unit choice.
- **Arrange**: align/distribute/flip complete, but **no stacking-order
  controls** although the engine has all four
  (`bringSelectionToFront` etc., `engine.ts:7945–7956`) — they exist only
  in menus. Rotate/Scale live behind a dialog elsewhere, not in Arrange.
  No align-to-key-object, no spacing-by-value distribution.
- **Grid section**: complete against the engine (three setters only);
  see §3 for the model-level gaps. No cross-reference to snap-to-grid,
  which lives in Snapping.
- **Snapping**: complete against the engine's six setters, but **snap
  tolerance is not user-settable anywhere** (hardcoded constants,
  `SnappingManager.ts:64, 126`), and **guides are not a snap target in
  the Snapping model at all** — guide snapping happens on a separate
  engine path with no toggle. No centre/midpoint/intersection snap kinds,
  no master snap switch.
- **Filters** is not a panel section: it is a floating card whose default
  "Color" tab duplicates the Fill/Stroke sections, and whose filter
  parameters are local component state that resets when the card closes
  (unlike every engine-backed control). Missing: hue/saturation, levels,
  image opacity, reset-to-original in the panel, preview-before-apply.
- **Repeat** (audited during Tier Three): progression panel state and the
  active outcome name are session-only; Expand detaches without an undo
  entry. Menus still carry the stale labels in §2.

## 6. Suggested grouping if this becomes a build tier

1. **Dead & unreachable** (§1): wire or delete the three menu rows, wire
  Printify export into File → Export, make WidgetHandle honest.
2. **View & navigation**: View menu, Fit Page/Artwork/Selection, ruler
  show/hide + cursor indicator, guides show/hide + snap toggle.
3. **Canvas definition**: corner-origin rulers (or an origin choice),
  decouple ruler ticks from grid spacing, grid subdivisions + line style
  + colour, page background colour, per-document view settings decision,
  Workspace Custom size, margins/bleed decision.
4. **Text fill-out** (§4): full justification, underline/strike, caps,
  baseline shift, word spacing, a real body-text editor; styles and
  find & replace as the larger items.
5. **Panel completion** (§5): stacking order into Arrange, Group/Ungroup
  out of History, layer visibility/lock/opacity (model change), document
  palette actually in the document, path operations out of the Stroke
  flyout, Exclude mode, history list.
6. **Menu reorganization** (§2 proposal) as the final pass, once the
  commands it references exist.
