import type { PaletteDocument } from '../browser/document.js';
import type { DeletedDocument, workspaceRepository } from '../browser/repository.js';
import type { ColorValue } from '../model/color.js';
import { checkContrast, suggestForeground } from '../color/contrast.js';
import { applyPaletteCommand, openPaletteSession, type PaletteCommand } from '../palette/document.js';
import { composePreview, type PreviewVariant, type Template } from '../preview/layout.js';

type Storage = Pick<ReturnType<typeof workspaceRepository>, 'getDocument' | 'saveDocument' | 'deleteDocument' | 'restoreDocument'>;
type Pair = Readonly<{ foregroundId: string; backgroundId: string; backing?: ColorValue }>;

export class WorkspaceError extends Error {
  constructor(public readonly code: 'unsaved' | 'missing' | 'stale' | 'invalid-import', message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WorkspaceError';
  }
}

export function previewWorkspaceImport(text: string): PaletteDocument {
  if (text.length > 65_536) throw new WorkspaceError('invalid-import', 'The palette import is too large.');
  try {
    const model: PaletteDocument = JSON.parse(text);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(model.id) || typeof model.id !== 'string' ||
        typeof model.name !== 'string' || !model.name.trim() || model.name.length > 120) throw new RangeError('Invalid document metadata.');
    return openPaletteSession(model).document;
  } catch (cause) {
    throw new WorkspaceError('invalid-import', 'Choose a valid version-one palette document.', { cause });
  }
}

export function localWorkspace(storage: Storage, initial: PaletteDocument, options: {
  now: () => number; newId: () => string;
}) {
  let navigation = 0;
  let active = { token: 0, session: openPaletteSession(initial), storedRevision: null as number | null, savedEdit: null as number | null };
  let deleted: { snapshot: DeletedDocument; token: number; savedEdit: number | null } | null = null;
  const dirty = () => active.savedEdit !== active.session.document.revision;
  const allowReplacement = (discard: boolean) => {
    if (!discard && dirty()) throw new WorkspaceError('unsaved', 'Save or copy the active palette before replacing it.');
  };
  function replace(document: PaletteDocument, saved: boolean) {
    const session = openPaletteSession(document);
    const revision = saved ? document.revision : null;
    active = { token: ++navigation, session, storedRevision: revision, savedEdit: revision };
    return session;
  }
  function copy(document: PaletteDocument, name: string) {
    const id = options.newId();
    if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(id) || id === document.id ||
        !name.trim() || name.length > 120) throw new RangeError('A copy needs a new identifier and valid name.');
    return { ...document, id, name, revision: 1, updatedAt: options.now() };
  }
  function edit(command: PaletteCommand, expectedRevision = active.session.document.revision) {
    const session = applyPaletteCommand(active.session, command, { expectedRevision, updatedAt: options.now() });
    active = { ...active, session };
    return session;
  }
  function pairColors(pair: Pair) {
    const swatches = active.session.document.palette.swatches;
    const foreground = swatches.find(swatch => swatch.id === pair.foregroundId);
    const background = swatches.find(swatch => swatch.id === pair.backgroundId);
    if (!foreground || !background) throw new WorkspaceError('missing', 'The contrast pair references a missing swatch.');
    return { foreground, background };
  }
  return {
    current: () => active.session,
    dirty,
    edit,
    handoff: () => structuredClone(active.session.document),
    preview: (template: Template, variant: PreviewVariant) => composePreview(template, variant, active.session.document.palette),
    contrast(pair: Pair) {
      const { foreground, background } = pairColors(pair);
      return checkContrast(foreground.color, background.color, pair.backing);
    },
    proposeFix(pair: Pair) {
      const { foreground, background } = pairColors(pair);
      const fix = suggestForeground(foreground.color, background.color, { backing: pair.backing });
      return fix ? { ...fix, id: foreground.id, documentId: active.session.document.id,
        expectedRevision: active.session.document.revision } : null;
    },
    applyFix(fix: { id: string; color: ColorValue; documentId: string; expectedRevision: number }) {
      if (fix.documentId !== active.session.document.id) throw new WorkspaceError('stale', 'This fix belongs to another palette.');
      return edit({ type: 'set-color', id: fix.id, color: fix.color }, fix.expectedRevision);
    },
    async save() {
      const before = active;
      const document = before.session.document;
      const saved = await storage.saveDocument(document, { expectedRevision: before.storedRevision, updatedAt: options.now() });
      if (before.token === active.token && before.storedRevision === active.storedRevision) {
        active = { ...active, storedRevision: saved.revision, savedEdit: document.revision };
      }
      return saved;
    },
    async saveCopy(name: string) {
      return storage.saveDocument(copy(active.session.document, name), { expectedRevision: null, updatedAt: options.now() });
    },
    openCopy(source: PaletteDocument, name: string, discard = false) {
      allowReplacement(discard);
      return replace(copy(source, name), false);
    },
    async openSaved(id: string, discard = false) {
      allowReplacement(discard);
      const ticket = ++navigation;
      const original = active.session;
      const document = await storage.getDocument(id);
      if (ticket !== navigation || active.session !== original) throw new WorkspaceError('stale', 'The workspace changed while opening the saved palette.');
      if (document?.kind !== 'palette') throw new WorkspaceError('missing', 'The saved palette is unavailable.');
      return replace(document, true);
    },
    async deleteSaved(id: string, revision: number) {
      const before = active;
      const snapshot = await storage.deleteDocument(id, revision);
      const current = active.token === before.token && active.session.document.id === id;
      deleted = { snapshot, token: before.token, savedEdit: current ? before.savedEdit : null };
      if (current) active = { ...active, storedRevision: null, savedEdit: null };
      return snapshot.document;
    },
    async undoDelete() {
      const pending = deleted;
      if (!pending) return null;
      const restored = await storage.restoreDocument(pending.snapshot, options.now());
      if (deleted === pending) deleted = null;
      if (active.token === pending.token && active.session.document.id === restored.id && active.storedRevision === null) {
        active = { ...active, storedRevision: restored.revision, savedEdit: pending.savedEdit };
      }
      return restored;
    },
  };
}
