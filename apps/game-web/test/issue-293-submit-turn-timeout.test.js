import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createApiClient } from '../src/api/client.js';
import { storedPendingTurn } from '../src/app/pending-turn.js';
import { submitRecoverableTurn } from '../src/app/turn-submission.js';

function controlledClock(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  return {
    runAll: () => t.mock.timers.runAll()
  };
}

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

test('a stalled submitTurn is bounded and transport failure retains the exact retry identity', async (t) => {
  const clock = controlledClock(t);
  const saved = storage();
  const sent = [];
  let calls = 0;
  let finishFirstFetch;
  const api = createApiClient({ fetchImpl: async (_url, options) => {
    sent.push(JSON.parse(options.body));
    calls += 1;
    if (calls === 1) return new Promise((resolve) => { finishFirstFetch = resolve; });
    throw new TypeError('connection lost');
  } });

  const first = submitRecoverableTurn(api, saved, 'party', { raw_text: 'Жду.' });
  let settled = false;
  first.then(() => { settled = true; }, () => { settled = true; });
  try {
    await Promise.resolve();
    clock.runAll();
    await setImmediate();
    assert.equal(settled, true, 'submitTurn finishes after its client-side deadline');
    await assert.rejects(first);
  } finally {
    finishFirstFetch?.({ ok: false, status: 503, async json() { return {}; } });
    await first.catch(() => {});
  }

  const pending = storedPendingTurn(saved, 'party');
  assert.deepEqual(pending?.request, sent[0], 'transport timeout retains pending request identity');
  await assert.rejects(submitRecoverableTurn(api, saved, 'party', { raw_text: 'Другой ввод.' }));
  assert.deepEqual(sent[1], sent[0], 'retry resends the same request and idempotency identity');
  assert.deepEqual(storedPendingTurn(saved, 'party')?.request, sent[0]);
});

test('a successful submitTurn is not interrupted by a later timeout callback', async (t) => {
  const clock = controlledClock(t);
  let releaseFetch;
  const api = createApiClient({ fetchImpl: () => new Promise((resolve) => {
    releaseFetch = () => {
      resolve({ ok: true, async json() {
        return { version: 1, schema: 'rus_api_success', ok: true, data: {} };
      } });
      clock.runAll();
    };
  }) });

  const submitted = api.submitTurn('party', { request_id: 'turn-1' });
  await Promise.resolve();
  releaseFetch();
  const result = await submitted;
  assert.deepEqual(result, {});
});
