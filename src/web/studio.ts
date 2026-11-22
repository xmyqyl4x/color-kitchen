import { harmonyModes } from '../color/effects.js';
import type { Locale } from '../model/locales.js';
import { html, pathFor } from './shell.js';
import { studioRoles, studioText } from './studio-text.js';
import { screenTitle } from './strings.js';

export function paletteStudio(locale: Locale) {
  const t = (key: Parameters<typeof studioText>[1]) => html(studioText(locale, key));
  const menu = (values: readonly Parameters<typeof studioText>[1][]) =>
    values.map(value => '<option value="' + value + '">' + t(value) + '</option>').join('');
  return `<div class="studio" id="studio">
    <div class="studio-heading">
      <div><h1>${html(screenTitle(locale, 'palette-studio'))}</h1><p>${t('intro')}</p></div>
      <button id="studio-save" type="button" class="button">${t('save')}</button>
    </div>
    <div class="studio-toolbar">
      <label for="palette-name">${t('paletteName')}<input id="palette-name" type="text" maxlength="120" autocomplete="off"></label>
      <label for="palette-harmony">${t('harmony')}<select id="palette-harmony">${menu(harmonyModes)}</select></label>
      <div class="studio-actions">
        <button class="button" type="button" id="studio-undo" disabled>${t('undo')}</button>
        <button class="button primary" type="button" id="studio-generate">${t('generate')}</button>
      </div>
    </div>
    <details class="studio-options"><summary>${t('options')}</summary>
      <div class="studio-controls">
        <label for="palette-temperature">${t('temperature')}<select id="palette-temperature">${menu(['any', 'warm', 'cool'])}</select></label>
        <label for="palette-seed">${t('seed')}<input id="palette-seed" type="number" min="0" max="4294967295" step="1" inputmode="numeric"></label>
        <label class="shortcut-setting"><input id="palette-shortcut" type="checkbox" checked> ${t('shortcut')}</label>
      </div>
    </details>
    <section tabindex="0" id="palette-canvas" class="studio-canvas" aria-label="${t('canvas')}" aria-keyshortcuts="Space">
      <ol id="studio-swatches" class="studio-swatches"></ol>
    </section>
    <div class="studio-after">
      <span id="studio-count"></span>
      <button id="studio-add" type="button" class="button">${t('add')}</button>
      <p id="studio-status" role="status" aria-live="polite"></p>
      <label class="copy-field" id="copy-fallback" hidden>${t('copyFallback')}<input readonly id="copy-value"></label>
    </div>
    <div class="studio-panels">
      <section class="studio-panel">
        <h2>${t('roles')}</h2>
        <label>${t('role')}<select id="palette-role">${menu(studioRoles)}</select></label>
        <label>${t('assign')}<select id="palette-role-color"></select></label>
      </section>
      <section class="studio-panel">
        <h2>${t('adjust')}</h2>
        <label>${t('lightness')}<input id="palette-lightness" type="range" min="-0.25" max="0.25" step="0.01" value="0"></label>
        <label>${t('chroma')}<input id="palette-chroma" type="range" min="-1" max="1" step="0.05" value="0"></label>
        <div id="adjust-preview" class="adjust-preview" hidden aria-label="${t('preview')}"></div>
        <div class="studio-actions">
          <button type="button" class="button" id="studio-preview">${t('preview')}</button>
          <button type="button" class="button" id="studio-apply" disabled>${t('apply')}</button>
        </div>
      </section>
    </div>
    <div class="studio-bottom">
      <a class="secondary-link" href="${pathFor(locale, 'contrast')}" data-focus-key="studio-contrast">${html(screenTitle(locale, 'contrast'))}</a>
      <a class="secondary-link" href="${pathFor(locale, 'design-preview')}" data-focus-key="studio-design">${html(screenTitle(locale, 'design-preview'))}</a>
      <button type="button" class="button" id="studio-backup">${t('backup')}</button>
    </div>
  </div>`;
}
