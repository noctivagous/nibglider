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
5. ~~No layout registry, layout id, layout switcher, or per-layout caps~~ —
   done in Phase 1 (2026-10-31): `KEYBOARD_LAYOUTS` registry,
   `KeyboardLayoutId`, per-layout sparse tables, `activeLayoutId`
   on `KeyState`, engine-owned switching. Manual switcher UI is
   still Phase 5.
6. No erase-last-point, no dab, no switch-rounding key anywhere.

## Decisions to settle before / during Phase 1

Defaults are proposed so work can start; flag any you want changed.

- [x] **D1 — Layout activation.** Settled as proposed and implemented
  in Phase 1: the spline layout activates automatically while a
  composite path session is live (`PathTool.active` via
  `isCompositeSessionActive`) and the base layout returns on
  finish/cancel. A manual layout switcher (for future Grid Paint /
  Repeat layouts from `TASKS.txt`) is built in Phase 5, not now.
  (Widened by Tier Three Slice 14, 2026-11-10: activation is
  composite mode on OR session live, so the bowed key can start a
  path; the manual choice is the persisted `keyboard.layout`
  setting. Merge 2026-11-11: kept the widening; the manual
  override survives only as the clothoid-layout key, Shift+B.)
- [ ] **D2 — Default path mode.** FM keys only make sense in
  `ngComposite`. Default: keep `legacy` as the global default;
  starting a path from the spline layout implies `ngComposite`.
  Changing the global default is a separate, explicit decision.
  (Followed by Tier Two Slice 9b: bowed/arc keys act only in
  ngComposite mode; the global default is unchanged.)
- [x] **D3 — Rounded-corner length semantics.** FM stamps
  `roundedCornerSegmentLength` (default 25, a trim length along each
  leg, halved when a leg is short). NibGlider stores a tangent-arc
  `radius` (default 12) and already caps trims at half-leg. Default:
  keep radius as the stored truth; expose FM's length only as the
  derived trim. Do not add a second stored length.
