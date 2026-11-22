import { validateGradient } from '../gradient/gradient.js';
import { checkPalette, openPaletteSession } from '../palette/document.js';
import type { BackupEnvelope, Collection, CreativeDocument, StoredAsset } from './document.js';
import { validateBoardComposition } from './board.js';

const maxAssetBytes = 20 * 1024 * 1024;
export const maxBackupBytes = 32 * 1024 * 1024;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
const boardLayouts = ['bottom-strip', 'side-strip', 'two-image', 'square'];

export class BackupError extends Error {
  constructor(public readonly code: 'too-large' | 'invalid' | 'unsupported-version' | 'missing-assets',
    message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BackupError';
  }
}

function validId(id: unknown): id is string {
  return typeof id === 'string' && idPattern.test(id);
}

function uniqueIds(ids: unknown): ids is string[] {
  return Array.isArray(ids) && ids.every(validId) && new Set(ids).size === ids.length;
}

function validMetadata(record: { id: unknown; name: unknown; revision: number }) {
  return validId(record.id) && typeof record.name === 'string' && record.name.trim() &&
    record.name.length <= 120 && Number.isSafeInteger(record.revision) && record.revision > 0;
}

function documentRecord(document: CreativeDocument) {
  if (!validMetadata(document) || document.schemaVersion !== 1 ||
      !Number.isSafeInteger(document.updatedAt) || document.updatedAt < 0 ||
      (document.tags !== undefined && (!Array.isArray(document.tags) || document.tags.length > 12 ||
        document.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 32)))) {
    throw new RangeError('Invalid document metadata.');
  }
  switch (document.kind) {
    case 'palette': return openPaletteSession(document).document;
    case 'gradient': validateGradient(document); return document;
    case 'board':
      checkPalette(document.palette);
      if (!boardLayouts.includes(document.layout) || !uniqueIds(document.assetIds) ||
          document.assetIds.length < 1 || document.assetIds.length > 4 ||
          (document.caption !== undefined && (typeof document.caption !== 'string' || document.caption.length > 240))) {
        throw new RangeError('Invalid board.');
      }
      validateBoardComposition(document);
      return document;
    default: throw new RangeError('Unknown document kind.');
  }
}

export function backupBase64(bytes: Uint8Array) {
  let encoded = '';
  // Each full chunk is divisible by three, so only the final chunk needs padding.
  for (let offset = 0; offset < bytes.length; offset += 12_288) {
    encoded += btoa(String.fromCharCode(...bytes.subarray(offset, offset + 12_288)));
  }
  return encoded;
}

function checkAsset(asset: BackupEnvelope['assets'][number]) {
  if (!validId(asset.id) || typeof asset.mediaType !== 'string' || asset.mediaType.length > 120 ||
      !/^[\x20-\x7e]*$/.test(asset.mediaType) || typeof asset.dataBase64 !== 'string' ||
      asset.dataBase64.length > Math.ceil(maxAssetBytes / 3) * 4 ||
      asset.dataBase64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(asset.dataBase64)) {
    throw new RangeError('Invalid backup asset.');
  }
  const bytes = Uint8Array.from(atob(asset.dataBase64), character => character.charCodeAt(0));
  if (bytes.length > maxAssetBytes) throw new RangeError('Backup image is too large.');
  return { id: asset.id, blob: new Blob([bytes], { type: asset.mediaType }) };
}

export function previewBackup(text: string) {
  if (text.length > maxBackupBytes || new TextEncoder().encode(text).length > maxBackupBytes) {
    throw new BackupError('too-large', 'The JSON backup exceeds 32 MiB.');
  }
  try {
    const input = JSON.parse(text);
    if (!input || typeof input !== 'object') throw new RangeError('Expected a workspace backup object.');
    if (input.schemaVersion !== 1) throw new BackupError('unsupported-version', 'Unsupported JSON backup version.');
    // Version-one standalone documents were exported before collection envelopes existed.
    const envelope: BackupEnvelope = 'kind' in input
      ? { schemaVersion: 1, documents: [input], collections: [], assets: [],
        omittedAssetIds: input.kind === 'board' ? input.assetIds : [] }
      : input;
    const { documents, collections, assets, omittedAssetIds = [] } = envelope;
    if (!Array.isArray(documents) || documents.length > 1000 ||
        !Array.isArray(collections) || collections.length > 1000 ||
        !Array.isArray(assets) || assets.length > 1000 || !uniqueIds(omittedAssetIds) ||
        !uniqueIds(documents.map(document => document.id)) || !uniqueIds(collections.map(collection => collection.id)) ||
        !uniqueIds([...assets.map(asset => asset.id), ...omittedAssetIds])) throw new RangeError('Invalid backup records.');
    const items = documents.map(documentRecord);
    const includedIds = new Set(items.map(document => document.id));
    const groups = collections.map((collection: Collection) => {
      const normalized = { ...collection, revision: collection.revision === undefined ? 1 : collection.revision };
      if (!validMetadata(normalized) || !uniqueIds(normalized.documentIds) ||
          !normalized.documentIds.every(id => includedIds.has(id))) throw new RangeError('Invalid collection references.');
      return normalized;
    });
    const references = new Set(items.flatMap(document => document.kind === 'board' ? document.assetIds : []));
    const supplied = [...assets.map(asset => asset.id), ...omittedAssetIds];
    if (references.size !== supplied.length || supplied.some(id => !references.has(id))) {
      throw new RangeError('Every board asset must be included or explicitly listed as omitted.');
    }
    return { documents: items, collections: groups, assets: assets.map(checkAsset), omittedAssetIds };
  } catch (cause) {
    if (cause instanceof BackupError) throw cause;
    throw new BackupError('invalid', 'Choose a valid workspace backup.', { cause });
  }
}

export async function writeBackup(input: Readonly<{
  documents: readonly CreativeDocument[];
  collections?: readonly Collection[];
  assets?: readonly StoredAsset[];
  includeAssets: boolean;
}>) {
  const documents = structuredClone(input.documents);
  const collections = structuredClone(input.collections ?? []);
  const referenced = new Set(documents.flatMap(document => document.kind === 'board' ? document.assetIds : []));
  const supplied = input.includeAssets ? (input.assets ?? []).filter(asset => referenced.has(asset.id)) : [];
  let total = 0;
  for (const { blob } of supplied) {
    total += 4 * Math.ceil(blob.size / 3);
    if (blob.size > maxAssetBytes || total > maxBackupBytes) throw new BackupError('too-large', 'The backup images are too large.');
  }
  const assets = await Promise.all(supplied.map(async ({ id, blob }) =>
    ({ id, mediaType: blob.type, dataBase64: backupBase64(new Uint8Array(await blob.arrayBuffer())) })));
  const included = new Set(assets.map(asset => asset.id));
  const omittedAssetIds = [...referenced].filter(id => !included.has(id));
  const text = JSON.stringify({ schemaVersion: 1, documents, collections, assets, omittedAssetIds });
  previewBackup(text);
  return { text, omittedAssetIds };
}
