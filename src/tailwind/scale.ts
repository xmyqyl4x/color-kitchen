import type { ColorValue } from '../model/color.js';
import { checkContrast } from '../color/contrast.js';
import { convertColor } from '../color/convert.js';
import { colorCss } from '../color/css.js';
import { assertColor } from '../color/parse.js';
import { pinnedColors } from './pinned-colors.js';

export const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Shade = typeof shades[number];
export type TailwindVersion = 3 | 4;
type TargetSpace = 'srgb' | 'oklch';
export type ColorScale = Readonly<{
  schemaVersion: 1; name: string; anchor: Shade; colors: Readonly<Record<Shade, ColorValue>>;
}>;

function checkVersion(version: TailwindVersion) {
  if (version !== 3 && version !== 4) throw new RangeError('Choose Tailwind v3 or v4.');
}

export function normalizeTokenName(name: string) {
  const normalized = name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(normalized)) throw new RangeError('A token name needs a letter and at most 40 characters.');
  return normalized;
}

const versionLabels = { 3: '3.4.19', 4: '4.3.5' } as const;

export function inspectBuiltInScale(version: TailwindVersion, name: string) {
  checkVersion(version);
  const key = normalizeTokenName(name);
  const palettes: Readonly<Record<string, readonly string[]>> = pinnedColors[version];
  if (!Object.hasOwn(palettes, key)) return null;
  return { version: versionLabels[version], name: key, colors: Object.fromEntries(shades.map(
    (level, index) => [level, palettes[key]![index]!],
  )) as Record<Shade, string> };
}

export function generateColorScale(options: {
  name: string; base: ColorValue; anchor?: Shade; overrides?: Readonly<Partial<Record<Shade, ColorValue>>>;
}): ColorScale {
  const { base, anchor = 500, overrides = {} } = options;
  assertColor(base);
  if (!shades.includes(anchor)) throw new RangeError('Choose a valid anchor shade.');
  for (const [level, color] of Object.entries(overrides)) {
    if (!shades.includes(Number(level) as Shade) || String(Number(level)) !== level || Number(level) === anchor) {
      throw new RangeError('An override must name a non-anchor shade.');
    }
    assertColor(color);
  }
  const [lightness, chroma, hue] = convertColor(base, 'oklch').color.components;
  const colors = Object.fromEntries(shades.map(level => {
    const override = overrides[level];
    if (override) return [level, structuredClone(override)];
    if (level === anchor) return [level, structuredClone(base)];
    const lighter = level < anchor;
    const fraction = lighter ? (anchor - level) / (anchor - 50) : (level - anchor) / (950 - anchor);
    const end = lighter ? Math.max(lightness, 0.97) : Math.min(lightness, 0.14);
    const derived: ColorValue = { space: 'oklch', components: [lightness + (end - lightness) * fraction,
      chroma * (1 - fraction * (lighter ? 0.85 : 0.5)), hue], alpha: base.alpha };
    return [level, derived];
  })) as Record<Shade, ColorValue>;
  return { schemaVersion: 1, name: normalizeTokenName(options.name), anchor, colors };
}

export function exportTailwindScale(scale: ColorScale, options: {
  version: TailwindVersion; space: TargetSpace; taken?: readonly string[];
}) {
  const { version, space, taken = [] } = options;
  checkVersion(version);
  if (scale.schemaVersion !== 1 || (space !== 'srgb' && space !== 'oklch')) throw new RangeError('Unsupported token format.');
  const name = normalizeTokenName(scale.name);
  if (Object.hasOwn(pinnedColors[version], name) || ['black', 'white', 'transparent', 'inherit', 'current'].includes(name) ||
      taken.some(candidate => normalizeTokenName(candidate) === name)) {
    throw new RangeError(`Color family "${name}" already exists. Choose a different token name.`);
  }
  const gamutMapped: Shade[] = [];
  const colors = Object.fromEntries(shades.map(level => {
    const result = convertColor(scale.colors[level], space);
    if (result.gamutMapped) gamutMapped.push(level);
    return [level, colorCss(result.color)];
  })) as Record<Shade, string>;
  if (version === 4) {
    return { version, colors, gamutMapped,
      css: ['@theme {', ...shades.map(level => `  --color-${name}-${level}: ${colors[level]};`), '}'].join('\n') };
  }
  const config = { theme: { extend: { colors: { [name]: colors } } } };
  return { version, colors, gamutMapped, config, source: 'module.exports = ' + JSON.stringify(config, null, 2) + ';' };
}

export function checkScaleExample(scale: ColorScale, foreground: Shade | ColorValue,
    background: Shade | ColorValue, backing?: ColorValue) {
  return checkContrast(typeof foreground === 'number' ? scale.colors[foreground] : foreground,
    typeof background === 'number' ? scale.colors[background] : background, backing);
}
