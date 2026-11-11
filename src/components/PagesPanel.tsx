// Pages & Guides panel section body (Tier Two, Slice 5).
// Pages are distinct scenes: the list switches the active page and
// adds / duplicates / deletes / reorders pages through the engine.
// Guides belong to the active page: add one at an exact position,
// lock it, or delete it here; on canvas they are dragged from the
// rulers or grabbed directly. Page Setup (printer paper, margins,
// crop marks) is summarized with a button into its dialog.
import { useState } from 'react';
import type { NibGliderEngine } from '../engine/engine';

export default function PagesPanel({ engine, onPageSetup }: {
  engine: NibGliderEngine;
  onPageSetup?: () => void;
}) {
  const pages = engine.listPages();
  const guides = engine.listGuides();
  const setup = engine.getPrintSetup();
  const [renameId, setRenameId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [guideAxis, setGuideAxis] = useState<'x' | 'y'>('x');
  const [guidePos, setGuidePos] = useState('100');

  const active = pages.find((page) => page.active);

  return (
    <div className="pages-panel">
      <div className="pages-panel-actions">
        <button type="button" onClick={() => engine.addPage()}>Add page</button>
        <button
          type="button"
          disabled={!active}
          onClick={() => { if (active) engine.duplicatePage(active.id); }}
        >
          Duplicate
        </button>
        <button
          type="button"
          disabled={pages.length <= 1 || !active}
          onClick={() => { if (active) engine.deletePage(active.id); }}
        >
          Delete
        </button>
      </div>
      <ul className="pages-list">
        {pages.map((page, index) => (
          <li
            key={page.id}
            className={`pages-row${page.active ? ' is-active' : ''}`}
            onClick={() => engine.switchPage(page.id)}
            onDoubleClick={() => { setRenameId(page.id); setDraft(page.name); }}
          >
            {renameId === page.id ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => { engine.renamePage(page.id, draft); setRenameId(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                aria-label="Page name"
              />
            ) : (
              <span className="pages-name">{page.name}</span>
            )}
            <span className="pages-size">
              {page.widthPt !== null && page.heightPt !== null
                ? `${Math.round(page.widthPt)}×${Math.round(page.heightPt)} pt`
                : 'unbounded'}
            </span>
            <span className="pages-row-actions">
              <button
                type="button"
                disabled={index === 0}
                onClick={(e) => { e.stopPropagation(); engine.movePage(page.id, 'up'); }}
                aria-label={`Move ${page.name} up`}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === pages.length - 1}
                onClick={(e) => { e.stopPropagation(); engine.movePage(page.id, 'down'); }}
                aria-label={`Move ${page.name} down`}
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ul>

      <div className="pages-subhead">Guides (active page)</div>
      <div className="pages-guide-add">
        <select
          value={guideAxis}
          onChange={(e) => setGuideAxis(e.target.value as 'x' | 'y')}
          aria-label="Guide orientation"
        >
          <option value="x">Vertical (x)</option>
          <option value="y">Horizontal (y)</option>
        </select>
        <input
          type="number"
          value={guidePos}
          onChange={(e) => setGuidePos(e.target.value)}
          aria-label="Guide position in points"
        />
        <button
          type="button"
          onClick={() => {
            const position = Number(guidePos);
            if (Number.isFinite(position)) engine.addGuide(guideAxis, position);
          }}
        >
          Add guide
        </button>
        <button type="button" disabled={guides.length === 0} onClick={() => engine.clearGuides()}>
          Clear
        </button>
      </div>
      <ul className="pages-guides">
        {guides.map((guide) => (
          <li key={guide.id} className="pages-guide-row">
            <span>{guide.axis === 'x' ? 'Vertical' : 'Horizontal'} @ {Math.round(guide.position)} pt</span>
            <button
              type="button"
              onClick={() => engine.setGuideLocked(guide.id, !guide.locked)}
              aria-label={guide.locked ? 'Unlock guide' : 'Lock guide'}
            >
              {guide.locked ? 'Unlock' : 'Lock'}
            </button>
            <button type="button" onClick={() => engine.removeGuide(guide.id)}>Delete</button>
          </li>
        ))}
      </ul>

      <div className="pages-subhead">Page Setup</div>
      <div className="pages-setup-summary">
        {`${Math.round(setup.paperWidthPt)}×${Math.round(setup.paperHeightPt)} pt ${setup.orientation}`}
        {setup.cropMarks ? ' · crop marks' : ''}
        {setup.preview ? ' · preview on' : ''}
      </div>
      {onPageSetup && (
        <button type="button" onClick={onPageSetup}>Page Setup…</button>
      )}
    </div>
  );
}
