# TASKS — FMStroke in the spline + swappable keyboard layouts

Status: **task list only — no implementation yet.** This work is extensive
(it touches the path model, geometry, drawing session, input dispatch,
on-screen keyboard, settings, persistence, and tests), so it is staged
here first. Say `go` (optionally naming a phase) to start implementing.

Sources this list is grounded in:

- [floatingMarker-FMStroke-Info.txt](/Users/jpratt/Developer/nibglider/refs/floatingMarker-FMStroke-Info.txt)
  — key-by-key trace of Floating Marker's FMStroke keys, `BowedInfo`
  fields, and the live-point discipline.
- [ngpath-fmstroke-composite-path-study.md](/Users/jpratt/Developer/nibglider/refs/ngpath-fmstroke-composite-path-study.md)
  — the two-tier semantic-path design NibGlider already adopted.
- `external-proj/Floating Marker/Floating Marker/FMDrawable/FMStroke.swift`
  (`FMStrokePointType` ~line 5168, `FMStrokePoint` ~line 5180,
  `pkStrokePointsArrayForFMStrokePoint` ~line 5313) and
  `LineWorkInteractionEntity.swift` (key handlers ~lines 1384–1747,
  `BowedInfo` ~line 70). Reference only — do not port Swift/PencilKit.

## Why a keyboard-layout feature is required

FMStroke needs more point keys than the current board can show at once:

| FMStroke key | NibGlider today |
|---|---|
| B-spline point | Exists: `G` (`spline-point`, composite = "B-SPLINE POINT") |
| Hard corner | Exists: `F` (`sharp-point` → `hardCorner`) |
| Rounded corner | Exists: `H` (`rounded-point`, composite only) |
| Hard-corner bowed line A / B | **Missing** (2 keys) |
| Rounded-corner bowed line A / B | **Missing** (2 keys) |
| Arc by three points | **Missing** (1 key, 3-press protocol) |
| Switch rounded-corner type (arc → bSpline → bevel) | **Missing** (1 key) |
| End / close shape / erase last point / cancel | Partially exist (`A`/`R` end, `Q`/Esc cancel; **no erase-last**) |

That is 6 new point keys plus settings keys. Free caps on the current
board are only `KeyB`, `Period`, `Backslash` (see `KEY_CAPS` in
[src/engine/input/keymap.ts](/Users/jpratt/Developer/nibglider/src/engine/input/keymap.ts:716)),
and the number row is not on the board at all. Overloading more
modifier chords would hide the keys. So, per the existing notes
(`TASKS.txt`: "SECONDARY MODES AND KEYBOARD LAYOUT LOADING",
"SPLINE DRAWING MODE", "ACTION KEYBOARD LAYOUTS"), the spline gets its
own **swappable keyboard layout**: entering spline/composite drawing
swaps the board to the spline layout; leaving restores the base layout.

## What already exists (do not rebuild)

- [x] Semantic model: `NGCompositePath` / `NGPathPoint` with kinds
  `bSpline | hardCorner | roundedCorner | line | bowedLine |
  arcByThreeStart | arcByThreeEnd`, `NGCornerParams`
  (`arc | bSpline | bevel` + radius), `NGSegmentParams`
  (`inherit | line | bSpline | bowedLine | arc`, `bowOffset`,
  `bowFacing`) — [NGPath.ts](/Users/jpratt/Developer/nibglider/src/engine/model/NGPath.ts:17)
- [x] Expansion with FM's multiplicity trick: bSpline = 1 control,
  rounded = 2, hard = 3 coincident controls; rounded-corner trim
  capped at half of each adjacent leg; arc/bevel/bSpline rounding —
  [compositeExpansion.ts](/Users/jpratt/Developer/nibglider/src/engine/geometry/compositeExpansion.ts:16)
- [x] Cubic B-spline sampling (clamped open + periodic closed),
  adaptive tolerance — [splineInterpolation.ts](/Users/jpratt/Developer/nibglider/src/engine/geometry/splineInterpolation.ts:38)
- [x] Live-point discipline: trailing rubber-band point, key-click
  retypes the previous committed point, snapshot drops a duplicate
  trailing point — [PathDrawingSession.ts](/Users/jpratt/Developer/nibglider/src/engine/drawing/PathDrawingSession.ts:27)
