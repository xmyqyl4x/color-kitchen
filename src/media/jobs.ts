import { MediaJobError, type MediaReply, type MediaResults, type MediaTask } from './protocol.js';

export function startMediaJob<T extends MediaTask>(task: T, signal?: AbortSignal) {
  let fail: (error: MediaJobError) => void = () => {};
  const cancel = () => fail(new MediaJobError('cancelled', 'The local image operation was cancelled.'));
  const result = new Promise<MediaResults[T['kind']]>((resolve, reject) => {
    let worker: Worker | undefined;
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener('abort', cancel);
      worker?.terminate();
    };
    fail = error => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    if (signal?.aborted) {
      cancel();
      return;
    }
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      signal?.addEventListener('abort', cancel, { once: true });
      worker.onmessage = (event: MessageEvent<MediaReply>) => {
        if (settled) return;
        const reply = event.data;
        if (!reply.ok) return fail(new MediaJobError(reply.code, reply.message));
        settled = true;
        cleanup();
        resolve(reply.value as MediaResults[T['kind']]);
      };
      worker.onerror = () => fail(new MediaJobError('unavailable', 'The local image worker could not start.'));
      worker.onmessageerror = () => fail(new MediaJobError('render', 'The local image result was unavailable.'));
      worker.postMessage(task);
    } catch (cause) {
      fail(new MediaJobError('unavailable', 'The local image worker is unavailable.', { cause }));
    }
  });
  return { result, cancel };
}

export function latestMediaJob() {
  let active: (() => void) | undefined;
  return {
    start<T extends MediaTask>(task: T, signal?: AbortSignal) {
      active?.();
      const job = startMediaJob(task, signal);
      active = job.cancel;
      const clear = () => { if (active === job.cancel) active = undefined; };
      void job.result.then(clear, clear);
      return job;
    },
    cancel() { active?.(); },
  };
}
