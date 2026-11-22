import { readConsent, type ConsentAdapter, type ConsentChoice } from '../operations/consent.js';

function post(path: string, data: unknown) {
  return fetch(path, { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}

export function firstPartyConsentAdapter(clearOptionalStorage: (choice: ConsentChoice) => Promise<void>): ConsentAdapter {
  return {
    async read() {
      const response = await fetch('/api/v1/consent', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('Consent is unavailable.');
      return (await response.json()).data;
    },
    async update(choice) {
      try {
        const response = await post('/api/v1/consent', readConsent(choice));
        if (!response.ok) throw new Error('Consent could not be updated.');
      } finally {
        await clearOptionalStorage(choice);
      }
    },
  };
}

export async function explicitCatalogOpen(itemId: string, consent: () => ConsentChoice) {
  if (!consent().analytics) return null;
  try {
    const response = await post('/api/v1/events/catalog-open/nonce', { itemId });
    if (!response.ok) return null;
    const { data } = await response.json();
    if (typeof data?.token !== 'string' || data.token.length > 512) return null;
    return {
      async record() {
        if (!consent().analytics) return false;
        try { return (await post('/api/v1/events/catalog-open', { token: data.token })).status === 202; }
        catch { return false; }
      },
    };
  } catch { return null; }
}
