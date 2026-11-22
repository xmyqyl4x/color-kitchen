export class RequestBodyError extends Error {
  constructor(public readonly status: 400 | 413 | 415, public readonly code: string) { super(code); }
}

type Fields = Record<string, unknown>;

export function fields(value: unknown, keys: readonly string[]): Fields | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key))) return null;
  return value as Fields;
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return origin === null || origin === new URL(request.url).origin;
}

export async function readJsonBody(request: Request, limit: number): Promise<unknown> {
  const type = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  const encoding = request.headers.get('content-encoding');
  if (type !== 'application/json' || (encoding && encoding.toLowerCase() !== 'identity')) {
    throw new RequestBodyError(415, 'unsupported_media_type');
  }
  if (Number(request.headers.get('content-length')) > limit) throw new RequestBodyError(413, 'body_too_large');
  if (!request.body) throw new RequestBodyError(400, 'invalid_json');
  const reader = request.body.getReader();
  const bytes = new Uint8Array(limit);
  let filled = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (filled + chunk.value.byteLength > limit) throw new RequestBodyError(413, 'body_too_large');
      bytes.set(chunk.value, filled);
      filled += chunk.value.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, filled)));
  } catch (cause) {
    if (cause instanceof RequestBodyError) throw cause;
    throw new RequestBodyError(400, 'invalid_json');
  } finally {
    reader.releaseLock();
  }
}
