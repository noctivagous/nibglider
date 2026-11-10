// Arrange panel section (Slice 4): align (to selection or to the
// document), distribute, and flip for the current selection. Every
// button runs one engine operation = one history entry. The same
// commands live in the Operations and context menus.
import type { NibGliderEngine } from '../engine/engine';

export default function ArrangePanel({ engine }: { engine: NibGliderEngine }) {
  const count = engine.selectedItems.length;
  const none = count === 0;
  const few = count < 3;
  const btn = (
    label: string,
    title: string,
    onClick: () => void,
    disabled: boolean,
  ) => (
    <button type="button" className="arrange-btn" title={title} disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
  return (
    <div className="arrange-panel">
      <div className="arrange-label">Align to selection</div>
      <div className="arrange-row">
        {btn('Left', 'Align left edges', () => engine.alignSelection('left', 'selection'), none)}
        {btn('Centre', 'Align horizontal centres', () => engine.alignSelection('centerX', 'selection'), none)}
        {btn('Right', 'Align right edges', () => engine.alignSelection('right', 'selection'), none)}
        {btn('Top', 'Align top edges', () => engine.alignSelection('top', 'selection'), none)}
        {btn('Middle', 'Align vertical centres', () => engine.alignSelection('centerY', 'selection'), none)}
        {btn('Bottom', 'Align bottom edges', () => engine.alignSelection('bottom', 'selection'), none)}
      </div>
      <div className="arrange-label">Align to document</div>
      <div className="arrange-row">
        {btn('Left', 'Align to the document’s left edge', () => engine.alignSelection('left', 'document'), none)}
        {btn('Centre', 'Centre horizontally in the document', () => engine.alignSelection('centerX', 'document'), none)}
        {btn('Right', 'Align to the document’s right edge', () => engine.alignSelection('right', 'document'), none)}
        {btn('Top', 'Align to the document’s top edge', () => engine.alignSelection('top', 'document'), none)}
        {btn('Middle', 'Centre vertically in the document', () => engine.alignSelection('centerY', 'document'), none)}
        {btn('Bottom', 'Align to the document’s bottom edge', () => engine.alignSelection('bottom', 'document'), none)}
      </div>
      <div className="arrange-label">Distribute &amp; flip</div>
      <div className="arrange-row">
        {btn('Dist. H', 'Distribute horizontally with equal gaps (needs 3+)', () => engine.distributeSelection('horizontal'), few)}
        {btn('Dist. V', 'Distribute vertically with equal gaps (needs 3+)', () => engine.distributeSelection('vertical'), few)}
        {btn('Flip H', 'Flip horizontally around the selection centre', () => engine.flipSelection('horizontal'), none)}
        {btn('Flip V', 'Flip vertically around the selection centre', () => engine.flipSelection('vertical'), none)}
      </div>
      {none && <div className="arrange-empty">Select objects to arrange them.</div>}
    </div>
  );
}
