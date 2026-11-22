import type { CatalogEntry } from '../catalog/repository.js';
import { messages } from '../i18n/messages.js';
import type { Locale } from '../model/locales.js';
import { html, pathFor } from './shell.js';
import { screenTitle } from './strings.js';
import { trustText } from './trust-text.js';

export function trustScreen(locale: Locale, screen: 'cookie-preferences' | 'contact' | 'advertise') {
  const t = (key: Parameters<typeof trustText>[1]) => html(trustText(locale, key));
  const title = html(screenTitle(locale, screen));
  if (screen === 'cookie-preferences') return `<section class="studio trust-ui">
    <h1>${title}</h1><p>${t('help')}</p><div class="studio-panel">
      <h2>${t('optional')}</h2>
      <label><input id="trust-advertising" type="checkbox" disabled> ${t('advertising')}</label>
      <label><input id="trust-analytics" type="checkbox" disabled> ${html(messages[locale]['consent.analytics'])}</label>
      <div class="studio-actions">
        <button class="button" id="trust-accept" type="button" disabled>${t('accept')}</button>
        <button class="button" id="trust-deny" type="button" disabled>${html(messages[locale]['consent.reject'])}</button>
        <button class="button" id="trust-save" type="button" disabled>${t('save')}</button>
      </div><p id="trust-status" role="status"></p>
    </div><a class="secondary-link" href="${pathFor(locale, 'cookies')}">${html(screenTitle(locale, 'cookies'))}</a>
  </section>`;
  const advertise = screen === 'advertise';
  return `<section class="studio trust-ui"><h1>${title}</h1><p>${t(advertise ? 'placements' : 'contact')}</p>
    <form id="inquiry-form" class="studio-panel" data-channel="${advertise ? 'advertising' : 'contact'}">
      ${advertise ? '' : '<label>' + t('purpose') + '<select id="inquiry-purpose">' +
        (['support', 'accessibility', 'privacy', 'licensing'] as const)
          .map(value => '<option value="' + value + '">' + t(value) + '</option>').join('') + '</select></label>'}
      <label>${t('email')}<input id="inquiry-email" type="email" maxlength="254" autocomplete="email" required></label>
      <label>${t('message')}<textarea id="inquiry-message" rows="6" maxlength="12000" required></textarea></label>
      <button class="button primary" id="inquiry-submit" type="submit" disabled>${t('send')}</button>
      <p id="trust-status" role="status"></p>
    </form><a class="secondary-link" href="${pathFor(locale, 'privacy')}">${html(screenTitle(locale, 'privacy'))}</a></section>`;
}

export function publishedPolicy(locale: Locale, screen: 'licensing' | 'terms' | 'privacy' | 'cookies', entry?: CatalogEntry) {
  const title = entry?.title ?? screenTitle(locale, screen);
  const formatDate = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' });
  const heading = '<h1>' + html(title) + '</h1>';
  if (!entry) return { title, content: heading + '<p>' + html(trustText(locale, 'unavailable')) + '</p>', status: 404, index: false };
  const meta = '<p><strong>' + html(trustText(locale, 'revision')) + '</strong> ' + entry.revision +
    (entry.effectiveAt ? ' · ' + html(trustText(locale, 'effective')) + ' <time datetime="' + entry.effectiveAt.toISOString() + '">' +
      html(formatDate.format(entry.effectiveAt)) + '</time>' : '') + '</p>';
  const body = (entry.body ?? '').split(/\r?\n(?:\s*\r?\n)+/).filter(Boolean).map(para => '<p>' + html(para) + '</p>').join('');
  return { title, description: entry.summary, content: '<article class="trust-ui">' + heading + meta + '<p>' + html(entry.summary) +
    '</p>' + body + '</article>' + (screen === 'cookies' || screen === 'privacy'
      ? '<a class="secondary-link" href="' + pathFor(locale, 'cookie-preferences') + '">' +
        html(screenTitle(locale, 'cookie-preferences')) + '</a>' : ''), status: 200, index: true };
}
