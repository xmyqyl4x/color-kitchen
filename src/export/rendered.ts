import { colorCss } from '../color/css.js';
import { convertColor } from '../color/convert.js';
import { assertColor, inRange } from '../color/parse.js';
import { gradientPointSampler, gradientSvg, type Gradient, type GradientBounds } from '../gradient/gradient.js';
import { MediaJobError, type MediaFormat, type MediaTask } from '../media/protocol.js';
import { startMediaJob } from '../media/jobs.js';
import { paintCanvas } from '../media/render.js';
import type { ColorValue, Palette } from '../model/color.js';
import { checkPalette } from '../palette/document.js';
import { composePreview } from '../preview/layout.js';
import { selectFont, typographyCss, type FontDefinition } from '../typography/fonts.js';
import { gradientText, paletteText } from './text.js';

export const renderedCapabilities = {
  png: { alpha: true, gamut: 'srgb', precision: '8-bit' },
  jpeg: { alpha: false, gamut: 'srgb', precision: 'lossy' },
  'swatch-svg': { alpha: true, gamut: 'srgb', precision: 'floating-point' },
  'gradient-svg': { alpha: true, gamut: 'srgb', precision: 'faithful-interpolation-only' },
  pdf: { alpha: true, gamut: 'srgb', precision: 'vector-swatches-or-8-bit-board' },
  ase: { alpha: false, gamut: 'srgb', precision: 'float32' },
} as const;

export function opaqueExportBacking(format: string, requiresBacking: boolean, backing?: ColorValue) {
  if (backing !== undefined) {
    assertColor(backing);
    if (backing.alpha !== 1) throw new MediaJobError('format', 'The export backing must be opaque.');
  } else if (requiresBacking) {
    throw new MediaJobError('format', 'Choose an opaque backing for the ' + format + ' export.');
  }
  return backing;
}

function swatchStrip(palette: Palette, width: number, height: number) {
  checkPalette(palette);
  if (!Number.isInteger(width) || width < palette.swatches.length || width > 8192 ||
      !Number.isInteger(height) || height < 1 || height > 8192) throw new RangeError('Invalid swatch dimensions.');
  return palette.swatches.map(({ id, color }, index) => {
    const x = Math.floor(index * width / palette.swatches.length);
    return { id, color, x, width: Math.floor((index + 1) * width / palette.swatches.length) - x };
  });
}

export function paletteSvg(palette: Palette, { width, height }: GradientBounds = { width: 720, height: 160 }) {
  const gamutMapped: string[] = [];
  const swatches = swatchStrip(palette, width, height).map(swatch => {
    const mapped = convertColor(swatch.color, 'srgb');
    if (mapped.gamutMapped) gamutMapped.push(swatch.id);
    const rgb = mapped.color.components.map(value => value * 100 + '%').join(',');
    return '<rect x="' + swatch.x + '" width="' + swatch.width + '" height="' + height + '" fill="rgb(' + rgb +
      ')" fill-opacity="' + mapped.color.alpha + '"/>';
  });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
    '" viewBox="0 0 ' + width + ' ' + height + '">' + swatches.join('') + '</svg>';
  return { blob: new Blob([svg], { type: 'image/svg+xml' }), gamutMapped, companion: paletteText(palette, 'css').text };
}

export async function paletteRaster(palette: Palette, options: GradientBounds & { format: MediaFormat; backing?: ColorValue }) {
  const { width, height, format } = options;
  const swatches = swatchStrip(palette, width, height);
  const backing = format === 'jpeg'
    ? opaqueExportBacking('JPEG', swatches.some(item => item.color.alpha < 1), options.backing) : options.backing;
  const gamutMapped: string[] = [];
  const raster = await paintCanvas(width, height, format, context => {
    for (const swatch of swatches) {
      const mapped = convertColor(swatch.color, 'srgb');
      if (mapped.gamutMapped) gamutMapped.push(swatch.id);
      context.fillStyle = colorCss(mapped.color);
      context.fillRect(swatch.x, 0, swatch.width, height);
    }
  }, backing);
  return { ...raster, gamutMapped, companion: paletteText(palette, 'css').text };
}

