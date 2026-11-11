// Repeat as a SYMMETRY system (Tier Two, Slice 9a, user design
// direction 2026-11-10). A repeat is {family, group/parameters,
// source item(s)} generating transformed copies:
//
//   wallpaper — 2D lattice repeats. Transforms are generated from
//     a symmetry-group descriptor: motif transforms in fractional
//     cell coordinates composed with lattice translations (plus a
//     centring offset for the c-groups). Repeat Grid is the plain
//     translation member (p1).
//   polar — rotation about a centre, with optional reflection
//     (dihedral). Repeat Circle is this family.
//   frieze — 1D band repeats along a step vector: translation with
//     optional glide reflection / vertical & horizontal reflection
//     / half-turn, per the seven frieze groups.
//
// All 17 wallpaper groups and all 7 frieze groups have generator
// entries below. Square groups (p4*) require a square cell and the
// hexagonal groups (p3*, p6*) a 60° cell; basisForWallpaper derives
// the right cell shape from the requested group.
import type { Vec2 } from '../model/geometryResolution';

/** Affine map (x, y) -> (a*x + c*y + tx, b*x + d*y + ty). */
export interface Affine {
  a: number; b: number; c: number; d: number; tx: number; ty: number;
}

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

export function composeAffine(outer: Affine, inner: Affine): Affine {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    tx: outer.a * inner.tx + outer.c * inner.ty + outer.tx,
    ty: outer.b * inner.tx + outer.d * inner.ty + outer.ty,
  };
}

export function applyAffine(t: Affine, p: Vec2): Vec2 {
  return { x: t.a * p.x + t.c * p.y + t.tx, y: t.b * p.x + t.d * p.y + t.ty };
}

export function isIdentityAffine(t: Affine): boolean {
  const eps = 1e-9;
  return Math.abs(t.a - 1) < eps && Math.abs(t.b) < eps && Math.abs(t.c) < eps
    && Math.abs(t.d - 1) < eps && Math.abs(t.tx) < eps && Math.abs(t.ty) < eps;
}

function translation(x: number, y: number): Affine {
  return { a: 1, b: 0, c: 0, d: 1, tx: x, ty: y };
}

function rotationAbout(center: Vec2, degrees: number): Affine {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rot: Affine = { a: cos, b: sin, c: -sin, d: cos, tx: 0, ty: 0 };
  return composeAffine(translation(center.x, center.y),
    composeAffine(rot, translation(-center.x, -center.y)));
}

// ----------------------------------------------------------------
// Wallpaper groups

export type WallpaperGroupId =
  | 'p1' | 'p2' | 'pm' | 'pg' | 'cm' | 'pmm' | 'pmg' | 'pgg' | 'cmm'
  | 'p4' | 'p4m' | 'p4g' | 'p3' | 'p3m1' | 'p31m' | 'p6' | 'p6m';

export type LatticeKind = 'oblique' | 'centered' | 'square' | 'hexagonal';

export const WALLPAPER_GROUPS: Record<WallpaperGroupId, { label: string; lattice: LatticeKind }> = {
  p1: { label: 'p1 — translation only', lattice: 'oblique' },
  p2: { label: 'p2 — half-turns', lattice: 'oblique' },
  pm: { label: 'pm — parallel mirrors', lattice: 'oblique' },
  pg: { label: 'pg — glide reflections', lattice: 'oblique' },
  cm: { label: 'cm — mirror + glide, centred', lattice: 'centered' },
  pmm: { label: 'pmm — mirrors both ways', lattice: 'oblique' },
  pmg: { label: 'pmg — mirror + glide', lattice: 'oblique' },
  pgg: { label: 'pgg — glides both ways', lattice: 'oblique' },
  cmm: { label: 'cmm — mirrors both ways, centred', lattice: 'centered' },
  p4: { label: 'p4 — quarter-turns', lattice: 'square' },
  p4m: { label: 'p4m — quarter-turns + mirrors', lattice: 'square' },
  p4g: { label: 'p4g — quarter-turns + glides', lattice: 'square' },
  p3: { label: 'p3 — third-turns', lattice: 'hexagonal' },
  p3m1: { label: 'p3m1 — third-turns + mirrors', lattice: 'hexagonal' },
  p31m: { label: 'p31m — third-turns + mirrors (offset)', lattice: 'hexagonal' },
  p6: { label: 'p6 — sixth-turns', lattice: 'hexagonal' },
  p6m: { label: 'p6m — sixth-turns + mirrors', lattice: 'hexagonal' },
};

