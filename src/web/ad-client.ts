import { firstPartyConsentAdapter } from '../browser/optional-requests.js';
import { advertisingEligibility, readConsent } from '../operations/consent.js';

const slot = document.querySelector<HTMLElement>('[data-ad-frame]');
if (slot) {
  const adapter = firstPartyConsentAdapter(async () => {});
  const preference = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ck-consent-choice') : undefined;
  let active: HTMLIFrameElement | undefined;
  let revision = 0;
  function suspend() {
    revision++;
    active?.remove();
    active = undefined;
  }
  async function refresh() {
    const pending = ++revision;
    try {
      const consent = readConsent(await adapter.read());
      if (pending !== revision || document.hidden) return;
      const decision = advertisingEligibility({ route: slot!.dataset.adRoute ?? '', viewportWidth: innerWidth,
        consent, approvedProvider: true, documentHasAdScript: !!active });
      if (!decision.placement) { suspend(); return; }
      if (active) return;
      const frame = document.createElement('iframe');
      frame.title = slot!.getAttribute('aria-label') ?? '';
      frame.sandbox.add('allow-scripts');
      frame.referrerPolicy = 'no-referrer';
      frame.src = slot!.dataset.adFrame!;
      slot!.append(frame);
      active = frame;
    } catch { if (pending === revision) suspend(); }
  }
  preference?.addEventListener('message', event => {
    if (event.data === 'suspend') suspend();
    else if (event.data === 'verify') void refresh();
  });
  window.addEventListener('pagehide', suspend);
  window.addEventListener('pageshow', event => { if (event.persisted) void refresh(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else void refresh(); });
  matchMedia('(min-width: 320px)').addEventListener('change', () => void refresh());
  void refresh();
}
