// Layer model: pure document-side layer and object-list logic.
// No Paper, React, or browser access: the engine (LayerManager) and
// the panel (LayersPanel) share these shapes and rules.
// Tested from tests/layers.test.mjs.

/** One document layer. Order in an array is bottom-to-top stacking.
 * The presentation state (Slice 20) is optional on the record:
 * absent means the defaults (visible, unlocked, full opacity), so
 * records written before it existed read unchanged. */
export interface LayerRecord {
  id: string;
  name: string;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
}

export function layerRecord(
  id: string,
  name: string,
  state?: { visible?: boolean; locked?: boolean; opacity?: number },
): LayerRecord {
  if (typeof id !== 'string' || id.length === 0) throw new Error('layer id must be non-empty');
  if (typeof name !== 'string' || name.trim().length === 0) throw new Error('layer name must be non-empty');
  return { id, name, ...(state ?? {}) };
}

export function layerVisible(record: LayerRecord): boolean {
  return record.visible !== false;
}

export function layerLocked(record: LayerRecord): boolean {
  return record.locked === true;
}

export function layerOpacity(record: LayerRecord): number {
  return typeof record.opacity === 'number' && Number.isFinite(record.opacity)
    ? Math.min(1, Math.max(0, record.opacity))
    : 1;
}

/** Name for the next created layer, given the layers already present. */
export function nextLayerName(records: readonly LayerRecord[]): string {
  return `Layer ${records.length + 1}`;
}

/** Move one layer one step in the stack: 'up' = nearer the top. */
export function moveLayer(records: readonly LayerRecord[], id: string, dir: 'up' | 'down'): LayerRecord[] {
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) return [...records];
  const next = [...records];
  const swap = dir === 'up' ? index + 1 : index - 1;
  if (swap < 0 || swap >= next.length) return next;
  [next[index], next[swap]] = [next[swap], next[index]];
  return next;
}

/**
 * One-step reorder of a set of ids inside a full stacking order
 * (bottom-to-top). Each moving id swaps with its next non-moving
 * neighbour in the given direction; moving ids keep their relative
 * order. Non-moving ids never cross each other.
 */
export function stepOrderedIds(
  ids: readonly string[],
  moving: ReadonlySet<string>,
  dir: 'forward' | 'backward',
): string[] {
  const next = [...ids];
  if (dir === 'forward') {
    for (let i = next.length - 2; i >= 0; i -= 1) {
      if (moving.has(next[i]) && !moving.has(next[i + 1])) {
        [next[i], next[i + 1]] = [next[i + 1], next[i]];
      }
    }
  } else {
    for (let i = 1; i < next.length; i += 1) {
      if (moving.has(next[i]) && !moving.has(next[i - 1])) {
        [next[i], next[i - 1]] = [next[i - 1], next[i]];
      }
    }
  }
  return next;
}

/** One object (or group child) as the Layers & Objects panel lists it. */
export interface ObjectRow {
  /** Stable identity for selection: the Paper item's id string. */
  key: string;
  /** Display name; `autoNamed` when derived from the kind. */
  name: string;
  autoNamed: boolean;
  kindLabel: string;
  /** 0 for top-level objects, 1+ for group children. */
  depth: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  /** True when this row has children listed beneath it. */
  group: boolean;
  /** Paper layer record id the object belongs to. */
  layerId: string;
}

export interface ListingObjectInput {
  key: string;
  name?: string;
  kindLabel: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  children?: ListingObjectInput[];
}

export interface ListingLayerInput {
  record: LayerRecord;
  objects: ListingObjectInput[];
}

export interface LayerListing {
  record: LayerRecord;
  rows: ObjectRow[];
}

/**
 * Flatten layers and their objects into display rows, top of the
 * stack first within each layer, and layers top-first overall.
 * Unnamed objects get a stable auto-name per kind in document
 * order ("Path 2", "Text 1"): the count runs over the whole
 * document, so a name never changes when a layer is renamed or
 * reordered — only when an unnamed object of the same kind is
 * added above it. Group children follow their group row.
 */
export function buildLayerListing(layers: readonly ListingLayerInput[]): LayerListing[] {
  const counters = new Map<string, number>();
  const flatten = (input: ListingObjectInput, depth: number, layerId: string): ObjectRow[] => {
    const named = typeof input.name === 'string' && input.name.trim().length > 0;
    const ordinal = (counters.get(input.kindLabel) ?? 0) + 1;
    counters.set(input.kindLabel, ordinal);
    const row: ObjectRow = {
      key: input.key,
      name: named ? (input.name as string) : `${input.kindLabel} ${ordinal}`,
      autoNamed: !named,
      kindLabel: input.kindLabel,
      depth,
      visible: input.visible,
      locked: input.locked,
      opacity: Number.isFinite(input.opacity) ? input.opacity : 1,
      group: (input.children?.length ?? 0) > 0,
      layerId,
    };
    const children = (input.children ?? []).flatMap((child) => flatten(child, depth + 1, layerId));
    return [row, ...children];
  };
  // Count in bottom-to-top document order so ordinals are stable and
  // read in the order the drawing was built; rows display reversed.
  const counted: LayerListing[] = layers.map((layer) => ({
    record: layer.record,
    rows: layer.objects.flatMap((obj) => flatten(obj, 0, layer.record.id)),
  }));
  return [...counted].reverse().map((layer) => ({ ...layer, rows: [...layer.rows].reverse() }));
}