export const WALLPAPER_GROUP_IDS = Object.keys(WALLPAPER_GROUPS) as WallpaperGroupId[];

/** Conway orbifold signatures — the DISPLAY notation for groups
 * (panel labels); the international key above stays the stored
 * descriptor key. */
export const WALLPAPER_ORBIFOLD: Record<WallpaperGroupId, string> = {
  p1: 'o', p2: '2222', pm: '**', pg: 'xx', cm: '*×', pmm: '*2222',
  pmg: '22*', pgg: '22×', cmm: '2*22', p4: '442', p4m: '*442',
  p4g: '4*2', p3: '333', p3m1: '*333', p31m: '3*3', p6: '632', p6m: '*632',
};

/** A motif transform in fractional cell coordinates: linear part
 * Q (row-major [q00 q01; q10 q11]) + translation t in cell units. */
interface Motif { q: [number, number, number, number]; t: [number, number] }

const I: Motif = { q: [1, 0, 0, 1], t: [0, 0] };
const NEG: Motif = { q: [-1, 0, 0, -1], t: [0, 0] };
const MX: Motif = { q: [1, 0, 0, -1], t: [0, 0] }; // reflect across a axis
const MY: Motif = { q: [-1, 0, 0, 1], t: [0, 0] }; // reflect across b axis
const glideX = (t: [number, number]): Motif => ({ q: [1, 0, 0, -1], t });
const shift = (m: Motif, t: [number, number]): Motif => ({ q: m.q, t });
// Square-basis rotations.
const R90: Motif = { q: [0, -1, 1, 0], t: [0, 0] };
const R270: Motif = { q: [0, 1, -1, 0], t: [0, 0] };
// Hexagonal-basis rotations (b at 60 degrees).
const H60: Motif = { q: [0, -1, 1, 1], t: [0, 0] };
const H120: Motif = { q: [-1, -1, 1, 0], t: [0, 0] };
const H240: Motif = { q: [0, 1, -1, -1], t: [0, 0] };
const H300: Motif = { q: [1, 1, -1, 0], t: [0, 0] };
// Hexagonal reflections: across the a axis, and across the a+b bisector.
const HA: Motif = { q: [1, 0, 1, -1], t: [0, 0] };
const HB: Motif = { q: [0, 1, 1, 0], t: [0, 0] };

function composeMotif(outer: Motif, inner: Motif): Motif {
  const [a, b, c, d] = outer.q;
  const [e, f, g, h] = inner.q;
  return {
    q: [a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h],
    t: [
      a * inner.t[0] + b * inner.t[1] + outer.t[0],
      c * inner.t[0] + d * inner.t[1] + outer.t[1],
    ],
  };
}

function withRotations(base: Motif[], rotations: Motif[]): Motif[] {
  const out: Motif[] = [];
  for (const r of rotations) for (const m of base) out.push(composeMotif(r, m));
  return out;
}

const MOTIFS: Record<WallpaperGroupId, Motif[]> = {
  p1: [I],
  p2: [I, NEG],
  pm: [I, MX],
  pg: [I, glideX([0.5, 0])],
  cm: [I, MX],
  pmm: [I, MX, MY, NEG],
  pmg: [I, MY, glideX([0.5, 0]), shift(NEG, [0.5, 0])],
  pgg: [I, glideX([0.5, 0]), { q: [-1, 0, 0, 1], t: [0, 0.5] }, shift(NEG, [0.5, 0.5])],
  cmm: [I, MX, MY, NEG],
  p4: [I, R90, NEG, R270],
  p4m: withRotations([I, MX], [I, R90, NEG, R270]),
  p4g: withRotations([I, glideX([0.5, 0.5])], [I, R90, NEG, R270]),
  p3: [I, H120, H240],
  p3m1: withRotations([I, HA], [I, H120, H240]),
  p31m: withRotations([I, HB], [I, H120, H240]),
  p6: [I, H60, H120, NEG, H240, H300],
  p6m: withRotations([I, HA], [I, H60, H120, NEG, H240, H300]),
};

