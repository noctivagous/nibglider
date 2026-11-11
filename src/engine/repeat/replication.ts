// Retained replication records (Tier Three, Slice 10, revised).
//
// There is one repeat engine: a symmetry descriptor {family,
// group/parameters, source} -> transform set (symmetry.ts). When a
// live-armed draw deposits, or a selection-level repeat is applied,
// the source item stores THE DESCRIPTOR ITSELF as its replication
// record — in its Paper item data, and mirrored onto its NGDrawable
// record when the item is catalog-bound, so the record is part of
// the native document model. Copies carry only the source's key
// (item data `replicationOf`). Regenerate replays the descriptor
// (or a fresh panel-built descriptor of the same family) to rebuild
// the copies; Expand deletes the record and the copies stay as
// ordinary items.
import type { SymmetryRepeatSpec } from './symmetry';

export interface ReplicationRecord {
  version: 2;
  spec: SymmetryRepeatSpec;
}

function isVec(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.x === 'number' && Number.isFinite(v.x)
    && typeof v.y === 'number' && Number.isFinite(v.y);
}

function isVecList(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 2 && value.every(isVec);
}

function isNum(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value as number);
}

const PROGRESSION_TARGETS: Record<string, string[]> = {
  polar: ['radius', 'scale'],
  alongStroke: ['gap'],
};

/** Progressions exist only on polar/alongStroke descriptors
 * (Amendment C: per-copy variation would break wallpaper/frieze
 * groups, so their presence there is invalid, not ignored). */
function isProgressions(value: unknown, family: string): boolean {
  if (value === undefined) return true;
  const targets = PROGRESSION_TARGETS[family];
  if (!targets || !Array.isArray(value)) return false;
  const seen = new Set<string>();
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const p = entry as Record<string, unknown>;
    if (!targets.includes(p.target as string) || seen.has(p.target as string)) return false;
    seen.add(p.target as string);
    return (p.kind === 'arithmetic' || p.kind === 'geometric')
      && isNum(p.start) && isNum(p.step)
      && Object.keys(p).every((k) => ['target', 'kind', 'start', 'step'].includes(k));
  });
}

/** Structural validation for a stored symmetry descriptor. Ranges
 * are checked where the generators rely on them; unknown families
 * and malformed parameters are rejected, never repaired. */
export function isSymmetrySpec(value: unknown): value is SymmetryRepeatSpec {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as Record<string, unknown>;
  switch (s.family) {
    case 'wallpaper':
      return typeof s.group === 'string'
        && isVec(s.origin) && isVec(s.basisA) && isVec(s.basisB)
        && isNum(s.cols) && isNum(s.rows)
        && (s.motifOffsetDeg === undefined || isNum(s.motifOffsetDeg))
        && isProgressions(s.progressions, 'wallpaper');
    case 'frieze':
      return typeof s.group === 'string'
        && isVec(s.origin) && isVec(s.step) && isNum(s.count)
        && (s.motifOffsetDeg === undefined || isNum(s.motifOffsetDeg))
        && isProgressions(s.progressions, 'frieze');
    case 'polar':
      return isVec(s.center) && isNum(s.count) && typeof s.reflect === 'boolean'
        && (s.mode === undefined || s.mode === 'division' || s.mode === 'degrees')
        && (s.stepDeg === undefined || isNum(s.stepDeg))
        && (s.motifOffsetDeg === undefined || isNum(s.motifOffsetDeg))
        && (s.outcome === undefined || typeof s.outcome === 'string')
        && isProgressions(s.progressions, 'polar');
    case 'alongStroke':
      return isVecList(s.guide) && typeof s.closed === 'boolean'
        && isNum(s.count) && isNum(s.spacing) && isVec(s.pivot)
        && typeof s.alignToTangent === 'boolean'
        && (s.stationMode === undefined || s.stationMode === 'division' || s.stationMode === 'spacing' || s.stationMode === 'progression')
        && (s.orientationOffsetDeg === undefined || isNum(s.orientationOffsetDeg))
        && isProgressions(s.progressions, 'alongStroke');
    case 'normals':
      return isVecList(s.guide) && typeof s.closed === 'boolean'
        && isNum(s.stations) && isVec(s.pivot);
    default:
      return false;
  }
}

export function isReplicationRecord(value: unknown): value is ReplicationRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return r.version === 2 && isSymmetrySpec(r.spec)
    && Object.keys(r).every((k) => k === 'version' || k === 'spec');
}
