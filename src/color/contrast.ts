import type { ColorChannels, ColorValue } from '../model/color.js';
import { clampUnit, convertColor, linearize, toSrgbFallback } from './convert.js';

function composite(above: ColorValue, below: ColorChannels): ColorChannels {
  // Composite in encoded sRGB before converting the rendered colors to relative luminance.
  const [r, g, b] = above.components;
  const [br, bg, bb] = below;
  const alpha = above.alpha;
  return [
    clampUnit(r * alpha + br * (1 - alpha)),
    clampUnit(g * alpha + bg * (1 - alpha)),
    clampUnit(b * alpha + bb * (1 - alpha)),
  ];
}

function luminance([r, g, b]: ColorChannels) {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

const assessment = (ratio: number, threshold: number) => ({ threshold, passes: ratio >= threshold });

export function checkContrast(foreground: ColorValue, background: ColorValue, backing?: ColorValue) {
  if ((foreground.alpha < 1 || background.alpha < 1) && !backing) {
    throw new RangeError('Translucent colors require an explicit opaque backing.');
  }
  if (backing && backing.alpha !== 1) throw new RangeError('The backing color must be opaque.');
  const fg = toSrgbFallback(foreground);
  const bg = toSrgbFallback(background);
  const base = backing === undefined ? undefined : toSrgbFallback(backing);
  const renderedBackground = base ? composite(bg.color, base.color.components) : bg.color.components;
  const renderedForeground = composite(fg.color, renderedBackground);
  const fgLuminance = luminance(renderedForeground);
  const bgLuminance = luminance(renderedBackground);
  const ratio = (Math.max(fgLuminance, bgLuminance) + 0.05) / (Math.min(fgLuminance, bgLuminance) + 0.05);
  return {
    ratio,
    foreground: { space: 'srgb', components: renderedForeground, alpha: 1 } as const,
    background: { space: 'srgb', components: renderedBackground, alpha: 1 } as const,
    backing: base?.color ?? null,
    gamutMapped: fg.gamutMapped || bg.gamutMapped || Boolean(base?.gamutMapped),
    normal: { aa: assessment(ratio, 4.5), aaa: assessment(ratio, 7) },
    large: { aa: assessment(ratio, 3), aaa: assessment(ratio, 4.5) },
  };
}

export function suggestForeground(foreground: ColorValue, background: ColorValue, options: {
  backing?: ColorValue; threshold?: 3 | 4.5 | 7;
} = {}) {
  const { backing, threshold = 4.5 } = options;
  const initial = checkContrast(foreground, background, backing);
  if (initial.ratio >= threshold) return null;
  const { color } = convertColor(foreground, 'oklch');
  const [lightness, chroma, hue] = color.components;
  for (let step = 1; step <= 100; step++) {
    for (const direction of [-1, 1]) {
      const next = lightness + direction * step / 100;
      if (next < 0 || next > 1) continue;
      const candidate: ColorValue = { space: 'oklch', components: [next, chroma, hue], alpha: foreground.alpha };
      const result = checkContrast(candidate, background, backing);
      if (result.ratio >= threshold) return { color: candidate, ratio: result.ratio };
    }
  }
  for (const channel of [0, 1]) {
    const candidate: ColorValue = { space: 'srgb', components: [channel, channel, channel], alpha: 1 };
    const result = checkContrast(candidate, background, backing);
    if (result.ratio >= threshold) return { color: candidate, ratio: result.ratio };
  }
  return null;
}
