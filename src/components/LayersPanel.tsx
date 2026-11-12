// Layers & Objects. The titlebar keeps the active layer and a preview;
// this panel is the flyout: create, rename, reorder, and delete layers,
// and hide, lock, fade, and select every object on the page.
import { useState, type ReactNode } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import { layerLocked, layerOpacity, layerVisible, type LayerRecord } from '../engine/document/layerModel';
import NumericStepper from './NumericStepper';

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <Glyph>
      <path d="M1.5 8s2.3-4 6.5-4 6.5 4 6.5 4-2.3 4-6.5 4-6.5-4-6.5-4z" />
      <circle cx="8" cy="8" r="1.7" />
      {open ? null : <path d="M3 3.2 L13 12.8" />}
    </Glyph>
  );
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <Glyph>
      <rect x="3.4" y="7.2" width="9.2" height="6.2" rx="1" />
      {locked
        ? <path d="M5.4 7.2 V5.1 a2.6 2.6 0 0 1 5.2 0 V7.2" />
        : <path d="M5.4 7.2 V5.1 a2.6 2.6 0 0 1 5.2 0" />}
    </Glyph>
  );
}

function activeListing(engine: NibGliderEngine) {
  const listing = engine.objectListing();
  const activeId = engine.activeLayerId();
  const active = listing.find((layer) => layer.record.id === activeId) ?? listing[0] ?? null;
  const objects = listing.reduce(
    (count, layer) => count + layer.rows.filter((row) => row.depth === 0).length,
    0,
  );
  return { listing, active, objects };
}

/** Compact stack drawn in the titlebar well and at the top of the flyout. */
export function LayersPreview({
  engine,
  compact = false,
}: {
  engine: NibGliderEngine;
  compact?: boolean;
}) {
  const { active, objects } = activeListing(engine);
  const hidden = active ? !layerVisible(active.record) : false;
  const label = compact
    ? (objects === 0 ? 'Empty' : String(objects))
    : (active?.record.name ?? 'Layers');
  return (
    <span className="combine-preview-wrap" aria-hidden="true" style={hidden ? { opacity: 0.4 } : undefined}>
      <svg
        className="combine-preview"
        viewBox="0 0 64 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      >
        <path d="M32 5 L50 12 L32 19 L14 12 Z" />
        <path d="M14 16 L32 23 L50 16" />
        <path d="M14 20 L32 27 L50 20" />
      </svg>
      <span className="combine-preview-label">{label}</span>
    </span>
  );
}

/** Show / lock for whichever layer is active, kept on the titlebar. */
export function LayersQuickControls({ engine }: { engine: NibGliderEngine }) {
  const { active } = activeListing(engine);
  if (!active) return null;
  const record = active.record;
  const visible = layerVisible(record);
  const locked = layerLocked(record);
  return (
    <div className="seg-ctrl" role="group" aria-label="Active layer">
      <button
        type="button"
        title={visible ? 'Hide layer' : 'Show layer'}
        aria-label={visible ? 'Hide active layer' : 'Show active layer'}
        aria-pressed={visible}
        className={visible ? 'active' : undefined}
        onClick={() => engine.setLayerVisible(record.id, !visible)}
      >
        <EyeIcon open={visible} />
      </button>
      <button
        type="button"
        title={locked ? 'Unlock layer' : 'Lock layer'}
        aria-label={locked ? 'Unlock active layer' : 'Lock active layer'}
        aria-pressed={locked}
        className={locked ? 'active' : undefined}
        onClick={() => engine.setLayerLocked(record.id, !locked)}
      >
        <LockIcon locked={locked} />
      </button>
    </div>
  );
}

function OpacityField({
  value,
  label,
  onCommit,
}: {
  value: number;
  label: string;
  onCommit: (fraction: number) => void;
}) {
  return (
    <NumericStepper
      size="compact"
      value={Math.round(value * 100)}
      min={0}
      max={100}
      step={5}
      unit="%"
      ariaLabel={label}
      title={label}
      onCommit={(n) => onCommit(n / 100)}
    />
  );
}

