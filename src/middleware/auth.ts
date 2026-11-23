import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.js';
import { apiError } from '../http/response.js';

export type AuthResult =
  | Readonly<{ ok: true; user: DecodedIdToken }>
  | Readonly<{ ok: false; response: Response }>;

export async function requireAuth(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, response: apiError(401, 'unauthorized') };
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return { ok: false, response: apiError(401, 'unauthorized') };
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    return { ok: true, user: decodedToken };
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return { ok: false, response: apiError(401, 'invalid_token') };
  }
}
