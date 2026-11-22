import { WorkspaceStorageError, stores } from './database.js';
import { BackupError, previewBackup } from './backup.js';
import type { Collection, CreativeDocument, StoredAsset, StoredPreference } from './document.js';

type StoreName = typeof stores[keyof typeof stores];
type StoredCollection = Omit<Collection, 'revision'> & { revision?: number };
export type DeletedDocument = Readonly<{
  document: CreativeDocument;
  assets: readonly StoredAsset[];
  collections: readonly StoredCollection[];
}>;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
}

function classify(cause: unknown): WorkspaceStorageError {
  if (cause instanceof WorkspaceStorageError) return cause;
  if (cause instanceof DOMException && cause.name === 'QuotaExceededError') {
    return new WorkspaceStorageError('quota', 'Device storage is full. Keep your active draft or export a backup.', { cause });
  }
  if (cause instanceof DOMException && cause.name === 'ConstraintError') {
    return new WorkspaceStorageError('conflict', 'This local identifier is already in use.', { cause });
  }
  return new WorkspaceStorageError('unavailable', 'Workspace storage is unavailable. Your active draft stays in memory.', { cause });
}

async function transact<T>(database: IDBDatabase, names: StoreName[], mode: IDBTransactionMode,
    work: (transaction: IDBTransaction) => Promise<T>): Promise<T> {
  try {
    const transaction = database.transaction(names, mode);
    const result = completed(transaction);
    void result.catch(() => {});
    try {
      const value = await work(transaction);
      await result;
      return value;
    } catch (cause) {
      try { transaction.abort(); } catch { /* Already settled. */ }
      await result.catch(() => {});
      throw cause;
    }
  } catch (cause) {
    throw classify(cause);
  }
}

function idValid(id: string) {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(id);
}

function identifiersValid(ids: readonly string[]) {
  return new Set(ids).size === ids.length && ids.every(idValid);
}

function checkExpected(actual: number | undefined, expected: number | null) {
  if ((actual ?? null) !== expected) {
    throw new WorkspaceStorageError('conflict', 'The saved version changed. Reopen it or save a copy.');
  }
}

function assetIds(document: CreativeDocument | undefined): readonly string[] {
  return document?.kind === 'board' ? document.assetIds : [];
}

async function requireAssets(store: IDBObjectStore, ids: readonly string[]) {
  for (const id of ids) {
    if (await requestResult(store.getKey(id)) === undefined) {
      throw new WorkspaceStorageError('invalid', 'A referenced board image is unavailable.');
    }
  }
}

async function removeOrphanedAssets(transaction: IDBTransaction, ids: readonly string[]) {
  const documents = transaction.objectStore(stores.documents).index('by-asset');
  const assets = transaction.objectStore(stores.assets);
  const removed: StoredAsset[] = [];
  for (const id of ids) {
    if (await requestResult(documents.count(id))) continue;
    const asset = await requestResult<StoredAsset | undefined>(assets.get(id));
    if (!asset) continue;
    await requestResult(assets.delete(id));
    removed.push(asset);
  }
  return removed;
}

function validateDocument(document: CreativeDocument, updatedAt: number) {
  if (!idValid(document.id) || document.schemaVersion !== 1 || !document.name.trim() || document.name.length > 120 ||
      !Number.isSafeInteger(updatedAt) || updatedAt < 0) {
    throw new WorkspaceStorageError('invalid', 'Invalid workspace document metadata.');
  }
  if (document.kind === 'board' &&
      (!identifiersValid(document.assetIds) || document.assetIds.length < 1 || document.assetIds.length > 4)) {
    throw new WorkspaceStorageError('invalid', 'A saved board needs one to four distinct local image references.');
  }
}

