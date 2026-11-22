import { gradientRaster, gradientVector, paletteRaster, paletteSvg, renderedCapabilities,
  designPreviewExport, typographyImage } from '../export/rendered.js';
import { paletteAse } from '../export/swatch-exchange.js';
import { copyText, gradientText, paletteText, tailwindText } from '../export/text.js';
import type { ImagePoint, ImageRegion } from '../image/pixels.js';
import { inspectLocalImage } from '../media/decode.js';
import { latestMediaJob, startMediaJob } from '../media/jobs.js';
import { MediaJobError, type MediaTask } from '../media/protocol.js';
import type { Palette } from '../model/color.js';
import type { Locale } from '../model/locales.js';
import { coverCrop } from '../preview/moodboard.js';
import { fontCoverage, selectFont, typographyCss, type FontDefinition } from '../typography/fonts.js';
import { styleText } from '../typography/styled-text.js';
import { BackupError, maxBackupBytes, previewBackup, writeBackup } from './backup.js';
import type { workspaceRepository } from './repository.js';
import { preparePaletteShare, readPaletteShare } from './share.js';

type Storage = Pick<ReturnType<typeof workspaceRepository>,
  'backupSource' | 'getDocument' | 'getCollection' | 'saveDocument' | 'saveCollection' |
  'deleteDocument' | 'restoreDocument' | 'restoreBackup'>;

export function previewPoint(point: ImagePoint, preview: Readonly<{ width: number; height: number; source: ImageRegion }>) {
  const { width, height, source } = preview;
  if (![point.x, point.y, width, height, source.x, source.y, source.width, source.height].every(Number.isSafeInteger) ||
      point.x < 0 || point.y < 0 || point.x >= width || point.y >= height ||
      source.x < 0 || source.y < 0 || source.width < width || source.height < height) {
    throw new MediaJobError('invalid-region', 'Choose a point within the preview.');
  }
  return {
    x: source.x + Math.floor((point.x + 0.5) * source.width / width),
    y: source.y + Math.floor((point.y + 0.5) * source.height / height),
  };
}

function download(blob: Blob, filename: string) {
  if (!filename.trim() || filename.length > 180 || /[\x00-\x1f/\\]/.test(filename)) throw new RangeError('Invalid download filename.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function jpegEncoding() {
  try {
    const canvas = new OffscreenCanvas(1, 1);
    return (await canvas.convertToBlob({ type: 'image/jpeg' })).type === 'image/jpeg';
  } catch { return false; }
}

export function createBrowserMedia(storage?: Storage) {
  let pdfState: 'unloaded' | 'loaded' | 'unavailable' = 'unloaded';
  let pdfModule: Promise<typeof import('../export/pdf.js')> | undefined;
  const latest = latestMediaJob();
  function loadPdf() {
    pdfModule ??= import('../export/pdf.js').then(module => {
      pdfState = 'loaded';
      return module;
    }, cause => {
      pdfState = 'unavailable';
      throw new MediaJobError('unavailable', 'The PDF export module is unavailable in this browser session.', { cause });
    });
    return pdfModule;
  }

  return {
    async capabilities() {
      const canvas = typeof OffscreenCanvas !== 'undefined';
      return { worker: canvas && typeof Worker !== 'undefined' && typeof createImageBitmap === 'function',
        canvas, jpeg: canvas && await jpegEncoding(), pdf: pdfState, storage: storage !== undefined,
        clipboard: !!globalThis.navigator?.clipboard, formats: renderedCapabilities };
    },
    jobs: { start: startMediaJob, startLatest: latest.start, cancelLatest: latest.cancel },
    image: { inspect: inspectLocalImage, previewPoint, coverCrop },
    type: {
      style: styleText, css: typographyCss, image: typographyImage,
      preview(font: FontDefinition, text: string, locale: Locale, settings: Parameters<typeof selectFont>[1]) {
        const selected = selectFont(font, settings);
        const loaded = typeof document !== 'undefined' &&
          [...document.fonts].some(face => face.status === 'loaded' && face.family.replace(/^["']|["']$/g, '') === selected.family);
        return { selected, glyphs: fontCoverage(font, text, locale), asset: loaded ? 'loaded' : 'unloaded' } as const;
      },
    },
    export: {
      paletteText, gradientText, tailwindText, paletteSvg, gradientVector, paletteRaster, gradientRaster,
      designPreview: designPreviewExport, paletteAse, paletteShare: preparePaletteShare, readPaletteShare,
      async palettePdf(palette: Palette) { return (await loadPdf()).palettePdf(palette); },
      async boardPdf(task: Extract<MediaTask, { kind: 'moodboard' }>, dpi?: number, signal?: AbortSignal) {
        const companion = [task.input.caption?.trim(), paletteText(task.input.palette, 'css').text].filter(Boolean).join('\n');
        const module = await loadPdf();
        const png = await startMediaJob({ ...task, format: 'png' }, signal).result;
        const result = await module.boardPdf(png.blob, { dpi, companion });
        if (signal?.aborted) throw new MediaJobError('cancelled', 'The local PDF export was cancelled.');
        return result;
      },
    },
    files: { download, copyText },
    collection: storage,
    backup: {
      write: writeBackup,
      async fromStorage(options: { includeAssets: boolean; collectionId?: string }) {
        if (!storage) throw new MediaJobError('unavailable', 'Local collection storage is unavailable.');
        return writeBackup({ ...await storage.backupSource(options.includeAssets, options.collectionId), includeAssets: options.includeAssets });
      },
      async preview(input: Blob | string) {
        if (input instanceof Blob && input.size > maxBackupBytes) throw new BackupError('too-large', 'The JSON backup exceeds 32 MiB.');
        const text = typeof input === 'string' ? input : await input.text();
        const data = previewBackup(text);
        return { data, async restore() {
          if (!storage) throw new MediaJobError('unavailable', 'Local collection storage is unavailable.');
          return storage.restoreBackup(text);
        } };
      },
    },
  };
}
