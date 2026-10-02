// Turns a settings schema plus the current engine state into controls.
//
// Owns: no state. Each control's commit validates, then calls the
//   schema's write accessor.
// May read: the SettingsTarget passed in.
// May mutate: only by calling that accessor.

import type {
  ColorSetting,
  KeySettingsSchema,
  NumberSetting,
  SelectSetting,
  SettingsField,
  SettingsOption,
  SettingsTarget,
  ToggleSetting,
} from './KeySettingsRegistry';

export type SettingsControl =
  | {
      id: string;
      kind: 'number';
      label: string;
      help?: string;
      value: number;
      min: number;
      max: number;
      step: number;
      unit?: string;
      decimals?: number;
      commit: (value: number) => void;
    }
  | {
      id: string;
      kind: 'toggle';
      label: string;
      help?: string;
      value: boolean;
      commit: (value: boolean) => void;
    }
  | {
      id: string;
      kind: 'select';
      label: string;
      help?: string;
      value: string;
      options: SettingsOption[];
      commit: (value: string) => void;
    }
  | {
      id: string;
      kind: 'color';
      label: string;
      help?: string;
      value: string;
      commit: (value: string) => void;
    };

export interface SettingsView {
  id: string;
  title: string;
  help: string;
  owner: KeySettingsSchema['owner'];
  controls: SettingsControl[];
}

function numberControl(field: NumberSetting, target: SettingsTarget): SettingsControl {
  const max = field.maxOf ? field.maxOf(target) : field.max;
  return {
    id: field.id,
    kind: 'number',
    label: field.label,
    help: field.help,
    value: field.read(target),
    min: field.min,
    max,
    step: field.step,
    unit: field.unit,
    decimals: field.decimals,
    commit: (value) => {
      field.write(target, field.validate(value, target));
    },
  };
}

function toggleControl(field: ToggleSetting, target: SettingsTarget): SettingsControl {
  return {
    id: field.id,
    kind: 'toggle',
    label: field.label,
    help: field.help,
    value: field.read(target),
    commit: (value) => field.write(target, value),
  };
}

function selectControl(field: SelectSetting, target: SettingsTarget): SettingsControl {
  return {
    id: field.id,
    kind: 'select',
    label: field.label,
    help: field.help,
    value: field.read(target),
    options: field.options,
    commit: (value) => {
      const next = field.validate(value);
      if (next != null) field.write(target, next);
    },
  };
}

function colorControl(field: ColorSetting, target: SettingsTarget): SettingsControl {
  const read = field.validate(field.read(target)) ?? field.default;
  return {
    id: field.id,
    kind: 'color',
    label: field.label,
    help: field.help,
    value: read,
    commit: (value) => {
      const next = field.validate(value);
      if (next != null) field.write(target, next);
    },
  };
}

function controlFor(field: SettingsField, target: SettingsTarget): SettingsControl {
  switch (field.kind) {
    case 'number':
      return numberControl(field, target);
    case 'toggle':
      return toggleControl(field, target);
    case 'select':
      return selectControl(field, target);
    case 'color':
      return colorControl(field, target);
  }
}

export function settingsView(schema: KeySettingsSchema, target: SettingsTarget): SettingsView {
  return {
    id: schema.id,
    title: schema.title,
    help: schema.help,
    owner: schema.owner,
    controls: schema.fields
      .filter((field) => (field.visible ? field.visible(target) : true))
      .map((field) => controlFor(field, target)),
  };
}