export interface WallpaperSpec {
  family: 'wallpaper';
  group: WallpaperGroupId;
  origin: Vec2;
  basisA: Vec2;
  basisB: Vec2;
  /** Bounded extent: the lattice is generated for cols × rows
   * cells (the descriptor's answer to an infinite lattice). */
  cols: number;
  rows: number;
  /** Motif orientation offset in degrees (default 0): the motif is
   * rotated by this much about the descriptor origin before the
   * group's transforms apply, so copy anchors stay on the lattice
   * while every copy's orientation turns. */
  motifOffsetDeg?: number;
}

/** The right cell shape for a group, sized from a source extent. */
export function basisForWallpaper(group: WallpaperGroupId, width: number, height: number): { basisA: Vec2; basisB: Vec2 } {
  const lattice = WALLPAPER_GROUPS[group].lattice;
  if (lattice === 'square') return { basisA: { x: width, y: 0 }, basisB: { x: 0, y: width } };
  if (lattice === 'hexagonal') {
    return { basisA: { x: width, y: 0 }, basisB: { x: width / 2, y: (width * Math.sqrt(3)) / 2 } };
  }
  return { basisA: { x: width, y: 0 }, basisB: { x: 0, y: height } };
}

function motifToWorld(motif: Motif, origin: Vec2, basisA: Vec2, basisB: Vec2): Affine {
  // World point of fractional (u, v): origin + u*A + v*B. The motif
  // acts in fractional space; conjugate by the basis change.
  const m = { a: basisA.x, b: basisA.y, c: basisB.x, d: basisB.y };
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) return IDENTITY;
  const inv = {
    a: m.d / det, b: -m.b / det, c: -m.c / det, d: m.a / det,
  };
  const [q0, q1, q2, q3] = motif.q;
  const lin = {
    a: m.a * q0 + m.c * q2, b: m.b * q0 + m.d * q2,
    c: m.a * q1 + m.c * q3, d: m.b * q1 + m.d * q3,
  };
  const linWorld = {
    a: lin.a * inv.a + lin.c * inv.b,
    b: lin.b * inv.a + lin.d * inv.b,
    c: lin.a * inv.c + lin.c * inv.d,
    d: lin.b * inv.c + lin.d * inv.d,
  };
  const tWorld = {
    x: basisA.x * motif.t[0] + basisB.x * motif.t[1],
    y: basisA.y * motif.t[0] + basisB.y * motif.t[1],
  };
  // X(p) = origin + LinWorld * (p - origin) + tWorld
  return {
    ...linWorld,
    tx: origin.x - (linWorld.a * origin.x + linWorld.c * origin.y) + tWorld.x,
    ty: origin.y - (linWorld.b * origin.x + linWorld.d * origin.y) + tWorld.y,
  };
}

/** Post-compose every transform with a rotation about the pivot:
 * the motif turns inside its cell while its anchor (the pivot's
 * image under each transform) stays where the group puts it. */
function withMotifOffset(transforms: Affine[], pivot: Vec2, offsetDeg?: number): Affine[] {
  if (!offsetDeg) return transforms;
  const spin = rotationAbout(pivot, offsetDeg);
  return transforms.map((t) => composeAffine(t, spin));
}

function wallpaperTransforms(spec: WallpaperSpec): Affine[] {
  const motifs = MOTIFS[spec.group];
  const centered = WALLPAPER_GROUPS[spec.group].lattice === 'centered';
  const out: Affine[] = [];
  for (let row = 0; row < spec.rows; row++) {
    for (let col = 0; col < spec.cols; col++) {
      const cellOffsets: Array<[number, number]> = centered
        ? [[col, row], [col + 0.5, row + 0.5]]
        : [[col, row]];
      for (const [cu, cv] of cellOffsets) {
        const shiftVec = {
          x: spec.basisA.x * cu + spec.basisB.x * cv,
          y: spec.basisA.y * cu + spec.basisB.y * cv,
        };
        for (const motif of motifs) {
          const world = motifToWorld(motif, spec.origin, spec.basisA, spec.basisB);
          out.push(composeAffine(translation(shiftVec.x, shiftVec.y), world));
        }
      }
    }
  }
  return withMotifOffset(out, spec.origin, spec.motifOffsetDeg);
}

