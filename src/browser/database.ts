import type { Swatch } from '../model/color.js';

export const storageVersion = 2;
export const storageName = 'color-kitchen-workspace';
export const stores = {
  documents: 'documents',
  assets: 'assets',
  collections: 'collections',
  preferences: 'preferences',
} as const;

export class WorkspaceStorageError extends Error {
  constructor(
    public readonly code: 'blocked' | 'unavailable' | 'upgrade-failed' | 'quota' | 'conflict' | 'invalid',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'WorkspaceStorageError';
  }
}

export function openWorkspaceDatabase(name = storageName, factory?: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = (factory ?? globalThis.indexedDB).open(name, storageVersion);
    } catch (cause) {
      reject(new WorkspaceStorageError('unavailable', 'Browser storage is unavailable.', { cause }));
      return;
    }

    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(new WorkspaceStorageError('blocked', 'Close the other workspace tab and retry the upgrade.'));
    };
    request.onerror = () => {
      const cause = request.error;
      const code = cause?.name === 'QuotaExceededError' ? 'quota'
        : cause?.name === 'VersionError' || cause?.name === 'AbortError' ? 'upgrade-failed' : 'unavailable';
      reject(new WorkspaceStorageError(code, 'The workspace database could not be opened.', { cause }));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) {
        database.close();
        return;
      }
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onupgradeneeded = event => {
      const transaction = request.transaction;
      if (!transaction) return;
      if (blocked) {
        transaction.abort();
        return;
      }
      const database = request.result;
      if (event.oldVersion === 0) {
        database.createObjectStore(stores.documents, { keyPath: 'id' });
        database.createObjectStore(stores.assets, { keyPath: 'id' });
        database.createObjectStore(stores.collections, { keyPath: 'id' });
      }
      const documents = transaction.objectStore(stores.documents);
      documents.createIndex('by-kind-updated', ['kind', 'updatedAt']);
      documents.createIndex('by-asset', 'assetIds', { multiEntry: true });
      transaction.objectStore(stores.collections).createIndex('by-document', 'documentIds', { multiEntry: true });
      database.createObjectStore(stores.preferences, { keyPath: 'key' });

      if (event.oldVersion === 1) {
        const cursorRequest = documents.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const record = cursor.value as {
            schemaVersion?: number;
            revision?: number;
            palette?: { swatches: (Omit<Swatch, 'locked'> & { locked?: boolean })[] };
          };
          if (record.palette) {
            record.palette.swatches = record.palette.swatches.map(swatch => ({ ...swatch, locked: swatch.locked ?? false }));
          }
          cursor.update({ ...record, schemaVersion: record.schemaVersion ?? 1, revision: record.revision ?? 1 });
          cursor.continue();
        };
      }
    };
  });
}
