import type { GradientDocument, PaletteDocument } from '../browser/document.js';
import { validateGradient } from '../gradient/gradient.js';
import { previewWorkspaceImport } from '../workspace/workspace.js';

const storageKey = 'ck-active-palette';
const gradientKey = 'ck-active-gradient';
type Saved = Readonly<{ storedRevision: number; editRevision: number }>;

export function readActiveDraft() {
  try {
    const text = sessionStorage.getItem(storageKey);
    if (!text) return null;
    const value = JSON.parse(text);
    if (!value.document) return { document: previewWorkspaceImport(text), saved: undefined };
    const document = previewWorkspaceImport(JSON.stringify(value.document));
    const saved: Saved | undefined = value.saved;
    return { document, saved: saved && Number.isSafeInteger(saved.storedRevision) && saved.storedRevision > 0 &&
      Number.isSafeInteger(saved.editRevision) && saved.editRevision > 0 && saved.editRevision <= document.revision ? saved : undefined };
  } catch { return null; }
}

export function readActivePalette() {
  return readActiveDraft()?.document ?? null;
}

export function storeActivePalette(document: PaletteDocument, saved?: Saved) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(saved ? { document, saved } : document));
    return true;
  } catch { return false; }
}

export function readGradientDraft(): GradientDocument | null {
  try {
    const text = sessionStorage.getItem(gradientKey);
    if (!text) return null;
    const document = JSON.parse(text) as GradientDocument;
    if (document.kind !== 'gradient' || document.schemaVersion !== 1) return null;
    validateGradient(document);
    return document;
  } catch { return null; }
}

export function storeGradientDraft(document: GradientDocument) {
  try {
    validateGradient(document);
    sessionStorage.setItem(gradientKey, JSON.stringify(document));
    return true;
  } catch { return false; }
}
