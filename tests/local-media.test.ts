import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { withBrowserPage } from './browser.js';

test('browser media contract cancels an active worker, restores a backup and keeps private payloads local', async () => {
  const requests: { method: string; url: string; body: string | null }[] = [];
  const result = await withBrowserPage(async page => {
    page.on('request', request => requests.push({ method: request.method(), url: request.url(), body: request.postData() }));
    return page.evaluate(async () => {
      const apiUrl = '/src/browser/media.js';
      const dbUrl = '/src/browser/database.js';
      const repoUrl = '/src/browser/repository.js';
      const { createBrowserMedia } = await import(apiUrl) as typeof import('../src/browser/media.js');
      const { openWorkspaceDatabase } = await import(dbUrl) as typeof import('../src/browser/database.js');
      const { workspaceRepository } = await import(repoUrl) as typeof import('../src/browser/repository.js');
      const source = await openWorkspaceDatabase('media-source');
      const destination = await openWorkspaceDatabase('media-destination');
      try {
        const media = createBrowserMedia(workspaceRepository(source));
        const incoming = createBrowserMedia(workspaceRepository(destination));
        const first = await media.capabilities();
        const canvas = new OffscreenCanvas(256, 80);
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#f00';
        context.fillRect(0, 0, 256, 80);
        const blob = await canvas.convertToBlob();
        const file = new File([blob], 'private-photo.png', { type: blob.type });
        const job = media.jobs.start({ kind: 'image-preview', source: file, maxSide: 64 });
        const progress = [job.progress()];
        job.subscribe(stage => {
          progress.push(stage);
          if (stage === 'processing') job.cancel();
        });
        const stopped = await job.result.then(() => 'success', (error: { code: string }) => error.code);
        const region = { x: 40, y: 15, width: 90, height: 30 };
        const next = await media.jobs.start({ kind: 'image-preview', source: file, region, maxSide: 45 }).result;
        const point = media.image.previewPoint({ x: 44, y: 14 }, next.preview);
        const header = await media.image.inspect(file);
        const red = { space: 'srgb', components: [1, 0, 0], alpha: 1 } as const;
        const white = { space: 'srgb', components: [1, 1, 1], alpha: 1 } as const;
        const palette = { swatches: [{ id: 'red', color: red, locked: true }, { id: 'white', color: white, locked: false }],
          roles: { primary: 'red' } };
        const board = { schemaVersion: 1, id: 'board', kind: 'board', revision: 1, updatedAt: 0,
          name: 'Private board', palette, layout: 'square', assetIds: ['source'] } as const;
        await media.collection!.saveDocument(board, { expectedRevision: null, updatedAt: 2, newAssets: [{ id: 'source', blob }] });
        await media.collection!.saveCollection({ id: 'test', name: 'Private collection', documentIds: ['board'] }, null);
        const backup = await media.backup.fromStorage({ includeAssets: true, collectionId: 'test' });
        const preview = await incoming.backup.preview(new Blob([backup.text], { type: 'application/json' }));
        const absent = await incoming.collection!.getDocument('board');
        const restored = await preview.restore();
        const savedBoard = await incoming.collection!.getDocument('board');
        const rejected = await media.files.copyText('Private notes', { async writeText() { throw Error('Clipboard blocked'); } });
        const pdf = await media.export.palettePdf(palette);
        const after = await media.capabilities();
        const text = media.type.preview({ family: 'Unloaded font', weights: [400], scripts: ['Latn'] },
          'Été ☀️', 'fr', { weight: 400 });
        return { progress, stopped, final: job.progress(), point, header, absent, restored, savedBoard: savedBoard?.name,
          backupAssets: preview.data.assets.length, rejected, first, after, text,
          pdf: Array.from(new Uint8Array(await pdf.blob.arrayBuffer())) };
      } finally { source.close(); destination.close(); }
    });
  });
  assert.deepEqual(result.progress, ['queued', 'loading', 'processing', 'cancelled']);
  assert.equal(result.stopped, 'cancelled');
  assert.equal(result.final, 'cancelled');
  assert.deepEqual(result.point, { x: 129, y: 44 });
  assert.deepEqual(result.header, { width: 256, height: 80, mime: 'image/png' });
  assert.equal(result.absent, null);
  assert.deepEqual(result.restored, { documentCount: 1, collectionCount: 1 });
  assert.equal(result.savedBoard, 'Private board');
  assert.equal(result.backupAssets, 1);
  assert.deepEqual(result.rejected, { copied: false, text: 'Private notes' });
  assert.equal(result.first.pdf, 'unloaded');
  assert.equal(result.after.pdf, 'loaded');
  assert.equal(result.after.worker, true);
  assert.equal(result.text.asset, 'unloaded');
  assert.equal(result.text.glyphs.supported, false);
  assert.equal((await PDFDocument.load(Uint8Array.from(result.pdf))).getPageCount(), 1);
  assert(requests.every(request => request.method === 'GET' && request.body === null));
  assert(requests.every(request => /^\/(?:src|vendor)\//.test(new URL(request.url).pathname)));
  assert.doesNotMatch(JSON.stringify(requests), /Private|private-photo/);
});
