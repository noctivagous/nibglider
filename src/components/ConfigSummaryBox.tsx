// Config summary box widget: read-only icon/layout summary of everything
// the next drawn path will do (stroke + fill), mounted in the panel-side
// rail slot where the vertical menu-rail cards used to live.
// With a selection it reflects the selected path (first selected item,
// matching the Stroke/Fill sections); otherwise it reflects the globals.
// Header carries the document name in the upper left. DOM/SVG only — it
// never creates Paper.js scene items, so it cannot be selected or printed.
import { useId, useSyncExternalStore } from 'react';
import {
  formatZoomPercent,
  resolveLiveMeasure,
  resolveSummaryState,
  type SummaryGlobals,
} from '../ui/ConfigSummary';
import type { SelectionPaint } from '../engine/appearance/StyleManager';
import type { NibGliderEngine } from '../engine/engine';
import CustomSelect, { type CustomSelectOption } from './CustomSelect';

// Small legend glyph (Adobe CS-style: small, currentColor).
function Glyph({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <svg
      className="cfg-glyph"
      viewBox="0 0 16 14"
      width="14"
      height="12"
      role="img"
      aria-label={label}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function StrokeGlyph() {
  return (
    <Glyph label="Stroke">
      <path d="M11 2 L14 5 L6.5 12.5 L3 13.5 L4 10 Z" />
    </Glyph>
  );
}

function FillGlyph() {
  return (
    <Glyph label="Fill">
      <path d="M8 1.5 C8 1.5 3.5 7.5 3.5 10 a4.5 4.5 0 0 0 9 0 C12.5 7.5 8 1.5 8 1.5 Z" />
    </Glyph>
  );
}

function CapGlyph({ cap }: { cap: string }) {
  return (
    <Glyph label={`Cap ${cap}`}>
      <path d="M3 10 L13 4" strokeLinecap={cap as 'butt' | 'round' | 'square'} strokeWidth="3" />
    </Glyph>
  );
}

function JoinGlyph({ join }: { join: string }) {
  return (
    <Glyph label={`Join ${join}`}>
      <path d="M2 12 L8 3 L14 11" strokeLinejoin={join as 'miter' | 'round' | 'bevel'} strokeWidth="2.6" />
    </Glyph>
  );
}

function DashGlyph({ dash, gap }: { dash: number; gap: number }) {
  return (
    <Glyph label={dash > 0 || gap > 0 ? `Dash ${dash}/${gap}` : 'Solid line'}>
      <path
        d="M2 7 L14 7"
        strokeWidth="2.2"
        strokeDasharray={dash > 0 || gap > 0 ? `${dash || 0.1} ${gap || 0.1}` : undefined}
      />
    </Glyph>
  );
}

function ZoomGlyph() {
  return (
    <Glyph label="Zoom">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 L14 14" />
    </Glyph>
  );
}

function LengthGlyph() {
  return (
    <Glyph label="Length">
      <path d="M2 10 L14 10" />
      <path d="M4 10 L4 7.5 M8 10 L8 7.5 M12 10 L12 7.5" />
    </Glyph>
  );
}

function AngleGlyph() {
  return (
    <Glyph label="Angle">
      <path d="M2 12 L2 12" />
      <path d="M3 12 A9 9 0 0 1 12 5" />
      <path d="M3 12 L12 12" />
    </Glyph>
  );
}

// Document menu entries that act instead of switching documents.
const DOC_SETTINGS_VALUE = '__cfg-settings';
const DOC_RENAME_VALUE = '__cfg-rename';

export interface ConfigSummaryBoxProps {
  engine: NibGliderEngine;
  docName: string;
  docDirty: boolean;
  currentDocId: string | null;
  documents: Array<{ id: string; name: string }>;
  selectedCount: number;
  selection: SelectionPaint | null;
  globals: SummaryGlobals;
  onSelectDocument?: (id: string) => void;
  onOpenSettings?: () => void;
  onRequestRename?: () => void;
}

export default function ConfigSummaryBox({
  engine,
  docName,
  docDirty,
  currentDocId,
  documents,
  selectedCount,
  selection,
  globals,
  onSelectDocument,
  onOpenSettings,
  onRequestRename,
}: ConfigSummaryBoxProps) {
  const { mode, paint, mixed } = resolveSummaryState(selection, selectedCount, globals);
  // Zoom and live drawing progress bypass the document channel (view-only
  // state and mousemove-only canvas repaints), so the box subscribes to
  // those narrow channels itself: only the box re-renders per cursor move.
  const viewVersion = useSyncExternalStore(engine.subscribeView, engine.getViewVersion);
  const liveVersion = useSyncExternalStore(engine.subscribeLive, engine.getLiveVersion);
  void viewVersion;
  void liveVersion;
  const live = resolveLiveMeasure({
    lengthOn: engine.isLengthSnappingEnabled,
    angleOn: engine.isAngleSnappingEnabled,
    vector: engine.liveMeasureVector(),
    unit: engine.lengthUnit,
  });
  const zoomText = formatZoomPercent(engine.zoomLevel);
  const uid = useId().replace(/:/g, '');
  const fillId = `cfg-fill-${uid}`;
  const spec = paint.fillSpec;
  // Clamp the preview stroke so a 200pt width stays inside the well; the
  // exact number still shows as text beside it.
  const previewWidth = paint.strokeOn ? Math.max(0.75, Math.min(10, paint.strokeWidth)) : 0;
  const dashOn = paint.dashLength > 0 || paint.gapLength > 0;
  const stateLabel =
    mode === 'selection' ? (mixed ? `${selectedCount} selected` : 'Selection') : 'Global';
  const docOptions: CustomSelectOption[] = [
    ...documents.map((doc) => ({
      value: doc.id,
      label: doc.id === currentDocId && docDirty ? `${doc.name} •` : doc.name,
    })),
    { value: '__cfg-doc-section', label: 'Document', header: true },
    { value: DOC_SETTINGS_VALUE, label: 'Settings' },
    { value: DOC_RENAME_VALUE, label: 'Rename' },
  ];
  const handleDocChange = (value: string) => {
    if (value === DOC_SETTINGS_VALUE) {
      onOpenSettings?.();
      return;
    }
    if (value === DOC_RENAME_VALUE) {
      onRequestRename?.();
      return;
    }
    onSelectDocument?.(value);
  };

  return (
    <div
      id="configSummaryBox"
      role="status"
      aria-label={`Configuration summary: ${stateLabel}`}
      title={
        mode === 'selection'
          ? 'Reflects the selected path (first selected item). Edit in the Stroke and Fill sections.'
          : 'Reflects what the next drawn path will use. Edit in the Stroke and Fill sections.'
      }
    >
      <div className="cfg-head">
        <CustomSelect
          id="configSummaryDocSelect"
          ariaLabel={`Document: ${docName}${docDirty ? ' (unsaved changes)' : ''}`}
          value={currentDocId ?? '__cfg-untitled'}
          placeholder={docDirty ? `${docName} •` : docName}
          options={docOptions}
          onChange={handleDocChange}
        />
        <span className={`cfg-state ${mode}`} title={mode === 'selection' ? 'Showing the selected path' : 'Showing the global settings the next path will use'}>
          {stateLabel}
        </span>
      </div>
      <svg
        className="cfg-preview"
        viewBox="0 0 120 56"
        width="100%"
        height="52"
        role="img"
        aria-label={paint.strokeOn || paint.fillOn ? 'Draw preview' : 'Nothing will draw: stroke and fill are both off'}
      >
        <defs>
          {spec.type === 'linear' ? (
            <linearGradient id={fillId} gradientTransform={`rotate(${spec.angle} 0.5 0.5)`}>
              <stop offset="0" stopColor={spec.color} />
              <stop offset="1" stopColor={spec.endColor} />
            </linearGradient>
          ) : null}
          {spec.type === 'radial' ? (
            <radialGradient id={fillId}>
              <stop offset={Math.max(0, Math.min(0.95, spec.inner))} stopColor={spec.color} />
              <stop offset="1" stopColor={spec.endColor} />
            </radialGradient>
          ) : null}
        </defs>
        <rect
          x="10"
          y="8"
          width="100"
          height="40"
          rx="9"
          fill={
            !paint.fillOn
              ? 'none'
              : spec.type === 'solid'
                ? spec.color
                : `url(#${fillId})`
          }
          stroke={paint.strokeOn ? paint.strokeColor : 'none'}
          strokeWidth={previewWidth}
          strokeLinecap={paint.strokeCap}
          strokeLinejoin={paint.strokeJoin}
          strokeDasharray={dashOn ? `${paint.dashLength || 0.1} ${paint.gapLength || 0.1}` : undefined}
        />
        {!paint.strokeOn && !paint.fillOn ? (
          <path d="M14 44 L106 12" stroke="#e06565" strokeWidth="1.6" strokeDasharray="3 3" />
        ) : null}
      </svg>
      <dl className="cfg-rows">
        <div className="cfg-row">
          <dt>
            <ZoomGlyph />
            <span>Zoom</span>
          </dt>
          <dd title={`View zoom ${zoomText}`}>{zoomText}</dd>
        </div>
        {live.lengthText ? (
          <div className="cfg-row sub">
            <dt>
              <LengthGlyph />
              <span>Length</span>
            </dt>
            <dd title="Live radius or spline-segment length (Length snapping is on)">{live.lengthText}</dd>
          </div>
        ) : null}
        {live.angleText ? (
          <div className="cfg-row sub">
            <dt>
              <AngleGlyph />
              <span>Angle</span>
            </dt>
            <dd title="Live radius or spline-segment angle (Angle snapping is on)">{live.angleText}</dd>
          </div>
        ) : null}
        <div className={`cfg-row ${paint.strokeOn ? '' : 'is-off'}`}>
          <dt>
            <StrokeGlyph />
            <span>Stroke</span>
          </dt>
          <dd title={paint.strokeOn ? `Stroke ${paint.strokeColor}, ${paint.strokeWidth}pt` : 'Stroke off'}>
            <span className="cfg-swatch" style={{ background: paint.strokeOn ? paint.strokeColor : 'transparent' }} aria-hidden="true" />
            <span>{paint.strokeOn ? `${paint.strokeWidth}pt` : 'Off'}</span>
          </dd>
        </div>
        <div className={`cfg-row sub ${paint.strokeOn ? '' : 'is-off'}`}>
          <dt>
            <CapGlyph cap={paint.strokeCap} />
            <span>Cap</span>
          </dt>
          <dd>{paint.strokeCap}</dd>
        </div>
        <div className={`cfg-row sub ${paint.strokeOn ? '' : 'is-off'}`}>
          <dt>
            <JoinGlyph join={paint.strokeJoin} />
            <span>Join</span>
          </dt>
          <dd>{paint.strokeJoin}{paint.strokeJoin === 'miter' ? ` ${paint.miterLimit}` : ''}</dd>
        </div>
        <div className={`cfg-row sub ${paint.strokeOn ? '' : 'is-off'}`}>
          <dt>
            <DashGlyph dash={paint.dashLength} gap={paint.gapLength} />
            <span>Dash</span>
          </dt>
          <dd>{dashOn ? `${paint.dashLength}/${paint.gapLength}` : 'Solid'}</dd>
        </div>
        <div className={`cfg-row ${paint.fillOn ? '' : 'is-off'}`}>
          <dt>
            <FillGlyph />
            <span>Fill</span>
          </dt>
          <dd title={paint.fillOn ? `Fill ${spec.color} (${spec.type})` : 'Fill off'}>
            <span className="cfg-swatch" style={{ background: paint.fillOn ? spec.color : 'transparent' }} aria-hidden="true" />
            <span>{paint.fillOn ? spec.type : 'Off'}</span>
          </dd>
        </div>
        {paint.fillOn && spec.type !== 'solid' ? (
          <div className="cfg-row sub">
            <dt>
              <FillGlyph />
              <span>{spec.type === 'linear' ? 'Angle' : 'Inner'}</span>
            </dt>
            <dd>
              {spec.type === 'linear' ? `${Math.round(spec.angle)}° → ${spec.endColor}` : `${spec.inner} → ${spec.endColor}`}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
