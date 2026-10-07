// New Document dialog: pick a starting size by target (workspace canvas,
// print, image) or from a ratio multiplied by a unit of measurement.
// Rendered into a portal like DocumentGallery: a dark pro-GUI tab strip
// occupying the dialog content area. Confirming returns dimensions in
// document points plus the entry unit for the page display unit; the dirty
// guard lives with the caller. Unit-system preference (SI vs. English,
// default English) persists under UNIT_SYSTEM_KEY.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LengthUnit } from '../engine/types';
import { DimensionFields, PresetList, UnitSelect } from './sizeControls';
import { TABS, parsePositive, type TabId } from './sizeTabs';
import {
  DEFAULT_UNIT_SYSTEM,
  IMAGE_PRESETS,
  MAX_DIMENSION_PT,
  PRINT_PRESETS,
  RATIO_PRESETS,
  UNIT_SYSTEM_KEY,
  WORKSPACE_PRESETS,
  formatInUnit,
  imagePresetToPoints,
  pagePresetToPoints,
  parseUnitSystem,
  resolveRatioToPoints,
  systemUnits,
  unitLabel,
  unitToPoints,
  type ImagePreset,
  type Orientation,
  type PagePreset,
  type RatioPreset,
  type UnitSystem,
} from '../engine/document/MeasurementUnits';

export interface NewDocumentSpec {
  name: string;
  widthPt: number;
  heightPt: number;
  unit: LengthUnit;
}

function loadSystem(): UnitSystem {
  try {
    return parseUnitSystem(localStorage.getItem(UNIT_SYSTEM_KEY));
  } catch {
    return DEFAULT_UNIT_SYSTEM;
  }
}

export default function NewDocumentDialog({
  defaultName,
  onConfirm,
  onClose,
}: {
  defaultName: string;
  onConfirm: (spec: NewDocumentSpec) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabId>('workspace');
  const [name, setName] = useState(defaultName);
  // One stored-system read; all system-flavored defaults derive from it so
  // SI users land on ISO A4 / mm and English users on US Letter / inches.
  const [initial] = useState(() => {
    const stored = loadSystem();
    return {
      system: stored,
      printId: (stored === 'si' ? 'iso-a4' : 'us-letter') as string | 'custom',
      customWidth: stored === 'si' ? '210' : '8.5',
      customHeight: stored === 'si' ? '297' : '11',
      customUnit: (stored === 'si' ? 'mm' : 'inch') as LengthUnit,
      ratioUnit: (stored === 'si' ? 'mm' : 'inch') as LengthUnit,
    };
  });
  const [system, setSystem] = useState<UnitSystem>(initial.system);
  const [workspaceId, setWorkspaceId] = useState<string>('canvas-16-9');
  const [printId, setPrintId] = useState<string | 'custom'>(initial.printId);
  const [imageId, setImageId] = useState<string>('img-hd');
  const [ratioId, setRatioId] = useState<string>('ratio-16-9');
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [customWidth, setCustomWidth] = useState(initial.customWidth);
  const [customHeight, setCustomHeight] = useState(initial.customHeight);
  const [customUnit, setCustomUnit] = useState<LengthUnit>(initial.customUnit);
  const [ratioScale, setRatioScale] = useState('120');
  const [ratioUnit, setRatioUnit] = useState<LengthUnit>(initial.ratioUnit);
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const field = nameRef.current;
    if (field) {
      field.focus();
      field.select();
    } else dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Entry units follow the active system; presets carry their own native
  // unit which the custom fields adopt when picked.
  const units = useMemo(() => systemUnits(system), [system]);

  const changeSystem = (next: UnitSystem) => {
    setSystem(next);
    const nextUnits = systemUnits(next);
    if (!nextUnits.includes(customUnit)) setCustomUnit(nextUnits[0]);
    setRatioUnit((prev) => (nextUnits.includes(prev) ? prev : next === 'si' ? 'mm' : 'inch'));
    try {
      localStorage.setItem(UNIT_SYSTEM_KEY, next);
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
  };

  const pickPrintPreset = (id: string) => {
    setPrintId(id);
    const preset = PRINT_PRESETS.find((p) => p.id === id);
    if (preset && units.includes(preset.unit)) setCustomUnit(preset.unit);
  };

  const result = useMemo((): { spec: Omit<NewDocumentSpec, 'name'>; note: string } | { error: string } => {
    const fail = (error: string) => ({ error });
    if (tab === 'workspace') {
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
    onConfirm({ ...result.spec, name: name.trim() || defaultName });
  };

  return createPortal(
    <div
      className="newdoc-overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="newdoc-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="New document"
        tabIndex={-1}
      >
        <div className="gallery-head">
          <span className="gallery-title">New document</span>
          <button type="button" className="gallery-x" aria-label="Close new document" onClick={onClose}>
            ×
          </button>
        </div>
        <label className="newdoc-field">
          <span className="newdoc-field-label">Name</span>
          <input
            ref={nameRef}
            type="text"
            className="newdoc-input"
            aria-label="Document name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              commit();
            }}
          />
        </label>
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
          <div className="newdoc-system" role="group" aria-label="Unit system">
            {(['english', 'si'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={system === option}
                className={system === option ? 'newdoc-system-option active' : 'newdoc-system-option'}
                title={option === 'english' ? 'English Units (inches to feet)' : 'SI Units (mm to m)'}
                onClick={() => changeSystem(option)}
              >
                {option === 'english' ? 'English' : 'SI'}
              </button>
            ))}
          </div>
        </div>
        <div className="newdoc-body">
          {tab === 'workspace' && (
            <PresetList
              presets={WORKSPACE_PRESETS}
              selected={workspaceId}
              onSelect={setWorkspaceId}
              details={(preset) => `${preset.width} × ${preset.height} ${unitLabel(preset.unit)}`}
            />
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
                  units={units}
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
                <UnitSelect label="Unit" value={ratioUnit} units={units} onChange={setRatioUnit} />
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
            Create document
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