- [x] Frame-coalesced preview + tighter final sampling —
  [PathRenderer.ts](/Users/jpratt/Developer/nibglider/src/engine/drawing/PathRenderer.ts:29)
- [x] Deposit / stamp / cancel / endpoint-join / boolean lowering /
  undo-redo of the retained semantic source, covered by
  [composite-path.test.mjs](/Users/jpratt/Developer/nibglider/tests/composite-path.test.mjs)
- [x] Path mode setting `legacy | ngComposite` (default `legacy`) with
  key popover — [KeySettingsRegistry.ts](/Users/jpratt/Developer/nibglider/src/engine/input/KeySettingsRegistry.ts:198),
  `engine.pathDrawingMode`
- [x] Modifier-chord variant resolution for dispatch + board display —
  [KeyboardLayoutResolver.ts](/Users/jpratt/Developer/nibglider/src/engine/input/KeyboardLayoutResolver.ts:10)
  (this resolves *variants within one layout*; it is not yet a
  swappable-layout system)

## Known gaps (the actual work)

1. `expandCompositePoints` **throws** `'Bowed segments and three-point
   arcs are not implemented'` —
   [compositeExpansion.ts:59](/Users/jpratt/Developer/nibglider/src/engine/geometry/compositeExpansion.ts:59)
2. `CompositePointKind` is only `'bSpline' | 'hardCorner' |
   'roundedCorner'`; the session cannot deposit bowed or arc points —
   [PathDrawingSession.ts:8](/Users/jpratt/Developer/nibglider/src/engine/drawing/PathDrawingSession.ts:8)
3. `NGSegmentParams` carries only `bowOffset`/`bowFacing`; FM's
   `BowedInfo` has 9 persisted fields (see Phase 2).
4. Serialization *validates* bowed/arc kinds but no code path can
   produce them; arc pairing is only "adjacent start/end", which does
   not match FM's staged P1/P2 protocol — [serialization.ts:96](/Users/jpratt/Developer/nibglider/src/engine/model/serialization.ts:96)
5. No layout registry, layout id, layout switcher, or per-layout caps;
   `KeyState` has `isCompositePath` but no active-layout field —
   [keymap.ts:18](/Users/jpratt/Developer/nibglider/src/engine/input/keymap.ts:18),
   [KeyboardController.ts:259](/Users/jpratt/Developer/nibglider/src/engine/input/KeyboardController.ts:259)
6. No erase-last-point, no dab, no switch-rounding key anywhere.

## Decisions to settle before / during Phase 1

Defaults are proposed so work can start; flag any you want changed.

- [ ] **D1 — Layout activation.** Default: the spline layout activates
  automatically while a composite path session is live
  (`PathTool.active`) and the base layout returns on finish/cancel.
  A manual layout switcher (for future Grid Paint / Repeat layouts
  from `TASKS.txt`) is built in Phase 5, not now.
- [ ] **D2 — Default path mode.** FM keys only make sense in
  `ngComposite`. Default: keep `legacy` as the global default;
  starting a path from the spline layout implies `ngComposite`.
  Changing the global default is a separate, explicit decision.
- [ ] **D3 — Rounded-corner length semantics.** FM stamps
  `roundedCornerSegmentLength` (default 25, a trim length along each
  leg, halved when a leg is short). NibGlider stores a tangent-arc
  `radius` (default 12) and already caps trims at half-leg. Default:
  keep radius as the stored truth; expose FM's length only as the
  derived trim. Do not add a second stored length.
