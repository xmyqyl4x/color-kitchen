import type { ClientBase } from 'pg';
import { compileMessageBundles } from '../i18n/bundles.js';
import { messages, type MessageBundles } from '../i18n/messages.js';

export async function publishLocalizedRevision(client: ClientBase, request: Readonly<{
  itemId: string;
  revision: number;
  itemVersion: string | number;
  editVersion: string | number;
}>, bundles: MessageBundles = messages) {
  compileMessageBundles(bundles);
  const { rows } = await client.query<{ version: string }>(
    'SELECT ck.publish_catalog_revision($1, $2, $3, $4) AS version',
    [request.itemId, request.revision, request.itemVersion, request.editVersion],
  );
  return rows[0]!.version;
}
