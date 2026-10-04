// Re-export. The schema builder lives with the engine so the facade does not
// import src/ui. StatusOverlay still renders the schema and adds chord hints.
export { buildStatusSchema, type StatusSnapshot } from '../engine/appearance/statusSchema';
