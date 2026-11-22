import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, PDFName } from 'pdf-lib';
import { parseColor } from '../src/color/parse.js';
import { palettePdf, boardPdf } from '../src/export/pdf.js';
import { paletteAse } from '../src/export/swatch-exchange.js';
import { withBrowserPage } from './browser.js';

const palette = { swatches: [
  { id: 'rose', locked: false, color: parseColor('rgb(255 0 0 / .5)') },
  { id: 'navy', locked: false, color: parseColor('rgb(0 0 127.5)') },
], roles: { primary: 'rose' } };

test('ASE 1.0 color entries can be independently read with float32 precision', async () => {
  assert.throws(() => paletteAse(palette), { code: 'format' });
  const result = paletteAse(palette, parseColor('#fff'));
  assert.deepEqual(result.flattened, ['rose']);
  const data = Buffer.from(await result.blob.arrayBuffer());
  assert.equal(data.toString('ascii', 0, 4), 'ASEF');
  assert.equal(data.readUInt32BE(4), 0x00010000);
  assert.equal(data.readUInt32BE(8), 2);
  const colors: number[][] = [];
  for (let entry = 12; entry < data.length;) {
    assert.equal(data.readUInt16BE(entry), 1);
    const entryEnd = entry + 6 + data.readUInt32BE(entry + 2);
    const nameLength = data.readUInt16BE(entry + 6);
    const colorStart = entry + 8 + nameLength * 2;
    assert.equal(data.readUInt16BE(colorStart - 2), 0);
    assert.equal(data.toString('ascii', colorStart, colorStart + 4), 'RGB ');
    colors.push([4, 8, 12].map(offset => data.readFloatBE(colorStart + offset)));
    assert.equal(data.readUInt16BE(colorStart + 16), 2);
    assert.equal(entryEnd, colorStart + 18);
    entry = entryEnd;
  }
  assert.deepEqual(colors, [[1, 0.5, 0.5], [0, 0, 0.5]]);
});

test('PDF swatches and clean board imagery open with alpha and declared print dimensions', async () => {
  const output = await palettePdf(palette);
  assert.match(output.companion, /--ck-role-primary/);
  const pdf = await PDFDocument.load(await output.blob.arrayBuffer());
  assert.equal(pdf.getPageCount(), 1);
  const swatches = pdf.getPage(0);
  assert.deepEqual(swatches.getSize(), { width: 236, height: 165 });
  assert(swatches.node.Resources()?.has(PDFName.of('ExtGState')));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGklEQVR4nGNw6ErZQglmGDVg1IBRA7YMEwMAsl7iEK/WDNYAAAAASUVORK5CYII=', 'base64');
  const board = await boardPdf(new Blob([png], { type: 'image/png' }), { dpi: 144, companion: 'Board caption' });
  const opened = await PDFDocument.load(await board.blob.arrayBuffer());
  assert.deepEqual(opened.getPage(0).getSize(), { width: 8, height: 8 });
  assert(opened.getPage(0).node.Resources()?.has(PDFName.of('XObject')));
  assert.equal(board.companion, 'Board caption');
});

test('Chromium decodes clean PNG, JPEG and SVG boundaries with alpha, hard edges and faithful PNG fallback', async () => {
  const result = await withBrowserPage(page => page.evaluate(async palette => {
    const module = '/src/export/rendered.js';
    const { paletteRaster, paletteSvg, gradientRaster, gradientVector, typographyImage, designPreviewExport } =
      await import(module) as typeof import('../src/export/rendered.js');
    const parseModule = '/src/color/parse.js';
    const { parseColor } = await import(parseModule) as typeof import('../src/color/parse.js');
    const decode = async (blob: Blob, points: readonly [number, number][]) => {
      const url = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = new OffscreenCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        return { width: image.width, height: image.height,
          samples: points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data)) };
      } finally { URL.revokeObjectURL(url); }
    };
    const bounds = { width: 120, height: 60 };
    const points: [number, number][] = [[4, 4], [100, 4]];
    const png = await paletteRaster(palette, { ...bounds, format: 'png' });
    const svg = paletteSvg(palette, bounds);
    const jpeg = await paletteRaster(palette, { ...bounds, format: 'jpeg', backing: parseColor('#fff') });
    let missingBacking = false;
    try { await paletteRaster(palette, { ...bounds, format: 'jpeg' }); } catch { missingBacking = true; }
    const first = palette.swatches[0]!.color;
    const second = parseColor('rgb(0 0 255 / .5)');
    const gradient = { type: 'linear', angle: 90, interpolation: 'srgb',
      stops: [{ id: 'a', position: 0, color: first }, { id: 'b', position: 0.5, color: first },
        { id: 'c', position: 0.5, color: second }, { id: 'd', position: 1, color: second }],
    } as const;
    const edge: [number, number][] = [[59, 4], [60, 4]];
    const vector = gradientVector(gradient, bounds);
    const raster = await gradientRaster(gradient, bounds);
    const conic = gradientVector({ ...gradient, type: 'conic' }, bounds);
    const text = 'Français, ação, Straße';
    const type = await typographyImage(text, { family: 'Unloaded fixture', weights: [400], scripts: ['Latn'] },
      { weight: 400, size: 16, lineHeight: 1.3, spacing: 0, color: parseColor('#202722') },
      { width: 340, height: 60, allowFallback: true, format: 'png' });
    const preview = await designPreviewExport({ kind: 'design-preview', palette, template: 'landing',
      variant: { viewport: 'mobile', theme: 'light' } }).result;
    return {
      png: await decode(png.blob, points), svg: await decode(svg.blob, points), jpeg: await decode(jpeg.blob, points),
      missingBacking, vector: vector.format === 'svg' ? (await decode(vector.blob, edge)).samples : vector,
      raster: (await decode(raster.blob, edge)).samples,
      conic: conic.format === 'raster-required' && conic.fallback,
      typography: type.format !== 'css-required' && { fallback: type.fontFallback, companion: type.companion,
        raster: (await decode(type.blob, [[0, 0]])).samples },
      preview: { width: preview.width, height: preview.height, primary: preview.tokens.primary },
    };
  }, palette));
  assert.deepEqual(result.png, { width: 120, height: 60, samples: [[255, 0, 0, 128], [0, 0, 128, 255]] });
  assert.deepEqual(result.svg, result.png);
  assert(Array.isArray(result.vector));
  assert(result.vector.every((sample, sampleIndex) => sample.every((channel, index) =>
    Math.abs(channel - result.raster[sampleIndex]![index]!) <= 2)));
  assert.deepEqual(result.raster, [[255, 0, 0, 128], [0, 0, 255, 128]]);
  assert(result.missingBacking);
  assert(result.jpeg.samples[0]!.every((channel, index) => Math.abs(channel - [255, 127, 127, 255][index]!) <= 3));
  assert.equal(result.conic, 'png');
  assert.deepEqual(result.typography, { fallback: true, companion: 'Français, ação, Straße', raster: [[0, 0, 0, 0]] });
  assert.deepEqual(result.preview, { width: 360, height: 600, primary: 'color(srgb 1 0 0 / 0.5)' });
});