// ----------------------------------------------------------------
// Frieze groups

export type FriezeGroupId = 'p1111' | 'p11g' | 'p1m1' | 'pm11' | 'p112' | 'p2mg' | 'p2mm';

export const FRIEZE_GROUPS: Record<FriezeGroupId, { label: string }> = {
  p1111: { label: 'p1111 — translation only' },
  p11g: { label: 'p11g — glide reflection' },
  p1m1: { label: 'p1m1 — vertical mirrors' },
  pm11: { label: 'pm11 — horizontal mirror' },
  p112: { label: 'p112 — half-turns' },
  p2mg: { label: 'p2mg — mirror + glide + half-turn' },
  p2mm: { label: 'p2mm — mirrors both ways + half-turn' },
};

export const FRIEZE_GROUP_IDS = Object.keys(FRIEZE_GROUPS) as FriezeGroupId[];

/** Conway orbifold signatures for the frieze groups (display
 * notation; keys stay international). The amendment's short names
 * map onto the stored keys: p1=p1111, p11m=pm11, p2=p112. */
export const FRIEZE_ORBIFOLD: Record<FriezeGroupId, string> = {
  p1111: '∞∞', p11g: '∞×', p1m1: '∞*', pm11: '*∞∞',
  p112: '22∞', p2mg: '2*∞', p2mm: '*22∞',
};

const FRIEZE_MOTIFS: Record<FriezeGroupId, Motif[]> = {
  p1111: [I],
  p11g: [I, glideX([0.5, 0])],
  p1m1: [I, MY],
  pm11: [I, MX],
  p112: [I, NEG],
  p2mg: [I, shift(NEG, [0.5, 0]), { q: [-1, 0, 0, 1], t: [0.5, 0] }, MX],
  p2mm: [I, MX, MY, NEG],
};

export interface FriezeSpec {
  family: 'frieze';
  group: FriezeGroupId;
  origin: Vec2;
  /** One translation step; the band runs along it. */
  step: Vec2;
  /** Bounded extent: this many steps along the band. */
  count: number;
  /** Motif orientation offset in degrees (see WallpaperSpec). */
  motifOffsetDeg?: number;
}

function friezeTransforms(spec: FriezeSpec): Affine[] {
  const step = spec.step;
  const perp = { x: step.y, y: -step.x }; // same length as step
  const out: Affine[] = [];
  for (let i = 0; i < spec.count; i++) {
    for (const motif of FRIEZE_MOTIFS[spec.group]) {
      const world = motifToWorld(motif, spec.origin, step, perp);
      out.push(composeAffine(translation(step.x * i, step.y * i), world));
    }
  }
  return withMotifOffset(out, spec.origin, spec.motifOffsetDeg);
}

// ----------------------------------------------------------------
// Polar repeats

export interface PolarSpec {
  family: 'polar';
  center: Vec2;
  count: number;
  reflect: boolean;
  /**
   * Rotation configuration, stored in the descriptor (never
   * reduced to a derived step): 'division' divides the circle into
   * `count` equal steps (360/count, a closed ring); 'degrees'
   * steps by `stepDeg` for `count` copies (an open fan/rosette —
   * the step need not divide 360). Absent means 'division'
   * (descriptors written before the mode existed).
   */
  mode?: 'division' | 'degrees';
  /** Step angle for 'degrees' mode. */
  stepDeg?: number;
  /** Motif orientation offset in degrees (see WallpaperSpec). */
  motifOffsetDeg?: number;
  /** Optional progressions: targets 'radius' (copies step outward
   * along their own angle — spiral rosettes) and 'scale' (copies
   * scale about the centre). Both apply per copy index k; a
   * reflected partner shares its rotation's index. */
  progressions?: Progression[];
  /** Display only: the name of the Progressions outcome (Whorl,
   * Phyllotaxis) this configuration was filled from, so the panel
   * can re-display it. Never drives generation — the resolved
   * parameters above win on any conflict. */
  outcome?: string;
}

