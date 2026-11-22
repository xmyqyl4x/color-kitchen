import { colorCss } from '../color/css.js';
import { toHex } from '../color/convert.js';
import { checkContrast } from '../color/contrast.js';
import { assertColor, parseColor } from '../color/parse.js';
import type { ColorValue } from '../model/color.js';
import { composePreview, type Rect } from '../preview/layout.js';
import { composeMoodboard, coverCrop, maxRasterPixels } from '../preview/moodboard.js';
import { decodeLocalImage, inspectLocalImage } from './decode.js';
import { MediaJobError, type MediaFormat, type MediaTask } from './protocol.js';

type Context = OffscreenCanvasRenderingContext2D;
const white = parseColor('#fff');
const black = parseColor('#000');

export async function paintCanvas(width: number, height: number, format: MediaFormat,
    paint: (context: Context) => void | Promise<void>, backing?: ColorValue) {
  if (![width, height].every(value => Number.isInteger(value) && value > 0)) {
    throw new MediaJobError('render', 'The export needs positive integral dimensions.');
  }
  if (width > 8192 || height > 8192 || width * height > maxRasterPixels) {
    throw new MediaJobError('too-large', 'The export exceeds the local raster bounds.');
  }
  if (format !== 'png' && format !== 'jpeg') throw new MediaJobError('format', 'Choose a PNG or JPEG export.');
  if (backing) {
    assertColor(backing);
    if (backing.alpha !== 1) throw new MediaJobError('format', 'The export backing must be opaque.');
  }
  const canvas = new OffscreenCanvas(width, height);
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new MediaJobError('unavailable', 'Canvas rendering is unavailable.');
    if (backing) fill(context, { x: 0, y: 0, width, height }, backing);
    await paint(context);
    const type = format === 'png' ? 'image/png' : 'image/jpeg';
    const blob = await canvas.convertToBlob({ type, quality: 0.92 });
    if (blob.type !== type) throw new MediaJobError('format', 'This browser cannot encode the selected format.');
    return { width, height, blob };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function fill(context: Context, rect: Rect, color: ColorValue) {
  context.fillStyle = colorCss(color);
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
}

function label(context: Context, rect: Rect, text: string, color: ColorValue, fontSize: number) {
  context.fillStyle = colorCss(color);
  context.font = `${fontSize}px sans-serif`;
  context.textBaseline = 'middle';
  context.fillText(text, rect.x + 4, rect.y + rect.height / 2, Math.max(1, rect.width - 8));
}

function readableInk(background: ColorValue, backing = white) {
  return checkContrast(black, background, backing).ratio >= checkContrast(white, background, backing).ratio ? black : white;
}

export function renderDesign(task: Extract<MediaTask, { kind: 'design-preview' }>) {
  const plan = composePreview(task.template, task.variant, task.palette);
  return paintCanvas(plan.width, plan.height, task.format ?? 'png', context => {
    fill(context, { x: 0, y: 0, width: plan.width, height: plan.height }, plan.background);
    for (const block of plan.blocks) {
      fill(context, block.rect, block.fill);
      if (block.label && block.ink) label(context, block.rect, block.label, block.ink, 18);
    }
  });
}

export async function renderMoodboard(task: Extract<MediaTask, { kind: 'moodboard' }>) {
  const { images, ...layout } = task.input;
  if (!images.length || images.length > 4) throw new MediaJobError('render', 'Choose one to four local images.');
  const sources: { image: (typeof images)[number]; header: Awaited<ReturnType<typeof inspectLocalImage>> }[] = [];
  for (const image of images) sources.push({ image, header: await inspectLocalImage(image.source) });
  const plan = composeMoodboard({ ...layout, images: sources.map(({ image, header }) => ({ ...image, ...header })) });
  if (task.format === 'jpeg' && plan.background.alpha < 1 && !task.backing) {
    throw new MediaJobError('format', 'Choose an opaque backing for a transparent JPEG export.');
  }
  const backing = task.backing ?? white;
  const opaqueBacking = checkContrast(backing, plan.background, backing).background;
  return paintCanvas(plan.width, plan.height, task.format ?? 'png', async context => {
    fill(context, { x: 0, y: 0, width: plan.width, height: plan.height }, plan.background);
    for (const [index, frame] of plan.frames.entries()) {
      const { image, header } = sources[index]!;
      const bitmap = await decodeLocalImage(image.source, header);
      try {
        const crop = coverCrop({ ...image, width: bitmap.width, height: bitmap.height }, frame.rect);
        context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height,
          frame.rect.x, frame.rect.y, frame.rect.width, frame.rect.height);
      } finally { bitmap.close(); }
    }
    for (const swatch of plan.swatches) {
      fill(context, swatch.rect, swatch.color);
      if (swatch.showLegend) label(context, swatch.rect, toHex(swatch.color).hex, readableInk(swatch.color, opaqueBacking), 12);
    }
    if (plan.caption) label(context, plan.caption.rect, plan.caption.text, readableInk(opaqueBacking), 16);
  }, task.backing);
}
