import { isLocale, type Locale } from '../model/locales.js';

export type TextStyle = 'bold' | 'italic' | 'monospace';
const alphabets = {
  bold: [0x1d400, 0x1d41a, 0x1d7ce],
  italic: [0x1d434, 0x1d44e, 0],
  monospace: [0x1d670, 0x1d68a, 0x1d7f6],
} as const;

export function styleText(original: string, style: TextStyle, locale: Locale) {
  if (!isLocale(locale) || !Object.hasOwn(alphabets, style) || original.length > 10_000) {
    throw new RangeError('Unsupported styled text settings or length.');
  }
  const [upright, lower, digit] = alphabets[style];
  let transformed = 0;
  let unsupported = 0;
  const styled = [...new Intl.Segmenter(locale, { granularity: 'grapheme' }).segment(original)].map(({ segment }) => {
    let point: number | undefined;
    if (/^[A-Z]$/.test(segment)) point = upright + segment.charCodeAt(0) - 65;
    else if (/^[a-z]$/.test(segment)) {
      point = style === 'italic' && segment === 'h' ? 0x210e : lower + segment.charCodeAt(0) - 97;
    } else if (digit && /^[0-9]$/.test(segment)) point = digit + segment.charCodeAt(0) - 48;
    if (point !== undefined) {
      transformed++;
      return String.fromCodePoint(point);
    }
    if (/[\p{Letter}\p{Number}\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(segment)) unsupported++;
    return segment;
  }).join('');
  return { original, styled, transformed, unsupported };
}
