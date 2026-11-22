import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PaletteDocument } from '../src/browser/document.js';
import { withBrowserPage } from './browser.js';

test('the palette engine runs in Chromium and its edited document round-trips through IndexedDB', async () => {
  const result = await withBrowserPage(page => page.evaluate(async () => {
    const paths = {
      db: '/src/browser/database.js', repository: '/src/browser/repository.js',
      generate: '/src/palette/generate.js', document: '/src/palette/document.js', color: '/src/color/convert.js',
    };
    const { openWorkspaceDatabase } = await import(paths.db) as typeof import('../src/browser/database.js');
    const { workspaceRepository } = await import(paths.repository) as typeof import('../src/browser/repository.js');
    const { generatePalette } = await import(paths.generate) as typeof import('../src/palette/generate.js');
    const { openPaletteSession, applyPaletteCommand } = await import(paths.document) as typeof import('../src/palette/document.js');
    const { toHex } = await import(paths.color) as typeof import('../src/color/convert.js');
    const document: PaletteDocument = {
      id: 'generated', kind: 'palette', schemaVersion: 1, name: 'Working Palette', revision: 1, updatedAt: 1,
      palette: generatePalette({ seed: 1 }),
    };
    let active = openPaletteSession(document);
    active = applyPaletteCommand(active, { type: 'assign-role', role: 'text', id: 'swatch-1' },
      { expectedRevision: 1, updatedAt: 2 });
    for (const id of ['swatch-1', 'swatch-2']) {
      active = applyPaletteCommand(active, { type: 'set-lock', id, locked: true },
        { expectedRevision: active.document.revision, updatedAt: active.document.updatedAt + 1 });
    }
    const original = active.document.palette.swatches.slice(0, 2).map(swatch => toHex(swatch.color).hex);
    for (const seed of [25, 31]) {
      active = applyPaletteCommand(active, { type: 'generate', options: { seed } },
        { expectedRevision: active.document.revision, updatedAt: active.document.updatedAt + 1 });
    }
    const first = await openWorkspaceDatabase('round-trip-palette');
    try {
      await workspaceRepository(first).saveDocument(active.document, { expectedRevision: null, updatedAt: 10 });
    } finally { first.close(); }
    const second = await openWorkspaceDatabase('round-trip-palette');
    try {
      const persisted = await workspaceRepository(second).getDocument('generated');
      if (persisted?.kind !== 'palette') throw new Error('Palette document did not round-trip.');
      const reopened = openPaletteSession(persisted);
      const swatches = reopened.document.palette.swatches.slice(0, 2);
      return {
        sameColors: original.every((hex, index) => hex === toHex(swatches[index]!.color).hex),
        allLocked: swatches.every(swatch => swatch.locked),
        role: reopened.document.palette.roles.text,
      };
    } finally { second.close(); }
  }));
  assert.deepEqual(result, { sameColors: true, allLocked: true, role: 'swatch-1' });
});
