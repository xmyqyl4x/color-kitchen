import { colorCss } from '../color/css.js';
import { convertColor, toHex, toHsl } from '../color/convert.js';
import { gradientCss, type Gradient } from '../gradient/gradient.js';
import type { Palette, ColorValue } from '../model/color.js';
import { checkPalette } from '../palette/document.js';
import { exportTailwindScale, type ColorScale } from '../tailwind/scale.js';

export type PaletteTextFormat = 'hex' | 'rgb' | 'hsl' | 'oklch' | 'css';

export function paletteText(palette: Palette, format: PaletteTextFormat) {
  checkPalette(palette);
  const number = (value: number) => +value.toFixed(8);
  const channels = (color: ColorValue) => {
    const alpha = color.alpha === 1 ? '' : ' / ' + number(color.alpha);
    switch (format) {
      case 'hex': { const { hex, gamutMapped } = toHex(color); return { value: hex, gamutMapped }; }
      case 'rgb': {
        const result = convertColor(color, 'srgb');
        return { value: 'rgb(' + result.color.components.map(value => number(value * 255)).join(' ') + alpha + ')',
          gamutMapped: result.gamutMapped };
      }
      case 'hsl': {
        const { hue, saturation, lightness, gamutMapped } = toHsl(color);
        return { value: 'hsl(' + number(hue) + ' ' + number(saturation * 100) + '% ' + number(lightness * 100) + '%' + alpha + ')',
          gamutMapped };
      }
      case 'oklch': return { value: colorCss(convertColor(color, 'oklch').color), gamutMapped: false };
      case 'css': return { value: colorCss(color), gamutMapped: false };
      default: throw new RangeError('Unsupported palette text format.');
    }
  };
  const values = palette.swatches.map(swatch => ({ id: swatch.id, ...channels(swatch.color) }));
  const gamutMapped = values.filter(value => value.gamutMapped).map(value => value.id);
  if (format !== 'css') return { text: values.map(value => value.value).join('\n'), gamutMapped };
  const aliases = Object.entries(palette.roles).map(([role, id]) => {
    const variable = '--ck-role-' + role.replaceAll('.', '--');
    return '  ' + variable + ': var(--ck-swatch-' + id + ');';
  });
  const declarations = values.map(({ id, value }) => '  --ck-swatch-' + id + ': ' + value + ';');
  return { text: [':root {', ...declarations, ...aliases, '}'].join('\n'), gamutMapped };
}

export function gradientText(gradient: Gradient) {
  return ':root {\n  --ck-gradient: ' + gradientCss(gradient) + ';\n}';
}

export function tailwindText(scale: ColorScale, options: Parameters<typeof exportTailwindScale>[1]) {
  const result = exportTailwindScale(scale, options);
  return { text: result.version === 4 ? result.css : result.source, gamutMapped: result.gamutMapped };
}

export async function copyText(text: string, clipboard?: Pick<Clipboard, 'writeText'>) {
  try {
    const destination = clipboard ?? globalThis.navigator?.clipboard;
    if (destination) {
      await destination.writeText(text);
      return { copied: true as const };
    }
  } catch { /* Retain the exact text so it can be selected and copied. */ }
  return { copied: false as const, text };
}
