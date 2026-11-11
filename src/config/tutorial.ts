// Project-editable tutorial rollout config.
// Flip SHOW_TUTORIAL_FOR_NEW_USERS while working on the project to control
// whether first-time users (no tutorial flag in browser storage yet) are
// dropped straight into the guided tutorial on load.

/** Auto-show the tutorial for users who have not completed it yet. */
export const SHOW_TUTORIAL_FOR_NEW_USERS = true;

/** Browser-storage key recording that the user went through the tutorial. */
export const TUTORIAL_COMPLETED_KEY = 'nibglider.tutorialCompleted';

/** Browser-storage key recording that the user closed the tutorial early. */
export const TUTORIAL_DISMISSED_KEY = 'nibglider.tutorialDismissed';

/**
 * Browser-storage key for the per-tutorial progress map (Slice 23):
 * tutorial id → { status, stepIndex, updatedAt }. The two legacy keys
 * above are read once to seed the map's hello-rectangle record and are
 * never written again.
 */
export const TUTORIAL_PROGRESS_KEY = 'nibglider.tutorialProgress.v1';
