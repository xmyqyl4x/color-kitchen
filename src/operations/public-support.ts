import type { ClientBase } from 'pg';
import type { ContactKeys } from './contact-crypto.js';
import { acceptInquiry, claimInquiry, completeInquiry, failInquiry, openInquiryClaim,
  recoverExpiredInquiryLeases } from './contacts.js';

type Inquiry = Parameters<typeof acceptInquiry>[1];
type Delivery = ReturnType<typeof openInquiryClaim>;
type DeliveryResult = Readonly<{ delivered: true; reference: string | null }> |
  Readonly<{ delivered: false; definitelyNotSent: boolean }>;

export type InquiryProvider = Readonly<{
  // Minimum time the provider guarantees one delivery for repeated idempotency keys.
  deduplicationMs: number;
  deliver(inquiry: Delivery, signal: AbortSignal): Promise<DeliveryResult>;
}>;

export function publicSupport(config: Readonly<{
  client: ClientBase;
  keys: ContactKeys;
  retentionMs: number;
  now?: () => Date;
  provider?: InquiryProvider;
  deliveryTimeoutMs?: number;
}>) {
  const { client, keys, now = () => new Date(), provider, retentionMs, deliveryTimeoutMs = 8000 } = config;
  if (!Number.isSafeInteger(retentionMs) || retentionMs < 86_400_000 ||
      !Number.isInteger(deliveryTimeoutMs) || deliveryTimeoutMs < 1 || deliveryTimeoutMs > 30_000 ||
      (provider && (!Number.isSafeInteger(provider.deduplicationMs) || provider.deduplicationMs < 0))) {
    throw new RangeError('Invalid inquiry service configuration.');
  }

  return {
    async submit(channel: 'contact' | 'advertising', inquiry: Inquiry) {
      if ((channel === 'advertising') !== (inquiry.purpose === 'advertising')) {
        throw new RangeError('The inquiry purpose does not match its destination.');
      }
      const clock = now();
      return acceptInquiry(client, inquiry, keys, clock, new Date(clock.getTime() + retentionMs));
    },
    async deliverNext() {
      if (!provider) return 'unavailable';
      const started = now();
      await recoverExpiredInquiryLeases(client, started);
      const claim = await claimInquiry(client, started);
      if (!claim) return 'empty';
      // Intake time is a conservative lower bound on the first possible provider attempt.
      const retrySafeUntil = new Date(claim.createdAt.getTime() + provider.deduplicationMs - deliveryTimeoutMs);
      if (claim.attempt > 1 && !(started < retrySafeUntil)) {
        return failInquiry(client, claim, { code: 'provider_window_elapsed' }, now());
      }
      let inquiry: Delivery;
      try {
        inquiry = openInquiryClaim(claim, keys);
      } catch {
        return failInquiry(client, claim, { code: 'content_unavailable' }, now());
      }
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let result: DeliveryResult | undefined;
      try {
        result = await Promise.race([
          new Promise<undefined>(resolve => {
            timer = setTimeout(() => { resolve(undefined); controller.abort(); }, deliveryTimeoutMs);
          }),
          provider.deliver(inquiry, controller.signal),
        ]);
      } catch {
        controller.abort();
      } finally {
        clearTimeout(timer);
      }
      if (result?.delivered) {
        const ref = result.reference && /^[\w.:-]{1,240}$/.test(result.reference) ? result.reference : null;
        return await completeInquiry(client, claim, ref, now()) ? 'sent' : 'stale_lease';
      }
      return failInquiry(client, claim, {
        code: result?.definitelyNotSent ? 'provider_failed' : 'provider_unconfirmed',
        retrySafeUntil,
      }, now());
    },
  };
}
