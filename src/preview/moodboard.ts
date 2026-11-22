import { assertColor, inRange } from '../color/parse.js';
import type { ColorValue, Palette } from '../model/color.js';
import type { Rect } from './layout.js';

export const maxRasterPixels = 16_000_000;
export type BoardLayout = 'bottom-strip' | 'side-strip' | 'two-image' | 'square';
export type BoardImage = Readonly<{
  id: string; width: number; height: number;
  crop?: Rect;
  focus?: readonly [number, number];
}>;
export type MoodboardInput = Readonly<{
  layout: BoardLayout; width: number; height: number; spacing: number; padding: number;
  images: readonly BoardImage[]; palette: Palette; background: ColorValue; caption?: string; legend?: boolean;
}>;

export function coverCrop(image: BoardImage, destination: Pick<Rect, 'width' | 'height'>): Rect {
  const { width, height } = image;
  const source = image.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const [fx, fy] = image.focus ?? [0.5, 0.5];
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0) ||
      !inRange(source.x) || !inRange(source.y) || !inRange(source.width, Number.EPSILON, 1 - source.x) ||
      !inRange(source.height, Number.EPSILON, 1 - source.y) || !inRange(fx) || !inRange(fy) ||
      !Number.isFinite(destination.width) || !Number.isFinite(destination.height) ||
      destination.width <= 0 || destination.height <= 0) throw new RangeError('Invalid crop or destination bounds.');
  const aw = source.width * width;
  const ah = source.height * height;
  const aspect = destination.width / destination.height;
  const w = Math.min(aw, ah * aspect);
  const h = Math.min(ah, aw / aspect);
  return { x: source.x * width + (aw - w) * fx, y: source.y * height + (ah - h) * fy, width: w, height: h };
}

export function composeMoodboard(input: MoodboardInput) {
  const { width, height, layout, spacing, padding, images, palette, background } = input;
  const caption = input.caption?.trim() ?? '';
  if (![width, height, spacing, padding].every(Number.isSafeInteger) || width < 64 || height < 64 ||
      width * height > maxRasterPixels || !inRange(spacing, 0, 96) || !inRange(padding, 0, 96) ||
      !['bottom-strip', 'side-strip', 'two-image', 'square'].includes(layout) || images.length < 1 || images.length > 4 ||
      (layout === 'two-image' && images.length !== 2) || new Set(images.map(image => image.id)).size !== images.length ||
      caption.length > 160 || palette.swatches.length < 2 || palette.swatches.length > 12) {
    throw new RangeError('Invalid moodboard dimensions, layout or content.');
  }
  assertColor(background);
  const captionHeight = caption ? 36 : 0;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2 - (caption ? captionHeight + spacing : 0);
  const sideways = layout === 'side-strip';
  const strip = Math.max(24, Math.min(92, (sideways ? innerWidth : innerHeight) * 0.15));
  const area = {
    x: padding, y: padding, width: innerWidth - (sideways ? strip + spacing : 0),
    height: innerHeight - (sideways ? 0 : strip + spacing),
  };
  const columns = images.length > 1 ? 2 : 1;
  const rows = Math.ceil(images.length / columns);
  const cellWidth = (area.width - (columns - 1) * spacing) / columns;
  const cellHeight = (area.height - (rows - 1) * spacing) / rows;
  const swatchSpace = (sideways ? innerHeight : innerWidth) / palette.swatches.length;
  if (cellWidth < 12 || cellHeight < 12 || swatchSpace < 2) throw new RangeError('The layout does not fit the export bounds.');
  const frames = images.map((image, index) => {
    if (!image.id) throw new RangeError('A moodboard image needs an ID.');
    const w = layout === 'square' ? Math.min(cellWidth, cellHeight) : cellWidth;
    const h = layout === 'square' ? w : cellHeight;
    const rect = {
      x: area.x + index % columns * (cellWidth + spacing) + (cellWidth - w) / 2,
      y: area.y + Math.floor(index / columns) * (cellHeight + spacing) + (cellHeight - h) / 2, width: w, height: h,
    };
    return { id: image.id, rect, crop: coverCrop(image, rect) };
  });
  const swatches = palette.swatches.map((swatch, index) => {
    assertColor(swatch.color);
    const rect = sideways
      ? { x: width - padding - strip, y: padding + index * swatchSpace, width: strip, height: swatchSpace }
      : { x: padding + index * swatchSpace, y: padding + innerHeight - strip, width: swatchSpace, height: strip };
    return { id: swatch.id, color: swatch.color, rect, showLegend: input.legend === true };
  });
  return {
    width, height, background, frames, swatches,
    caption: caption ? { text: caption, rect: { x: padding, y: height - padding - captionHeight, width: innerWidth, height: captionHeight } } : null,
  };
}
