import type { Locale } from '../model/locales.js';
import { shades, tailwindVersions } from '../tailwind/scale.js';
import { collectionText } from './collection-text.js';
import { previewToolsText } from './preview-tools-text.js';
import { html } from './shell.js';
import { screenTitle } from './strings.js';
import { studioText } from './studio-text.js';
import { tailwindStudioText } from './tailwind-studio-text.js';

export function tailwindStudio(locale: Locale) {
  const t = (key: Parameters<typeof tailwindStudioText>[1]) => html(tailwindStudioText(locale, key));
  const p = (key: Parameters<typeof previewToolsText>[1]) => html(previewToolsText(locale, key));
  const c = (key: Parameters<typeof collectionText>[1]) => html(collectionText(locale, key));
  const shadeOptions = shades.map(shade => `<option value="${shade}"${shade === 500 ? ' selected' : ''}>${shade}</option>`).join('');
  const button = (id: string, label: string, primary = false) =>
    `<button type="button" id="${id}" class="button${primary ? ' primary' : ''}">${label}</button>`;
  return `<section class="studio tailwind-studio">
    <header class="tw-page-header">
      <div><h1>${html(screenTitle(locale, 'tailwind'))}</h1><p>${t('intro')}</p></div>
      <label>${t('version')}<select id="tw-version"><option value="3">v${tailwindVersions[3]}</option>
        <option value="4" selected>v${tailwindVersions[4]}</option></select></label>
    </header>
    <div class="tw-modes">
      <button type="button" class="button" id="tw-browse" aria-pressed="true" aria-controls="tw-library">${t('browse')}</button>
      <button type="button" class="button" id="tw-generate" aria-pressed="false" aria-controls="tw-editor">${t('generate')}</button>
    </div>
    <div class="tw-workspace">
      <aside class="studio-panel tw-controls" id="tw-library">
        <h2>${t('families')}</h2>
        <div class="tw-filters">
          <label>${t('search')}<input id="tw-search" type="search" maxlength="80" autocomplete="off"></label>
          <label>${t('categories')}<select id="tw-category">
            ${(['all', 'warm', 'greens', 'blues', 'purple', 'neutrals'] as const).map(key => `<option value="${key}">${t(key)}</option>`).join('')}
          </select></label>
        </div>
        <ul class="tw-families" id="tw-families" aria-label="${t('families')}"></ul>
        <p id="tw-empty" role="status" hidden>${t('noResults')}</p>
      </aside>
      <aside class="studio-panel tw-controls" id="tw-editor" hidden>
        <h2>${t('controls')}</h2>
        <label>${p('token')}<input id="tw-name" value="kitchen" maxlength="80"></label>
        <label>${p('base')}<select id="tw-base"><option value="">${t('custom')}</option></select></label>
        <label>${t('baseColor')}<input id="tw-base-color" maxlength="160" spellcheck="false"></label>
        <label>${p('anchor')}<select id="tw-anchor">${shadeOptions}</select></label>
        <fieldset><legend>${p('override')}</legend>
          <label>${t('shadeToEdit')}<select id="tw-override">${shadeOptions}</select></label>
          <label>${p('overrideColor')}<input id="tw-override-color" maxlength="160" spellcheck="false"></label>
          <div class="studio-actions">${button('tw-apply', html(studioText(locale, 'apply')))}${button('tw-clear', p('clear'))}</div>
        </fieldset>
      </aside>
      <div class="tw-content">
        <section class="studio-panel tw-scale-panel" id="tw-details" aria-labelledby="tw-title" hidden>
          <h2 id="tw-title"></h2>
          <div id="tw-scale" class="tailwind-scale"></div>
          <div class="tw-selection">
            <div class="tw-large-swatch" aria-hidden="true"><span id="tw-swatch"></span></div>
            <div class="tw-select-controls">
              <h3 id="tw-shade-title"></h3>
              <div class="tw-value-fields">
                <label>${t('value')}<input id="tw-value" readonly></label>
                <label>${t('utility')}<select id="tw-utility"><option value="bg">${t('background')}</option>
                  <option value="text">${t('textColor')}</option><option value="border">${t('borderColor')}</option></select></label>
                <label>${t('className')}<input id="tw-class" readonly></label>
              </div>
              <div class="studio-actions">
                ${button('tw-copy-value', t('copyValue'))}${button('tw-copy-class', t('copyClass'))}
                <a class="button" id="tw-inspect" target="_blank" rel="noopener">${t('inspect')} <span aria-hidden="true">↗</span></a>
                ${button('tw-from-shade', t('useShade'), true)}
              </div>
            </div>
          </div>
        </section>
        <p id="preview-status" role="status"></p>
        <section class="studio-panel tw-usage" id="tw-usage" aria-labelledby="tw-usage-title" hidden>
          <header class="tw-section-header"><h2 id="tw-usage-title">${t('examples')}</h2>
            <label>${t('mode')}<select id="tw-theme"><option value="light">${p('light')}</option>
              <option value="dark">${p('dark')}</option></select></label></header>
          <div id="tw-examples" class="tw-example-grid"></div>
        </section>
        <section class="studio-panel" id="tw-export" aria-labelledby="tw-export-title" hidden>
          <header class="tw-section-header"><h2 id="tw-export-title">${t('export')}</h2>
            <label>${t('format')}<select id="tw-format">
              <option value="tailwind">Tailwind</option><option value="css">${t('css')}</option><option value="json">JSON</option>
            </select></label>
          </header>
          <textarea id="tw-output" rows="7" readonly aria-label="${c('content')}"></textarea>
          <div class="studio-actions">${button('tw-download', c('download'), true)}${button('tw-copy', c('copy'))}</div>
          <p id="tw-export-status" role="status"></p>
        </section>
      </div>
    </div>
  </section>`;
}
