export type ConsentChoice = Readonly<{ advertising: boolean; analytics: boolean }>;
export type ConsentAdapter = Readonly<{
  read(): Promise<unknown>;
  // Persist the choices and clear optional storage for withdrawn purposes before resolving.
  update(choice: ConsentChoice): Promise<void>;
}>;

const denied = Object.freeze({ advertising: false, analytics: false });

export function readConsent(value: unknown): ConsentChoice {
  if (typeof value !== 'object' || value === null || !('advertising' in value) || !('analytics' in value) ||
      typeof value.advertising !== 'boolean' || typeof value.analytics !== 'boolean') return denied;
  return Object.freeze({ advertising: value.advertising, analytics: value.analytics });
}

export function createConsentSession(adapter?: ConsentAdapter) {
  let current = denied as ConsentChoice;
  let revision = 0;
  let pending = Promise.resolve();

  function synchronize(write?: ConsentChoice) {
    const requested = ++revision;
    current = denied;
    pending = pending.then(async () => {
      try {
        if (!adapter) return;
        if (write) await adapter.update(write);
        const saved = readConsent(await adapter.read());
        if (requested === revision) current = saved;
      } catch {
        // Until the adapter confirms the new state, all optional processing stays disabled.
      }
    });
    return pending.then(() => current);
  }

  return {
    snapshot: () => current,
    refresh: () => synchronize(),
    update: (choice: ConsentChoice) => synchronize(readConsent(choice)),
    withdraw: () => synchronize(denied),
  };
}

const publicPlacements = new Set([
  'palette-studio', 'palettes', 'color-inspector', 'contrast', 'gradient-studio',
  'colors', 'gradients', 'gradient-steps', 'tailwind', 'fonts',
]);

export function advertisingEligibility(input: Readonly<{
  route: string;
  viewportWidth: number;
  consent: ConsentChoice;
  approvedProvider: boolean;
  documentHasAdScript: boolean;
}>) {
  if (!publicPlacements.has(input.route)) {
    return { placement: null, navigation: input.documentHasAdScript ? 'clean-document' : 'same-document' } as const;
  }
  if (input.approvedProvider !== true || input.consent.advertising !== true ||
      !Number.isFinite(input.viewportWidth) || input.viewportWidth < 320) {
    return { placement: null, navigation: input.documentHasAdScript ? 'clean-document' : 'same-document' } as const;
  }
  return { placement: input.viewportWidth < 768 ? 'after-content' : 'reserved-side', navigation: 'same-document' } as const;
}
