# 7.1 Research note: clothoid segments, fitting, and Spiro semantics

Settles the open questions in `TASKS-FMStroke.md` Phase 7 for the
clothoid layout shipped in 7.3. Sources: `src/engine/geometry/clothoidFit.ts`,
`src/engine/geometry/compositeExpansion.ts`, libspiro
`spiroentrypoints.h` / `spiro.h` (fontforge/libspiro), and the Phase 7 proposal.

## 1. Clothoid segment definition

A clothoid (Euler spiral) has linearly varying curvature:

```text
k(s) = k0 + a·s
```

Position follows from integrating heading, which yields the Fresnel
integrals (engineering convention, `C(∞) = S(∞) = 0.5`).
`fresnel()` in `clothoidFit.ts` evaluates them by adaptive Simpson
quadrature — accurate for the few-oscillation integrands this solver
produces, not a general oscillatory integrator. The fitter integrates
the clothoid directly rather than routing through `fresnel()`.

## 2. Fitting: G1 Hermite spans, not G2

`fitClothoidG1(p0, heading0, p1, heading1)` solves one span from
endpoint positions + endpoint headings in a scale-normalized frame
(damped Newton from circular-arc seeds). Spans that refuse to converge
split recursively (cubic-Hermite midpoint), bottoming out at a straight
line. Coincident endpoints and chord-aligned headings short-circuit to
a line span. Output is ordinary cubic Béziers within tolerance — the
libspiro pattern — so renderers and export need no clothoid awareness.

Joint headings are estimated from neighbors (`sampleClothoid`):
interior knots use next-minus-prev, ends use the chord, closed paths
wrap. That gives **G1 (tangent) continuity across joints**.
Curvature continuity (G2) across joints is **not** enforced today:
each span picks its own sharpness `a`, so curvature can jump at knots.
The `G4`/`G2` point kinds are semantic intent only for now; the solver
treats every smooth kind identically.

## 3. Spiro / libspiro point-type semantics

Authoritative `ty` values from libspiro `spiroentrypoints.h`:

| libspiro | char | meaning |
|---|---|---|
| `SPIRO_CORNER` | `v` | abrupt direction change |
| `SPIRO_G4` | `o` | smooth, fourth-order continuity |
| `SPIRO_G2` | `c` | smooth, curvature continuity |
| `SPIRO_LEFT` | `[` | one-sided constraint, curve side |
| `SPIRO_RIGHT` | `]` | one-sided constraint, curve side |
| `SPIRO_END` / open-contour markers | `z` / `{` `}` | contour bookkeeping, no NibGlider equivalent |

`LEFT`/`RIGHT` constrain curvature to zero on one side of the knot:
they are the straight↔curve hand-off vocabulary. NibGlider names them
direction-relatively instead of left/right-relatively:

| Key | NibGlider kind | Spiro concept |
|---|---|---|
| `S` | `g4` | `SPIRO_G4` |
| `D` | `g2` | `SPIRO_G2` |
| `F` | `clothoidCorner` | `SPIRO_CORNER` |
| `G` | `line` (reused kind) | straight run |
| `W` | `prevConstraint` | one-sided constraint, curve-into-straight |
| `E` | `nextConstraint` | one-sided constraint, straight-into-curve |
| `Z` | erase-last | no Spiro equivalent; waits for Phase 4.5 |
| `B` | stamp | no Spiro equivalent; layout-local Stamp |

One-sided zero-curvature forcing is **not** implemented: `W`/`E`
currently deposit smooth points. Direction-relative naming is kept —
it reads correctly under key-click regardless of path direction,
whereas left/right flip with winding.

## 4. Solver-route decision (settled)

Self-contained TypeScript G1 fitter (Slice B), no dependency to
license or bundle. libspiro ships under **GPLv3** (`COPYING` in
fontforge/libspiro), so neither static bundling nor in-app WASM is
acceptable for NibGlider distribution. Exact Spiro compatibility stays
an option only if 7.4 demands it, and then only out-of-process —
never linked into the app.

## 5. Key table: confirmed as shipped

The 7.0 proposal table stands, as implemented in 7.3. `A` stays End
and `Q`/`Esc` stay Cancel in every layout (layout-wide reservation).
`X`–`B` (minus `B` = Stamp) stay unassigned for future solver/setting
keys; no bindings invented here. `Z` erase-last stays unavailable
until Phase 4.5 lands the editing primitive.

## 6. Left open (for 7.4 or later)

- One-sided curvature forcing for `prevConstraint`/`nextConstraint`.
- G2 continuity across smooth joints (would make `g4` vs `g2` real).
- `SPIRO_ANCHOR`/`SPIRO_HANDLE` (`a`/`h`): curve-crossing vocabulary,
  out of scope for key-click deposit.
