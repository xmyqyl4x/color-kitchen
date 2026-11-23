import type { ColorValue } from '../model/color.js';
import { colorCss } from '../color/css.js';
import { inRange } from '../color/parse.js';
import { isLocale, type Locale } from '../model/locales.js';

const scripts = {
  Latn: /\p{Script=Latin}/u, Grek: /\p{Script=Greek}/u, Cyrl: /\p{Script=Cyrillic}/u,
  Arab: /\p{Script=Arabic}/u, Hebr: /\p{Script=Hebrew}/u, Hani: /\p{Script=Han}/u,
  Hira: /\p{Script=Hiragana}/u, Kana: /\p{Script=Katakana}/u, Hang: /\p{Script=Hangul}/u,
  Deva: /\p{Script=Devanagari}/u, Thai: /\p{Script=Thai}/u,
} as const;

type Script = keyof typeof scripts;
type Axis = Readonly<{ min: number; max: number; default: number }>;
export const fontCategories = ['sans', 'serif', 'mono', 'display'] as const;
export type FontCategory = typeof fontCategories[number];
export type FontWeightRange = Readonly<Pick<Axis, 'min' | 'max'>>;
export function isFontCategory(value: unknown): value is FontCategory { return fontCategories.some(category => category === value); }
export type FontDefinition = Readonly<{
  family: string;
  weights: readonly number[];
  scripts: readonly Script[];
  axes?: Readonly<Record<string, Axis>>;
  glyphRanges?: readonly (readonly [number, number])[];
}>;

function validateFont(font: FontDefinition) {
  if (!font.family.trim() || font.family.length > 120 || /[\u0000-\u001f\u007f]/.test(font.family) ||
      !font.weights.length || font.weights.some(weight => !inRange(weight, 1, 1000)) ||
      font.scripts.some(script => !Object.hasOwn(scripts, script))) throw new RangeError('Invalid font manifest.');
  for (const [name, axis] of Object.entries(font.axes ?? {})) {
    if (!/^[A-Za-z0-9]{4}$/.test(name) || !Number.isFinite(axis.min) || !Number.isFinite(axis.max) ||
        !inRange(axis.default, axis.min, axis.max) || (name === 'wght' && (axis.min < 1 || axis.max > 1000))) {
      throw new RangeError('Invalid font axis manifest.');
    }
  }
  if (font.glyphRanges?.some(([start, end]) =>
    !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 0x10ffff || start > end)) {
    throw new RangeError('Invalid font glyph ranges.');
  }
}

export function catalogFont(payload: Record<string, unknown>): FontDefinition {
  if (typeof payload.family !== 'string' || typeof payload.weight !== 'number' ||
      !Array.isArray(payload.scripts) || payload.scripts.some(script => typeof script !== 'string' || !Object.hasOwn(scripts, script))) {
    throw new RangeError('Incomplete font catalog metadata.');
  }
  const range = payload.weightRange as FontWeightRange | undefined;
  const weight = payload.weight;
  let definition: FontDefinition = { family: payload.family, weights: [weight], scripts: payload.scripts as Script[] };
  if (range !== undefined) {
    if (!range || typeof range !== 'object' || !inRange(range.min, 1, 1000) || !inRange(range.max, range.min, 1000) ||
        !inRange(weight, range.min, range.max)) throw new RangeError('Invalid font weight range.');
    const standard = [100, 200, 300, 400, 500, 600, 700, 800, 900].filter(value => inRange(value, range.min, range.max));
    const weights = [...new Set([range.min, ...standard, weight, range.max])].sort((a, b) => a - b);
    definition = { ...definition, weights, axes: { wght: { min: range.min, max: range.max, default: weight } } };
  }
  validateFont(definition);
  return definition;
}

export function fontCoverage(font: FontDefinition, original: string, locale: Locale) {
  validateFont(font);
  if (!isLocale(locale) || original.length > 10_000) throw new RangeError('Unsupported sample text or locale.');
  const fallback: string[] = [];
  const known = font.scripts.map(script => scripts[script]);
  for (const { segment } of new Intl.Segmenter(locale, { granularity: 'grapheme' }).segment(original)) {
    if (/^\s+$/u.test(segment)) continue;
    const characters = [...segment];
    const covered = font.glyphRanges
      ? characters.every(character => font.glyphRanges!.some(([low, high]) => inRange(character.codePointAt(0)!, low, high)))
      : !/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(segment) &&
        characters.every(character => !/\p{Letter}/u.test(character) || known.some(script => script.test(character)));
    if (!covered) fallback.push(segment);
  }
  return { coverage: font.glyphRanges ? 'glyphs' : 'scripts', supported: fallback.length === 0, fallback } as const;
}

export function selectFont(font: FontDefinition, request: {
  weight: number; axes?: Readonly<Record<string, number>>;
}) {
  validateFont(font);
  if (!inRange(request.weight, 1, 1000)) throw new RangeError('Choose a font weight from 1 to 1000.');
  const requestedAxes = request.axes ?? {};
  for (const name of Object.keys(requestedAxes)) {
    if (!Object.hasOwn(font.axes ?? {}, name)) throw new RangeError(`Unsupported font axis ${name}.`);
  }
  const axes = Object.fromEntries(Object.entries(font.axes ?? {}).map(([name, axis]) => {
    const value = requestedAxes[name] ?? (name === 'wght' ? request.weight : axis.default);
    if (!inRange(value, axis.min, axis.max)) throw new RangeError(`Font axis ${name} is outside its range.`);
    return [name, value];
  }));
  const weight = axes.wght ?? [...font.weights].sort((a, b) =>
    Math.abs(a - request.weight) - Math.abs(b - request.weight) || a - b)[0]!;
  return { family: font.family, weight, weightFallback: weight !== request.weight, axes };
}

export function typographyCss(font: FontDefinition, settings: {
  weight: number; axes?: Readonly<Record<string, number>>;
  size: number; lineHeight: number; spacing: number; color: ColorValue;
}) {
  const selected = selectFont(font, settings);
  if (!inRange(settings.size, 8, 256) || !inRange(settings.lineHeight, 0.75, 3) || !inRange(settings.spacing, -0.5, 1)) {
    throw new RangeError('Typography values are outside the preview bounds.');
  }
  const axes = Object.entries(selected.axes).map(([name, value]) => `"${name}" ${value}`);
  return [
    `font-family: ${JSON.stringify(selected.family)}, system-ui, sans-serif;`,
    `font-weight: ${selected.weight};`,
    `font-size: ${settings.size}px;`,
    `line-height: ${settings.lineHeight};`,
    `letter-spacing: ${settings.spacing}em;`,
    `color: ${colorCss(settings.color)};`,
    ...(axes.length ? [`font-variation-settings: ${axes.join(', ')};`] : []),
  ].join('\n');
}
