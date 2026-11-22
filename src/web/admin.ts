import { catalogStaffRoles } from '../catalog/moderation-repository.js';
import type { CatalogStaffRole } from '../catalog/publication-rules.js';
import { catalogKinds } from '../catalog/repository.js';
import { identifyRequest, type ProtectedDependencies } from '../http/identity.js';
import { adminErrorMessage } from '../i18n/admin-errors.js';
import { locales, type Locale } from '../model/locales.js';
import { findProjectActor } from '../projects/repository.js';
import { adminText, type AdminLabel } from './admin-text.js';
import { html, renderShell } from './shell.js';
import { languageNames, screenTitle } from './strings.js';

type Labels = (label: AdminLabel) => string;
const provenanceFields = ['sourceUri', 'sourceVersion', 'sourceDigest', 'licenseUri', 'attribution', 'effectiveAt'] as const;

function provenance(t: Labels) {
  return `<fieldset class="admin-form"><legend>${t('metadata')}</legend>
    <label>${t('origin')} <select name="origin"><option value="original">${t('original')}</option><option value="licensed">${t('licensed')}</option></select></label>
    <label>${t('licenseId')} <input name="licenseId" required maxlength="200"></label>
    ${provenanceFields.map(field => `<label>${t(field)} <input name="${field}" ${field.endsWith('Uri') ? 'type="url"' : ''} maxlength="2048"></label>`).join('')}
    <label class="admin-wide">${t('payload')} <textarea name="payload" rows="6" required spellcheck="false" class="admin-code">{}</textarea></label>
  </fieldset>`;
}

