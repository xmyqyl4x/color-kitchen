import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withBrowserPage } from './browser.js';

test('IndexedDB opens a clean schema and upgrades version one records in place', async () => {
  const outcome = await withBrowserPage(page => page.evaluate(async () => {
    const path = '/src/browser/database.js';
    const { openWorkspaceDatabase } = await import(path) as typeof import('../src/browser/database.js');
    const fresh = await openWorkspaceDatabase('fresh');
    const freshStores = [...fresh.objectStoreNames];
    fresh.close();

    const setup = indexedDB.open('earlier', 1);
    setup.onupgradeneeded = () => {
      const db = setup.result;
      db.createObjectStore('assets', { keyPath: 'id' }).add({ id: 'photo', blob: new Blob(['original'], { type: 'image/png' }) });
      db.createObjectStore('collections', { keyPath: 'id' }).add({ id: 'group', name: 'Test', documentIds: ['board'] });
      db.createObjectStore('documents', { keyPath: 'id' }).add({
        id: 'board', name: 'Board', kind: 'board', updatedAt: 10, assetIds: ['photo'], layout: 'square',
        palette: { roles: { text: 'forest' }, swatches: [{ id: 'forest', color: { space: 'srgb', components: [0, 0, 0], alpha: 1 } }] },
      });
    };
    await new Promise<void>((resolve, reject) => {
      setup.onsuccess = () => { setup.result.close(); resolve(); };
      setup.onerror = () => reject(setup.error);
    });

    const upgraded = await openWorkspaceDatabase('earlier');
    const txn = upgraded.transaction(['documents', 'collections', 'assets']);
    const board = txn.objectStore('documents').index('by-asset').get('photo');
    const image = txn.objectStore('assets').get('photo');
    const collection = txn.objectStore('collections').index('by-document').get('board');
    await new Promise<void>((resolve, reject) => {
      txn.oncomplete = () => resolve();
      txn.onabort = () => reject(txn.error);
    });
    upgraded.close();
    return {
      freshStores, revision: board.result.revision, version: board.result.schemaVersion,
      bindings: board.result.palette.roles, locked: board.result.palette.swatches[0].locked,
      image: await image.result.blob.text(), collection: collection.result.documentIds,
    };
  }));
  assert.deepEqual(outcome, {
    freshStores: ['assets', 'collections', 'documents', 'preferences'],
    revision: 1, version: 1, bindings: { text: 'forest' }, locked: false, image: 'original', collection: ['board'],
  });
});

test('a blocked IndexedDB upgrade leaves the previous database recoverable', async () => {
  const outcome = await withBrowserPage(page => page.evaluate(async () => {
    const path = '/src/browser/database.js';
    const { openWorkspaceDatabase, WorkspaceStorageError } = await import(path) as typeof import('../src/browser/database.js');
    const request = indexedDB.open('blocked', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('documents', { keyPath: 'id' }).add({ id: 'keep', kind: 'palette' });
      db.createObjectStore('assets', { keyPath: 'id' });
      db.createObjectStore('collections', { keyPath: 'id' });
    };
    const earlier = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    let code;
    try { (await openWorkspaceDatabase('blocked')).close(); }
    catch (error) { if (error instanceof WorkspaceStorageError) code = error.code; }
    earlier.close();
    const reopened = await openWorkspaceDatabase('blocked');
    const saved = reopened.transaction('documents').objectStore('documents').get('keep');
    const kept = await new Promise<string>((resolve, reject) => {
      saved.onsuccess = () => resolve(saved.result.id);
      saved.onerror = () => reject(saved.error);
    });
    reopened.close();
    return { code, kept };
  }));
  assert.deepEqual(outcome, { code: 'blocked', kept: 'keep' });
});