export default function LayersPanel({ engine }: { engine: NibGliderEngine }) {
  const { listing, active } = activeListing(engine);
  const activeId = active?.record.id ?? null;
  const selectedKeys = new Set(engine.selectedItems.map((item) => String(item.id)));
  const [renameKey, setRenameKey] = useState<string | null>(null);
  const [renameLayerId, setRenameLayerId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const beginRename = (id: string, name: string, kind: 'layer' | 'object') => {
    setDraft(name);
    if (kind === 'layer') {
      setRenameLayerId(id);
      setRenameKey(null);
    } else {
      setRenameKey(id);
      setRenameLayerId(null);
    }
  };

  return (
    <div className="layers-panel">
      <div className="layers-panel-actions">
        <button type="button" className="layers-action" onClick={() => engine.createLayer()}>
          <Glyph>
            <path d="M8 3 V13" />
            <path d="M3 8 H13" />
          </Glyph>
          New layer
        </button>
      </div>
      {listing.map(({ record, rows }) => (
        <LayerCard
          key={record.id}
          engine={engine}
          record={record}
          rows={rows}
          active={record.id === activeId}
          canDelete={listing.length > 1}
          selectedKeys={selectedKeys}
          renameLayerId={renameLayerId}
          renameKey={renameKey}
          draft={draft}
          collapsedGroups={collapsedGroups}
          onDraft={setDraft}
          onBeginRename={beginRename}
          onEndRename={() => { setRenameLayerId(null); setRenameKey(null); }}
          onToggleGroup={toggleGroup}
        />
      ))}
    </div>
  );
}

function LayerCard({
  engine,
  record,
  rows,
  active,
  canDelete,
  selectedKeys,
  renameLayerId,
  renameKey,
  draft,
  collapsedGroups,
  onDraft,
  onBeginRename,
  onEndRename,
  onToggleGroup,
}: {
  engine: NibGliderEngine;
  record: LayerRecord;
  rows: ReturnType<NibGliderEngine['objectListing']>[number]['rows'];
  active: boolean;
  canDelete: boolean;
  selectedKeys: Set<string>;
  renameLayerId: string | null;
  renameKey: string | null;
  draft: string;
  collapsedGroups: ReadonlySet<string>;
  onDraft: (value: string) => void;
  onBeginRename: (id: string, name: string, kind: 'layer' | 'object') => void;
  onEndRename: () => void;
  onToggleGroup: (key: string) => void;
}) {
  const visible = layerVisible(record);
  const locked = layerLocked(record);
  const out: ReactNode[] = [];
  let hiddenDepth: number | null = null;
  for (const row of rows) {
    if (hiddenDepth !== null && row.depth > hiddenDepth) continue;
    hiddenDepth = null;
    out.push(
      <div
        key={row.key}
        className={`layers-object-row${selectedKeys.has(row.key) ? ' is-selected' : ''}${row.visible ? '' : ' is-hidden'}`}
        style={{ paddingLeft: `${8 + row.depth * 14}px` }}
        onClick={() => engine.selectObjectByKey(row.key)}
      >
        {row.group ? (
          <button
            type="button"
            className="layers-group-toggle"
            title={collapsedGroups.has(row.key) ? 'Expand group' : 'Collapse group'}
            aria-expanded={!collapsedGroups.has(row.key)}
            onClick={(e) => { e.stopPropagation(); onToggleGroup(row.key); }}
          >
            <Glyph>
              {collapsedGroups.has(row.key)
                ? <path d="M6 3.5 L11 8 L6 12.5" />
                : <path d="M3.5 6 L8 11 L12.5 6" />}
            </Glyph>
          </button>
        ) : (
          <span className="layers-kind" aria-hidden="true">{row.kindLabel.slice(0, 1)}</span>
        )}
        {renameKey === row.key ? (
          <input
            className="layers-name-input"
            autoFocus
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => { engine.renameObjectByKey(row.key, draft); onEndRename(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            aria-label="Object name"
          />
        ) : (
          <span
            className="layers-object-name"
            onDoubleClick={(e) => {
              e.stopPropagation();
              onBeginRename(row.key, row.autoNamed ? '' : row.name, 'object');
            }}
            title={`${row.kindLabel} — double-click to rename`}
          >
            {row.name}
          </span>
        )}
        <span className="layers-object-controls" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            title={row.visible ? 'Hide object' : 'Show object'}
            aria-pressed={row.visible}
            onClick={() => engine.setObjectVisibleByKey(row.key, !row.visible)}
          >
            <EyeIcon open={row.visible} />
          </button>
          <button
            type="button"
            title={row.locked ? 'Unlock object' : 'Lock object'}
            aria-pressed={row.locked}
            onClick={() => engine.setObjectLockedByKey(row.key, !row.locked)}
          >
            <LockIcon locked={row.locked} />
          </button>
          <OpacityField
            value={row.opacity}
            label={`Opacity for ${row.name}`}
            onCommit={(fraction) => engine.setObjectOpacityByKey(row.key, fraction)}
          />
        </span>
      </div>,
    );
    if (row.group && collapsedGroups.has(row.key)) hiddenDepth = row.depth;
  }

  return (
    <div className={`layers-layer${active ? ' is-active' : ''}${visible ? '' : ' is-hidden'}`}>
      <div
        className={`layers-layer-row${active ? ' is-active' : ''}`}
        onClick={() => engine.setActiveLayer(record.id)}
      >
        {renameLayerId === record.id ? (
          <input
            className="layers-name-input"
            autoFocus
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => { engine.renameLayer(record.id, draft); onEndRename(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            aria-label="Layer name"
          />
        ) : (
          <span
            className="layers-layer-name"
            onDoubleClick={(e) => {
              e.stopPropagation();
              onBeginRename(record.id, record.name, 'layer');
            }}
            title="Double-click to rename; click to make active"
          >
            {record.name}
          </span>
        )}
        <span className="layers-layer-buttons">
          <button
            type="button"
            title={visible ? 'Hide layer' : 'Show layer'}
            aria-pressed={visible}
            onClick={(e) => { e.stopPropagation(); engine.setLayerVisible(record.id, !visible); }}
          >
            <EyeIcon open={visible} />
          </button>
          <button
            type="button"
            title={locked ? 'Unlock layer' : 'Lock layer'}
            aria-pressed={locked}
            onClick={(e) => { e.stopPropagation(); engine.setLayerLocked(record.id, !locked); }}
          >
            <LockIcon locked={locked} />
          </button>
          <OpacityField
            value={layerOpacity(record)}
            label="Layer opacity percent"
            onCommit={(fraction) => engine.setLayerOpacity(record.id, fraction)}
          />
          <button
            type="button"
            title="Move layer up"
            onClick={(e) => { e.stopPropagation(); engine.moveLayer(record.id, 'up'); }}
          >
            <Glyph><path d="M4 10 L8 5.5 L12 10" /></Glyph>
          </button>
          <button
            type="button"
            title="Move layer down"
            onClick={(e) => { e.stopPropagation(); engine.moveLayer(record.id, 'down'); }}
          >
            <Glyph><path d="M4 6 L8 10.5 L12 6" /></Glyph>
          </button>
          <button
            type="button"
            title="Delete layer and its objects"
            disabled={!canDelete}
            onClick={(e) => { e.stopPropagation(); engine.deleteLayer(record.id); }}
          >
            <Glyph>
              <path d="M4 4.5 H12" />
              <path d="M6.2 4.5 V3.4 H9.8 V4.5" />
              <path d="M5 6.2 L5.6 13 H10.4 L11 6.2" />
            </Glyph>
          </button>
        </span>
      </div>
      {out}
      {rows.length === 0 ? <div className="layers-empty">No objects</div> : null}
    </div>
  );
}
