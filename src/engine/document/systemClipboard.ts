// Browser system-clipboard mirror for copy/paste. Every entry point is a
// no-op outside the browser (or when permission is denied) so engine.ts
// stays importable in the Node test suite; the engine always keeps its own
// internal scene buffer as the fallback.
import { SCENE_MIME } from './clipboardIngest';

export interface OutwardClipboardData {
  /** Native scene JSON for round-tripping back into NibGlider. */
  scene: string;
  /** Plain-text degradation for other apps (selected text, if any). */
  text: string;
}

export interface InwardClipboardData {
  scene?: string;
  html?: string;
  text?: string;
  imageBlob?: Blob;
}

function browserClipboard(): Clipboard | null {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return null;
    return navigator.clipboard;
  } catch {
    return null;
  }
}

/** Copy outward: native scene type plus a plain-text degradation. Never throws. */
export async function writeSystemClipboard(data: OutwardClipboardData): Promise<boolean> {
  const board = browserClipboard();
  if (!board) return false;
  try {
    if (typeof ClipboardItem !== 'undefined' && board.write) {
      const files: Record<string, Blob> = {
        [SCENE_MIME]: new Blob([data.scene], { type: SCENE_MIME }),
      };
      if (data.text.trim()) files['text/plain'] = new Blob([data.text], { type: 'text/plain' });
      await board.write([new ClipboardItem(files)]);
      return true;
    }
  } catch {
    // A custom MIME type can be rejected (e.g. Firefox/Safari); fall through
    // to plain text so something still reaches the clipboard.
  }
  try {
    if (data.text.trim()) {
      await board.writeText(data.text);
      return true;
    }
  } catch {
    // Permission denied or unavailable: the internal buffer still holds it.
  }
  return false;
}

/** Read inward, preferring richer types. Never throws; empty means the
 * caller should fall back to the engine's internal buffer. */
export async function readSystemClipboard(): Promise<InwardClipboardData> {
  const board = browserClipboard();
  if (!board) return {};
  try {
    if (board.read && typeof ClipboardItem !== 'undefined') {
      const items = await board.read();
      const out: InwardClipboardData = {};
      for (const item of items) {
        for (const type of item.types) {
          try {
            if (type === SCENE_MIME && out.scene === undefined) {
              out.scene = await (await item.getType(type)).text();
            } else if (type === 'text/html' && out.html === undefined) {
              out.html = await (await item.getType(type)).text();
            } else if (type === 'text/plain' && out.text === undefined) {
              out.text = await (await item.getType(type)).text();
            } else if (type.startsWith('image/') && out.imageBlob === undefined) {
              out.imageBlob = await item.getType(type);
            }
          } catch {
            // One unreadable type must not sink the other types.
          }
        }
      }
      if (out.scene ?? out.html ?? out.text ?? out.imageBlob) return out;
    }
  } catch {
    // read() needs focus/permission; fall through to readText().
  }
  try {
    if (board.readText) {
      const text = await board.readText();
      if (text) return { text };
    }
  } catch {
    // Denied: the caller falls back to the internal buffer.
  }
  return {};
}

/** Blobs arrive from clipboard image types and drop URL fetches. */
export function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onerror = () => resolve(null);
      reader.onload = () => {
        resolve(typeof reader.result === 'string' ? reader.result : null);
      };
      reader.readAsDataURL(blob);
    } catch {
      resolve(null);
    }
  });
}
