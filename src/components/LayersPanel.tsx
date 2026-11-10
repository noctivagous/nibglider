// Layers & Objects panel section body.
// Lists the document's layers (top of stack first) and every object
// in them from engine.objectListing(). Rows select their object on
// click (activating its layer), rename on double-click, and carry
// visible / locked / opacity controls wired to the engine's
// per-object setters — the NGDrawable fields the model has always
// carried, applied to the live Paper items. Layer rows create,
// delete, rename, reorder and activate layers. Group children are
// indented under their group with an expand/collapse toggle.
import { useState } from 'react';
import type { NibGliderEngine } from '../engine/engine';

export default function LayersPanel({ engine }: { engine: NibGliderEngine }) {
  const listing = engine.objectListing();
  const activeId = engine.activeLayerId();
  const selectedKeys = new Set(engine.selectedItems.map((item) => String(item.id)));
  const [renameKey, setRenameKey] = useState<string | null>(null);
  const [renameLayerId, setRenameLayerId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="layers-panel">
      <div className="layers-panel-actions">
        <button type="button" onClick={() => engine.createLayer()}>New layer</button>
      </div>
      {listing.map(({ record, rows }) => (
        <div key={record.id} className="layers-layer">
          <div
            className={`layers-layer-row${record.id === activeId ? ' is-active' : ''}`}
            onClick={() => engine.setActiveLayer(record.id)}
          >
            {renameLayerId === record.id ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => { engine.renameLayer(record.id, draft); setRenameLayerId(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                aria-label="Layer name"
              />
            ) : (
              <span
                className="layers-layer-name"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setDraft(record.name);
                  setRenameLayerId(record.id);
                }}
                title="Double-click to rename; click to make active"
              >
                {record.name}
              </span>
            )}
            <span className="layers-layer-buttons">
              <button type="button" title="Move layer up" onClick={(e) => { e.stopPropagation(); engine.moveLayer(record.id, 'up'); }}>↑</button>
              <button type="button" title="Move layer down" onClick={(e) => { e.stopPropagation(); engine.moveLayer(record.id, 'down'); }}>↓</button>
              <button
                type="button"
                title="Delete layer and its objects"
                disabled={listing.length <= 1}
                onClick={(e) => { e.stopPropagation(); engine.deleteLayer(record.id); }}
              >
                ✕
              </button>
            </span>
          </div>
          {(() => {
            const out: React.ReactNode[] = [];
            let hiddenDepth: number | null = null;
            for (const row of rows) {
              if (hiddenDepth !== null && row.depth > hiddenDepth) continue;
              hiddenDepth = null;
              out.push(
                <div
                  key={row.key}
                  className={`layers-object-row${selectedKeys.has(row.key) ? ' is-selected' : ''}`}
                  style={{ paddingLeft: `${8 + row.depth * 14}px` }}
                  onClick={() => engine.selectObjectByKey(row.key)}
                >
                  {row.group ? (
                    <button
                      type="button"
                      className="layers-group-toggle"
                      title={collapsedGroups.has(row.key) ? 'Expand group' : 'Collapse group'}
                      onClick={(e) => { e.stopPropagation(); toggleGroup(row.key); }}
                    >
                      {collapsedGroups.has(row.key) ? '▸' : '▾'}
                    </button>
                  ) : null}
                  {renameKey === row.key ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => { engine.renameObjectByKey(row.key, draft); setRenameKey(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      aria-label="Object name"
                    />
                  ) : (
                    <span
                      className="layers-object-name"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setDraft(row.autoNamed ? '' : row.name);
                        setRenameKey(row.key);
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
                      {row.visible ? '◉' : '○'}
                    </button>
                    <button
                      type="button"
                      title={row.locked ? 'Unlock object' : 'Lock object'}
                      aria-pressed={row.locked}
                      onClick={() => engine.setObjectLockedByKey(row.key, !row.locked)}
                    >
                      {row.locked ? '🔒' : '🔓'}
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      value={Math.round(row.opacity * 100)}
                      title="Opacity %"
                      aria-label={`Opacity for ${row.name}`}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v)) engine.setObjectOpacityByKey(row.key, v / 100);
                      }}
                    />
                  </span>
                </div>,
              );
              if (row.group && collapsedGroups.has(row.key)) hiddenDepth = row.depth;
            }
            return out;
          })()}
          {rows.length === 0 ? <div className="layers-empty">No objects</div> : null}
        </div>
      ))}
    </div>
  );
}
