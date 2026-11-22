export const locales = ['en', 'fr', 'es', 'pt', 'de'] as const;
export type Locale = typeof locales[number];

export function isLocale(value: unknown): value is Locale {
  return locales.some(locale => locale === value);
}
