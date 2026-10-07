// Document size editor: sets the active page dimensions, shared by the
// dedicated Document Size window and the Size tab of Document Settings.
// Reuses the New Document dialog's dark pro-GUI tab strip (Workspace,
// Print, Image, Ratio) and its preset tables, but initializes from the
// current page and applies via engine.setPageDimensions, which resizes the
// page sheet in place and keeps artwork untouched.
import { useMemo, useState } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import type { LengthUnit } from '../engine/types';
import {
  IMAGE_PRESETS,
  MAX_DIMENSION_PT,
  PRINT_PRESETS,
  RATIO_PRESETS,
  WORKSPACE_PRESETS,
  formatInUnit,
  imagePresetToPoints,
  pagePresetToPoints,
  pointsToUnit,
  resolveRatioToPoints,
  unitLabel,
  unitToPoints,
  type ImagePreset,
  type Orientation,
  type PagePreset,
  type RatioPreset,
} from '../engine/document/MeasurementUnits';
import { DimensionFields, PresetList, UnitSelect } from './sizeControls';
import { TABS, parsePositive, type TabId } from './sizeTabs';

const ALL_UNITS: LengthUnit[] = ['pt', 'pica', 'inch', 'ft', 'mm', 'cm', 'm'];

function trimNumber(value: number): string {
  return String(Math.round(value * 10000) / 10000);
}

function sameDims(aPt: number, bPt: number, cPt: number, dPt: number): boolean {
  return Math.abs(aPt - cPt) < 0.01 && Math.abs(bPt - dPt) < 0.01;
}

interface InitialSelection {
  tab: TabId;
  workspaceId: string | 'custom';
  printId: string | 'custom';
  imageId: string;
  orientation: Orientation;
}

function initialFromPage(widthPt: number | null, heightPt: number | null): InitialSelection {
  const fallback: InitialSelection = {
    tab: 'workspace',
    workspaceId: 'canvas-16-9',
    printId: 'custom',
    imageId: 'img-hd',
    orientation: 'portrait',
  };
  if (widthPt == null || heightPt == null) return fallback;
  for (const preset of WORKSPACE_PRESETS) {
    const dims = pagePresetToPoints(preset);
    if (sameDims(dims.widthPt, dims.heightPt, widthPt, heightPt)) {
      return { ...fallback, tab: 'workspace', workspaceId: preset.id };
    }
  }
  for (const orientation of ['portrait', 'landscape'] as const) {
    for (const preset of PRINT_PRESETS) {
      const dims = pagePresetToPoints(preset, orientation);
      if (sameDims(dims.widthPt, dims.heightPt, widthPt, heightPt)) {
        return { ...fallback, tab: 'print', printId: preset.id, orientation };
      }
    }
  }
  for (const orientation of ['landscape', 'portrait'] as const) {
    for (const preset of IMAGE_PRESETS) {
      const dims = imagePresetToPoints(preset);
      const ordered =
        orientation === 'landscape'
          ? { widthPt: Math.max(dims.widthPt, dims.heightPt), heightPt: Math.min(dims.widthPt, dims.heightPt) }
          : { widthPt: Math.min(dims.widthPt, dims.heightPt), heightPt: Math.max(dims.widthPt, dims.heightPt) };
      if (sameDims(ordered.widthPt, ordered.heightPt, widthPt, heightPt)) {
        return { ...fallback, tab: 'image', imageId: preset.id, orientation };
      }
    }
  }
  return { ...fallback, tab: 'workspace', workspaceId: 'custom' };
}