export function gradientVector(gradient: Gradient, bounds: GradientBounds) {
  const result = gradientSvg(gradient, bounds);
  const companion = gradientText(gradient);
  if (result.format !== 'svg') return { ...result, fallback: 'png' as const, companion };
  return { format: result.format, blob: new Blob([result.svg], { type: 'image/svg+xml' }), companion,
    gamutMapped: gradient.stops.filter(stop => convertColor(stop.color, 'srgb').gamutMapped).map(stop => stop.id) };
}

export async function gradientRaster(gradient: Gradient, bounds: GradientBounds) {
  const { width, height } = bounds;
  const sample = gradientPointSampler(gradient, bounds);
  let gamutMapped = gradient.interpolation === 'srgb' && gradient.stops.some(stop => convertColor(stop.color, 'srgb').gamutMapped);
  const raster = await paintCanvas(width, height, 'png', context => {
    const pixels = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const result = convertColor(sample(x + 0.5, y + 0.5), 'srgb');
        gamutMapped ||= result.gamutMapped;
        const offset = (y * width + x) * 4;
        pixels.data[offset] = result.color.components[0] * 255;
        pixels.data[offset + 1] = result.color.components[1] * 255;
        pixels.data[offset + 2] = result.color.components[2] * 255;
        pixels.data[offset + 3] = result.color.alpha * 255;
      }
    }
    context.putImageData(pixels, 0, 0);
  });
  return { ...raster, gamutMapped, companion: gradientText(gradient) };
}

export function designPreviewExport(task: Extract<MediaTask, { kind: 'design-preview' }>, signal?: AbortSignal) {
  const plan = composePreview(task.template, task.variant, task.palette);
  const tokens = Object.fromEntries(Object.entries(plan.roles).map(([role, color]) => [role, colorCss(color)]));
  const job = startMediaJob(task, signal);
  return { ...job, result: job.result.then(raster => ({ ...raster, tokens, companion: JSON.stringify(tokens, null, 2) })) };
}

type TypographySettings = Parameters<typeof typographyCss>[1];

export async function typographyImage(text: string, font: FontDefinition, settings: TypographySettings,
  options: GradientBounds & { format: MediaFormat; backing?: ColorValue; allowFallback?: boolean }) {
  const css = typographyCss(font, settings);
  const selection = selectFont(font, settings);
  const lines = text.split(/\r\n?|\n/);
  if (!text.trim() || text.length > 10_000 || lines.length > 50 || !inRange(options.width, 32, 8192) ||
      !inRange(options.height, 32, 8192)) throw new RangeError('Invalid typography export dimensions or text.');
  if (Object.entries(selection.axes).some(([name, value]) => name !== 'wght' && value !== font.axes?.[name]?.default)) {
    return { format: 'css-required', reason: 'font-axes', css, companion: text } as const;
  }
  const family = JSON.stringify(selection.family);
  const fontStyle = selection.weight + ' ' + settings.size + 'px ' + family + ', system-ui, sans-serif';
  const faces = typeof document === 'undefined' ? undefined : document.fonts;
  const loaded = faces && [...faces].some(face => face.status === 'loaded' && face.family.replace(/^["']|["']$/g, '') === selection.family);
  if (!loaded && !options.allowFallback) return { format: 'css-required', reason: 'font-unavailable', css, companion: text } as const;
  const backing = options.format === 'jpeg' ? opaqueExportBacking('JPEG', true, options.backing) : options.backing;
  const color = convertColor(settings.color, 'srgb');
  const result = await paintCanvas(options.width, options.height, options.format, context => {
    context.font = fontStyle;
    context.letterSpacing = settings.spacing * settings.size + 'px';
    context.textBaseline = 'top';
    context.fillStyle = colorCss(color.color);
    const lineHeight = settings.size * settings.lineHeight;
    if (lines.length * lineHeight + 24 > options.height ||
        lines.some(line => context.measureText(line).width + 24 > options.width)) {
      throw new MediaJobError('render', 'Increase the export dimensions to include the entire text.');
    }
    for (const [index, line] of lines.entries()) context.fillText(line, 12, 12 + index * lineHeight);
  }, backing);
  return { ...result, format: options.format, css, companion: text, gamutMapped: color.gamutMapped,
    fontFallback: !loaded } as const;
}
