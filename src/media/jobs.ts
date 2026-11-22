import { MediaJobError, type MediaProgress, type MediaUpdate, type MediaResults, type MediaTask } from './protocol.js';

export function startMediaJob<T extends MediaTask>(task: T, signal?: AbortSignal) {
  let progress: MediaProgress = 'queued';
  const observers = new Set<(stage: MediaProgress) => void>();
  function publish(stage: MediaProgress) {
    progress = stage;
    for (const listener of observers) {
      try { listener(stage); } catch { /* A consumer progress failure cannot interrupt a worker. */ }
      if (progress !== stage) break;
    }
  }
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
      publish(error.code === 'cancelled' ? 'cancelled' : 'failed');
      observers.clear();
      reject(error);
    };
    if (signal?.aborted) {
      cancel();
      return;
    }
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      signal?.addEventListener('abort', cancel, { once: true });
      worker.onmessage = (event: MessageEvent<MediaUpdate>) => {
        if (settled) return;
        const reply = event.data;
        if ('progress' in reply) return publish(reply.progress);
        if (!reply.ok) return fail(new MediaJobError(reply.code, reply.message));
        settled = true;
        cleanup();
        publish('complete');
        observers.clear();
        resolve(reply.value as MediaResults[T['kind']]);
      };
      worker.onerror = () => fail(new MediaJobError('unavailable', 'The local image worker could not start.'));
      worker.onmessageerror = () => fail(new MediaJobError('render', 'The local image result was unavailable.'));
      worker.postMessage(task);
    } catch (cause) {
      fail(new MediaJobError('unavailable', 'The local image worker is unavailable.', { cause }));
    }
  });
  return { result, cancel, progress: () => progress,
    subscribe(listener: (stage: MediaProgress) => void) {
      if (progress === 'queued' || progress === 'loading' || progress === 'processing') observers.add(listener);
      return () => { observers.delete(listener); };
    },
  };
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
