// Ordered document identities, never scene-item references. Reference
// existence/cycles across records will be enforced by the document service.
export interface NGGroup { childIds: string[] }
