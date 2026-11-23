import assert from 'node:assert/strict';
import test from 'node:test';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { hasCloudSqlAdminEnv, hasCloudSqlEnv } from '../src/db/index.js';
import { accountHttp } from '../src/http/account.js';
import { apiError } from '../src/http/response.js';

const fakeUser = {
  uid: 'firebase-test-uid-1',
  email: 'designer@example.test',
  name: 'Studio Designer',
} as unknown as DecodedIdToken;

test('hasCloudSqlEnv and hasCloudSqlAdminEnv detect Cloud SQL object-method variables', () => {
  assert.equal(hasCloudSqlEnv({}), false);
  assert.equal(
    hasCloudSqlEnv({
      SQL_HOST: '/cloudsql/proj:us-east1:inst',
      SQL_USER: 'app_user',
      SQL_PASSWORD: 'secret',
      SQL_DB_NAME: 'app_db',
    }),
    true,
  );
  assert.equal(
    hasCloudSqlAdminEnv({
      SQL_HOST: '/cloudsql/proj:us-east1:inst',
      SQL_ADMIN_USER: 'admin_user',
      SQL_ADMIN_PASSWORD: 'secret',
      SQL_DB_NAME: 'app_db',
    }),
    true,
  );
  assert.equal(hasCloudSqlAdminEnv({ SQL_HOST: '/cloudsql/proj:us-east1:inst' }), false);
});

test('accountHttp rejects unauthenticated requests with 401', async () => {
  const handler = accountHttp({
    authenticate: async () => ({ ok: false, response: apiError(401, 'unauthorized') }),
  });

  const response = await handler(new Request('http://127.0.0.1:3000/api/v1/account/me'));
  assert.ok(response);
  assert.equal(response.status, 401);
});

test('accountHttp validates palette payloads and HTTP methods before hitting the database', async () => {
  const handler = accountHttp({
    authenticate: async () => ({ ok: true, user: fakeUser }),
  });

  const wrongMethod = await handler(new Request('http://127.0.0.1:3000/api/v1/account/me', { method: 'POST' }));
  assert.ok(wrongMethod);
  assert.equal(wrongMethod.status, 405);

  const invalidPayload = await handler(
    new Request('http://127.0.0.1:3000/api/v1/account/palettes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Bad Colors', colors: ['not-a-hex'] }),
    }),
  );
  assert.ok(invalidPayload);
  assert.equal(invalidPayload.status, 400);

  const nonAccountRoute = await handler(new Request('http://127.0.0.1:3000/api/v1/catalog/palettes'));
  assert.equal(nonAccountRoute, null);
});
