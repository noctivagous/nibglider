// Loading for authored tutorial files: parse text, validate, return data.
// Accepts JSON text (fetch response, ?raw import, or file read in tests).

import { validateTutorial, type Tutorial } from './tutorialSchema';

export interface TutorialLoadResult {
  ok: boolean;
  tutorial: Tutorial | null;
  errors: string[];
}

/** Parse JSON text and validate it against the tutorial schema. */
export function parseTutorialText(jsonText: string): TutorialLoadResult {
  let data: unknown;
  try {
    data = JSON.parse(jsonText) as unknown;
  } catch {
    return { ok: false, tutorial: null, errors: ['tutorial file is not valid JSON'] };
  }
  const checked = validateTutorial(data);
  if (!checked.ok) return { ok: false, tutorial: null, errors: checked.errors };
  return { ok: true, tutorial: checked.tutorial, errors: [] };
}

/** Fetch a tutorial JSON file by URL and validate it. */
export async function fetchTutorial(url: string): Promise<TutorialLoadResult> {
  let text: string;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, tutorial: null, errors: [`tutorial request failed: ${response.status}`] };
    }
    text = await response.text();
  } catch {
    return { ok: false, tutorial: null, errors: ['tutorial request failed'] };
  }
  return parseTutorialText(text);
}
