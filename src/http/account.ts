import { createSavedPalette, deleteSavedPalette, getOrCreateUser, listSavedPalettes } from '../db/users.js';
import { requireAuth, type AuthResult } from '../middleware/auth.js';
import { apiError, json } from './response.js';

const hexColorPattern = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export type AccountHttpDependencies = Readonly<{
  authenticate?: (request: Request) => Promise<AuthResult>;
}>;

function parsePalettePayload(body: unknown): { title: string; colors: string[]; notes: string | null } | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  if (!title || title.length > 120) return null;

  if (!Array.isArray(record.colors) || record.colors.length < 1 || record.colors.length > 12) return null;
  const colors: string[] = [];
  for (const item of record.colors) {
    if (typeof item !== 'string') return null;
    const normalized = item.trim();
    if (!hexColorPattern.test(normalized)) return null;
    colors.push(normalized.toUpperCase());
  }

  let notes: string | null = null;
  if (record.notes !== undefined && record.notes !== null) {
    if (typeof record.notes !== 'string') return null;
    const trimmed = record.notes.trim();
    if (trimmed.length > 500) return null;
    notes = trimmed || null;
  }

  return { title, colors, notes };
}

export function accountHttp(dependencies: AccountHttpDependencies = {}) {
  const authenticate = dependencies.authenticate ?? requireAuth;

  return async (request: Request): Promise<Response | null> => {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/v1/account')) return null;

    const authResult = await authenticate(request);
    if (!authResult.ok) return authResult.response;

    const { uid, email, name } = authResult.user;
    const userEmail = typeof email === 'string' && email.trim() ? email.trim() : `${uid}@firebase.local`;
    const displayName = typeof name === 'string' && name.trim() ? name.trim() : null;

    if (pathname === '/api/v1/account/me') {
      if (request.method !== 'GET') return apiError(405, 'method_not_allowed');
      try {
        const user = await getOrCreateUser(uid, userEmail, displayName);
        return json({ data: { user } });
      } catch (error) {
        console.error('Failed to sync account profile:', error);
        return apiError(500, 'account_unavailable');
      }
    }

    if (pathname === '/api/v1/account/palettes') {
      if (request.method === 'GET') {
        try {
          await getOrCreateUser(uid, userEmail, displayName);
          const palettes = await listSavedPalettes(uid);
          return json({ data: { palettes } });
        } catch (error) {
          console.error('Failed to list saved palettes:', error);
          return apiError(500, 'palettes_unavailable');
        }
      }

      if (request.method === 'POST') {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return apiError(400, 'invalid_json');
        }

        const parsed = parsePalettePayload(payload);
        if (!parsed) return apiError(400, 'invalid_palette');

        try {
          const palette = await createSavedPalette(uid, userEmail, {
            ...parsed,
            displayName,
          });
          return json({ data: { palette } }, { status: 201 });
        } catch (error) {
          console.error('Failed to save palette:', error);
          return apiError(500, 'palette_save_failed');
        }
      }

      return apiError(405, 'method_not_allowed');
    }

    const paletteMatch = /^\/api\/v1\/account\/palettes\/(\d+)$/.exec(pathname);
    if (paletteMatch) {
      if (request.method !== 'DELETE') return apiError(405, 'method_not_allowed');
      const paletteId = Number(paletteMatch[1]);
      if (!Number.isSafeInteger(paletteId) || paletteId <= 0) {
        return apiError(400, 'invalid_palette_id');
      }

      try {
        const deleted = await deleteSavedPalette(uid, paletteId);
        if (!deleted) return apiError(404, 'palette_not_found');
        return json({ data: { deleted: true, id: paletteId } });
      } catch (error) {
        console.error('Failed to delete saved palette:', error);
        return apiError(500, 'palette_delete_failed');
      }
    }

    return apiError(404, 'not_found');
  };
}
