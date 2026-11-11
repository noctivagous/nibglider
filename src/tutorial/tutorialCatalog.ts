// Tutorial catalog: every authored tutorial the Help menu can start.
// Files live under tutorials/ and are bundled with ?raw imports, the
// same mechanism App has always used for hello-rectangle. Adding a
// tutorial = author the JSON file, add one entry here, add its Help
// menu item in menus.xml. Tested from tests/tutorial-catalog.test.mjs.
//
// Order: the intro first, then one tutorial per panel section in panel
// order (the same order the Help ▸ Tutorials submenu lists them).
import helloRaw from '../../tutorials/hello-rectangle.tutorial.json?raw';
import demoRaw from '../../tutorials/demo-rectangle.tutorial.json?raw';
import fixShapeRaw from '../../tutorials/fix-a-shape.tutorial.json?raw';
import helloCircleRaw from '../../tutorials/hello-circle.tutorial.json?raw';
import strokeRaw from '../../tutorials/stroke.tutorial.json?raw';
import fillRaw from '../../tutorials/fill.tutorial.json?raw';
import swatchesRaw from '../../tutorials/swatches.tutorial.json?raw';
import textRaw from '../../tutorials/adding-text.tutorial.json?raw';
import combinatoricsRaw from '../../tutorials/combinatorics.tutorial.json?raw';
import historyRaw from '../../tutorials/history.tutorial.json?raw';
import layersRaw from '../../tutorials/layers-and-objects.tutorial.json?raw';
import groupingRaw from '../../tutorials/grouping-and-ordering.tutorial.json?raw';
import pagesRaw from '../../tutorials/pages-and-guides.tutorial.json?raw';
import savingRaw from '../../tutorials/saving-and-exporting.tutorial.json?raw';
import arrangeRaw from '../../tutorials/arrange.tutorial.json?raw';
import gridRaw from '../../tutorials/grid.tutorial.json?raw';
import repeatRaw from '../../tutorials/repeat.tutorial.json?raw';
import snappingRaw from '../../tutorials/snapping.tutorial.json?raw';
import pathOpsRaw from '../../tutorials/path-operations.tutorial.json?raw';

export interface TutorialCatalogEntry {
  /** Tutorial document id (matches the JSON file's "id"). */
  id: string;
  /** Help menu command that starts this tutorial. */
  command: string;
  /** Raw JSON text of the tutorial file. */
  raw: string;
}

export const TUTORIAL_CATALOG: TutorialCatalogEntry[] = [
  { id: 'hello-rectangle', command: 'tutorial', raw: helloRaw },
  { id: 'demo-rectangle', command: 'tutorial-demo-rectangle', raw: demoRaw },
  { id: 'fix-a-shape', command: 'tutorial-fix-a-shape', raw: fixShapeRaw },
  { id: 'hello-circle', command: 'tutorial-hello-circle', raw: helloCircleRaw },
  { id: 'stroke', command: 'tutorial-stroke', raw: strokeRaw },
  { id: 'fill', command: 'tutorial-fill', raw: fillRaw },
  { id: 'swatches', command: 'tutorial-swatches', raw: swatchesRaw },
  { id: 'adding-text', command: 'tutorial-adding-text', raw: textRaw },
  { id: 'combinatorics', command: 'tutorial-combinatorics', raw: combinatoricsRaw },
  { id: 'history', command: 'tutorial-history', raw: historyRaw },
  { id: 'layers-and-objects', command: 'tutorial-layers-and-objects', raw: layersRaw },
  { id: 'grouping-and-ordering', command: 'tutorial-grouping-and-ordering', raw: groupingRaw },
  { id: 'pages-and-guides', command: 'tutorial-pages-and-guides', raw: pagesRaw },
  { id: 'saving-and-exporting', command: 'tutorial-saving-and-exporting', raw: savingRaw },
  { id: 'arrange', command: 'tutorial-arrange', raw: arrangeRaw },
  { id: 'grid', command: 'tutorial-grid', raw: gridRaw },
  { id: 'repeat', command: 'tutorial-repeat', raw: repeatRaw },
  { id: 'snapping', command: 'tutorial-snapping', raw: snappingRaw },
  { id: 'path-operations', command: 'tutorial-path-operations', raw: pathOpsRaw },
];

export function tutorialByCommand(command: string): TutorialCatalogEntry | null {
  return TUTORIAL_CATALOG.find((entry) => entry.command === command) ?? null;
}

export function tutorialById(id: string): TutorialCatalogEntry | null {
  return TUTORIAL_CATALOG.find((entry) => entry.id === id) ?? null;
}
