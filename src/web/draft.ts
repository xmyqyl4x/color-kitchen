import type { PaletteDocument } from '../browser/document.js';
import { previewWorkspaceImport } from '../workspace/workspace.js';

const storageKey = 'ck-active-palette';

export function readActivePalette() {
  try {
    const value = sessionStorage.getItem(storageKey);
    return value ? previewWorkspaceImport(value) : null;
  } catch { return null; }
}

export function storeActivePalette(document: PaletteDocument) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(document));
    return true;
  } catch { return false; }
}
