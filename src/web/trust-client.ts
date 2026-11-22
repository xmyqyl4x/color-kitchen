import { firstPartyConsentAdapter } from '../browser/optional-requests.js';
import { messages } from '../i18n/messages.js';
import { readConsent, type ConsentChoice } from '../operations/consent.js';
import { trustText } from './trust-text.js';
import { clientLocale, get } from './ui.js';

const locale = clientLocale();
const t = (key: Parameters<typeof trustText>[1]) => trustText(locale, key);
const status = get('trust-status');
const form = document.querySelector<HTMLFormElement>('#inquiry-form');
const field = (id: string) => get<HTMLInputElement>(id);
const button = (id: string) => get<HTMLButtonElement>(id);
const choicesKey = 'ck-consent-choice';

if (form) {
  const send = button('inquiry-submit');
  const replyEmail = field('inquiry-email');
  const message = get<HTMLTextAreaElement>('inquiry-message');
  let prior: { key: string; id: string } | undefined;
  send.disabled = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (send.disabled) return;
    const channel = form.dataset.channel;
    const purpose = channel === 'advertising' ? 'advertising' : get<HTMLSelectElement>('inquiry-purpose').value;
    const payload = { purpose, locale, replyEmail: replyEmail.value.trim(), message: message.value.trim() };
    if (!payload.replyEmail || !payload.message) { status.textContent = t('invalid'); return; }
    const key = JSON.stringify(payload);
    if (key !== prior?.key) prior = { key, id: crypto.randomUUID() };
    const requestId = prior.id;
    send.disabled = true;
    status.textContent = '';
    try {
      const response = await fetch('/api/v1/inquiries/' + channel, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({ ...payload, requestId }),
      });
      const body = await response.json();
      if (response.status !== 202 || body.data?.requestId !== requestId) {
        status.textContent = t(response.status === 400 ? 'invalid' : 'failed');
        if (response.status === 410) prior = undefined;
        return;
      }
      status.textContent = t('queued') + ' ' + messages[locale]['inquiry.reference'].replace('{reference}', requestId);
      if (replyEmail.value.trim() === payload.replyEmail) replyEmail.value = '';
      if (message.value.trim() === payload.message) message.value = '';
      prior = undefined;
    } catch { status.textContent = t('failed'); }
    finally { send.disabled = false; }
  });
} else {
  const advertising = field('trust-advertising');
  const analytics = field('trust-analytics');
  const controls = [advertising, analytics, button('trust-accept'), button('trust-deny'), button('trust-save')];
  const signal = typeof BroadcastChannel === 'function' ? new BroadcastChannel(choicesKey) : undefined;
  const notify = (value: string) => signal?.postMessage(value);
  const adapter = firstPartyConsentAdapter(async () => { notify('verify'); });
  const busy = (value: boolean) => { for (const control of controls) control.disabled = value; };
  function show(choice: ConsentChoice) { advertising.checked = choice.advertising; analytics.checked = choice.analytics; }
  async function save(choice: ConsentChoice) {
    busy(true);
    notify('suspend');
    try {
      await adapter.update(choice);
      const saved = readConsent(await adapter.read());
      if (saved.advertising !== choice.advertising || saved.analytics !== choice.analytics) throw new Error('Unverified choice.');
      show(saved);
      status.textContent = t('choicesSaved');
    } catch { show(readConsent(null)); notify('suspend'); status.textContent = t('denied'); }
    finally { busy(false); }
  }
  button('trust-accept').addEventListener('click', () => void save({ advertising: true, analytics: true }));
  button('trust-deny').addEventListener('click', () => void save({ advertising: false, analytics: false }));
  button('trust-save').addEventListener('click', () => void save({ advertising: advertising.checked, analytics: analytics.checked }));
  busy(true);
  try { show(readConsent(await adapter.read())); }
  catch { status.textContent = t('denied'); }
  finally { busy(false); }
}
