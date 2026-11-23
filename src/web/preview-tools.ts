import type { Locale } from '../model/locales.js';
import { previewToolsText } from './preview-tools-text.js';
import { html } from './shell.js';
import { studioRoles, studioText } from './studio-text.js';
import { screenTitle } from './strings.js';

export function previewToolsScreen(locale: Locale) {
  const t = (key: Parameters<typeof previewToolsText>[1]) => html(previewToolsText(locale, key));
  const button = (id: string, label: string, primary = false) =>
    '<button type="button" id="' + id + '" class="button' + (primary ? ' primary' : '') + '">' + label + '</button>';
  const menu = (id: string, label: string, choices: readonly string[]) =>
    '<label>' + label + '<select id="' + id + '">' + choices.map(value => '<option value="' + value + '">' +
      t(value as Parameters<typeof t>[0]) + '</option>').join('') + '</select></label>';
  return `<section class="studio preview-tools" data-preview-mode="design-preview">
    <h1>${html(screenTitle(locale, 'design-preview'))}</h1><div class="image-tools-layout"><div class="studio-panel">
      <div class="numeric-grid">${menu('preview-template', t('template'), ['landing', 'dashboard', 'editorial', 'shop-card'])}
      ${menu('preview-theme', t('theme'), ['light', 'dark'])}${menu('preview-size', t('size'), ['desktop', 'mobile'])}</div>
      <fieldset><legend>${html(studioText(locale, 'roles'))}</legend><div class="numeric-grid">
      ${studioRoles.map(role => '<label>' + html(studioText(locale, role)) + '<select id="preview-role-' + role +
        '" data-preview-role="' + role + '"></select></label>').join('')}
      </div>${button('preview-reset', t('reset'))}</fieldset>
      <div class="studio-actions">${button('preview-export', t('image'), true)}${button('preview-tokens', t('tokens'))}</div>
    <p role="status" id="preview-status"></p></div>
    <div class="studio-panel"><div id="template-canvas"></div><div id="preview-pair" aria-live="polite"></div></div></div>
  </section>`;
}
