# Ctrl/Cmd+T interception findings

Date: 2026-10-06. Question: can the app intercept Command+T (Mac) /
Ctrl+T (PC), which browsers use to open a new tab, for the transform-controls
toggle?

## Bottom line

- In a normal browser tab: **no**. The browser consumes Ctrl+T / Cmd+T
  before the page sees any `keydown`, so page-level `preventDefault()`
  never runs. NibGlider listens on `document` (`InputManager.attach`),
  so the committed `transform-mode` binding cannot fire from those chords
  in Chrome/Firefox/Safari regular tabs.
- With the Keyboard Lock API (`navigator.keyboard.lock()` called with **no**
  key list, i.e. lock everything): **yes, in Chromium** — verified end to
  end on real Chrome, where Ctrl+T and Ctrl+W reached the page 3/3 (vs 0/3
  with a named key subset locked). Requires HTTPS, a user gesture, and
  fullscreen; the browser always keeps hold-Esc (~2s) as the exit.
- Locking a *named subset* such as `lock(["KeyT"])` does **not** capture
  Ctrl+T; only the no-args lock-all form does.
- Cmd+T on macOS is a browser-level accelerator (unlike OS-reserved
  Cmd+Tab), so lock-all is expected to deliver it the same way, but no
  Mac-specific verification was found — treat as expected, not proven.

## App decision (kept)

Ctrl/Cmd+T stays the intended toggle: the app may run as an
Electron/webview app later, where the chord reaches us. Meanwhile the
working shortcut in browsers is **Alt+T (Option+T on Mac)** — see
`isPrimaryTransformKey` / `isAltTransformKey` in
`src/engine/input/keymap.ts`. Caveat: on Windows Firefox, Alt+T is the
Tools-menu mnemonic, so the remap is primarily a Chrome/Edge/Safari path;
`preventDefault()` is still called on the keydown.

## Sources (all inspected 2026-10-06)

- MDN `Keyboard.lock()`:
  https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/lock
- WICG Keyboard Lock spec (reserved-key-codes, fullscreen design):
  https://wicg.github.io/keyboard-lock/
- WICG keyboard-lock explainer (fullscreen + secure-origin requirements):
  https://github.com/WICG/keyboard-lock/blob/gh-pages/explainer.md
- Selkies commit with Chrome 154 e2e (lock-all captures Ctrl+T/Ctrl+W):
  https://github.com/selkies-project/selkies/commit/b85e43a3126ca88d7a75dac55f8d8e82c5581086
- Follow-up on Firefox/Safari `keyboardLock` fullscreen option:
  https://github.com/selkies-project/selkies/commit/ec34c741ae3efe02d775852b1e43c88aa67473ae
- Terminal app hitting the same wall (page never sees the chord):
  https://github.com/cfpperche/picode/commit/b0c82a296e213210772c3feed84d0e31779c4e12
- Keybinding guidance (never steal Ctrl/Cmd+T without opt-in):
  https://github.com/jonathanlemes/nodedesk/blob/HEAD/docs/shortcuts.md
