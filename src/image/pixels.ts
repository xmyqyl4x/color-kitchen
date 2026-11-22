import type { ColorChannels, ColorValue } from '../model/color.js';
import { toSrgbFallback } from '../color/convert.js';

export const maxImagePixels = 40_000_000;
export const maxPreviewSide = 512;
export type PixelBuffer = Readonly<{ width: number; height: number; data: Uint8Array | Uint8ClampedArray }>;
export type ImagePoint = Readonly<{ x: number; y: number }>;
export type ImageRegion = ImagePoint & Readonly<{ width: number; height: number }>;

export class ImageSampleError extends Error {
  constructor(public readonly code: 'invalid-pixels' | 'too-large' | 'invalid-region' | 'transparent', message: string) {
    super(message);
    this.name = 'ImageSampleError';
  }
}

export function validatePixels(image: PixelBuffer) {
  const { width, height, data } = image;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new ImageSampleError('invalid-pixels', 'Image dimensions must be positive integers.');
  }
  if (width * height > maxImagePixels) throw new ImageSampleError('too-large', 'Image exceeds 40 megapixels.');
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray) || data.length !== width * height * 4) {
    throw new ImageSampleError('invalid-pixels', 'Image data must contain four RGBA bytes per pixel.');
  }
}

function checkRegion(image: PixelBuffer, region = { x: 0, y: 0, width: image.width, height: image.height }): ImageRegion {
  const { x, y, width, height } = region;
  if (![x, y, width, height].every(Number.isSafeInteger) || x < 0 || y < 0 ||
      width < 1 || height < 1 || x + width > image.width || y + height > image.height) {
    throw new ImageSampleError('invalid-region', 'The selection must fit inside the source image.');
  }
  return region;
}

function backingChannels(backing?: ColorValue): ColorChannels {
  if (!backing) return [1, 1, 1];
  const { color } = toSrgbFallback(backing);
  if (color.alpha !== 1) throw new RangeError('Image sampling requires an opaque backing color.');
  return color.components;
}

function renderPixel(data: PixelBuffer['data'], index: number, backing: ColorChannels): ColorChannels | null {
  const alpha = data[index + 3]! / 255;
  if (alpha === 0) return null;
  return [
    data[index]! / 255 * alpha + backing[0] * (1 - alpha),
    data[index + 1]! / 255 * alpha + backing[1] * (1 - alpha),
    data[index + 2]! / 255 * alpha + backing[2] * (1 - alpha),
  ];
}

export function sampleImagePoint(image: PixelBuffer, point: ImagePoint, backing?: ColorValue): ColorValue {
  validatePixels(image);
  checkRegion(image, { ...point, width: 1, height: 1 });
  const components = renderPixel(image.data, (point.y * image.width + point.x) * 4, backingChannels(backing));
  if (!components) throw new ImageSampleError('transparent', 'The selected pixel is transparent.');
  return { space: 'srgb', components, alpha: 1 };
}

export function downsampleImage(image: PixelBuffer, options: { maxSide?: number; region?: ImageRegion } = {}) {
  validatePixels(image);
  const source = checkRegion(image, options.region);
  const limit = options.maxSide ?? maxPreviewSide;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxPreviewSide) throw new RangeError('Invalid preview size.');
  const scale = Math.min(1, limit / Math.max(source.width, source.height));
  const width = Math.max(1, Math.floor(source.width * scale));
  const height = Math.max(1, Math.floor(source.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const top = source.y + Math.floor(y * source.height / height);
    const bottom = source.y + Math.floor((y + 1) * source.height / height);
    for (let x = 0; x < width; x++) {
      const left = source.x + Math.floor(x * source.width / width);
      const right = source.x + Math.floor((x + 1) * source.width / width);
      let r = 0, g = 0, b = 0, weight = 0;
      for (let sy = top; sy < bottom; sy++) {
        for (let sx = left; sx < right; sx++) {
          const index = (sy * image.width + sx) * 4;
          const alpha = image.data[index + 3]!;
          weight += alpha;
          r += image.data[index]! * alpha;
          g += image.data[index + 1]! * alpha;
          b += image.data[index + 2]! * alpha;
        }
      }
      if (!weight) continue;
      const index = (y * width + x) * 4;
      data[index] = r / weight;
      data[index + 1] = g / weight;
      data[index + 2] = b / weight;
      data[index + 3] = Math.max(1, Math.round(weight / ((right - left) * (bottom - top))));
    }
  }
  return { width, height, data, source };
}

type Bin = { count: number; r: number; g: number; b: number };
export type ExtractionOptions = Readonly<{
  count: number;
  method?: 'dominant' | 'balanced';
  region?: ImageRegion;
  backing?: ColorValue;
}>;

export function extractImagePalette(image: PixelBuffer, options: ExtractionOptions) {
  validatePixels(image);
  const { count, method = 'dominant' } = options;
  if (!Number.isInteger(count) || count < 2 || count > 12 || (method !== 'dominant' && method !== 'balanced')) {
    throw new RangeError('Choose an extraction method and two to twelve colors.');
  }
  const region = checkRegion(image, options.region);
  const backing = backingChannels(options.backing);
  const histogram = new Map<number, Bin>();
  const bucket = (channel: number) => Math.min(31, Math.floor(channel * 32));
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      const pixel = renderPixel(image.data, (y * image.width + x) * 4, backing);
      if (!pixel) continue;
      const [r, g, b] = pixel;
      const key = bucket(r) * 1024 + bucket(g) * 32 + bucket(b);
      const bin = histogram.get(key);
      if (bin) {
        bin.count++;
        bin.r += r;
        bin.g += g;
        bin.b += b;
      } else {
        histogram.set(key, { count: 1, r, g, b });
      }
    }
  }
  const candidates = [...histogram.entries()].sort(([a, left], [b, right]) => right.count - left.count || a - b)
    .map(([, value]) => ({
      count: value.count,
      components: [value.r / value.count, value.g / value.count, value.b / value.count] as ColorChannels,
    }));
  if (!candidates.length) throw new ImageSampleError('transparent', 'The selection has no visible pixels.');
  const selected = candidates.splice(0, 1);
  while (selected.length < count && candidates.length) {
    let best = 0;
    let bestScore = -1;
    if (method === 'balanced') {
      for (const [index, candidate] of candidates.entries()) {
        const separation = Math.min(...selected.map(chosen => candidate.components.reduce(
          (sum, channel, axis) => sum + (channel - chosen.components[axis]!) ** 2, 0)));
        const score = separation * Math.log2(candidate.count + 1);
        if (score > bestScore) { bestScore = score; best = index; }
      }
    }
    selected.push(candidates.splice(best, 1)[0]!);
  }
  return selected.map(({ components, count: pixels }) => ({
    color: { space: 'srgb', components, alpha: 1 } as const, pixels,
  }));
}
