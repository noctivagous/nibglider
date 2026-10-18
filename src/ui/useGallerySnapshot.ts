// React subscription for the document gallery cache.
// The snapshot is shared by every caller. IndexedDB loads once.

import { useSyncExternalStore } from 'react';
import {
  browserGallerySession,
  type GallerySnapshot,
} from './DocumentGallery';

const EMPTY: GallerySnapshot = {
  docs: [],
  currentId: null,
  currentName: null,
  displayName: 'Untitled',
  ready: false,
};

let current: GallerySnapshot = EMPTY;
const listeners = new Set<() => void>();
let started = false;

function ensure(): void {
  if (started) return;
  started = true;
  void browserGallerySession().then((session) => {
    const pull = (): void => {
      current = session.getSnapshot();
      for (const listener of listeners) listener();
    };
    session.subscribe(pull);
    pull();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  ensure();
  return () => { listeners.delete(listener); };
}

function getSnapshot(): GallerySnapshot {
  return current;
}

export function useGallerySnapshot(): GallerySnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
