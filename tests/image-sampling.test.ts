import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseColor } from '../src/color/parse.js';
import { toHex } from '../src/color/convert.js';
import { downsampleImage, extractImagePalette, sampleImagePoint, type PixelBuffer } from '../src/image/pixels.js';

const rgba = (width: number, pixels: readonly (readonly number[])[]): PixelBuffer =>
  ({ width, height: pixels.length / width, data: Uint8ClampedArray.from(pixels.flat()) });
const red = [255, 0, 0, 255], darkRed = [200, 0, 0, 255], blue = [0, 0, 255, 255], empty = [0, 255, 0, 0];

test('synthetic palettes are deterministic, ignore transparent padding and preserve the selected region', () => {
  const source = rgba(4, [red, red, darkRed, blue, empty, empty, empty, empty]);
  const picks = (image: PixelBuffer, method: 'balanced' | 'dominant') =>
    extractImagePalette(image, { count: 2, method }).map(item => toHex(item.color).hex);
  assert.deepEqual(picks(source, 'dominant'), ['#FF0000', '#0000FF']);
  const weighted = rgba(8, [red, red, red, darkRed, darkRed, blue, empty, empty]);
  assert.deepEqual(picks(weighted, 'dominant'), ['#FF0000', '#C80000']);
  assert.deepEqual(picks(weighted, 'balanced'), ['#FF0000', '#0000FF']);
  assert.deepEqual(picks(weighted, 'balanced'), picks(weighted, 'balanced'));
  assert.equal(toHex(sampleImagePoint(source, { x: 3, y: 0 })).hex, '#0000FF');
  assert.deepEqual(extractImagePalette(source, { count: 12, region: { x: 3, y: 0, width: 1, height: 2 } })
    .map(pick => toHex(pick.color).hex), ['#0000FF']);
});

test('partially transparent samples use the chosen backing and downsampling preserves coverage', () => {
  const image = rgba(2, [[255, 0, 0, 128], empty]);
  assert.equal(toHex(sampleImagePoint(image, { x: 0, y: 0 })).hex, '#FF7F7F');
  assert.equal(toHex(sampleImagePoint(image, { x: 0, y: 0 }, parseColor('#000'))).hex, '#800000');
  const preview = downsampleImage(image, { maxSide: 1 });
  assert.deepEqual([...preview.data], [255, 0, 0, 64]);
  assert.deepEqual(preview.source, { x: 0, y: 0, width: 2, height: 1 });
  assert.throws(() => sampleImagePoint(image, { x: 1, y: 0 }), { code: 'transparent' });
});

test('malformed, oversized, out-of-bounds and all-transparent inputs fail with typed errors', () => {
  const invalid = { width: 10, height: 1, data: new Uint8Array(0) };
  assert.throws(() => extractImagePalette(invalid, { count: 2 }), { code: 'invalid-pixels' });
  assert.throws(() => extractImagePalette({ ...invalid, width: 50_000_000 }, { count: 2 }), { code: 'too-large' });
  const emptyImage = rgba(1, [empty]);
  assert.throws(() => extractImagePalette(emptyImage, { count: 2 }), { code: 'transparent' });
  assert.throws(() => sampleImagePoint(emptyImage, { x: -1, y: 0 }), { code: 'invalid-region' });
});
