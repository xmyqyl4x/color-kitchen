import { randomUUID } from 'node:crypto';
import { assertColor } from '../color/parse.js';
import { askColorGuide, type GuideInput } from '../guide/service.js';
import type { ColorValue } from '../model/color.js';
import { isLocale } from '../model/locales.js';
import { fields, readJsonBody, RequestBodyError, sameOrigin } from './request.js';
import { json } from './response.js';

export const guidePath = '/api/v1/guide';

function guideInput(value: unknown): GuideInput | null {
  const item = fields(value, ['submitted', 'locale', 'prompt', 'history', 'shareSwatches', 'selectedColors']);
  if (!item || typeof item.submitted !== 'boolean' || !isLocale(item.locale) || typeof item.prompt !== 'string' ||
      (item.shareSwatches !== undefined && typeof item.shareSwatches !== 'boolean')) return null;
  const history: NonNullable<GuideInput['history']>[number][] = [];
  if (item.history !== undefined) {
    if (!Array.isArray(item.history) || item.history.length > 8) return null;
    for (const input of item.history) {
      const turn = fields(input, ['role', 'text']);
      if (!turn || (turn.role !== 'user' && turn.role !== 'assistant') || typeof turn.text !== 'string') return null;
      history.push({ role: turn.role, text: turn.text });
    }
  }
  const selectedColors: ColorValue[] = [];
  if (item.selectedColors !== undefined) {
    if (item.shareSwatches !== true || !Array.isArray(item.selectedColors) || item.selectedColors.length > 12) return null;
    for (const input of item.selectedColors) {
      const color = fields(input, ['space', 'components', 'alpha']);
      try { assertColor(color); } catch { return null; }
      selectedColors.push(color);
    }
  }
  return { submitted: item.submitted, locale: item.locale, prompt: item.prompt,
    shareSwatches: item.shareSwatches === true, history, selectedColors };
}

const statusCodes = {
  'not-submitted': 400, 'invalid-input': 400, limited: 429, unavailable: 503,
  timeout: 504, cancelled: 408, 'invalid-response': 502,
} as const;

export function guideHttp(deps: Omit<Parameters<typeof askColorGuide>[1], 'signal'>) {
  return async (request: Request) => {
    const requestId = randomUUID();
    const headers = new Headers({ 'X-Request-Id': requestId });
    const error = (status: number, code: string, retryAt?: string) => json({
      version: 1, requestId, error: { code, localAvailable: true, ...(retryAt ? { retryAt } : {}) },
    }, { status, headers });
    if (request.method !== 'POST') {
      headers.set('Allow', 'POST');
      return error(405, 'method_not_allowed');
    }
    if (!sameOrigin(request)) return error(403, 'origin_denied');
    let input: GuideInput | null;
    try { input = guideInput(await readJsonBody(request, 16_384)); }
    catch (cause) {
      if (!(cause instanceof RequestBodyError)) throw cause;
      if (cause.status === 413) headers.set('Connection', 'close');
      return error(cause.status, cause.code);
    }
    if (!input) return error(400, 'invalid-input');
    headers.set('Content-Language', input.locale);
    const result = await askColorGuide(input, { ...deps, signal: request.signal });
    if (result.status === 'ready') return json({ version: 1, requestId, locale: input.locale, data: result }, { headers });
    if (result.retryAt) headers.set('Retry-After', String(Math.max(1,
      Math.ceil((Date.parse(result.retryAt) - deps.now().getTime()) / 1000))));
    return error(statusCodes[result.code], result.code, result.retryAt);
  };
}
