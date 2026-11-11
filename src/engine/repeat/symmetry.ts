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
  cols: number;
  rows: number;
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
  return out;
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
  count: number;
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
  return out;
}

// ----------------------------------------------------------------
// Polar repeats

export interface PolarSpec {
  family: 'polar';
  center: Vec2;
  count: number;
  reflect: boolean;
}

function polarTransforms(spec: PolarSpec): Affine[] {
  const out: Affine[] = [];
  const count = Math.max(1, Math.floor(spec.count));
  for (let k = 0; k < count; k++) {
    const rot = rotationAbout(spec.center, (360 / count) * k);
    out.push(rot);
    if (spec.reflect) {
      // Reflect across the vertical line through the centre.
      const flip: Affine = {
        a: -1, b: 0, c: 0, d: 1,
        tx: 2 * spec.center.x, ty: 0,
      };
      out.push(composeAffine(rot, flip));
    }
  }
  return out;
}

// ----------------------------------------------------------------

export type SymmetryRepeatSpec = WallpaperSpec | FriezeSpec | PolarSpec;

export type RepeatFamilyName = SymmetryRepeatSpec['family'];

/** Every copy transform for a repeat spec, identity included
 * (callers skip the identity — the source already sits there). */
export function symmetryTransforms(spec: SymmetryRepeatSpec): Affine[] {
  switch (spec.family) {
    case 'wallpaper': return wallpaperTransforms(spec);
    case 'frieze': return friezeTransforms(spec);
    case 'polar': return polarTransforms(spec);
  }
}

/** Transforms with the identity removed. */
export function copyTransforms(spec: SymmetryRepeatSpec): Affine[] {
  return symmetryTransforms(spec).filter((t) => !isIdentityAffine(t));
}
