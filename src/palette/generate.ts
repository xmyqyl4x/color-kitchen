import { harmonyHues, type Harmony } from '../color/effects.js';
import { wrapHue } from '../color/parse.js';
import type { ColorValue, Palette } from '../model/color.js';

export const minSwatches = 2;
export const maxSwatches = 12;
export type Temperature = 'any' | 'warm' | 'cool';
export type GenerationOptions = Readonly<{ seed: number; harmony?: Harmony; temperature?: Temperature }>;

function randomStream(seed: number) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Palette seeds must be unsigned 32-bit integers.');
  }
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

export function generateColors(count: number, options: GenerationOptions): readonly ColorValue[] {
  if (!Number.isInteger(count) || count < minSwatches || count > maxSwatches) {
    throw new RangeError('A palette needs between two and twelve swatches.');
  }
  const { seed, harmony = 'balanced', temperature = 'any' } = options;
  if (temperature !== 'any' && temperature !== 'warm' && temperature !== 'cool') {
    throw new RangeError('Unsupported palette temperature.');
  }
  const random = randomStream(seed);
  const hues = harmonyHues(random() * 360, harmony);
  return Array.from({ length: count }, (_, index): ColorValue => {
    const hue = hues[index % hues.length]!;
    const chosen = temperature === 'warm' ? wrapHue(315 + hue / 3)
      : temperature === 'cool' ? 130 + hue * 165 / 360
      : hue;
    return { space: 'oklch', components: [0.36 + 0.5 * random(), 0.055 + 0.115 * random(), chosen], alpha: 1 };
  });
}

export function generatePalette(options: GenerationOptions, count = 5): Palette {
  return {
    swatches: generateColors(count, options).map((color, index) => ({ id: `swatch-${index + 1}`, color, locked: false })),
    roles: {},
  };
}
