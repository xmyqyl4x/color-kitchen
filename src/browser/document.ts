import type { Palette } from '../model/color.js';
import type { Gradient } from '../gradient/gradient.js';
import type { BoardLayout } from '../preview/moodboard.js';

type DocumentBase = Readonly<{
  schemaVersion: 1;
  id: string;
  revision: number;
  name: string;
  updatedAt: number;
}>;

export type PaletteDocument = DocumentBase & Readonly<{ kind: 'palette'; palette: Palette }>;

export type GradientDocument = DocumentBase & Readonly<{ kind: 'gradient' }> & Gradient;

export type BoardDocument = DocumentBase & Readonly<{
  kind: 'board';
  palette: Palette;
  assetIds: readonly string[];
  layout: BoardLayout;
  caption?: string;
}>;

export type CreativeDocument = PaletteDocument | GradientDocument | BoardDocument;
export type StoredAsset = Readonly<{ id: string; blob: Blob }>;
export type Collection = Readonly<{ id: string; name: string; revision: number; documentIds: readonly string[] }>;
export type StoredPreference = Readonly<{ key: string; value: boolean | number | string | null }>;

export type BackupEnvelope = Readonly<{
  schemaVersion: 1;
  documents: readonly CreativeDocument[];
  collections: readonly Collection[];
  assets: readonly Readonly<{ id: string; mediaType: string; dataBase64: string }>[];
}>;
