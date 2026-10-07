// Shared size-picker controls for the New Document dialog and the
// Document Size editor: the dark pro-GUI tab ids, preset list, dimension
// fields, and unit select. Kept in a component-free module so both
// dialogs share one implementation (and fast-refresh stays happy).
import type { LengthUnit } from '../engine/types';
import { unitLabel } from '../engine/document/MeasurementUnits';

export function UnitSelect({
  label,
  value,
  units,
  onChange,
}: {
  label: string;
  value: LengthUnit;
  units: LengthUnit[];
  onChange: (unit: LengthUnit) => void;
}) {
  return (
    <label className="newdoc-field">
      <span className="newdoc-field-label">{label}</span>
      <select
        className="newdoc-select"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as LengthUnit)}
      >
        {units.map((unit) => (
          <option key={unit} value={unit}>
            {unit === 'inch' ? 'inches' : unit === 'pica' ? 'pica' : unit}
            {unit === 'inch' || unit === 'pica' ? ` (${unitLabel(unit)})` : ` (${unit})`}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DimensionFields({
  width,
  height,
  unit,
  units,
  onWidth,
  onHeight,
  onUnit,
}: {
  width: string;
  height: string;
  unit: LengthUnit;
  units: LengthUnit[];
  onWidth: (v: string) => void;
  onHeight: (v: string) => void;
  onUnit: (u: LengthUnit) => void;
}) {
  return (
    <div className="newdoc-row">
      <label className="newdoc-field">
        <span className="newdoc-field-label">Width</span>
        <input
          type="text"
          inputMode="decimal"
          className="newdoc-input"
          aria-label="Custom width"
          value={width}
          onChange={(e) => onWidth(e.target.value)}
        />
      </label>
      <span className="newdoc-times" aria-hidden="true">
        ×
      </span>
      <label className="newdoc-field">
        <span className="newdoc-field-label">Height</span>
        <input
          type="text"
          inputMode="decimal"
          className="newdoc-input"
          aria-label="Custom height"
          value={height}
          onChange={(e) => onHeight(e.target.value)}
        />
      </label>
      <UnitSelect label="Unit" value={unit} units={units} onChange={onUnit} />
    </div>
  );
}

export function PresetList<T extends { id: string; label: string }>({
  presets,
  selected,
  onSelect,
  details,
}: {
  presets: T[];
  selected: string | null;
  onSelect: (id: string) => void;
  details: (preset: T) => string;
}) {
  return (
    <div className="newdoc-presets" role="listbox" aria-label="Size presets">
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          role="option"
          aria-selected={selected === preset.id}
          className={selected === preset.id ? 'newdoc-preset active' : 'newdoc-preset'}
          onClick={() => onSelect(preset.id)}
        >
          <span className="newdoc-preset-label">{preset.label}</span>
          <span className="newdoc-preset-dims">{details(preset)}</span>
        </button>
      ))}
    </div>
  );
}
