// Re-export. The schema builders live with the engine so the facade does
// not import src/ui. StatusOverlay renders the status schema; KeymapWidget
// renders the keymap rows plus live chord hints.
export { buildStatusSchema, type StatusSnapshot } from '../engine/appearance/statusSchema';
export { buildKeymapRows } from '../engine/appearance/keymapSchema';