export function workspaceRepository(database: IDBDatabase) {
  async function readRecord<T>(store: StoreName, id: string): Promise<T | null> {
    return transact(database, [store], 'readonly', async transaction =>
      (await requestResult<T | undefined>(transaction.objectStore(store).get(id))) ?? null);
  }

  return {
    getDocument: (id: string) => readRecord<CreativeDocument>(stores.documents, id),
    getAsset: (id: string) => readRecord<StoredAsset>(stores.assets, id),
    getPreference: (key: string) => readRecord<StoredPreference>(stores.preferences, key),

    async getCollection(id: string) {
      const record = await readRecord<StoredCollection>(stores.collections, id);
      return record ? { ...record, revision: record.revision ?? 1 } : null;
    },

    async restoreBackup(text: string) {
      const { documents, collections, assets, omittedAssetIds } = previewBackup(text);
      if (omittedAssetIds.length) throw new BackupError('missing-assets', 'Restore requires all referenced images.');
      return transact(database, [stores.documents, stores.assets, stores.collections], 'readwrite', async transaction => {
        for (const asset of assets) await requestResult(transaction.objectStore(stores.assets).add(asset));
        for (const document of documents) await requestResult(transaction.objectStore(stores.documents).add(document));
        for (const collection of collections) await requestResult(transaction.objectStore(stores.collections).add(collection));
        return { documentCount: documents.length, collectionCount: collections.length };
      });
    },

    async saveDocument<T extends CreativeDocument>(input: T, options: {
      expectedRevision: number | null;
      newAssets?: readonly StoredAsset[];
      updatedAt: number;
    }): Promise<Omit<T, 'revision' | 'updatedAt'> & { revision: number; updatedAt: number }> {
      const document = structuredClone(input);
      const { expectedRevision, updatedAt } = options;
      const newAssets = (options.newAssets ?? []).map(asset => ({ ...asset }));
      validateDocument(document, updatedAt);
      const referenced = assetIds(document);
      if (!identifiersValid(newAssets.map(asset => asset.id)) || newAssets.some(asset =>
        !referenced.includes(asset.id) || !(asset.blob instanceof Blob) || asset.blob.size < 1)) {
        throw new WorkspaceStorageError('invalid', 'Only referenced, nonempty image blobs can be saved.');
      }

      return transact(database, [stores.documents, stores.assets], 'readwrite', async transaction => {
        const documents = transaction.objectStore(stores.documents);
        const assets = transaction.objectStore(stores.assets);
        const previous = await requestResult<CreativeDocument | undefined>(documents.get(document.id));
        checkExpected(previous?.revision, expectedRevision);
        if (previous && previous.kind !== document.kind) {
          throw new WorkspaceStorageError('conflict', 'Save a different kind of document as a new item.');
        }
        for (const asset of newAssets) await requestResult(assets.add(asset));
        await requireAssets(assets, referenced);
        const stored = { ...document, revision: (previous?.revision ?? 0) + 1, updatedAt };
        await requestResult(documents.put(stored));
        await removeOrphanedAssets(transaction, assetIds(previous).filter(id => !referenced.includes(id)));
        return stored;
      });
    },

    async deleteDocument(id: string, expectedRevision: number): Promise<DeletedDocument> {
      return transact(database, [stores.documents, stores.assets, stores.collections], 'readwrite', async transaction => {
        const documents = transaction.objectStore(stores.documents);
        const previous = await requestResult<CreativeDocument | undefined>(documents.get(id));
        if (!previous) throw new WorkspaceStorageError('conflict', 'The document was already removed.');
        checkExpected(previous.revision, expectedRevision);
        await requestResult(documents.delete(id));
        const collections = transaction.objectStore(stores.collections);
        const affected = await requestResult<StoredCollection[]>(collections.index('by-document').getAll(id));
        for (const collection of affected) {
          await requestResult(collections.put({
            ...collection, revision: (collection.revision ?? 1) + 1,
            documentIds: collection.documentIds.filter(documentId => documentId !== id),
          }));
        }
        const removedAssets = await removeOrphanedAssets(transaction, assetIds(previous));
        return { document: previous, assets: removedAssets, collections: affected };
      });
    },

    async restoreDocument(snapshot: DeletedDocument, updatedAt: number) {
      const { document, assets, collections } = structuredClone(snapshot);
      validateDocument(document, updatedAt);
      return transact(database, [stores.documents, stores.assets, stores.collections], 'readwrite', async transaction => {
        const records = transaction.objectStore(stores.documents);
        const blobs = transaction.objectStore(stores.assets);
        const groups = transaction.objectStore(stores.collections);
        if (await requestResult(records.getKey(document.id)) !== undefined) {
          throw new WorkspaceStorageError('conflict', 'A newer document uses this identifier.');
        }
        for (const asset of assets) await requestResult(blobs.add(asset));
        await requireAssets(blobs, assetIds(document));
        const restored = { ...document, revision: document.revision + 1, updatedAt };
        await requestResult(records.add(restored));
        for (const prior of collections) {
          const current = await requestResult<StoredCollection | undefined>(groups.get(prior.id));
          if (!current || current.documentIds.includes(document.id)) continue;
          const documentIds = [...current.documentIds];
          documentIds.splice(Math.max(0, prior.documentIds.indexOf(document.id)), 0, document.id);
          await requestResult(groups.put({ ...current, documentIds, revision: (current.revision ?? 1) + 1 }));
        }
        return restored;
      });
    },

    async saveCollection(input: Omit<Collection, 'revision'>, expectedRevision: number | null) {
      const collection = { ...input, documentIds: [...input.documentIds] };
      if (!idValid(collection.id) || !collection.name.trim() || collection.name.length > 120 ||
          !identifiersValid(collection.documentIds)) {
        throw new WorkspaceStorageError('invalid', 'Invalid collection name or document references.');
      }
      return transact(database, [stores.collections, stores.documents], 'readwrite', async transaction => {
        const collections = transaction.objectStore(stores.collections);
        const documents = transaction.objectStore(stores.documents);
        const previous = await requestResult<StoredCollection | undefined>(collections.get(collection.id));
        const current = previous ? previous.revision ?? 1 : undefined;
        checkExpected(current, expectedRevision);
        for (const id of collection.documentIds) {
          if (await requestResult(documents.getKey(id)) === undefined) {
            throw new WorkspaceStorageError('invalid', 'A collection document is unavailable.');
          }
        }
        const saved = { ...collection, revision: (current ?? 0) + 1 };
        await requestResult(collections.put(saved));
        return saved;
      });
    },

    async savePreference(preference: StoredPreference) {
      const { key, value } = preference;
      if (!idValid(key) || (typeof value === 'number' && !Number.isFinite(value))) {
        throw new WorkspaceStorageError('invalid', 'Invalid workspace preference.');
      }
      return transact(database, [stores.preferences], 'readwrite', async transaction => {
        await requestResult(transaction.objectStore(stores.preferences).put({ key, value }));
        return { key, value };
      });
    },
  };
}