export default function DocumentSizeEditor({
  engine,
  commitLabel = 'Apply size',
  onApplied,
}: {
  engine: NibGliderEngine;
  commitLabel?: string;
  onApplied?: () => void;
}) {
  const page = engine.getPageSettings();
  const [selection] = useState(() => initialFromPage(page.widthPt, page.heightPt));
  const startUnit: LengthUnit = page.unit ?? 'pt';
  const [tab, setTab] = useState<TabId>(selection.tab);
  const [workspaceId, setWorkspaceId] = useState<string | 'custom'>(selection.workspaceId);
  const [printId, setPrintId] = useState<string | 'custom'>(selection.printId);
  const [imageId, setImageId] = useState<string>(selection.imageId);
  const [ratioId, setRatioId] = useState<string>('ratio-16-9');
  const [orientation, setOrientation] = useState<Orientation>(selection.orientation);
  const [customWidth, setCustomWidth] = useState(() =>
    page.widthPt != null ? trimNumber(pointsToUnit(page.widthPt, startUnit)) : '1920',
  );
  const [customHeight, setCustomHeight] = useState(() =>
    page.heightPt != null ? trimNumber(pointsToUnit(page.heightPt, startUnit)) : '1080',
  );
  const [customUnit, setCustomUnit] = useState<LengthUnit>(startUnit);
  const [ratioScale, setRatioScale] = useState('120');
  const [ratioUnit, setRatioUnit] = useState<LengthUnit>(startUnit);

  const pickPrintPreset = (id: string) => {
    setPrintId(id);
    const preset = PRINT_PRESETS.find((p) => p.id === id);
    if (preset && ALL_UNITS.includes(preset.unit)) setCustomUnit(preset.unit);
  };

  const result = useMemo((): { spec: { widthPt: number; heightPt: number; unit: LengthUnit }; note: string } | { error: string } => {
    const fail = (error: string) => ({ error });
    if (tab === 'workspace') {
      if (workspaceId === 'custom') {
        const w = parsePositive(customWidth);
        const h = parsePositive(customHeight);
        if (w == null || h == null) return fail('Enter a positive width and height.');
        const widthPt = unitToPoints(w, customUnit);
        const heightPt = unitToPoints(h, customUnit);
        if (widthPt > MAX_DIMENSION_PT || heightPt > MAX_DIMENSION_PT) {
          return fail(`Sizes are limited to ${formatInUnit(MAX_DIMENSION_PT, customUnit)}.`);
        }
        return { spec: { widthPt, heightPt, unit: customUnit }, note: 'Custom workspace canvas.' };
      }
      const preset: PagePreset | undefined = WORKSPACE_PRESETS.find((p) => p.id === workspaceId);
      if (!preset) return fail('Pick a workspace size.');
      return {
        spec: { ...pagePresetToPoints(preset), unit: preset.unit },
        note: 'Working canvas — export sections later with Export Frame.',
      };
    }
    if (tab === 'print') {
      if (printId === 'custom') {
        const w = parsePositive(customWidth);
        const h = parsePositive(customHeight);
        if (w == null || h == null) return fail('Enter a positive width and height.');
        const widthPt = unitToPoints(w, customUnit);
        const heightPt = unitToPoints(h, customUnit);
        if (widthPt > MAX_DIMENSION_PT || heightPt > MAX_DIMENSION_PT) {
          return fail(`Sizes are limited to ${formatInUnit(MAX_DIMENSION_PT, customUnit)}.`);
        }
        const ordered =
          orientation === 'landscape'
            ? { widthPt: Math.max(widthPt, heightPt), heightPt: Math.min(widthPt, heightPt) }
            : { widthPt: Math.min(widthPt, heightPt), heightPt: Math.max(widthPt, heightPt) };
        return { spec: { ...ordered, unit: customUnit }, note: 'Output size for print.' };
      }
      const preset = PRINT_PRESETS.find((p) => p.id === printId);
      if (!preset) return fail('Pick a print size.');
      return { spec: { ...pagePresetToPoints(preset, orientation), unit: preset.unit }, note: 'Output size for print.' };
    }
    if (tab === 'image') {
      const preset: ImagePreset | undefined = IMAGE_PRESETS.find((p) => p.id === imageId);
      if (!preset) return fail('Pick an image size.');
      const { widthPt, heightPt } = imagePresetToPoints(preset);
      const ordered =
        orientation === 'landscape'
          ? { widthPt: Math.max(widthPt, heightPt), heightPt: Math.min(widthPt, heightPt) }
          : { widthPt: Math.min(widthPt, heightPt), heightPt: Math.max(widthPt, heightPt) };
      return { spec: { ...ordered, unit: 'pt' }, note: 'Output size in pixels at 96 dpi.' };
    }
    const ratio: RatioPreset | undefined = RATIO_PRESETS.find((r) => r.id === ratioId);
    if (!ratio) return fail('Pick a ratio.');
    const scale = parsePositive(ratioScale);
    if (scale == null) return fail('Enter a positive scale length.');
    try {
      const dims = resolveRatioToPoints(ratio.a, ratio.b, scale, ratioUnit);
      if (dims.widthPt > MAX_DIMENSION_PT || dims.heightPt > MAX_DIMENSION_PT) {
        return fail(`Sizes are limited to ${formatInUnit(MAX_DIMENSION_PT, ratioUnit)}.`);
      }
      return {
        spec: { ...dims, unit: ratioUnit },
        note: `${ratio.label} × ${formatInUnit(unitToPoints(scale, ratioUnit), ratioUnit)}.`,
      };
    } catch {
      return fail('Enter a positive scale length.');
    }
  }, [
    tab, workspaceId, printId, imageId, ratioId, orientation,
    customWidth, customHeight, customUnit, ratioScale, ratioUnit,
  ]);

  const commit = () => {
    if (!('spec' in result)) return;
    try {
      engine.setPageDimensions(
        pointsToUnit(result.spec.widthPt, result.spec.unit),
        pointsToUnit(result.spec.heightPt, result.spec.unit),
        result.spec.unit,
      );
    } catch {
      return;
    }
    onApplied?.();
  };

  return (
    <div className="docsize-editor">
      <div className="newdoc-tabs" role="tablist" aria-label="Size target">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={tab === entry.id ? 'newdoc-tab active' : 'newdoc-tab'}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="newdoc-body">
        {tab === 'workspace' && (
          <>
            <PresetList
              presets={WORKSPACE_PRESETS}
              selected={workspaceId}
              onSelect={setWorkspaceId}
              details={(preset) => `${preset.width} × ${preset.height} ${unitLabel(preset.unit)}`}
            />
            <div className="newdoc-row">
              <button
                type="button"
                aria-pressed={workspaceId === 'custom'}
                className={workspaceId === 'custom' ? 'newdoc-orient-option active' : 'newdoc-orient-option'}
                onClick={() => setWorkspaceId('custom')}
              >
                Custom
              </button>
            </div>
            {workspaceId === 'custom' && (
              <DimensionFields
                width={customWidth}
                height={customHeight}
                unit={customUnit}
                units={ALL_UNITS}
                onWidth={setCustomWidth}
                onHeight={setCustomHeight}
                onUnit={setCustomUnit}
              />
            )}
          </>
        )}
        {tab === 'print' && (
          <>
            <div className="newdoc-group-label">ISO page sizes</div>
            <PresetList
              presets={PRINT_PRESETS.filter((p) => p.family === 'iso')}
              selected={printId}
              onSelect={pickPrintPreset}
              details={(preset) => `${preset.width} × ${preset.height} ${unitLabel(preset.unit)}`}
            />
            <div className="newdoc-group-label">US page sizes</div>
            <PresetList
              presets={PRINT_PRESETS.filter((p) => p.family === 'us')}
              selected={printId}
              onSelect={pickPrintPreset}
              details={(preset) => `${preset.width} × ${preset.height} ${unitLabel(preset.unit)}`}
            />
            <div className="newdoc-row">
              <div className="newdoc-orient" role="group" aria-label="Orientation">
                {(['portrait', 'landscape'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={orientation === option}
                    className={orientation === option ? 'newdoc-orient-option active' : 'newdoc-orient-option'}
                    onClick={() => setOrientation(option)}
                  >
                    {option === 'portrait' ? 'Portrait' : 'Landscape'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-pressed={printId === 'custom'}
                className={printId === 'custom' ? 'newdoc-orient-option active' : 'newdoc-orient-option'}
                onClick={() => setPrintId('custom')}
              >
                Custom
              </button>
            </div>
            {printId === 'custom' && (
              <DimensionFields
                width={customWidth}
                height={customHeight}
                unit={customUnit}
                units={ALL_UNITS}
                onWidth={setCustomWidth}
                onHeight={setCustomHeight}
                onUnit={setCustomUnit}
              />
            )}
          </>
        )}
        {tab === 'image' && (
          <>
            <PresetList
              presets={IMAGE_PRESETS}
              selected={imageId}
              onSelect={setImageId}
              details={(preset) => {
                const { widthPt, heightPt } = imagePresetToPoints(preset);
                return `${formatInUnit(widthPt, 'pt')} × ${formatInUnit(heightPt, 'pt')}`;
              }}
            />
            <div className="newdoc-row">
              <div className="newdoc-orient" role="group" aria-label="Orientation">
                {(['landscape', 'portrait'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={orientation === option}
                    className={orientation === option ? 'newdoc-orient-option active' : 'newdoc-orient-option'}
                    onClick={() => setOrientation(option)}
                  >
                    {option === 'landscape' ? 'Landscape' : 'Portrait'}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {tab === 'ratio' && (
          <>
            <PresetList
              presets={RATIO_PRESETS}
              selected={ratioId}
              onSelect={setRatioId}
              details={(ratio) => `${ratio.a} : ${ratio.b}`}
            />
            <div className="newdoc-row">
              <label className="newdoc-field">
                <span className="newdoc-field-label">Scale (one unit)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="newdoc-input"
                  aria-label="Ratio scale"
                  value={ratioScale}
                  onChange={(e) => setRatioScale(e.target.value)}
                />
              </label>
              <UnitSelect label="Unit" value={ratioUnit} units={ALL_UNITS} onChange={setRatioUnit} />
            </div>
          </>
        )}
      </div>
      <div className="newdoc-foot">
        {'spec' in result ? (
          <span className="newdoc-preview">
            {formatInUnit(result.spec.widthPt, 'pt')} × {formatInUnit(result.spec.heightPt, 'pt')}
            <span className="newdoc-note">{result.note}</span>
          </span>
        ) : (
          <span className="newdoc-error" role="alert">
            {result.error}
          </span>
        )}
        <button
          type="button"
          className="gallery-primary"
          disabled={!('spec' in result)}
          onClick={commit}
        >
          {commitLabel}
        </button>
      </div>
    </div>
  );
}
