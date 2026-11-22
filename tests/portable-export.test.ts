import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BackupError, previewBackup, writeBackup } from '../src/browser/backup.js';
import type { BoardDocument, PaletteDocument } from '../src/browser/document.js';
import { maxPaletteFragmentBytes, preparePaletteShare, readPaletteShare } from '../src/browser/share.js';
import { parseColor } from '../src/color/parse.js';
import { copyText, gradientText, paletteText } from '../src/export/text.js';
import { withBrowserPage } from './browser.js';

const palette = {
  swatches: [
    { id: 'private-filename', color: parseColor('color(display-p3 1 0 .1 / .5)'), locked: true },
    { id: 'paper', color: parseColor('#fff'), locked: false },
  ],
  roles: { 'action.text': 'private-filename', 'action-text': 'paper' },
};
const document: PaletteDocument = {
  id: 'palette', name: 'Café privé 🖌️', updatedAt: 100, schemaVersion: 1, revision: 4, kind: 'palette', palette,
};
const board: BoardDocument = {
  ...document, id: 'board', kind: 'board', layout: 'square', assetIds: ['photo'], caption: 'Private notes',
};

test('portable fragments preserve ordered full-gamut colors and role targets while discarding identifiers and editing state', () => {
  const share = preparePaletteShare(palette);
  assert(share.fragment);
  assert(!share.text.includes('private-filename'));
  assert(!share.text.includes('locked'));
  const opened = readPaletteShare(share.fragment);
  assert.deepEqual(opened.swatches.map(swatch => swatch.color), palette.swatches.map(swatch => swatch.color));
  assert.deepEqual(opened.roles, { 'action.text': 's1', 'action-text': 's2' });
  assert(opened.swatches.every(swatch => !swatch.locked));
  assert.throws(() => readPaletteShare('#palette=' + 'A'.repeat(maxPaletteFragmentBytes)), { code: 'too-large' });
  const bad = '#palette=' + Buffer.from(JSON.stringify({ ...share.data, roles: { text: 77 } })).toString('base64url');
  assert.throws(() => readPaletteShare(bad), { code: 'invalid' });
  const large = preparePaletteShare({ ...palette, roles: Object.fromEntries(Array.from({ length: 400 },
    (_, index) => ['role-' + index, 'paper'])) });
  assert.equal(large.fragment, null);
  assert(large.text.length > 2000);
});

test('raw version-one exports, collection revisions and omitted assets remain readable for preview', async () => {
  assert.deepEqual(previewBackup(JSON.stringify(document)).documents, [document]);
  assert.throws(() => previewBackup(JSON.stringify({ ...document, schemaVersion: 0 })), { code: 'unsupported-version' });
  assert.throws(() => previewBackup(JSON.stringify({ ...document, palette: { ...palette, roles: { action: 'absent' } } })),
    { code: 'invalid' });
  const omitted = await writeBackup({ documents: [board], includeAssets: false,
    assets: [{ id: 'photo', blob: new Blob(['private-source'], { type: 'image/png' }) }] });
  assert.deepEqual(omitted.omittedAssetIds, ['photo']);
  assert.equal(previewBackup(omitted.text).assets.length, 0);
  const old = JSON.stringify({ schemaVersion: 1, documents: [document], assets: [],
    collections: [{ id: 'kept', name: 'Keep', documentIds: ['palette'] }] });
  assert.equal(previewBackup(old).collections[0]?.revision, 1);
  assert.throws(() => previewBackup(' '.repeat(32 * 1024 * 1024 + 1)), BackupError);
});

test('backup restore validates first, commits assets and collections, and rolls back on any collision', async () => {
  const { text } = await writeBackup({
    documents: [board, document], includeAssets: true,
    collections: [{ id: 'group', name: 'Collection', revision: 3, documentIds: ['board', 'palette'] }],
    assets: [{ id: 'photo', blob: new Blob([Uint8Array.of(0, 254, 255, 5)], { type: 'image/png' }) }],
  });
  const omitted = await writeBackup({ documents: [board], includeAssets: false });
  const result = await withBrowserPage(page => page.evaluate(async ({ text, omitted, document }) => {
    const repositoryUrl = '/src/browser/repository.js';
    const databaseUrl = '/src/browser/database.js';
    const { openWorkspaceDatabase } = await import(databaseUrl) as typeof import('../src/browser/database.js');
    const { workspaceRepository } = await import(repositoryUrl) as typeof import('../src/browser/repository.js');
    const database = await openWorkspaceDatabase('backup-roundtrip');
    const repo = workspaceRepository(database);
    const tryRestore = async (value: string) => {
      try { return await repo.restoreBackup(value); }
      catch (error) { return (error as { code: string }).code; }
    };
    try {
      const missing = await tryRestore(omitted);
      const corrupt = JSON.parse(text);
      corrupt.documents[1].palette.roles['action.text'] = 'invalid';
      const bad = await tryRestore(JSON.stringify(corrupt));
      const before = await repo.getAsset('photo');
      await repo.saveDocument(document, { expectedRevision: null, updatedAt: 101 });
      const conflict = await tryRestore(text);
      const partial = await repo.getDocument('board');
      const after = await repo.getAsset('photo');
      await repo.deleteDocument('palette', 1);
      const restored = await tryRestore(text);
      const collection = await repo.getCollection('group');
      const asset = await repo.getAsset('photo');
      return { missing, bad, before, conflict, partial, after, restored, collection,
        bytes: Array.from(new Uint8Array(await asset!.blob.arrayBuffer())), name: (await repo.getDocument('palette'))?.name };
    } finally { database.close(); }
  }, { text, omitted: omitted.text, document }));
  assert.deepEqual(result, {
    missing: 'missing-assets', bad: 'invalid', before: null, conflict: 'conflict', partial: null, after: null,
    restored: { documentCount: 2, collectionCount: 1 },
    collection: { id: 'group', name: 'Collection', revision: 3, documentIds: ['board', 'palette'] },
    bytes: [0, 254, 255, 5], name: document.name,
  });
});

test('machine exports retain transparency and report conversions with a selectable clipboard fallback', async () => {
  for (const format of ['hex', 'rgb', 'hsl', 'oklch'] as const) {
    const { text, gamutMapped } = paletteText(palette, format);
    assert(Math.abs(parseColor(text.split('\n')[0]!).alpha - 0.5) <= 1 / 255);
    assert.deepEqual(gamutMapped, format === 'oklch' ? [] : ['private-filename']);
  }
  const { text } = paletteText(palette, 'css');
  assert.match(text, /--ck-role-action--text: var\(--ck-swatch-private-filename\)/);
  assert.match(text, /--ck-role-action-text: var\(--ck-swatch-paper\)/);
  assert.match(gradientText({ type: 'conic', interpolation: 'oklch', stops: [
    { id: 'a', position: 0, color: palette.swatches[0]!.color }, { id: 'b', position: 1, color: palette.swatches[1]!.color },
  ] }), /conic-gradient.*in oklch/);
  assert.deepEqual(await copyText(text, { async writeText() { throw new DOMException('Denied', 'NotAllowedError'); } }),
    { copied: false, text });
});
