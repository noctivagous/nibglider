// Deterministic seeded gradient noise (Perlin-style), implemented
// in-repo for the Noise displacement operation (Slice 11). Pure
// functions of (seed, coordinate): the same seed and input always
// produce the same output, on every machine, with no dependency on
// Math.random or platform hash seeds.

/** Integer lattice hash -> [0, 1). A small integer mix (splitmix
 * finalizer) keyed by the seed and the lattice coordinate. */
function hash1(seed: number, i: number): number {
  let h = (seed | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (i | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Gradient at a 1D lattice point, in [-1, 1). */
function gradient1(seed: number, i: number): number {
  return hash1(seed, i) * 2 - 1;
}

/**
 * 1D gradient noise at x. Lattice gradients tilt the value toward
 * each neighbouring lattice point; smoothstep blends them. Output
 * is in roughly [-0.71, 0.71]; it is normalised by 1/0.71 so full
 * amplitude is reachable, then clamped to [-1, 1].
 */
export function noise1(seed: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const left = gradient1(seed, i) * f;
  const right = gradient1(seed, i + 1) * (f - 1);
  const v = lerp(left, right, fade(f)) / 0.71;
  return Math.max(-1, Math.min(1, v));
}

/** Fractal sum: octaves of noise1 at doubling frequencies and
 * halving weights. Deterministic for a given (seed, x, octaves). */
export function fbm1(seed: number, x: number, octaves = 3): number {
  let sum = 0;
  let weight = 1;
  let total = 0;
  let frequency = 1;
  for (let o = 0; o < Math.max(1, Math.floor(octaves)); o++) {
    sum += weight * noise1(seed + o * 1013, x * frequency);
    total += weight;
    weight *= 0.5;
    frequency *= 2.03;
  }
  return sum / total;
}
