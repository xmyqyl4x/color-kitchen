import type { Locale } from '../model/locales.js';
import { shades, tailwindVersions } from '../tailwind/scale.js';
import { collectionText } from './collection-text.js';
import { previewToolsText } from './preview-tools-text.js';
import { html } from './shell.js';
import { studioRoles, studioText } from './studio-text.js';
import { screenTitle } from './strings.js';

export function previewToolsScreen(locale: Locale, kind: 'design-preview' | 'tailwind') {
  const t = (key: Parameters<typeof previewToolsText>[1]) => html(previewToolsText(locale, key));
  const c = (key: Parameters<typeof collectionText>[1]) => html(collectionText(locale, key));
  const button = (id: string, label: string, primary = false) =>
    '<button type="button" id="' + id + '" class="button' + (primary ? ' primary' : '') + '">' + label + '</button>';
  const menu = (id: string, label: string, choices: readonly string[]) =>
    '<label>' + label + '<select id="' + id + '">' + choices.map(value => '<option value="' + value + '">' +
      t(value as Parameters<typeof t>[0]) + '</option>').join('') + '</select></label>';
  const shadeOptions = shades.map(value => '<option' + (value === 500 ? ' selected' : '') + '>' + value + '</option>').join('');
  const preview = kind === 'design-preview';
  return `<section class="studio preview-tools" data-preview-mode="${kind}">
    <h1>${html(screenTitle(locale, kind))}</h1><div class="image-tools-layout"><div class="studio-panel">
    ${preview ? `
      <div class="numeric-grid">${menu('preview-template', t('template'), ['landing', 'dashboard', 'editorial', 'shop-card'])}
      ${menu('preview-theme', t('theme'), ['light', 'dark'])}${menu('preview-size', t('size'), ['desktop', 'mobile'])}</div>
      <fieldset><legend>${html(studioText(locale, 'roles'))}</legend><div class="numeric-grid">
      ${studioRoles.map(role => '<label>' + html(studioText(locale, role)) + '<select data-preview-role="' + role + '"></select></label>').join('')}
      </div>${button('preview-reset', t('reset'))}</fieldset>
      <div class="studio-actions">${button('preview-export', t('image'), true)}${button('preview-tokens', t('tokens'))}</div>` : `
      <label>Tailwind<select id="tw-version"><option value="3">v${tailwindVersions[3]}</option>
        <option value="4" selected>v${tailwindVersions[4]}</option></select></label>
      <label>${t('token')}<input id="tw-name" value="kitchen" maxlength="80"></label>
      <label>${t('base')}<select id="tw-base"></select></label>
      <label>${t('anchor')}<select id="tw-anchor">${shadeOptions}</select></label>
      <fieldset><legend>${t('override')}</legend><div class="numeric-grid">
        <label>${t('override')}<select id="tw-override">${shadeOptions}</select></label>
        <label>${t('overrideColor')}<input id="tw-override-color" maxlength="160"></label></div>
        <div class="studio-actions">${button('tw-apply', html(studioText(locale, 'apply')))}${button('tw-clear', t('clear'))}</div>
      </fieldset>
      <label>${t('inspect')}<select id="tw-built"><option value=""></option><option>slate</option><option>indigo</option><option>emerald</option></select></label>
      <div class="studio-actions">${button('tw-download', c('download'), true)}${button('tw-copy', c('copy'))}</div>`}
    <p role="status" id="preview-status"></p></div>
    <div class="studio-panel">${preview ? '<div id="template-canvas"></div><div id="preview-pair" aria-live="polite"></div>' :
      '<div id="tw-scale" class="tailwind-scale"></div><div id="tw-sample"></div><div id="tw-built-result"></div><textarea id="tw-output" rows="9" readOnly aria-label="' + c('content') + '"></textarea>'}</div></div>
  </section>`;
}
