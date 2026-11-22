import type { InquiryProvider } from './public-support.js';

export function inquiryWebhook(config: { url: string; token: string; deduplicationMs: number },
  send: typeof fetch = fetch): InquiryProvider {
  const url = new URL(config.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
      !config.token || /[\r\n]/.test(config.token) ||
      !Number.isSafeInteger(config.deduplicationMs) || config.deduplicationMs < 60_000) {
    throw new RangeError('Configure an approved HTTPS inquiry provider and its deduplication window.');
  }
  return {
    deduplicationMs: config.deduplicationMs,
    async deliver(inquiry, signal) {
      const { providerIdempotencyKey, ...contact } = inquiry;
      const response = await send(url, {
        method: 'POST', redirect: 'error', signal, headers: {
          Authorization: 'Bearer ' + config.token,
          'Content-Type': 'application/json',
          'Idempotency-Key': providerIdempotencyKey,
        }, body: JSON.stringify(contact),
      });
      const reference = response.headers.get('x-delivery-receipt');
      await response.body?.cancel();
      return response.ok ? { delivered: true, reference } : { delivered: false, definitelyNotSent: false };
    },
  };
}
