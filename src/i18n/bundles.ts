import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import { IntlMessageFormat } from 'intl-messageformat';
import { locales, type Locale } from '../model/locales.js';
import { messages, type MessageBundles, type MessageKey } from './messages.js';

function signature(ast: readonly MessageFormatElement[], locale: Locale) {
  const parameters = new Set<string>();
  function visit(elements: readonly MessageFormatElement[]) {
    for (const node of elements) {
      if (node.type === TYPE.literal || node.type === TYPE.pound) continue;
      if (node.type === TYPE.tag) throw new Error('Messages must render as plain text.');
      let detail = '';
      if (node.type === TYPE.select || node.type === TYPE.plural) {
        const selectors = Object.keys(node.options);
        if (node.type === TYPE.select) detail = selectors.sort().join(',');
        if (node.type === TYPE.plural) {
          const valid = new Intl.PluralRules(locale, { type: node.pluralType }).resolvedOptions().pluralCategories;
          if (selectors.some(key => !key.startsWith('=') && !valid.includes(key as Intl.LDMLPluralRule))) {
            throw new Error('Unsupported plural category.');
          }
          detail = [node.pluralType, node.offset, ...selectors.filter(key => key.startsWith('=')).sort()].join(',');
        }
        for (const option of Object.values(node.options)) visit(option.value);
      }
      parameters.add(JSON.stringify([node.value, node.type, detail]));
    }
  }
  visit(ast);
  return [...parameters].sort().join('|');
}

export function compileMessageBundles(bundles: MessageBundles) {
  const keys = Object.keys(bundles.en).sort();
  if (!keys.length) throw new Error('The source bundle has no messages.');
  const englishSignatures = new Map<string, string>();
  const compiled = new Map<Locale, ReadonlyMap<string, IntlMessageFormat>>();
  for (const locale of locales) {
    const bundle = bundles[locale];
    if (!bundle || JSON.stringify(Object.keys(bundle).sort()) !== JSON.stringify(keys)) {
      throw new Error(`Message keys differ for ${locale}.`);
    }
    const formats = new Map<string, IntlMessageFormat>();
    for (const key of keys) {
      try {
        const message = bundle[key];
        if (!message?.trim()) throw new Error('Empty message.');
        const ast = parse(message);
        const parameters = signature(ast, locale);
        if (locale === 'en') englishSignatures.set(key, parameters);
        else if (englishSignatures.get(key) !== parameters) throw new Error('Message placeholders differ.');
        formats.set(key, new IntlMessageFormat(ast, locale));
      } catch (cause) {
        throw new Error(`Invalid message ${locale}/${key}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
      }
    }
    compiled.set(locale, formats);
  }
  return compiled as ReadonlyMap<Locale, ReadonlyMap<string, IntlMessageFormat>>;
}

const publishedBundle = compileMessageBundles(messages);

export function formatMessage(locale: Locale, key: MessageKey, values?: Record<string, string | number>) {
  const format = publishedBundle.get(locale)?.get(key);
  if (!format) throw new RangeError('Unknown locale or message key.');
  const result = format.format(values);
  return Array.isArray(result) ? result.join('') : String(result);
}
