import { convertColor, toHex } from '../color/convert.js';
import { inspectLocalImage } from '../media/decode.js';
import { MediaJobError } from '../media/protocol.js';
import type { Palette } from '../model/color.js';
import { checkPalette } from '../palette/document.js';
import { maxRasterPixels } from '../preview/moodboard.js';
import { paletteText } from './text.js';

export async function palettePdf(palette: Palette) {
  checkPalette(palette);
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const margin = 30;
  const columnWidth = 88;
  const rowHeight = 105;
  const columns = Math.min(6, palette.swatches.length);
  const rows = Math.ceil(palette.swatches.length / columns);
  const page = pdf.addPage([margin * 2 + columns * columnWidth, margin * 2 + rows * rowHeight]);
  const gamutMapped: string[] = [];
  for (const [index, swatch] of palette.swatches.entries()) {
    const { color, gamutMapped: mapped } = convertColor(swatch.color, 'srgb');
    if (mapped) gamutMapped.push(swatch.id);
    const x = margin + (index % columns) * columnWidth;
    const y = margin + (rows - 1 - Math.floor(index / columns)) * rowHeight;
    page.drawRectangle({ x, y: y + 20, width: columnWidth - 10, height: rowHeight - 28,
      color: rgb(...color.components), opacity: color.alpha });
    page.drawText(toHex(color).hex, { x, y, size: 10, font, color: rgb(0.12, 0.15, 0.13) });
  }
  const bytes = await pdf.save();
  return { blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), gamutMapped,
    companion: paletteText(palette, 'css').text };
}

export async function boardPdf(cleanPng: Blob, settings: Readonly<{ dpi?: number; companion: string }>) {
  const dpi = settings.dpi ?? 300;
  if (!Number.isInteger(dpi) || dpi < 72 || dpi > 600) throw new RangeError('Choose a print resolution from 72 to 600 dpi.');
  const header = await inspectLocalImage(cleanPng);
  if (header.mime !== 'image/png' || header.width > 8192 || header.height > 8192 ||
      header.width * header.height > maxRasterPixels) throw new MediaJobError('format', 'Use a supported board PNG.');
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(await cleanPng.arrayBuffer());
  const width = image.width * 72 / dpi;
  const height = image.height * 72 / dpi;
  const page = pdf.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });
  const bytes = await pdf.save();
  return { blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), width, height, companion: settings.companion };
}
