import type { ColorValue } from '../model/color.js';
import { assertColor } from './parse.js';

export function colorCss(color: ColorValue) {
  assertColor(color);
  const channels = color.components.join(' ');
  const alpha = color.alpha === 1 ? '' : ` / ${color.alpha}`;
  return color.space === 'oklch'
    ? `oklch(${channels}${alpha})`
    : `color(${color.space} ${channels}${alpha})`;
}