function polarTransforms(spec: PolarSpec): Affine[] {
  const out: Affine[] = [];
  const count = Math.max(1, Math.floor(spec.count));
  const step = spec.mode === 'degrees'
    ? (typeof spec.stepDeg === 'number' && Number.isFinite(spec.stepDeg) ? spec.stepDeg : 360 / count)
    : 360 / count;
  const radiusProg = findProgression(spec.progressions, 'radius');
  const scaleProg = findProgression(spec.progressions, 'scale');
  const modulate = (t: Affine, k: number, angleDeg: number): Affine => {
    let result = t;
    if (scaleProg) result = composeAffine(scaleAbout(spec.center, progressionValue(scaleProg, k)), result);
    if (radiusProg) {
      const r = progressionValue(radiusProg, k);
      const rad = (angleDeg * Math.PI) / 180;
      result = composeAffine(translation(r * Math.cos(rad), r * Math.sin(rad)), result);
    }
    return result;
  };
  for (let k = 0; k < count; k++) {
    const rot = rotationAbout(spec.center, step * k);
    out.push(modulate(rot, k, step * k));
    if (spec.reflect) {
      // Reflect across the vertical line through the centre.
      const flip: Affine = {
        a: -1, b: 0, c: 0, d: 1,
        tx: 2 * spec.center.x, ty: 0,
      };
      out.push(modulate(composeAffine(rot, flip), k, step * k));
    }
  }
  return withMotifOffset(out, spec.center, spec.motifOffsetDeg);
}

// ----------------------------------------------------------------
// Progressions (Slice 10, Amendment C): per-copy sequences stored
// on the descriptor as structured data — {target, kind, start,
// step}; arithmetic evaluates start + i·step, geometric start ·
// step^i, per copy index i. The family generator produces base
// transforms; the progression modulates its target parameter per
// copy before the transform set is finalised, so live preview and
// apply agree by construction. Wallpaper and frieze descriptors
// carry NO progressions: per-copy variation would break the group.

export interface Progression {
  /** Family-specific target id: polar 'radius' | 'scale',
   * alongStroke 'gap'. */
  target: string;
  kind: 'arithmetic' | 'geometric';
  start: number;
  /** Difference (arithmetic) or ratio (geometric). */
  step: number;
}

export function progressionValue(progression: Progression, index: number): number {
  return progression.kind === 'arithmetic'
    ? progression.start + index * progression.step
    : progression.start * Math.pow(progression.step, index);
}

export function findProgression(list: Progression[] | undefined, target: string): Progression | undefined {
  return list?.find((p) => p.target === target);
}

function scaleAbout(center: Vec2, factor: number): Affine {
  return {
    a: factor, b: 0, c: 0, d: factor,
    tx: center.x * (1 - factor), ty: center.y * (1 - factor),
  };
}

// ----------------------------------------------------------------
// Named outcomes (Slice 10, Amendment D): Whorl and Phyllotaxis are
// NOT families. They are configurations of the polar family plus a
// progression block: polar in degrees mode (the step IS the
// divergence angle), a 'radius' progression (arithmetic growth =
// Archimedean spiral, geometric = logarithmic), and a count.
// Phyllotaxis is the same configuration at the golden angle with
// geometric growth. The panel lists the outcomes in its
// Progressions section; choosing one fills the polar + progression
// fields, which stay the single source of truth — the descriptor
// stores the resolved parameters (and may carry the outcome's name
// for display only; parameters win on any conflict).

export const GOLDEN_ANGLE_DEG = 137.50776405003785;

export interface RepeatOutcome {
  id: string;
  label: string;
  /** Polar step in degrees (the divergence angle). */
  stepDeg: number;
  count: number;
  /** The 'radius' progression: value at index k is copy k's
   * distance from the centre. */
  growth: { kind: 'arithmetic' | 'geometric'; start: number; step: number };
  /** Optional 'scale' progression (Size). */
  scale: { kind: 'arithmetic' | 'geometric'; start: number; step: number } | null;
}

