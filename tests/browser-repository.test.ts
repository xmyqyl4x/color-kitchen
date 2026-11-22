import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BoardDocument, PaletteDocument } from '../src/browser/document.js';
import { withBrowserPage } from './browser.js';

test('workspace writes, references and cleanup commit atomically', async () => {
  const outcome = await withBrowserPage(page => page.evaluate(async () => {
    const dbModule = '/src/browser/database.js';
    const repoModule = '/src/browser/repository.js';
    const { openWorkspaceDatabase, WorkspaceStorageError } = await import(dbModule) as typeof import('../src/browser/database.js');
    const { workspaceRepository } = await import(repoModule) as typeof import('../src/browser/repository.js');
    const db = await openWorkspaceDatabase('board-storage');
    try {
      const repo = workspaceRepository(db);
      const board: BoardDocument = {
        id: 'board', name: 'Board', kind: 'board', layout: 'square', revision: 1, schemaVersion: 1, updatedAt: 0,
        palette: { swatches: [], roles: {} }, assetIds: ['shared-image'],
      };
      const shared = { id: 'shared-image', blob: new Blob(['source'], { type: 'image/png' }) };
      await repo.saveDocument(board, { expectedRevision: null, updatedAt: 1, newAssets: [shared] });
      await repo.saveDocument({ ...board, id: 'other' }, { expectedRevision: null, updatedAt: 1 });
      await repo.saveCollection({ id: 'group', name: 'Collection', documentIds: ['board', 'other'] }, null);
      const failedDraft = { ...board, name: 'In-memory edits', assetIds: ['partial', 'missing'] };
      let failure;
      try {
        await repo.saveDocument(failedDraft, { expectedRevision: 1, updatedAt: 2,
          newAssets: [{ id: 'partial', blob: new Blob(['partial'], { type: 'image/png' }) }] });
      } catch (error) {
        if (error instanceof WorkspaceStorageError) failure = error.code;
      }

      const preserved = await repo.getDocument('board');
      const partialAsset = await repo.getAsset('partial');
      const firstDelete = await repo.deleteDocument('board', 1);
      const collection = await repo.getCollection('group');
      const sharedBytes = await (await repo.getAsset('shared-image'))?.blob.text();
      const lastDelete = await repo.deleteDocument('other', 1);
      await repo.savePreference({ key: 'analytics', value: false });
      return {
        failure, preservedName: preserved?.name, retainedDraft: failedDraft.name, partialAsset, firstRemoved: firstDelete.assets.length,
        sharedBytes, lastRemoved: await lastDelete.assets[0]?.blob.text(), remainingAsset: await repo.getAsset('shared-image'),
        collection, preference: await repo.getPreference('analytics'),
      };
    } finally { db.close(); }
  }));
  assert.deepEqual(outcome, {
    failure: 'invalid', preservedName: 'Board', retainedDraft: 'In-memory edits', partialAsset: null, firstRemoved: 0,
    sharedBytes: 'source', lastRemoved: 'source', remainingAsset: null,
    collection: { id: 'group', name: 'Collection', revision: 2, documentIds: ['other'] },
    preference: { key: 'analytics', value: false },
  });
});

test('concurrent workspace writers detect stale revisions and denied writes retain a usable draft', async () => {
  const outcome = await withBrowserPage(page => page.evaluate(async () => {
    const dbModule = '/src/browser/database.js';
    const repoModule = '/src/browser/repository.js';
    const { openWorkspaceDatabase, WorkspaceStorageError } = await import(dbModule) as typeof import('../src/browser/database.js');
    const { workspaceRepository } = await import(repoModule) as typeof import('../src/browser/repository.js');
    const first = await openWorkspaceDatabase('two-writers');
    const second = await openWorkspaceDatabase('two-writers');
    try {
      const repos = [workspaceRepository(first), workspaceRepository(second)];
      const repo = repos[0]!;
      const palette: PaletteDocument = {
        id: 'palette', name: 'Draft', kind: 'palette', revision: 1, schemaVersion: 1, updatedAt: 0,
        palette: { roles: {}, swatches: [] },
      };
      await repo.saveDocument(palette, { expectedRevision: null, updatedAt: 1 });
      const originalPut = IDBObjectStore.prototype.put;
      let quota;
      try {
        IDBObjectStore.prototype.put = function () { throw new DOMException('Fixture quota', 'QuotaExceededError'); };
        await repo.saveDocument({ ...palette, name: 'Quota draft' }, { expectedRevision: 1, updatedAt: 2 });
      } catch (error) {
        if (error instanceof WorkspaceStorageError) quota = error.code;
      } finally { IDBObjectStore.prototype.put = originalPut; }
      const afterQuota = (await repo.getDocument('palette'))?.name;
      const results = await Promise.allSettled(repos.map((writer, i) =>
        writer.saveDocument({ ...palette, name: `Writer ${i}` }, { expectedRevision: 1, updatedAt: 3 })));
      const rejected = results.find(result => result.status === 'rejected');
      const committed = results.find(result => result.status === 'fulfilled');
      const actual = await repo.getDocument('palette');
      second.close();
      let unavailable;
      try { await repos[1]!.saveDocument(palette, { expectedRevision: 2, updatedAt: 4 }); }
      catch (error) { if (error instanceof WorkspaceStorageError) unavailable = error.code; }
      return {
        quota, afterQuota, committed: actual?.name === committed?.value.name, revision: actual?.revision,
        rejected: rejected?.reason.code, unavailable, draft: palette.name,
      };
    } finally { first.close(); second.close(); }
  }));
  assert.deepEqual(outcome, {
    quota: 'quota', afterQuota: 'Draft', committed: true, revision: 2, rejected: 'conflict', unavailable: 'unavailable', draft: 'Draft',
  });
});
