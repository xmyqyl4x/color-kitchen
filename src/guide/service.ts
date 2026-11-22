import { assertColor } from '../color/parse.js';
import type { ColorValue } from '../model/color.js';
import { isLocale, type Locale } from '../model/locales.js';
import { InvalidGuideReply, parseGuideReply, type GuideSuggestion } from './response.js';

export const guideOutputTokens = 600;

type Turn = Readonly<{ role: 'user' | 'assistant'; text: string }>;
export type GuideInput = Readonly<{
  submitted: boolean; locale: Locale; prompt: string;
  history?: readonly Turn[]; shareSwatches?: boolean; selectedColors?: readonly ColorValue[];
}>;
export type GuideProviderInput = Readonly<{ locale: Locale; prompt: string; history: readonly Turn[]; colors: readonly ColorValue[] }>;
export type GuideProvider = Readonly<{ generate(input: GuideProviderInput, signal: AbortSignal): Promise<unknown> }>;
export type GuideAdmission = Readonly<{
  reserve(units: number, now: Date): Promise<{ accepted: boolean; retryAt?: Date }>;
}>;
type Failure = 'not-submitted' | 'invalid-input' | 'limited' | 'unavailable' | 'timeout' | 'cancelled' | 'invalid-response';
type Response = { mode: 'hosted'; status: 'ready'; suggestion: GuideSuggestion }
  | { mode: 'hosted'; status: 'error'; code: Failure; localAvailable: true; retryAt?: string };

const encoder = new TextEncoder();
function shortText(input: unknown, max: number): string {
  if (typeof input !== 'string' || !input.trim() || input.length > max || /[\u0000-\u0008\u000b-\u001f]/.test(input)) {
    throw new RangeError('Invalid guide message.');
  }
  return input.trim();
}

function prepare(input: GuideInput): GuideProviderInput {
  if (!isLocale(input.locale)) throw new RangeError('Unsupported Guide locale.');
  const prompt = shortText(input.prompt, 2000);
  const history = input.history ?? [];
  const selected = input.shareSwatches === true ? input.selectedColors ?? [] : [];
  if (!Array.isArray(history) || history.length > 8 || !Array.isArray(selected) || selected.length > 12) {
    throw new RangeError('Guide context exceeds the allowed bounds.');
  }
  const turns = history.map(({ role, text }) => {
    if (role !== 'user' && role !== 'assistant') throw new RangeError('Unsupported conversation role.');
    return { role, text: shortText(text, 1000) };
  });
  const colors = selected.map(inputColor => {
    assertColor(inputColor);
    return { space: inputColor.space, components: [...inputColor.components] as ColorValue['components'], alpha: inputColor.alpha };
  });
  return { locale: input.locale, prompt, history: turns, colors };
}

class GuideInterrupted extends Error {
  constructor(public readonly code: 'timeout' | 'cancelled') { super(code); }
}

async function runProvider(provider: GuideProvider, input: GuideProviderInput, timeoutMs: number, signal?: AbortSignal) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  try {
    const interrupt = new Promise<never>((_, reject) => {
      const stop = (code: 'timeout' | 'cancelled') => {
        const reason = new GuideInterrupted(code);
        reject(reason);
        controller.abort(reason);
      };
      abort = () => stop('cancelled');
      timer = setTimeout(() => stop('timeout'), timeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
    const work = Promise.resolve().then(() => {
      if (controller.signal.aborted) throw controller.signal.reason;
      return provider.generate(input, controller.signal);
    });
    return await Promise.race([interrupt, work]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function askColorGuide(input: GuideInput, dependencies: Readonly<{
  provider?: GuideProvider; admission: GuideAdmission; now: () => Date;
  timeoutMs?: number; signal?: AbortSignal;
  measure?: (event: Readonly<{ outcome: 'ready' | Failure; durationMs: number }>) => void;
}>): Promise<Response> {
  const start = performance.now();
  const report = (response: Response) => {
    try {
      dependencies.measure?.({ outcome: response.status === 'ready' ? 'ready' : response.code,
        durationMs: Math.round(performance.now() - start) });
    } catch { /* Metrics must not prevent a user response. */ }
    return response;
  };
  const error = (code: Failure, retryAt?: Date) =>
    report({ mode: 'hosted', status: 'error', code, localAvailable: true, ...(retryAt ? { retryAt: retryAt.toISOString() } : {}) });
  if (input.submitted !== true) return error('not-submitted');
  if (dependencies.signal?.aborted) return error('cancelled');
  let approved: GuideProviderInput;
  let units: number;
  try {
    approved = prepare(input);
    const bytes = encoder.encode(JSON.stringify(approved)).byteLength;
    if (bytes > 16_000) throw new RangeError('Guide request is too large.');
    units = bytes + guideOutputTokens + 512;
  } catch { return error('invalid-input'); }
  const timeout = dependencies.timeoutMs ?? 12_000;
  if (!dependencies.provider || !Number.isFinite(timeout) || timeout < 1 || timeout > 60_000) return error('unavailable');
  try {
    const budget = await dependencies.admission.reserve(units, dependencies.now());
    if (!budget.accepted) return error('limited', budget.retryAt);
    const raw = await runProvider(dependencies.provider, approved, timeout, dependencies.signal);
    return report({ mode: 'hosted', status: 'ready', suggestion: parseGuideReply(raw) });
  } catch (cause) {
    if (cause instanceof GuideInterrupted) return error(cause.code);
    if (cause instanceof InvalidGuideReply) return error('invalid-response');
    return error('unavailable');
  }
}