export const REPEAT_OUTCOMES: RepeatOutcome[] = [
  {
    id: 'whorl',
    label: 'Whorl',
    stepDeg: 30,
    count: 24,
    growth: { kind: 'arithmetic', start: 0, step: 8 },
    scale: null,
  },
  {
    id: 'phyllotaxis',
    label: 'Phyllotaxis',
    stepDeg: GOLDEN_ANGLE_DEG,
    count: 48,
    growth: { kind: 'geometric', start: 3, step: 1.16 },
    scale: null,
  },
];

export function repeatOutcome(id: string): RepeatOutcome | null {
  return REPEAT_OUTCOMES.find((outcome) => outcome.id === id) ?? null;
}

// ----------------------------------------------------------------
// Path-following repeats (Tier Three, Slice 10b). These two families
// are driven by a sampled guide polyline (world coordinates, dense
// enough to walk by arc length) plus the pivot the copies travel by
// (the source item's centre at build time).

export type StationMode = 'division' | 'spacing' | 'progression';

/** Arc-length stations along a polyline, by the stored mode:
 * 'division' puts `count` stations at equal fractions of the total
 * length; 'spacing' puts one every `spacing` units; 'progression'
 * walks cumulative gaps from the descriptor's 'gap' progression
 * (gap i separates station i from station i+1). Station 0 sits at
 * the first point. Exported for tests. */
export function polylineStations(
  points: Vec2[], closed: boolean, mode: StationMode, count: number, spacing: number,
  gapProgression?: Progression,
): Array<{ point: Vec2; angleDeg: number }> {
  if (points.length < 2) return [];
  const legs: Array<{ from: Vec2; to: Vec2; len: number }> = [];
  const legCount = closed ? points.length : points.length - 1;
  let total = 0;
  for (let i = 0; i < legCount; i++) {
    const from = points[i];
    const to = points[(i + 1) % points.length];
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    if (len < 1e-9) continue;
    legs.push({ from, to, len });
    total += len;
  }
  if (!legs.length || !(total > 0)) return [];
  const offsets: number[] = [];
  if (mode === 'progression' && gapProgression) {
    let at = 0;
    offsets.push(0);
    for (let k = 0; k < 400 && at < total; k++) {
      const gap = progressionValue(gapProgression, k);
      if (!(gap > 0)) break;
      at += gap;
      if (at < total) offsets.push(at);
    }
  } else if (mode === 'spacing' && spacing > 0) {
    const n = Math.max(1, Math.floor(total / spacing));
    for (let k = 0; k < n; k++) offsets.push(k * spacing);
  } else {
    const n = Math.max(1, Math.floor(count));
    for (let k = 0; k < n; k++) offsets.push((total * k) / n);
  }
  const at = (offset: number): { point: Vec2; angleDeg: number } => {
    let rest = ((offset % total) + total) % total;
    for (const leg of legs) {
      if (rest <= leg.len || leg === legs[legs.length - 1]) {
        const t = leg.len > 0 ? Math.min(1, rest / leg.len) : 0;
        return {
          point: { x: leg.from.x + (leg.to.x - leg.from.x) * t, y: leg.from.y + (leg.to.y - leg.from.y) * t },
          angleDeg: (Math.atan2(leg.to.y - leg.from.y, leg.to.x - leg.from.x) * 180) / Math.PI,
        };
      }
      rest -= leg.len;
    }
    const last = legs[legs.length - 1];
    return { point: { ...last.to }, angleDeg: (Math.atan2(last.to.y - last.from.y, last.to.x - last.from.x) * 180) / Math.PI };
  };
  return offsets.map(at);
}

export interface AlongStrokeSpec {
  family: 'alongStroke';
  /** Sampled guide path (world coordinates). */
  guide: Vec2[];
  closed: boolean;
  /** How stations are chosen — stored in the descriptor like the
   * polar mode: 'division' = `count` equal stations, 'spacing' =
   * one every `spacing` units, 'progression' = cumulative gaps
   * from the 'gap' progression. Absent: spacing > 0 means spacing. */
  stationMode?: StationMode;
  /** Station count for 'division' mode. */
  count: number;
  /** Station distance for 'spacing' mode. */
  spacing: number;
  /** The source point placed on each station (its centre). */
  pivot: Vec2;
  /** Rotate copies to the guide tangent at their station. */
  alignToTangent: boolean;
  /** Copy orientation offset in degrees, added on top of the
   * tangent angle (or applied alone when not aligning). */
  orientationOffsetDeg?: number;
  /** Optional progressions: target 'gap' (station mode
   * 'progression'). */
  progressions?: Progression[];
}

