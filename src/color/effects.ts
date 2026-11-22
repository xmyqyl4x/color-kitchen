import type { ColorValue } from '../model/color.js';
import { toSrgbFallback } from './convert.js';
import { assertColor, inRange, wrapHue } from './parse.js';

export const harmonyModes = ['balanced', 'analogous', 'complementary', 'split-complementary', 'triadic', 'monochromatic'] as const;
export type Harmony = typeof harmonyModes[number];
const offsets: Record<Harmony, readonly number[]> = {
  balanced: [0, 55, 125, 195, 260],
  analogous: [0, -30, 30, -60, 60],
  complementary: [0, 180],
  'split-complementary': [0, 150, 210],
  triadic: [0, 120, 240],
  monochromatic: [0],
};

export function harmonyHues(hue: number, harmony: Harmony) {
  if (!harmonyModes.includes(harmony)) throw new RangeError('Unsupported harmony.');
  return offsets[harmony].map(offset => wrapHue(hue + offset));
}

function mixNeutral(input: ColorValue, amount: number, neutral: number): ColorValue {
  if (!inRange(amount)) throw new RangeError('A tint, shade or tone amount must be in [0, 1].');
  if (amount === 0) {
    assertColor(input);
    return input;
  }
  const { color } = toSrgbFallback(input);
  const [r, g, b] = color.components;
  const mix = (channel: number) => channel * (1 - amount) + neutral * amount;
  return { space: 'srgb', components: [mix(r), mix(g), mix(b)], alpha: color.alpha };
}

export const tint = (color: ColorValue, amount: number) => mixNeutral(color, amount, 1);
export const shade = (color: ColorValue, amount: number) => mixNeutral(color, amount, 0);
export const tone = (color: ColorValue, amount: number) => mixNeutral(color, amount, 0.5);
