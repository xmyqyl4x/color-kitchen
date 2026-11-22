import type { Locale } from '../model/locales.js';
import { html } from './shell.js';
import { collectionText } from './collection-text.js';
import { screenTitle } from './strings.js';

export function collectionScreen(locale: Locale) {
  const t = (key: Parameters<typeof collectionText>[1]) => html(collectionText(locale, key));
  return `<section class="studio collection">
    <h1>${html(screenTitle(locale, 'collection'))}</h1>
    <div class="collection-bar">
      <strong>${t('local')}</strong>
      <label><input type="checkbox" id="collection-assets"> ${t('assets')}</label>
      <button class="button" type="button" id="collection-backup">${t('backup')}</button>
    </div>
    <div class="collection-controls">
      <label>${t('search')}<input type="search" id="collection-search"></label>
      <label>${t('import')}<input type="file" id="collection-import" accept=".json,application/json"></label>
    </div>
    <div class="studio-actions">
      <button class="button" type="button" id="collection-undo" hidden>${t('undo')}</button>
      <button class="button" type="button" id="collection-active" hidden>${t('active')}</button>
    </div>
    <p id="collection-status" role="status"></p>
    <ul id="collection-items" class="collection-grid"></ul>
  </section>`;
}