function alongStrokeTransforms(spec: AlongStrokeSpec): Affine[] {
  const mode: StationMode = spec.stationMode ?? (spec.spacing > 0 ? 'spacing' : 'division');
  const offset = spec.orientationOffsetDeg ?? 0;
  const gapProg = findProgression(spec.progressions, 'gap');
  return polylineStations(spec.guide, spec.closed, mode, spec.count, spec.spacing, gapProg).map((station) => {
    const move = translation(station.point.x - spec.pivot.x, station.point.y - spec.pivot.y);
    const degrees = (spec.alignToTangent ? station.angleDeg : 0) + offset;
    if (!degrees) return move;
    const theta = (degrees * Math.PI) / 180;
    const spun = composeAffine(
      translation(station.point.x, station.point.y),
      composeAffine(
        { a: Math.cos(theta), b: Math.sin(theta), c: -Math.sin(theta), d: Math.cos(theta), tx: 0, ty: 0 },
        translation(-station.point.x, -station.point.y),
      ),
    );
    return composeAffine(spun, move);
  });
}

export interface NormalsReflectorSpec {
  family: 'normals';
  /** Sampled path (world coordinates) whose tangent lines mirror. */
  guide: Vec2[];
  closed: boolean;
  /** Number of mirror stations along the path. */
  stations: number;
  /** The source's centre at build time, kept for parity with the
   * along-stroke descriptor. The reflections themselves are
   * absolute (across each station's tangent line) and do not
   * depend on it. */
  pivot: Vec2;
}

/**
 * Normals reflector, defined precisely: station the guide path at
 * `stations` points spaced evenly by arc length; at each station
 * take the guide's TANGENT LINE (the line through the station along
 * the path direction — the line the local normal is perpendicular
 * to). Each copy is the source reflected across one station's
 * tangent line, so copies land on alternating sides of the path,
 * the way FM's normals reflector fans a stroke around itself. The
 * reflection of a point set across a line through P with unit
 * direction u is x -> P + (2 u uᵀ - I)(x - P); the pivot is carried
 * along so tests can track the source centre's image exactly.
 */
function normalsReflectorTransforms(spec: NormalsReflectorSpec): Affine[] {
  return polylineStations(spec.guide, spec.closed, 'division', spec.stations, 0).map((station) => {
    const theta = (station.angleDeg * Math.PI) / 180;
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    const a = 2 * ux * ux - 1;
    const b = 2 * ux * uy;
    const c = b;
    const d = 2 * uy * uy - 1;
    const p = station.point;
    return {
      a, b, c, d,
      tx: p.x - (a * p.x + c * p.y),
      ty: p.y - (b * p.x + d * p.y),
    };
  });
}

// ----------------------------------------------------------------

export type SymmetryRepeatSpec = WallpaperSpec | FriezeSpec | PolarSpec
  | AlongStrokeSpec | NormalsReflectorSpec;

export type RepeatFamilyName = SymmetryRepeatSpec['family'];

/** Every copy transform for a repeat spec, identity included
 * (callers skip the identity — the source already sits there). */
export function symmetryTransforms(spec: SymmetryRepeatSpec): Affine[] {
  switch (spec.family) {
    case 'wallpaper': return wallpaperTransforms(spec);
    case 'frieze': return friezeTransforms(spec);
    case 'polar': return polarTransforms(spec);
    case 'alongStroke': return alongStrokeTransforms(spec);
    case 'normals': return normalsReflectorTransforms(spec);
  }
}

/** Transforms with the identity removed. */
export function copyTransforms(spec: SymmetryRepeatSpec): Affine[] {
  return symmetryTransforms(spec).filter((t) => !isIdentityAffine(t));
}
