import { isLocale, type Locale } from '../model/locales.js';

function baseLanguage(code: string | null | undefined): Locale | null {
  const token = code?.trim().toLowerCase();
  if (!token || !/^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/.test(token)) return null;
  const base = token.split('-')[0];
  return isLocale(base) ? base : null;
}

function browserPreferences(browser: string | readonly string[] | undefined) {
  if (typeof browser !== 'string') return browser?.slice(0, 32) ?? [];
  if (browser.length > 2048) return [];
  return browser.split(',').slice(0, 32).map((value, position) => {
    const [code, quality, ...rest] = value.trim().split(';');
    const q = quality === undefined ? 1 : /^q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/i.test(quality.trim())
      ? Number(quality.trim().slice(2)) : 0;
    return { code, q: rest.length ? 0 : q, position };
  }).filter(value => value.q > 0).sort((a, b) => b.q - a.q || a.position - b.position).map(value => value.code ?? '');
}

export function resolveLocale(options: Readonly<{
  selected?: string | null; route?: string | null; saved?: string | null; browser?: string | readonly string[];
}>) {
  const explicit = [options.selected, options.route];
  const unsupported = explicit.find(value => value && !baseLanguage(value)) ?? null;
  const candidates = [
    { value: options.selected, source: 'selection' },
    { value: options.route, source: 'route' },
    { value: options.saved, source: 'preference' },
    ...browserPreferences(options.browser).map(value => ({ value, source: 'browser' as const })),
  ] as const;
  for (const { value, source } of candidates) {
    const locale = baseLanguage(value);
    if (locale) return { locale, source, unsupported };
  }
  return { locale: 'en' as const, source: 'default' as const, unsupported };
}

export function changeCatalogLocale<T extends { locale: Locale; cursor?: string | null }>(view: T, locale: Locale) {
  if (!isLocale(locale)) throw new RangeError('Unsupported locale selection.');
  return { ...view, locale, cursor: null };
}