function catalogAdminContent(locale: Locale, roles: CatalogStaffRole[]) {
  const t: Labels = label => html(adminText(locale, label));
  const editor = roles.includes('editor'), publisher = roles.includes('publisher');
  const options = catalogKinds.map(kind => `<option value="${kind}">${t(kind)}</option>`).join('');
  const languageOptions = locales.map(language => `<option value="${language}" lang="${language}"${language === locale ? ' selected' : ''}>${languageNames[language]}</option>`).join('');
  return `<div id="catalog-admin" data-editor="${editor}">
    <header class="admin-heading"><h1>${html(screenTitle(locale, 'catalog-admin'))}</h1>
      <a class="button" href="#admin-audit">${t('audit')}</a></header>
    <p id="admin-message" role="status" tabindex="-1"></p>
    <div class="admin-layout">
      <section class="admin-panel" aria-labelledby="admin-catalog-heading">
        <h2 id="admin-catalog-heading">${t('catalog')}</h2>
        <form id="admin-filter" class="admin-form">
          <label>${t('search')} <input name="q" type="search" maxlength="100"></label>
          <label>${t('type')} <select name="kind"><option value="">${t('allKinds')}</option>${options}</select></label>
          <button class="button" type="submit">${t('apply')}</button>
        </form>
        <ul id="admin-items" class="admin-records"></ul>
        <button class="button" type="button" id="admin-items-more" hidden>${t('more')}</button>
        ${editor ? `<details class="admin-subpanel"><summary>${t('newItem')}</summary>
          <form id="admin-create" class="admin-form">
            <label>${t('type')} <select name="kind">${options}</select></label>
            <label>${t('slug')} <input name="slug" maxlength="100" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" spellcheck="false"></label>
            ${provenance(t)}<button class="button primary" type="submit">${t('newItem')}</button>
          </form></details>` : ''}
      </section>
      <section class="admin-panel" aria-labelledby="admin-item-heading">
        <h2 id="admin-item-heading" tabindex="-1">${t('revisions')}</h2>
        <p id="admin-choose">${t('choose')}</p>
        <div id="admin-revision" hidden>
          <dl id="admin-version" class="admin-version"></dl>
          <div class="admin-controls">
            <label>${t('revision')} <select id="admin-revision-select"></select></label>
            <button class="button" type="button" id="admin-revisions-more" hidden>${t('more')}</button>
            ${editor ? `<button class="button" type="button" id="admin-fork">${t('newRevision')}</button>` : ''}
          </div>
          <section class="admin-subpanel" aria-labelledby="admin-coverage-heading">
            <h3 id="admin-coverage-heading">${t('coverage')}</h3><dl id="admin-coverage" class="admin-version"></dl>
          </section>
          <form id="admin-translation" class="admin-form">
            <label>${t('language')} <select id="admin-language">${languageOptions}</select></label>
            <label class="admin-wide">${t('title')} <input name="title" required maxlength="250"></label>
            <label class="admin-wide">${t('summary')} <textarea name="summary" required maxlength="2000" rows="2"></textarea></label>
            <label class="admin-wide">${t('body')} <textarea name="body" maxlength="50000" rows="5"></textarea></label>
            ${editor ? `<button class="button primary" type="submit" id="admin-save-translation">${t('saveTranslation')}</button>` : ''}
          </form>
          <details class="admin-subpanel"><summary>${t('metadata')}</summary>
            <form id="admin-metadata" class="admin-form">${provenance(t)}
              ${editor ? `<button class="button" type="submit" id="admin-save-metadata">${t('saveMetadata')}</button>` : ''}
            </form>
          </details>
          <div id="admin-pending" class="admin-subpanel" hidden>
            <p>${t('pending')}</p><button class="button" type="button" id="admin-discard">${t('discard')}</button>
          </div>
          <div id="admin-conflict" class="admin-subpanel" hidden>
            <button class="button" type="button" id="admin-refresh">${t('loadCurrent')}</button>
            <section id="admin-current" hidden aria-labelledby="admin-current-heading">
              <h3 id="admin-current-heading" tabindex="-1">${t('current')}</h3><div id="admin-current-values"></div>
            </section>
          </div>
          <details class="admin-subpanel"><summary>${t('compare')}</summary>
            <form id="admin-compare" class="admin-form">
              <label>${t('base')} <select id="admin-compare-base" required></select></label>
              <button class="button" type="submit">${t('compare')}</button>
            </form>
            <div id="admin-diff" aria-live="polite"></div>
          </details>
          ${publisher ? `<div id="admin-publish-panel" class="admin-subpanel admin-controls" hidden>
            <button class="button" type="button" id="admin-review">${t('review')}</button>
            <button class="button primary" type="button" id="admin-publish" hidden>${t('publish')}</button>
          </div>` : ''}
        </div>
      </section>
    </div>
    <section class="admin-panel" id="admin-audit" aria-labelledby="admin-audit-heading">
      <h2 id="admin-audit-heading">${t('audit')}</h2>
      <form id="admin-audit-filter" class="admin-form">
        <label>${t('itemId')} <input name="itemId" type="search" maxlength="36" spellcheck="false"></label>
        <label>${t('action')} <select name="action"><option value="">${t('allActions')}</option>
          <option value="catalog.publish">${t('didPublish')}</option><option value="catalog.rollback">${t('didRollback')}</option></select></label>
        <button class="button" type="submit">${t('apply')}</button>
      </form>
      <ol id="admin-audit-entries" class="admin-records" aria-live="polite"></ol>
      <button class="button" type="button" id="admin-audit-more" hidden>${t('more')}</button>
    </section>
  </div>`;
}

export async function adminPortal(request: Request, locale: Locale, deps: ProtectedDependencies) {
  const title = screenTitle(locale, 'catalog-admin');
  const shell = { locale, screen: 'catalog-admin', title, description: title } as const;
  const denied = (status: number, code: string) => renderShell(request, { ...shell, status,
    content: `<h1>${html(title)}</h1><p>${html(adminErrorMessage(locale, code))}</p>` });
  const identity = identifyRequest(request, deps.verifyIdentity);
  if (!identity) return denied(401, 'authentication_required');
  try {
    const roles = await deps.withClient(async client => {
      const actor = await findProjectActor(client, identity.claims);
      return actor ? catalogStaffRoles(client, actor) : [];
    });
    if (!roles.length) return denied(403, 'staff_required');
    return renderShell(request, { ...shell, content: catalogAdminContent(locale, roles), module: '/src/web/admin-client.js' });
  } catch { return denied(503, 'catalog_admin_unavailable'); }
}
