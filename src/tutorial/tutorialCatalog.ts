// Tutorial catalog: every authored tutorial the Help menu can start.
// Files live under tutorials/ and are bundled with ?raw imports, the
// same mechanism App has always used for hello-rectangle. Adding a
// tutorial = author the JSON file, add one entry here, add its Help
// menu item in menus.xml. Tested from tests/tutorial-catalog.test.mjs.
import helloRaw from '../../tutorials/hello-rectangle.tutorial.json?raw';
import demoRaw from '../../tutorials/demo-rectangle.tutorial.json?raw';
import fixShapeRaw from '../../tutorials/fix-a-shape.tutorial.json?raw';
import fillStrokeRaw from '../../tutorials/fill-and-stroke.tutorial.json?raw';
import textRaw from '../../tutorials/adding-text.tutorial.json?raw';
import groupingRaw from '../../tutorials/grouping-and-ordering.tutorial.json?raw';
import savingRaw from '../../tutorials/saving-and-exporting.tutorial.json?raw';

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
  { id: 'fill-and-stroke', command: 'tutorial-fill-and-stroke', raw: fillStrokeRaw },
  { id: 'adding-text', command: 'tutorial-adding-text', raw: textRaw },
  { id: 'grouping-and-ordering', command: 'tutorial-grouping-and-ordering', raw: groupingRaw },
  { id: 'saving-and-exporting', command: 'tutorial-saving-and-exporting', raw: savingRaw },
];

export function tutorialByCommand(command: string): TutorialCatalogEntry | null {
  return TUTORIAL_CATALOG.find((entry) => entry.command === command) ?? null;
}

export function tutorialById(id: string): TutorialCatalogEntry | null {
  return TUTORIAL_CATALOG.find((entry) => entry.id === id) ?? null;
}
