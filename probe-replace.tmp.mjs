import paper from 'paper';
import { NibGliderEngine } from './src/engine/engine.ts';
const SVG = '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="1920" height="968" viewBox="0,0,1920,968"><g fill="none" stroke="#107cff" stroke-width="4"><path d="M570,495l-130,-152l-127,95l23,143l3,5"/></g></svg>';
const s = new paper.PaperScope(); s.setup(new s.Size(800, 600));
const e = new NibGliderEngine(s, () => {});
const ok = e.replaceSceneWithSVG('Open Untitled', SVG);
console.log('replace ok:', ok);
console.log('selected after:', e.selectedItems.length, 'canUndo:', e.canUndo(), 'label:', e.undoLabel());
console.log('content:', s.project.activeLayer.children.length);
for (const item of e.selectedItems) {
  try { console.log('sel:', item.className, JSON.stringify({x:Math.round(item.bounds.x),y:Math.round(item.bounds.y),w:Math.round(item.bounds.width),h:Math.round(item.bounds.height)})); } catch (err) { console.log('bounds err'); }
}
console.log('view:', s.view.size.width, s.view.size.height);
