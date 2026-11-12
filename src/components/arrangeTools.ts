import type { CustomSelectOption } from './CustomSelect';

export type ArrangeTool = 'align' | 'document' | 'space' | 'order' | 'turn';

export const ARRANGE_TOOL_OPTIONS: CustomSelectOption[] = [
  { value: 'align', label: 'Align' },
  { value: 'document', label: 'Document' },
  { value: 'space', label: 'Space' },
  { value: 'order', label: 'Order' },
  { value: 'turn', label: 'Turn' },
];

const ARRANGE_TITLES: Record<ArrangeTool, string> = {
  align: 'Align to selection',
  document: 'Align to document',
  space: 'Distribute & flip',
  order: 'Order',
  turn: 'Rotate & group',
};

export const ARRANGE_PREVIEW_LABEL: Record<ArrangeTool, string> = {
  align: 'Align',
  document: 'Page',
  space: 'Space',
  order: 'Order',
  turn: 'Turn',
};

export function isArrangeTool(value: string): value is ArrangeTool {
  return value === 'align' || value === 'document' || value === 'space' || value === 'order' || value === 'turn';
}

export function arrangeToolTitle(tool: ArrangeTool): string {
  return ARRANGE_TITLES[tool];
}
