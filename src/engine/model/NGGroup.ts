// Ordered document identities, never scene-item references. Reference
// existence/cycles across records will be enforced by the document service.
export interface NGGroup { childIds: string[] }

/** Live-weave params for an interlace group. Padding is absolute daylight
 * in document points; firstId names the member over at the first crossing
 * along its spine (later crossings alternate, offset by phase). Overrides
 * map a crossing key (`earlierId>laterId#index`) to the over member id for
 * per-crossing picks; explicit picks beat the alternation. */
export interface NGInterlaceParams {
  phase: 0 | 1;
  padding: number;
  firstId: string;
  overrides: Record<string, string>;
}

/** A group subclass whose members weave instead of stacking: the resolver
 * derives gapped bands from the live member records. Plain groups omit
 * the params and are unaffected. */
export interface NGInterlaceGroup extends NGGroup { interlace: NGInterlaceParams }
