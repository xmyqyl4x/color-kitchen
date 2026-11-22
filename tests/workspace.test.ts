import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PaletteDocument } from '../src/browser/document.js';
import { withBrowserPage } from './browser.js';

test('workspace contrast fixes, handoff, copies, imports and deletion undo preserve the original', async () => {
  const result = await withBrowserPage(page => page.evaluate(async () => {
    const dbModule = '/src/browser/database.js', storageModule = '/src/browser/repository.js';
    const workspaceModule = '/src/workspace/workspace.js', colorModule = '/src/color/parse.js';
    const { openWorkspaceDatabase } = await import(dbModule) as typeof import('../src/browser/database.js');
    const { workspaceRepository } = await import(storageModule) as typeof import('../src/browser/repository.js');
    const { localWorkspace, previewWorkspaceImport } = await import(workspaceModule) as typeof import('../src/workspace/workspace.js');
    const { parseColor } = await import(colorModule) as typeof import('../src/color/parse.js');
    const db = await openWorkspaceDatabase('shared-workspace');
    try {
      const storage = workspaceRepository(db);
      const initial: PaletteDocument = {
        schemaVersion: 1, id: 'original', kind: 'palette', revision: 1, name: 'Original', updatedAt: 1,
        palette: { roles: { text: 'foreground' }, swatches: [
          { id: 'foreground', color: parseColor('#6F8F7B'), locked: false },
          { id: 'background', color: parseColor('#F8F5EF'), locked: true },
        ] },
      };
      let time = 1, copies = 0;
      const workspace = localWorkspace(storage, initial, { now: () => ++time, newId: () => 'copy-' + ++copies });
      const saved = await workspace.save();
      await storage.saveCollection({ id: 'collection', name: 'Test', documentIds: [initial.id] }, null);
      const before = workspace.handoff();
      const pair = { foregroundId: 'foreground', backgroundId: 'background' };
      const fix = workspace.proposeFix(pair);
      if (!fix) throw new Error('Missing expected contrast fix.');
      workspace.applyFix(fix);
      const passed = workspace.contrast(pair).normal.aa.passes;
      const historyLength = workspace.current().undo.length;
      workspace.edit({ type: 'undo' });
      const undone = JSON.stringify(workspace.handoff().palette) === JSON.stringify(before.palette);
      const copy = await workspace.saveCopy('Duplicate');
      let refusal;
      try { await workspace.openSaved(initial.id); } catch (error) { refusal = (error as { code: string }).code; }
      const preview = previewWorkspaceImport(JSON.stringify(before));
      workspace.openCopy(preview, 'Imported', true);
      const imported = workspace.handoff();
      await workspace.openSaved(initial.id, true);
      await workspace.deleteSaved(initial.id, saved.revision);
      const removed = await storage.getDocument(initial.id);
      const restored = await workspace.undoDelete();
      const membership = (await storage.getCollection('collection'))?.documentIds;
      return {
        passed, historyLength, undone, copyId: copy.id, copyRole: copy.palette.roles.text, refusal,
        importedId: imported.id, importedPalette: JSON.stringify(imported.palette) === JSON.stringify(before.palette),
        removed, restoredRevision: restored?.revision, membership, original: (await storage.getDocument(initial.id))?.name,
      };
    } finally { db.close(); }
  }));
  assert.deepEqual(result, { passed: true, historyLength: 1, undone: true, copyId: 'copy-1',
    copyRole: 'foreground', refusal: 'unsaved', importedId: 'copy-2', importedPalette: true, removed: null,
    restoredRevision: 2, membership: ['original'], original: 'Original' });
});

test('workspace save and import failures leave a recoverable versioned draft', async () => {
  const result = await withBrowserPage(page => page.evaluate(async () => {
    const dbModule = '/src/browser/database.js', storageModule = '/src/browser/repository.js';
    const workspaceModule = '/src/workspace/workspace.js', paletteModule = '/src/palette/generate.js';
    const { openWorkspaceDatabase } = await import(dbModule) as typeof import('../src/browser/database.js');
    const { workspaceRepository } = await import(storageModule) as typeof import('../src/browser/repository.js');
    const { localWorkspace, previewWorkspaceImport } = await import(workspaceModule) as typeof import('../src/workspace/workspace.js');
    const { generatePalette } = await import(paletteModule) as typeof import('../src/palette/generate.js');
    const db = await openWorkspaceDatabase('invalid-storage');
    const storage = workspaceRepository(db);
    const initial: PaletteDocument = { id: 'active', kind: 'palette', schemaVersion: 1, revision: 1, updatedAt: 0,
      name: 'Draft', palette: generatePalette({ seed: 77 }) };
    const workspace = localWorkspace(storage, initial, { now: () => 11, newId: () => 'copy-1' });
    workspace.edit({ type: 'set-lock', id: 'swatch-2', locked: true });
    let invalid, failedSave;
    try { previewWorkspaceImport('{"schemaVersion":88}'); } catch (error) { invalid = (error as { code: string }).code; }
    db.close();
    try { await workspace.save(); } catch (error) { failedSave = (error as { code: string }).code; }
    return { invalid, failedSave, dirty: workspace.dirty(), locked: workspace.handoff().palette.swatches[1]?.locked,
      revision: workspace.handoff().revision };
  }));
  assert.deepEqual(result, { invalid: 'invalid-import', failedSave: 'unavailable', dirty: true, locked: true, revision: 2 });
});
