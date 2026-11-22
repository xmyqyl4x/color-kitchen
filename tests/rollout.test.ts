import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rollOut } from '../src/release/rollout.js';

test('a healthy release verifies the previous build, limits candidate exposure, then verifies full exposure', async () => {
  const events: string[] = [];
  const result = await rollOut({
    async setExposure(percent) { events.push('exposure ' + percent); },
    async verify(lane) { events.push('verify ' + lane); return lane + '-evidence'; },
  });
  assert.deepEqual(events, ['exposure 0', 'verify previous', 'exposure 10', 'verify candidate', 'verify previous',
    'exposure 100', 'verify candidate']);
  assert.equal(result, 'candidate-evidence');
});

test('failed navigation, repeated API errors and private egress each restore the verified build', async () => {
  for (const failure of ['localized navigation failed', 'repeated API failures', 'private network egress']) {
    const events: string[] = [];
    const cause = new Error(failure);
    await assert.rejects(rollOut({
      async setExposure(percent) { events.push('exposure ' + percent); },
      async verify(lane) {
        events.push('verify ' + lane);
        if (lane === 'candidate') throw cause;
      },
    }), error => {
      assert(error instanceof Error);
      assert.equal(error.message, 'Candidate failed and previous build was verified.');
      assert.equal(error.cause, cause);
      return true;
    });
    assert.deepEqual(events, ['exposure 0', 'verify previous', 'exposure 10', 'verify candidate', 'exposure 0', 'verify previous']);
  }
});

test('failures after full exposure restore the previous build and preserve both errors when recovery fails', async () => {
  for (const recoveryFails of [false, true]) {
    let percent = 0;
    let full = false;
    const candidate = new Error('full-exposure validation failed');
    const recovery = new Error('rollback verification failed');
    await assert.rejects(rollOut({
      async setExposure(value) { percent = value; full ||= value === 100; },
      async verify(lane) {
        if (lane === 'candidate' && percent === 100) throw candidate;
        if (lane === 'previous' && full && recoveryFails) throw recovery;
      },
    }), error => {
      assert.equal(percent, 0);
      if (recoveryFails) assert.deepEqual((error as AggregateError).errors, [candidate, recovery]);
      else assert.equal((error as Error).cause, candidate);
      return true;
    });
  }
});
