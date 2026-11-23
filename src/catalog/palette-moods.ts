import type { Locale } from '../model/locales.js';

export const paletteMoods = {
  earthy: { en: 'Earthy', fr: 'Terreux', es: 'Terroso', pt: 'Terroso', de: 'Erdig' },
  pastel: { en: 'Pastel', fr: 'Pastel', es: 'Pastel', pt: 'Pastel', de: 'Pastell' },
  bold: { en: 'Bold', fr: 'Audacieux', es: 'Atrevido', pt: 'Ousado', de: 'Kräftig' },
  moody: { en: 'Moody', fr: 'Sombre', es: 'Sombrío', pt: 'Sombrio', de: 'Düster' },
  minimal: { en: 'Minimal', fr: 'Minimaliste', es: 'Minimalista', pt: 'Minimalista', de: 'Minimalistisch' },
  retro: { en: 'Retro', fr: 'Rétro', es: 'Retro', pt: 'Retro', de: 'Retro' },
  fresh: { en: 'Fresh', fr: 'Frais', es: 'Fresco', pt: 'Fresco', de: 'Frisch' },
  warm: { en: 'Warm', fr: 'Chaleureux', es: 'Cálido', pt: 'Quente', de: 'Warm' },
} as const satisfies Record<string, Record<Locale, string>>;

export type PaletteMood = keyof typeof paletteMoods;