- [ ] **D4 — New physical keys (spline layout only).** Proposed,
  chosen from currently free/unused caps so the base layout is
  untouched. FM's original macOS keycodes do not transfer.
  - `B` — hard-corner bowed line, facing A
  - `Shift+B` — hard-corner bowed line, facing B
  - **Open**: the rounded-bowed pair, arc key, switch-rounding key,
    and erase-last key. Candidates are `.`, `\`, and Shift variants
    of the bowed keys (layouts are modal, so shadowing a base key
    is allowed only while drawing). Settle them in Phase 1, task
    1.3's collision audit against every `KEY_COMMANDS` entry that
    stays live while drawing (end, cancel, stamp, scale, rotate,
    stroke width), and record the final table there.
- [ ] **D5 — Clothoid.** FM notes clothoid only as an interest, with
  no implementation to trace. Default: Phase 7 is a research spike
  (Euler-spiral solver behind the same expansion interface); it does
  not block the bSpline FMStroke layout.
- [ ] **D6 — Brush-tip data.** FM points carry azimuth/altitude/
  brushSize for calligraphic tips. Default: **defer** (matches the
  composite-path study). Uniform stroke only until Phase 8.

---

## Phase 0 — Baseline (½ day) ✅ done 2026-10-28

- [x] 0.1 Run `npm run test` and `npm run lint` on the clean tree;
  record the green baseline in this file.
- [x] 0.2 Re-read `FMStroke.swift` expansion branches for
  `.roundedCorner` (~line 5330), `.arcByThreeP1` (~line 5585), and
  the bowed branches; note any behavior the info file missed.
- [x] 0.3 Confirm no other caller constructs `NGPathPoint` kinds
  beyond `PathDrawingSession` (search `kind:` under `src/engine/`).

**Gate:** baseline green; no surprises from 0.2/0.3.
**Result: gate NOT met as written — baseline is known-red (see
findings).** Later phases must not add failures beyond the 6
recorded below; fixing them is out of scope for this effort.

### Phase 0 findings (2026-10-28)

**0.1 Baseline** (clean tree at `fbee3d1`):

- `npm run test`: 515 tests, **509 pass, 6 fail** — all pre-existing
  and unrelated to spline/composite code:
  - `cursor-state.test.mjs:72` — hovering selectable content:
    expected `'pointer'`, got snap-point cursor URL.
  - `document-boundary.test.mjs:188` — trackpad pan/pinch dirties
    the document (`true !== false`).
  - `document-boundary.test.mjs:257` — engine pointer pan dirties
    the document (`true !== false`).
  - `tutorial-progress.test.mjs:39` — tutorial auto-show default.
  - `tutorial-progress.test.mjs:44` — completion flag drives
    auto-show.
  - `tutorial-progress.test.mjs:67` — dismissing tutorial
    suppresses auto-show.
  - Composite-path, engine-model, and engine-settings suites all
    pass; they are the regression floor for Phases 1–6.
- `npm run lint`: **0 errors, 2 warnings** (unused vars at
  `tests/snapping-grid.test.mjs:44` and `probe-replace.tmp.mjs:11`).

**0.2 FMStroke.swift re-read** (`pkStrokePointsArrayForFMStrokePoint`,
lines 5313–5819). The info file is accurate in the main; these
points correct or extend it and feed Phases 2–4:

1. **`bezierFitCurve` is dead in FM**: it has no expansion branch
   and emits zero PK points. Confirms Phase 8 deferral — there is
   no behavior to port.
2. **`arcByThreeP2` emits nothing** (its body is commented out).
   The arc is generated entirely by the `.arcByThreeP1` branch,
   and only when `count > 2`, `0 < index < count-1`, and the next
   point is `.arcByThreeP2`; otherwise P1 falls back to 3
   coincident points (a hard corner). So an *unfinished* arc
   previews as a hard corner — Phase 4.3 should mirror this
   instead of inventing a placeholder. Reversal heuristic: the
   buildup points are reversed when the first buildup point lands
   within a ±2pt square of P2.
3. **`.roundedCornerBowedLine` ignores the rounding settings in
   expansion**: it emits 2 coincident points at the corner plus
   the bow peak(s); `roundedCornerSegmentLength` /
   `cornerRoundingType` are never read there (they are stamped
   at deposit but unused). The info file's key-5 description
   overstates this. **New sub-decision for Phase 3:** follow FM
   literally (bow replaces the corner treatment) or improve on
   it (apply entry/exit trims). Default until decided: FM-literal.
4. **Rounded-corner special cases**: a first/last point, or
   `roundedCornerSegmentLength == 1.0`, emits 2 coincident points
   at the corner (no offsets). The short-leg fallback length is
   `0.5 × min(leg₁, leg₂) / 2` — a quarter of the shorter leg.
5. **FM's `.arc` rounding is not a tangent arc**: it calls
   `appendArc(from: corner, to: location2, radius:
   roundingSegmentLengthToUse)` — radius equals the trim length.
   NibGlider's tangent-arc geometry (D3) already differs and
   stays; do not "correct" it toward FM.
6. **Bow peak position** is measured from the corner toward the
   next point: `corner + f × (next − corner)` with
   `f = lineInterpolationLocation × multiplier`
   (`interpolatedPointAt`, NCTExtensions.swift:612). Dual peaks
   sit at `f ± dualDistance/2` along the same chord. Cornered
   apex totals: 2 copies (rounded) or 3 copies (hard) including
   the original peak.
7. **Conflicting FM defaults for `BowedInfo`**: point-init uses
   `normalHeightIsPercentageOfLineLength: false`, multiplier
   `1.0` (FMStroke.swift:5296); the XML reader defaults percent
   to `true` and multiplier to `0.5` clamped to `≥ 1.0`
   (LineWorkInteractionEntity.swift, `BowedInfo.init(xmlElement:)`).
   Phase 2.1 must pick one set — the Phase 2 proposal (percent
   default true) follows the settings/XML side, not point-init.
8. **Bowed branches differ only by point multiplicity — by
   design**: `.hardCornerBowedLine` and `.roundedCornerBowedLine`
   are identical except 3 vs 2 initial coincident points. That
   count is the technique, not duplication: in a B-spline
   (Apple's PencilKit spline in FM; NibGlider's cubic B-spline
   behaves the same way), 3 coincident control points pin the
   curve into a hard corner while 2 only soften it into a
   rounded one. NibGlider already relies on this —
   `repeats: hardCorner ? 3 : roundedCorner ? 2 : 1` in
   `compositeExpansion.ts`. So Phase 3 gets one parameterized
   implementation, but the multiplicity must stay a deliberate,
   named parameter (corner hardness), never "deduplicated" away.
   Bowed-arc buildup is reversed when facing B; the standalone
   arc uses the near-P2 heuristic in (2).
9. A bowed point in last position emits only its corner points
   (no following segment, no bow) — matches NibGlider's
   trailing-point snapshot discipline.

**0.3 Constructor audit**: in `src/`, `NGPathPoint` records are
constructed only by `PathDrawingSession.point()`
(PathDrawingSession.ts:72–76); its `snapshot()` deep-copies via
`structuredClone`. `PathTool` passes kinds through, expansion and
serialization only read/validate, and persisted points arrive via
`deserializeDrawable`. Tests build fixtures directly
(`tests/composite-path.test.mjs:28`). **No surprises** — Phase 4
can extend the session without hunting other constructors.

## Phase 1 — Keyboard layout system (the enabling feature)

Goal: one layout registry; the spline layout is the first non-base
layout. Files: [keymap.ts](/Users/jpratt/Developer/nibglider/src/engine/input/keymap.ts),
[KeyboardLayoutResolver.ts](/Users/jpratt/Developer/nibglider/src/engine/input/KeyboardLayoutResolver.ts),
[KeyboardController.ts](/Users/jpratt/Developer/nibglider/src/engine/input/KeyboardController.ts),
[KeyboardViewModel.ts](/Users/jpratt/Developer/nibglider/src/ui/KeyboardViewModel.ts),
[OnscreenKeyboard.tsx](/Users/jpratt/Developer/nibglider/src/components/OnscreenKeyboard.tsx).

- [ ] 1.1 Define `KeyboardLayoutDef { id, label, caps, commands }`
  and a `KEYBOARD_LAYOUTS` registry in `keymap.ts`. Base layout =
  today's `KEY_CAPS`/`KEY_COMMANDS` unchanged. Layouts *overlay*:
  layout commands win on their caps; unmatched caps fall back to
  base (so End/Cancel/Undo keep working while drawing).
- [ ] 1.2 Add `activeLayoutId` to `KeyState`; thread it through
  `KeyboardController.keyState()`, `resolveKeyVariants`,
  `resolveKeyboardLayout`, and `matchAppCommand`. Dispatch and
  on-screen display must resolve through the same variant list
  (existing invariant — do not fork it).
- [ ] 1.3 Collision audit + final key table for the spline layout
  (settles D4). Every spline-layout key must list: physical code,
  chord, command id, FM equivalent, and which base command it
  shadows while drawing.
- [ ] 1.4 Layout switching: engine-owned `activeKeyboardLayout`
  derived from session state (D1); layout name shown on the board
  and in the status overlay. Switching mid-draw must not cancel or
  mutate the live session.
- [ ] 1.5 `KEY_VARIANTS` compilation becomes per-layout (or
  layout-tagged). Watch the startup cost: it already enumerates
  codes × 16 chords × commands.
- [ ] 1.6 Tests: extend [composite-path.test.mjs](/Users/jpratt/Developer/nibglider/tests/composite-path.test.mjs)
  keymap test + add layout-resolution cases (base ↔ spline swap,
  fallback keys, `isTypingText` still suppresses everything).

**Gate:** with no spline session, board/dispatch are byte-identical
to today; with a session, the spline caps resolve and dispatch.

## Phase 2 — Model: BowedInfo + arc point kinds

Files: [NGPath.ts](/Users/jpratt/Developer/nibglider/src/engine/model/NGPath.ts),
[serialization.ts](/Users/jpratt/Developer/nibglider/src/engine/model/serialization.ts).

- [ ] 2.1 Add a persisted `NGBowedParams` mirroring FM `BowedInfo`:
  `facing: 'A' | 'B'`, `amplitude` + `amplitudeIsPercent` (default
  10 / true), `peakLocation` (0…1, default 0.5) ×
  `peakLocationMultiplier` (default 1), `isArc` (default false),
  `dualDistance` (0…1, default 0), `corneredApex:
  'none' | 'rounded' | 'hard'`.
- [ ] 2.2 Decide representation: FM uses distinct point kinds
  (`hardCornerBowedLine`, `roundedCornerBowedLine`). Default: keep
  NibGlider's point kind as the corner (`hardCorner` /
  `roundedCorner`) and put the bow on `outgoing: { kind:
  'bowedLine', bow: NGBowedParams }` — the bow describes the
  *following* segment in both systems. Replace the undersized
  `bowOffset`/`bowFacing` fields (no legacy migration per repo
  rules; update the few fixtures/tests that name them).
- [ ] 2.3 Arc: keep `arcByThreeStart`/`arcByThreeEnd` kinds but
  redefine validation for the staged protocol (Phase 4): a start
  with no end yet is valid *only* in a live session snapshot, never
  in a persisted/finalized path. Add a validation flag or a
  session-only check so persisted documents stay strict.
- [ ] 2.4 Update `validatePath` for the new fields (finite, clamped
  ranges rejected-not-repaired, unknown keys still rejected).
- [ ] 2.5 Tests in [engine-model.test.mjs](/Users/jpratt/Developer/nibglider/tests/engine-model.test.mjs):
  round-trip every new field; reject out-of-range `peakLocation`,
  negative amplitude, unpaired persisted arc points.

**Gate:** `serializeDrawable`/`deserializeDrawable` round-trips a
fixture using every FM point kind.

## Phase 3 — Geometry: bowed segments + three-point arcs

Files: [compositeExpansion.ts](/Users/jpratt/Developer/nibglider/src/engine/geometry/compositeExpansion.ts),
[splineInterpolation.ts](/Users/jpratt/Developer/nibglider/src/engine/geometry/splineInterpolation.ts).
Pure, Paper-free; this is where the "not implemented" throw goes away.

- [ ] 3.1 Bowed segment (spline mode, `isArc: false`): from corner
  `P0` to next vertex `P1`, peak = chord point at
  `peakLocation × multiplier`, offset along the chord normal by
  `amplitude` (absolute pt, or % of chord length). Facing A/B =
  normal rotated −90° / +90°. Emit the peak as spline control(s):
  1 peak, or 2 peaks straddling by `dualDistance / 2` when nonzero;
  apex repeated 2×/3× for `corneredApex` rounded/hard. Degenerate
  chord (≤ 1pt in FM; use the existing `1e-9` discipline — decide
  and document) emits just the peak.
- [ ] 3.2 Bowed segment (arc mode, `isArc: true`) and standalone
  three-point arc: circle through (start, through, end)
  (FM `makeArcFromThreePoints`), sampled as cubic(s) like the
  existing rounded-corner arc branch. Handle collinear/coincident
  triples by falling back to a line — never NaN, never throw
  during live preview.
- [ ] 3.3 Wire both into `expandCompositePoints` as new
  `CenterlineCommand` handling without breaking the existing
  run-splitting (line segments, corner commands, periodic seam).
  Bowed/arc segments are segment-level: they replace the spline run
  between their two vertices only.
- [ ] 3.4 Closed paths: bow/arc on the seam segment (last → first)
  works; a bowed segment into a rounded corner still gets its
  entry/exit trims.
- [ ] 3.5 Tests (pure, in [composite-path.test.mjs](/Users/jpratt/Developer/nibglider/tests/composite-path.test.mjs)):
  peak side flips with facing; % vs absolute amplitude; dual-peak
  flattening; apex kink multiplicity; arc through 3 known points
  stays on the circle; collinear arc → line; zero-length chord;
  output always finite + distinct (reuse the `distinct()` helper).

**Gate:** the throw at `compositeExpansion.ts:59` is gone; every
FM point kind expands to finite geometry.

## Phase 4 — Drawing session: deposit the new keys

Files: [PathDrawingSession.ts](/Users/jpratt/Developer/nibglider/src/engine/drawing/PathDrawingSession.ts),
[PathTool.ts](/Users/jpratt/Developer/nibglider/src/engine/drawing/PathTool.ts),
[DrawingHost.ts](/Users/jpratt/Developer/nibglider/src/engine/drawing/DrawingHost.ts),
[hosts.ts](/Users/jpratt/Developer/nibglider/src/engine/hosts.ts), engine facade.

- [ ] 4.1 Extend `CompositePointKind`/commit API so a commit can
  carry `NGBowedParams` and the current corner-rounding settings
  snapshot (FM stamps settings onto the point at deposit; later
  settings changes must not rewrite deposited points — except the
  existing deliberate `setCornerRadius` live-session behavior,
  which stays).
- [ ] 4.2 Bowed keys: retype trailing point to hard/rounded corner
  with `outgoing.kind = 'bowedLine'` + params; append fresh
  trailing point (FM appends the same bowed type — follow FM).
- [ ] 4.3 Arc key state machine: 1st press deposits
  `hardCorner + arcByThreeStart`; a press landing on a start
  deposits `arcByThreeEnd`; after a completed end, the next arc
  press starts a new arc with a hard-corner separator. Live
  preview of an unfinished arc must render (straight/spline
  placeholder) without tripping persisted-path validation.
  Finalize/cancel with an unfinished arc: drop or complete the
  pending start — pick one, test it.
- [ ] 4.4 Switch-rounded-corner key: cycles the *session's*
  `corner.rounding` `arc → bSpline → bevel` for subsequently
  deposited rounded/bowed-rounded points (FM semantics: it changes
  what the Rounded keys produce; it does not rewrite old points).
- [ ] 4.5 Erase-last-point key: removes the last committed point,
  keeping the trailing point live; no-op (not an error) at the
  first point. FM also closes unfinished arc slots before
  retyping — apply the same guard in 4.2–4.4.
- [ ] 4.6 Engine entry points (`*KC` methods), `PathTool` methods,
  host interface, scale/rotate session handling (bow amplitude in
  % scales naturally; absolute amplitude scales with the path —
  decide, test).
- [ ] 4.7 Tests: session-level commit sequences per key; arc
  3-press sequence; erase-last at boundaries; settings snapshot
  isolation (change settings mid-draw, earlier points unchanged).

**Gate:** a scripted key sequence builds a semantic path using
every FM key, and `snapshot()` matches the expected point list.

## Phase 5 — Wiring: dispatch, board, status, settings

Files: [KeyboardController.ts](/Users/jpratt/Developer/nibglider/src/engine/input/KeyboardController.ts),
[KeySettingsRegistry.ts](/Users/jpratt/Developer/nibglider/src/engine/input/KeySettingsRegistry.ts),
[keymapSchema.ts](/Users/jpratt/Developer/nibglider/src/engine/appearance/keymapSchema.ts),
[statusSchema.ts](/Users/jpratt/Developer/nibglider/src/engine/appearance/statusSchema.ts),
[engineSettings.ts](/Users/jpratt/Developer/nibglider/src/engine/engineSettings.ts).

- [ ] 5.1 New commands + `perform()` cases for: bowed-hard A/B,
  bowed-rounded A/B, arc-by-three, switch-rounding, erase-last.
  (Dab — FM code 4, stamps one brush tip — only with Phase 8;
  list it here so the key table reserves no key for it yet.)
- [ ] 5.2 Spline-layout caps with legends (e.g. `BOW →`,
  `ARC 3-PT`) following the existing two-line legend style;
  settings gear links via `KEY_SETTINGS_LINKS` pattern.
- [ ] 5.3 Key-settings fields (path-tool schema, spline-layout
  section): bow amplitude + %/absolute toggle, peak location,
  arc-vs-spline bow mode, dual distance, apex cornering, corner
  rounding type. All persisted through `engineSettings`
  (`path.*` keys) like `path.cornerRadius`.
- [ ] 5.4 Keymap-table + status rows for the spline layout
  (composite branch of `buildKeymapRows`): list the new keys only
  while the spline layout is active; show current rounding type
  and bow amplitude in the status snapshot.
- [ ] 5.5 Manual layout switcher UI (settles the general feature
  from `TASKS.txt`): board header or status control listing
  layouts; manual choice is overridden by D1 auto-activation
  while drawing. Disabled/explanatory state when only one layout
  is meaningful. Also register the future layout ids
  (`grid-paint`, `repeat`) as placeholders **only if** the
  registry needs them — no stub layouts.
- [ ] 5.6 Tests: dispatch through `KeyboardController` (not just
  the resolver), board legends for each chord, settings
  read/write/validate round-trip in
  [engine-settings.test.mjs](/Users/jpratt/Developer/nibglider/tests/engine-settings.test.mjs).

**Gate:** end-to-end — physical key → semantic point → preview →
deposit → undo/redo — for each new key, in tests.

## Phase 6 — Persistence, export, and downstream consumers

- [ ] 6.1 Retained-source round-trip: deposit a path using every
  new kind, save/load the drawable, confirm identical geometry
  after re-resolution (extend the Phase 5 engine test).
- [ ] 6.2 SVG/export: derived Bezier output only — no FM/NibGlider
  metadata required by external readers (per the study). Verify
  bowed/arc paths export as ordinary path data.
- [ ] 6.3 Downstream lowering audit: outlined-stroke spine
  ([outlinedStroke.ts](/Users/jpratt/Developer/nibglider/src/engine/geometry/outlinedStroke.ts)),
  interlace, boolean ops, endpoint join, direct Paper-segment
  edits. Each must either resolve the new kinds or lower to
  Bézier exactly as composite paths already do — no new throws.
- [ ] 6.4 Text-on-path and shape-text (`withShapeText`) still work
  on bowed/arc deposits.

**Gate:** no code path in `src/` throws on a persisted bowed/arc
composite path.

## Phase 7 — Clothoid layout (spike, after Phase 5)

### Model: Spiro (FontForge), not raw clothoid segments

The reference system is **Spiro**, created by Raph Levien and
integrated into FontForge (toggled by the spiral-shaped tool in
the glyph editor): interpolating splines built from clothoid
(Euler spiral) segments — curves whose curvature changes
linearly with arc length. That linear curvature ramp is what
makes straight ↔ curved transitions inherently gradual: a
straight segment has zero curvature, and the clothoid reaches
non-zero curvature without a jump, which is exactly the fluid
hand-off Bézier handles make finicky (Béziers primarily enforce
G1 tangent continuity; G2 curvature matching is manual).

Properties that make Spiro fit NibGlider's two-tier model:

- You edit with **only on-curve points** — no Bézier handles.
  That matches the key-click deposit model exactly: one key
  press, one semantic point.
- Point types carry the continuity/character of the join:
  - **G4 points** — gentle curves, higher-order smoothness.
  - **G2 points** — sharper curves, curvature continuity.
  - **Corner points** — abrupt changes of direction.
  - **Previous/next constraint points** — the special
    transitions that let a curve run smoothly into a straight
    line or back out; explicit, local control over the
    straight ↔ curved hand-off.
- The **libspiro** solver resolves the clothoid constraints and
  converts the result to ordinary cubic Bézier segments, so
  outlines stay compatible with PostScript/TrueType/OpenType.
  In NibGlider terms: Spiro points are the persisted semantic
  truth, the solver output feeds the existing
  derived-Bézier/Paper/SVG pipeline — same pattern as
  `ngComposite`, no new storage format.

So yes: a clothoid layout should have G4 / G2 / corner keys.
They replace the B-spline layout's bSpline/hard/rounded trio
with Spiro's vocabulary, plus the two constraint keys the
B-spline layout has no equivalent for.

### Suggested keys (proposal — settle in 7.1 + Phase 1 audit)

Frequency layout: the four workhorse point types on the home
row `ASDF` for fluid key-click drawing; less common keys on
the `QWERTY` row above and `ZXCVB` row below. This layout is
modal (clothoid spline layout only), so shadowing base-layout
meanings while drawing is allowed, as in Phase 1.

| Row | Key | Spiro point / action | Notes |
|---|---|---|---|
| Home | `A` | G4 point | Gentlest curve; expected most-used |
| Home | `S` | G2 point | Sharper curve, curvature-continuous |
| Home | `D` | Corner point | Abrupt direction change |
| Home | `F` | Straight/line point | Zero-curvature run into/out of curves; pairs with constraint keys |
| Top | `Q` | Previous constraint | Curve → straight hand-off (before) |
| Top | `W` | Next constraint | Straight → curve hand-off (after) |
| Top | `E` | (reserved) | e.g. cycle selected point type G4→G2→corner — decide in 7.1 |
| Bottom | `Z` | Erase last point | Same action as the B-spline layout's erase-last, if Phase 4.5 lands it there too |
| Bottom | `X`–`B` | (unassigned) | Reserve for solver/setting keys (e.g. toggle live-solve, extrema marking); do not invent bindings in 7.1 |

End / close / cancel / stamp keep falling back to the base
layout (Phase 1 overlay rule) — no clothoid-specific duplicates.
**Exception the audit must resolve:** this table shadows base
`A`/`S` (End aliases), `Q` (Cancel), and `W` (Stamp) while
drawing. Esc (cancel alias) and `R` (Complete Shape) still
fall back, but End and Stamp need explicit clothoid-layout
bindings (candidates: `Enter`, `B`) before this table is final.

Open questions for 7.1, do not pre-decide here:

- Exact libspiro point-type semantics (its type set includes
  G4, G2, corner, and left/right constraint variants) and which
  of them map 1:1 onto the `Q`/`W` prev/next pair above.
- Solver route: libspiro via WASM, a TypeScript port of the
  clothoid fit, or direct Fresnel evaluation. Check libspiro's
  license before considering bundling it.
- Whether G4/G2/corner/constraint become new `NGPathPoint`
  kinds, or a clothoid-specific point record under a separate
  spline layout id — the semantic model must not force
  B-spline kinds to pretend to be Spiro types.

### Tasks

- [ ] 7.1 Research note in `refs/`: clothoid (Euler spiral)
  segment definition, Fresnel-integral evaluation, fitting
  between two points with heading/curvature continuity
  (G1/G2), **plus** the Spiro/libspiro point-type semantics and
  solver-route decision from the open questions above. Confirm
  or revise the suggested key table.
- [ ] 7.2 Prototype the solver beside `sampleBSpline` with the
  same `SamplingOptions` contract; output ordinary cubic
  Bézier segments (the libspiro pattern) so `PathRenderer`
  and export need no clothoid awareness.
- [ ] 7.3 Second spline layout (`spline-clothoid`) reusing the
  Phase 1 registry + Phase 4 session structure, swapping only
  the point vocabulary and segment solver. This is the payoff
  the layout system exists for.
- [ ] 7.4 Decide: ship, or record findings and stop. Do not let
  this phase block Phases 1–6.

## Phase 8 — Deferred FM features (not in this effort)

- [ ] Brush-tip points (azimuth/altitude/size), calligraphic and
  ellipse tip outlines, dab key.
- [ ] `bezierFitCurve` point kind / fitted-curve import
  (see also the path-cleanup opportunity in
  [floating-marker-feature-opportunities.md](/Users/jpratt/Developer/nibglider/refs/floating-marker-feature-opportunities.md)).
- [ ] Noise on composite paths (already in `TASKS.txt` NOISE).

## Validation for every phase

- [ ] `npm run test` (Node test runner) — full suite green.
- [ ] `npm run lint` (oxlint) — clean.
- [ ] `npm run dev` manual smoke: draw one path per FM key,
  switch layouts mid-draw, finish, undo, redo, save/reload.
- [ ] Do **not** run `npm run build` during the session (per
  `AGENTS.md`); leave that to the user/CI.

## Risks

- **Key collisions** are the top risk: the spline layout shadows
  base keys only while drawing; Phase 1.3's audit table is the
  contract. If a needed key has no free cap, prefer adding the
  number row to the board over stealing a drawing-live key.
- **Arc-in-progress validity** cuts across session, validation,
  and preview; Phase 2.3's split (live-lenient, persisted-strict)
  must land before Phase 4.3.
- **Settings stamping vs live editing**: FM stamps per point;
  NibGlider's `setCornerRadius` rewrites live rounded points.
  Keep both, but document which operations are per-point-final.
- **`KEY_VARIANTS` startup cost** grows per layout; measure
  before/after Phase 1.5.