- [x] **D4 — New physical keys (spline layout only).** Proposed,
  chosen from currently free/unused caps so the base layout is
  untouched. FM's original macOS keycodes do not transfer.
  Reserved everywhere: `A` = End, `Q` = Cancel (see 1.1) —
  candidates below must avoid both.
  - `B` — hard-corner bowed line, facing A
  - `Shift+B` — hard-corner bowed line, facing B
  - **Open**: the rounded-bowed pair, arc key, switch-rounding key,
    and erase-last key. Candidates are `.`, `\`, and Shift variants
    of the bowed keys (layouts are modal, so shadowing a base key
    is allowed only while drawing). Settle them in Phase 1, task
    1.3's collision audit against every `KEY_COMMANDS` entry that
    stays live while drawing (end, cancel, stamp, scale, rotate,
    stroke width), and record the final table there.
  - Phase 1 audit result (2026-10-31): `KeyB`, `Period`,
    `Backslash` confirmed free (empty legends in `KEY_CAPS`).
    Reservation was enforced in code (`validateLayoutTable` +
    `POINT_COMMAND_IDS` on plain `A`/`Q`/`Escape`/`R`).
  - **Settled (Slice 14, 2026-11-10):** `.` = three-point arc,
    `\` = switch-rounding, `Z` = erase-last (Pan-lock is idle-only,
    so `Z` is free while drawing); the bowed pair stays by facing
    (`B`/`Shift+B`) over the single `bowedLine` kind. Full table in
    the Slice 14 completion note after Phase 6. Merge 2026-11-11:
    Slice 14 table wins; the reservation helper is retired with the
    old registry (A/Q/Escape/R stay point-free by construction).
    Clothoid entry moves to `Shift+B` (toggle).
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

- [x] 1.1 Define `KeyboardLayoutDef { id, label, caps, commands }`
  and a `KEYBOARD_LAYOUTS` registry in `keymap.ts`. Base layout =
  today's `KEY_CAPS`/`KEY_COMMANDS` unchanged. Layouts *overlay*:
  layout commands win on their caps; unmatched caps fall back to
  base (so End/Cancel/Undo keep working while drawing).
  Layout-wide reservation (applies to every layout, including
  the B-spline and clothoid spline layouts): **`A` is always End
  and `Q` is always Cancel** (plus the existing `Esc` cancel
  alias and `R` Complete Shape). The base layout's extra End
  aliases (`E`, `S`) are layout-local and MAY be repurposed as
  point keys inside spline layouts — but `A` and `Q` are never
  shadowed. Any layout proposal that puts a point key on `A` or
  `Q` is invalid on arrival. — Done 2026-10-31 (`base` + `spline`
  shell; `clothoid`/`grid-paint`/`repeat` reserved with no stub
  tables; enforced then by `validateLayoutTable` +
  `POINT_COMMAND_IDS`). Merge 2026-11-11: the registry is now the
  tier per-layout compile; the rule stands, enforced by
  construction instead of a validator.
- [x] 1.2 Add `activeLayoutId` to `KeyState`; thread it through
  `KeyboardController.keyState()`, `resolveKeyVariants`,
  `resolveKeyboardLayout`, and `matchAppCommand`. Dispatch and
  on-screen display must resolve through the same variant list
  (existing invariant — do not fork it). — Done 2026-10-31;
  `resolveKeyVariants` keeps one shared lookup path over the
  layout table, `matchAppCommand` keeps iterating the base table
  (app commands are unavailable while drawing, so layout is moot).
  Re-implemented Tier Three Slice 14 as a per-layout compile
  (`compileKeyVariants` + `KEY_VARIANTS_BY_LAYOUT`); merge
  2026-11-11 keeps the tier form.
- [x] 1.3 Collision audit + final key table for the spline layout
  (settles D4). Every spline-layout key must list: physical code,
  chord, command id, FM equivalent, and which base command it
  shadows while drawing. — Done 2026-10-31, see D4 audit result
  above; per-key table deferred to Phase 5 since the shell adds
  no commands. Final table settled Slice 14 (see D4).
- [x] 1.4 Layout switching: engine-owned `activeKeyboardLayout`
  derived from session state (D1); layout name shown on the board
  and in the status overlay. Switching mid-draw must not cancel or
  mutate the live session. — Done 2026-10-31
  (`isCompositeSessionActive` from `PathTool.active`; board badge
  + `data-layout`; status title gains `· Spline layout` while a
  composite session draws; resolution never touches the session).
  Merge 2026-11-11: derivation also yields `clothoid` while a
  clothoid session draws; the manual override survives only for
  the clothoid key.
- [x] 1.5 `KEY_VARIANTS` compilation becomes per-layout (or
  layout-tagged). Watch the startup cost: it already enumerates
  codes × 16 chords × commands. — Done 2026-10-31 as sparse
  per-layout maps keyed by code+chord (FM-plist shape: 55 commands
  → 226 bound triples, not the ~52k product space). `KEY_VARIANTS`
  stays as the flattened base table, unchanged in content/order.
  Tier Slice 14 recompiles per registered layout at startup;
  merge 2026-11-11 keeps that form (clothoid registers third).
- [x] 1.6 Tests: extend [composite-path.test.mjs](/Users/jpratt/Developer/nibglider/tests/composite-path.test.mjs)
  keymap test + add layout-resolution cases (base ↔ spline swap,
  fallback keys, `isTypingText` still suppresses everything).
  — Done 2026-10-31 (2 new tests: swap/restore/dispatch/no-mutate;
  sparsity + reservation + registry shape).

**Gate:** with no spline session, board/dispatch are byte-identical
to today; with a session, the spline caps resolve and dispatch.
— Met 2026-10-31: full suite 517 tests, 511 pass, 6 fail (the 6
pre-existing Phase 0 failures, unchanged); lint 0 errors.

## Phase 2 — Model: BowedInfo + arc point kinds

Files: [NGPath.ts](/Users/jpratt/Developer/nibglider/src/engine/model/NGPath.ts),
[serialization.ts](/Users/jpratt/Developer/nibglider/src/engine/model/serialization.ts).

- [x] 2.1 Add a persisted `NGBowedParams` mirroring FM `BowedInfo` (done 2026-11-01, model slice):
  `facing: 'A' | 'B'`, `amplitude` + `amplitudeIsPercent` (default
  10 / true), `peakLocation` (0…1, default 0.5) ×
  `peakLocationMultiplier` (default 1), `isArc` (default false),
  `dualDistance` (0…1, default 0), `corneredApex:
  'none' | 'rounded' | 'hard'`.
- [x] 2.2 Decide representation (done 2026-11-01, model slice):
  point kind stays the corner, bow lives on `outgoing: { kind:
  'bowedLine', bow: NGBowedParams }`; `bowOffset`/`bowFacing`
  removed with no migration.
- [x] 2.3 Arc staged validation (done 2026-11-01, model slice):
  `validatePath(path, { allowStagedArc: true })` permits one
  trailing unpaired start for live snapshots; persisted paths stay
  strict. (Superseded by the tier strict pairing + `arcOpen`
  session flag; merge 2026-11-11 drops the staged flag — the
  session completes arcs before they persist.)
- [x] 2.4 `validatePath` covers the new fields (done 2026-11-01,
  model slice): finite/clamped ranges rejected-not-repaired,
  unknown keys still rejected. (Tier Phase 2.4 adds explicit
  range minima; merge 2026-11-11 keeps the tier ranges.)
- [x] 2.5 Tests in [engine-model.test.mjs](/Users/jpratt/Developer/nibglider/tests/engine-model.test.mjs) (done
  2026-11-01, model slice): bow round-trip + 9 rejections, every-FM-kind
  fixture round-trip, staged-arc session/persisted split.

**Gate:** `serializeDrawable`/`deserializeDrawable` round-trips a
fixture using every FM point kind. — Met 2026-11-01 (3 new tests, 16/16 pass).

## Phase 3 — Geometry: bowed segments + three-point arcs

Files: [compositeExpansion.ts](/Users/jpratt/Developer/nibglider/src/engine/geometry/compositeExpansion.ts),
[splineInterpolation.ts](/Users/jpratt/Developer/nibglider/src/engine/geometry/splineInterpolation.ts).
Pure, Paper-free; this is where the "not implemented" throw goes away.

- [x] 3.1 Bowed segment (spline mode, done 2026-11-01): `bowPeakPoints`
  per FM math (facing = normal ±90°, %/absolute amplitude, dual
  straddle, 2×/3× apex copies); degenerate chord (1e-9 discipline)
  emits just the peak. (Kept as the exported peak-math helper;
  the walk now resolves through `bowedCommands`.)
- [x] 3.2 Arc mode + standalone arc (done 2026-11-01):
  `sampleCircleThrough3` (perpendicular-bisector center, sweep side
  containing `through`, kappa cubics, collinear/coincident → line
  fallback, never NaN/throw); arc-mode bows use the single central
  peak like FM. (Re-implemented Tier Two Slice 9b via
  simpleGeometry's `arcThroughPoints`/`arcSegments`, sampled as
  cubics; merge 2026-11-11 keeps the tier form.)
- [x] 3.3 Wired into `expandCompositePoints` (done 2026-11-01,
  re-implemented Slice 9b): segment-level replacement; unfinished
  arcs complete at finish instead of previewing as hard corners;
  bowed runs stay B-spline even in clothoid paths.
- [x] 3.4 Closed paths (done 2026-11-01, reworked Slice 14): bow/arc
  on the seam work (seam-safe vertex choice); rounded targets keep
  entry/exit trims.
- [x] 3.5 Tests (done 2026-11-01, 7 new in `composite-path.test.mjs`,
  reworked Slice 14 + merge 2026-11-11): peak-math helper cases
  plus arc-resolution cases; `distinct()` throughout.

**Gate:** the throw at `compositeExpansion.ts:59` is gone; every
FM point kind expands to finite geometry. — Met 2026-11-01 (29/29
composite tests; full suite 532 pass, 6 pre-existing reds).

## Phase 4 — Drawing session: deposit the new keys

Files: [PathDrawingSession.ts](/Users/jpratt/Developer/nibglider/src/engine/drawing/PathDrawingSession.ts),
[PathTool.ts](/Users/jpratt/Developer/nibglider/src/engine/drawing/PathTool.ts),
[DrawingHost.ts](/Users/jpratt/Developer/nibglider/src/engine/drawing/DrawingHost.ts),
[hosts.ts](/Users/jpratt/Developer/nibglider/src/engine/hosts.ts), engine facade.

- [x] 4.1 Extend `CompositePointKind`/commit API so a commit can
  carry `NGBowedParams` and the current corner-rounding settings
  snapshot (FM stamps settings onto the point at deposit; later
  settings changes must not rewrite deposited points — except the
  existing deliberate `setCornerRadius` live-session behavior,
  which stays).
- [x] 4.2 Bowed keys: retype trailing point to hard/rounded corner
  with `outgoing.kind = 'bowedLine'` + params; append fresh
  trailing point (FM appends the same bowed type — follow FM).
- [x] 4.3 Arc key state machine: 1st press deposits
  `hardCorner + arcByThreeStart`; a press landing on a start
  deposits `arcByThreeEnd`; after a completed end, the next arc
  press starts a new arc with a hard-corner separator. Live
  preview of an unfinished arc must render (straight/spline
  placeholder) without tripping persisted-path validation.
  Finalize/cancel with an unfinished arc: drop or complete the
  pending start — pick one, test it.
- [x] 4.4 Switch-rounded-corner key: cycles the *session's*
  `corner.rounding` `arc → bSpline → bevel` for subsequently
  deposited rounded/bowed-rounded points (FM semantics: it changes
  what the Rounded keys produce; it does not rewrite old points).
- [x] 4.5 Erase-last-point key: removes the last committed point,
  keeping the trailing point live; no-op (not an error) at the
  first point. FM also closes unfinished arc slots before
  retyping — apply the same guard in 4.2–4.4.
- [x] 4.6 Engine entry points (`*KC` methods), `PathTool` methods,
  host interface, scale/rotate session handling (bow amplitude in
  % scales naturally; absolute amplitude scales with the path —
  decide, test).
- [x] 4.7 Tests: session-level commit sequences per key; arc
  3-press sequence; erase-last at boundaries; settings snapshot
  isolation (change settings mid-draw, earlier points unchanged).

**Gate:** a scripted key sequence builds a semantic path using
every FM key, and `snapshot()` matches the expected point list.

**Tier Two Slice 9b completion note (2026-11-10).** The core of
Phases 3–4 landed, with deliberate simplifications vs. this plan:
`expandCompositePoints` no longer throws — bowed segments resolve
to an exact quadratic-peak cubic (peak at the chord midpoint,
`bowOffset` absolute pt or a 25%-of-chord default, `bowFacing`
left/right), three-point arcs resolve through
`arcThroughPoints`/`arcSegments` with a collinear line fallback,
and an `arc` outgoing segment resolves as the semicircle on its
chord. The drawing session deposits both: `B` / `Shift+B` stamp a
bowed point (facing A/B) and `.` runs the arc state machine under
the app's stamp-previous convention (pressing `.` at the end point
arcs through the previous point; any next point key commits the
end; finishing mid-arc completes the arc at the final point in
`snapshot()`, and ending exactly on the through point abandons it,
mirroring FM's unfinished-arc fallback). Engine `*KC` entry
points, PathTool methods, host interface, keymap commands/caps,
and tests (`tests/fmstroke-completion.test.mjs`) are in.
NOT done: Phase 1's swappable keyboard-layout registry (the new
keys are ordinary KEY_COMMANDS entries — the layout system did
not fall out of this slice), Phase 2's 9-field `NGBowedParams`
(the model's existing `bowOffset`/`bowFacing` carry the bow;
peak-location/multiplier/dual-peak parameters remain future),
the hard/rounded bowed key pair (one `bowedLine` kind, repeats=2),
3.4's seam-crossing arc triples (they fall back to ordinary
vertices; bowed seam segments do work), 4.4's switch-rounding
key, and 4.5's erase-last key.

## Phase 5 — Wiring: dispatch, board, status, settings

Files: [KeyboardController.ts](/Users/jpratt/Developer/nibglider/src/engine/input/KeyboardController.ts),
[KeySettingsRegistry.ts](/Users/jpratt/Developer/nibglider/src/engine/input/KeySettingsRegistry.ts),
[keymapSchema.ts](/Users/jpratt/Developer/nibglider/src/engine/appearance/keymapSchema.ts),
[statusSchema.ts](/Users/jpratt/Developer/nibglider/src/engine/appearance/statusSchema.ts),
[engineSettings.ts](/Users/jpratt/Developer/nibglider/src/engine/engineSettings.ts).

- [x] 5.1 New commands + `perform()` cases for: bowed-hard A/B,
  bowed-rounded A/B, arc-by-three, switch-rounding, erase-last.
  (Dab — FM code 4, stamps one brush tip — only with Phase 8;
  list it here so the key table reserves no key for it yet.)
- [x] 5.2 Spline-layout caps with legends (e.g. `BOW →`,
  `ARC 3-PT`) following the existing two-line legend style;
  settings gear links via `KEY_SETTINGS_LINKS` pattern.
- [x] 5.3 Key-settings fields (path-tool schema, spline-layout
  section): bow amplitude + %/absolute toggle, peak location,
  arc-vs-spline bow mode, dual distance, apex cornering, corner
  rounding type. All persisted through `engineSettings`
  (`path.*` keys) like `path.cornerRadius`.
- [x] 5.4 Keymap-table + status rows for the spline layout
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
- [x] 5.6 Tests: dispatch through `KeyboardController` (not just
  the resolver), board legends for each chord, settings
  read/write/validate round-trip in
  [engine-settings.test.mjs](/Users/jpratt/Developer/nibglider/tests/engine-settings.test.mjs).

**Gate:** end-to-end — physical key → semantic point → preview →
deposit → undo/redo — for each new key, in tests.

## Phase 6 — Persistence, export, and downstream consumers

- [x] 6.1 Retained-source round-trip: deposit a path using every
  new kind, save/load the drawable, confirm identical geometry
  after re-resolution (extend the Phase 5 engine test).
- [x] 6.2 SVG/export: derived Bezier output only — no FM/NibGlider
  metadata required by external readers (per the study). Verify
  bowed/arc paths export as ordinary path data.
- [x] 6.3 Downstream lowering audit: outlined-stroke spine
  ([outlinedStroke.ts](/Users/jpratt/Developer/nibglider/src/engine/geometry/outlinedStroke.ts)),
  interlace, boolean ops, endpoint join, direct Paper-segment
  edits. Each must either resolve the new kinds or lower to
  Bézier exactly as composite paths already do — no new throws.
- [x] 6.4 Text-on-path and shape-text (`withShapeText`) still work
  on bowed/arc deposits.

**Gate:** no code path in `src/` throws on a persisted bowed/arc
composite path.

**Tier Three Slice 14 completion note (2026-11-10).** Phases 1, 2,
3.1, 3.4, 3.5, 4, 5 (except 5.5), and 6 landed; tests are in
`tests/fmstroke-slice14.test.mjs`. What shipped, with the honest
deviations from this file's letter:

- **Phase 1 — layout registry.** `KEYBOARD_LAYOUTS` in `keymap.ts`
  holds named `KeyboardLayoutDef`s; the base layout is the existing
  command/cap set, and the spline layout carries the FMStroke
  commands (the bowed/arc commands moved out of `KEY_COMMANDS` into
  it) ahead of the base set over merged caps, so layout commands win
  their caps and everything else falls back to base. Variants compile
  per layout (`KEY_VARIANTS_BY_LAYOUT`); dispatch and the board both
  resolve through the active layout's list. D1: the engine derives
  the active layout — spline while composite mode is on or a
  composite session is live (mode-level, not session-only, so `B`
  can still start a path, matching Tier Two's board behaviour), else
  the manual `keyboard.layout` setting (`auto|base|spline`). `A`/`Q`
  are never claimed by the spline layout and are test-asserted to
  resolve to End/Cancel there. The layout name shows in the status
  overlay ("Keys: Spline · Rounding: … · Bow: …"); a board-header
  switcher control (5.5) was NOT built — the registry setting exists
  and persists, the visible control remains open.
- **D4 final key table (spline layout).** `B` bowed facing A,
  `Shift+B` bowed facing B (the pair is by facing; the single
  `bowedLine` kind with repeats=2 from Tier Two is unchanged — no
  separate hard/rounded bowed keys), `.` three-point arc, `\`
  switch-rounding (the Backslash cap had no base command), `Z`
  erase-last (base `Z` is Pan-lock, available only while idle, so
  the cap is free while drawing). Found while wiring this: `.` had
  never compiled a dispatch variant (`Period` was missing from the
  physical-key punctuation table), so the Tier Two arc key resolved
  on the board but did not dispatch; fixed by adding the mapping.
- **Phase 2 — model.** `NGBowedParams` (9 fields) rides on
  `outgoing.bow`, superseding `bowOffset`/`bowFacing`; the point
  kind stays the corner, per 2.2's default. Where the file said "no
  legacy migration", the slice brief required one: native format
  v3 → v4 (`migrate3to4`) converts stored pairs preserving Tier Two
  semantics exactly (present offset = absolute pt, absent = 25% of
  chord, left/right = A/B). `BOWED_DEFAULTS` keeps 25% (Tier Two's
  shipped default) rather than FM's 10 — the record a session
  stamps carries the settings value either way. Validation rejects
  out-of-range values, never repairs; closed-path arc pairing is
  checked cyclically so a seam-wrapped pair persists legally, open
  paths stay strict.
- **Phase 3 — geometry.** Single peak = the exact quadratic through
  the computed peak (Tier Two semantics, generalized to peak
  location × multiplier and %/absolute amplitude); dual peaks chain
  two quadratics through both peaks with the saddle between them;
  a cornered apex emits the peak as a repeated B-spline control
  (×2/×3, FM multiplicity); arc mode takes the circle through
  (start, peak, end) with a collinear line fallback; a degenerate
  chord emits just its endpoints (documented in code). Seam: the
  expansion walk now chooses a seam-safe start vertex, so arc
  triples crossing the array seam expand as arcs; a closed ring
  made only of through/end points (no anchor vertex) keeps the
  ordinary-vertex fallback.
- **Phase 4 — session.** Commits stamp the session's bow-parameter
  snapshot and rounding selection; settings changes never rewrite
  committed points (the deliberate `setCornerRadius` live behaviour
  stays, and now preserves each point's stamped rounding type).
  Switch-rounding (`\`) cycles arc → bSpline → bevel for later
  points. Erase-last (`Z`) removes the last committed point, is a
  no-op at the first point, abandons an open arc (through point
  reverts to a spline point) and likewise abandons a completed arc
  whose end is erased. Scale scales absolute bow amplitudes;
  percent amplitudes ride the chord; rotation leaves bow records
  untouched (they are chord-relative).
- **Phase 5 — wiring.** `perform()` cases, host methods, engine
  `*KC` entry points for both new keys; spline caps (Backslash
  gains the ROUNDING TYPE legend; B/Period/Z resolve through the
  layout); bow settings persisted as `path.bowAmplitude`,
  `path.bowAmplitudeIsPercent`, `path.bowPeakLocation`,
  `path.bowIsArc` (dual distance and apex cornering are
  record-level parameters, not settings fields; rounding type is
  the switch key's session state). Keymap-table rows for the new
  keys appear only in the composite branch.
- **Phase 6.** The bow record round-trips through drawable
  serialization field-for-field; exports remain derived-Bézier
  only (no new metadata); downstream consumers all resolve through
  `resolveCompositePath`, which is now total over every persisted
  kind — the full suite is the evidence.

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
row for fluid key-click drawing; less common keys on the
`QWERTY` row above and `ZXCVB` row below. This layout is modal
(clothoid spline layout only), but per the layout-wide rule
(1.1) **`A` stays End and `Q` stays Cancel in every layout** —
they are not available as point keys, so the four workhorses
sit on `S D F G` instead of `A S D F`.

| Row | Key | Spiro point / action | Notes |
|---|---|---|---|
| Home | `A` | **End (reserved)** | Layout-wide reservation; never a point key |
| Home | `S` | G4 point | Gentlest curve; expected most-used (`S` is only an End *alias* in base, freed here — End stays on `A`) |
| Home | `D` | G2 point | Sharper curve, curvature-continuous |
| Home | `F` | Corner point | Abrupt direction change |
| Home | `G` | Straight/line point | Zero-curvature run into/out of curves; pairs with constraint keys (remaps base `G` spline-point, which this vocabulary replaces) |
| Top | `Q` | **Cancel (reserved)** | Layout-wide reservation; `Esc` alias also works |
| Top | `W` | Previous constraint | Curve → straight hand-off (before) |
| Top | `E` | Next constraint | Straight → curve hand-off (after; `E` is only an End *alias* in base, freed here — End stays on `A`) |
| Bottom | `Z` | Erase last point | Same action as the B-spline layout's erase-last, if Phase 4.5 lands it there too (`Z` pan-lock is idle-only, so it is free while drawing) |
| Bottom | `X`–`B` | (unassigned) | Reserve for solver/setting keys (e.g. toggle live-solve, extrema marking, cycle point type); do not invent bindings in 7.1 |

End / cancel / complete (`A` / `Q`+`Esc` / `R`) are identical
in every layout — that is the point of the reservation: the
user's fingers never re-learn how to stop.
**Exception the audit must still resolve:** `W` shadows base
Stamp while drawing, so Stamp needs an explicit
clothoid-layout binding (candidates: `Enter`, `B`) before this
table is final. — Resolved 2026-10-31 (Slice A): `B` (`Enter`'s
cap is hidden, so it cannot carry the binding; `B` is modal —
base-board enter key vs in-layout Stamp — with no conflict).

Open questions for 7.1, do not pre-decide here:

- Exact libspiro point-type semantics (its type set includes
  G4, G2, corner, and left/right constraint variants) and which
  of them map 1:1 onto the `Q`/`W` prev/next pair above.
- Solver route: libspiro via WASM, a TypeScript port of the
  clothoid fit, or direct Fresnel evaluation. Check libspiro's
  license before considering bundling it. — Settled 2026-10-31
  (Slice B): self-contained TypeScript G1 fitter, no dependency
  to license or bundle; libspiro/WASM stays an option only if
  7.4 demands exact Spiro compatibility.
- Whether G4/G2/corner/constraint become new `NGPathPoint`
  kinds, or a clothoid-specific point record under a separate
  spline layout id — the semantic model must not force
  B-spline kinds to pretend to be Spiro types.

### Tasks

- [x] 7.0 Layout shell — Slice A (done 2026-10-31): `overlay:
  'partial' | 'full'` on `KeyboardLayoutDef` (clothoid ships
  partial; full blanks non-reserved caps); manual override
  (`engine.manualLayoutId`, transient) entered by `KeyB`
  (`enter-clothoid-layout`) and left by Escape-when-idle; live
  sessions override manual, finish/cancel restores it. Point
  commands registered per the table above but unavailable until
  the solver lands; `clothoid-stamp` (action `stamp`) works now.
  Tests in `tests/clothoid-layout.test.mjs` (3 pass). Full suite:
  520 tests, 514 pass, 6 fail (pre-existing Phase 0 reds);
  lint 0 errors.
- [x] 7.1 Research note in `refs/`: clothoid (Euler spiral)
  segment definition, Fresnel-integral evaluation, fitting
  between two points with heading/curvature continuity
  (G1/G2), **plus** the Spiro/libspiro point-type semantics and
  solver-route decision from the open questions above. Confirm
  or revise the suggested key table. — Done 2026-11-01:
  [clothoid-spiro-71-note.md](/Users/jpratt/Developer/nibglider/refs/clothoid-spiro-71-note.md).
  G1 across joints today, G2 not enforced; one-sided constraint
  forcing left open; solver route settled (self-contained TS,
  libspiro is GPLv3); key table confirmed as shipped in 7.3.
- [x] 7.2 Prototype the solver beside `sampleBSpline` with the
  same `SamplingOptions` contract; output ordinary cubic
  Bézier segments (the libspiro pattern) so `PathRenderer`
  and export need no clothoid awareness. — Done 2026-10-31
  (Slice B): `src/engine/geometry/clothoidFit.ts` (`fresnel`,
  `fitClothoidG1`, `sampleClothoid`), pure and Paper-free.
  Proofs in `tests/clothoid-fit.test.mjs` (7 pass): Fresnel(1)
  exact, straight exact, quarter-circle finds zero sharpness +
  arc length with curve deviation ≤ tolerance, S-curve end
  tangents exact, G1 across joints, seam closure, degenerate
  fallback. Full suite: 527 tests, 521 pass, 6 pre-existing
  reds; lint 0 errors.
- [x] 7.3 Second spline layout (`spline-clothoid`) reusing the
  Phase 1 registry + Phase 4 session structure, swapping only
  the point vocabulary and segment solver. This is the payoff
  the layout system exists for. — Done 2026-11-01 (Slice 7.3):
  new `g4`/`g2`/`clothoidCorner`/`prevConstraint`/`nextConstraint`
  point kinds (line reuses `line`) through `PathDrawingSession` +
  `resolveCompositePath` via `sampleClothoid`; `B` layout caps live
  and shadow base; live clothoid sessions hold the layout.
  Tests in `tests/clothoid-layout.test.mjs` (4 pass).
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
  before/after Phase 1.5. — Measured 2026-10-31: sparse tables hold
  226 / 226 / ~230 bindings (base/spline/clothoid) vs the ~52k
  product space; no action needed.


