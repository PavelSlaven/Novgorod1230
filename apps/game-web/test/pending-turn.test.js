import assert from 'node:assert/strict';
import test from 'node:test';
import { recoverPendingPresentation, submitRecoverableTurn } from
  '../src/app/turn-submission.js';
import { storedPendingTurn } from '../src/app/pending-turn.js';
import { renderActions } from '../src/features/actions/render.js';
import { createApiClient } from '../src/api/client.js';

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key) };
}

test('lost post-commit response reuses persisted exact request after reload and new intent gets a new identity', async () => {
  const saved = storage();
  const calls = []; const committed = new Map(); let effects = 0;
  const api = { async submitTurn(partyId, request) {
    assert.deepEqual(storedPendingTurn(saved, partyId)?.request, request);
    calls.push(JSON.stringify(request));
    if (committed.has(request.idempotency_key)) return committed.get(request.idempotency_key);
    effects += 1;
    const result = { screen: { screen_status: 'ready' } };
    committed.set(request.idempotency_key, result);
    if (calls.length === 1) throw new TypeError('connection lost');
    return result;
  } };
  await assert.rejects(submitRecoverableTurn(api, saved, 'party', { raw_text: 'Жду.' }),
    /connection lost/u);
  const reloadedStorage = { ...saved };
  await submitRecoverableTurn(api, reloadedStorage, 'party', { raw_text: 'Иду дальше.' });
  assert.equal(calls[0], calls[1]);
  assert.equal(effects, 1);
  assert.equal(storedPendingTurn(saved, 'party'), null);
  await submitRecoverableTurn(api, saved, 'party', { raw_text: 'Жду.' });
  assert.notEqual(calls[1], calls[2]);
  assert.equal(effects, 2);
});

test('only proven request rejection clears pending identity; ambiguous failures retain it', async () => {
  for (const [error, retained] of [
    [{ code: 'TURN_INPUT_REQUIRED', httpStatus: 400 }, false],
    [{ code: 'REQUEST_BODY_INVALID', httpStatus: 400 }, false],
    [{ code: 'UNKNOWN', httpStatus: 400 }, true],
    [{ code: 'TEMPORARY_ACTION_UNAVAILABLE', httpStatus: 503 }, true],
    [{ code: 'TEMPORARY_ACTION_UNAVAILABLE', httpStatus: 503,
      turn_commit_status: 'not_started' }, false],
    [{ code: 'TRACE_PHASE_2_IDEMPOTENCY_CONFLICT', httpStatus: 409 }, true]
  ]) {
    const saved = storage();
    await assert.rejects(submitRecoverableTurn({ async submitTurn() {
      throw Object.assign(new Error('failed'), error);
    } }, saved, 'party', { raw_text: 'Жду.' }));
    assert.equal(storedPendingTurn(saved, 'party') !== null, retained);
  }
});

test('HTTP no-commit result permits a changed intent after a planner rejection', async () => {
  const saved = storage(); const requests = [];
  const api = createApiClient({ fetchImpl: async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: false, status: 503, async json() { return {
      version: 1, schema: 'rus_api_error', ok: false,
      error: { code: 'TEMPORARY_ACTION_UNAVAILABLE', message: 'Недоступно',
        turn_commit_status: 'not_started' } }; } };
  } });
  await assert.rejects(submitRecoverableTurn(api, saved, 'party', { raw_text: 'Ищу.' }));
  assert.equal(storedPendingTurn(saved, 'party'), null);
  await assert.rejects(submitRecoverableTurn(api, saved, 'party', { raw_text: 'Зову.' }));
  assert.equal(requests[1].raw_text, 'Зову.');
  assert.notEqual(requests[0].idempotency_key, requests[1].idempotency_key);
});

test('post-commit narration failure retains the exact recovery identity', async () => {
  const saved = storage();
  await assert.rejects(submitRecoverableTurn({ async submitTurn() {
    throw Object.assign(new Error('narration failed after commit'), {
      code: 'PRESENTATION_PENDING', httpStatus: 503
    });
  } }, saved, 'party', { raw_text: 'Зову.' }));
  assert.equal(storedPendingTurn(saved, 'party')?.request.raw_text, 'Зову.');
});

test('live commit lease retains the exact pending request', async () => {
  const saved = storage(); const requests = [];
  const api = { async submitTurn(_partyId, request) {
    requests.push(request);
    throw Object.assign(new Error('turn is still in progress'), {
      code: 'TRACE_PHASE_2_IDEMPOTENCY_CONFLICT', httpStatus: 409
    });
  } };
  await assert.rejects(submitRecoverableTurn(api, saved, 'party', {
    raw_text: 'Зову.'
  }));
  await assert.rejects(submitRecoverableTurn(api, saved, 'party', {
    raw_text: 'Новый ввод.'
  }));
  assert.deepEqual(requests[1], requests[0]);
  assert.deepEqual(storedPendingTurn(saved, 'party')?.request, requests[0]);
});

test('pending presentation recovery retains identity until ready without another gameplay submission', async () => {
  const saved = storage(); let posts = 0;
  const api = { async submitTurn() { posts += 1; return {
    screen: { screen_status: 'committed_presentation_pending' } }; },
  async recoverPendingPresentation() { return { screen: { screen_status: 'ready' } }; } };
  await submitRecoverableTurn(api, saved, 'party', { selected_action_option_id: 'inspect' });
  assert.equal(posts, 1);
  assert.equal(storedPendingTurn(saved, 'party'), null);
});

test('pending recovery UI keeps the new draft and labels submission as recovery', () => {
  const html = renderActions({ actions: [{ id: 'inspect', label: 'Осмотреть' }] }, {
    draft: 'Новый текст <остаётся>', pendingTurn: { request: { raw_text: 'Жду.' } }
  });
  assert.match(html, /Восстановить прежний ход/u);
  assert.match(html, /Новый текст &lt;остаётся&gt;/u);
  assert.match(html, /data-action-id="inspect" disabled/u);
  assert.doesNotMatch(html, /textarea[^>]+disabled/u);
});

test('a failed local save prevents the first gameplay POST', async () => {
  let posts = 0;
  await assert.rejects(submitRecoverableTurn({ async submitTurn() { posts += 1; } },
    { getItem() { return null; }, setItem() { throw new Error('storage full'); } },
    'party', { raw_text: 'Жду.' }), /storage full/u);
  assert.equal(posts, 0);
});

test('turn progress polling uses exact request, never overlaps, stops, and is nonfatal', async () => {
  const saved = storage();
  let finishTurn, finishProgress, active = 0, maxActive = 0, polls = 0;
  const api = {
    submitTurn: async () => new Promise((resolve) => { finishTurn = resolve; }),
    async getTurnProgress(partyId, requestId) {
      assert.equal(partyId, 'party');
      assert.match(requestId, /^web:turn:/u);
      polls += 1; active += 1; maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => { finishProgress = resolve; });
      active -= 1;
      return { phase: 'understanding_action' };
    }
  };
  const updates = [];
  const pending = submitRecoverableTurn(api, saved, 'party', { raw_text: 'Жду.' },
    { onProgress: (value) => updates.push(value), pollIntervalMs: 1 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(maxActive, 1);
  finishProgress();
  await new Promise((resolve) => setTimeout(resolve, 5));
  finishTurn({ screen: { screen_status: 'ready' } });
  await pending;
  const stoppedAt = polls;
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(polls, stoppedAt);
  assert.deepEqual(updates.find(({ phase }) => phase === 'understanding_action'),
    { phase: 'understanding_action', commit_state: 'unconfirmed',
      elapsed_seconds: 0 });

  await submitRecoverableTurn({
    async submitTurn() { return { screen: { screen_status: 'ready' } }; },
    async getTurnProgress() { throw new Error('status unavailable'); }
  }, saved, 'party', { raw_text: 'Иду.' }, { onProgress() {}, pollIntervalMs: 1 });
});

test('turn progress keeps local elapsed monotonic when polling fails', async () => {
  const saved = storage();
  let finishTurn, now = 1_000, polls = 0;
  const updates = [];
  const pending = submitRecoverableTurn({
    submitTurn: async () => new Promise((resolve) => { finishTurn = resolve; }),
    async getTurnProgress() {
      polls += 1;
      if (polls === 1) return { phase: 'resolving_world',
        commit_state: 'unconfirmed', elapsed_seconds: 40 };
      throw new Error('status unavailable');
    }
  }, saved, 'party', { raw_text: 'Жду.' }, {
    onProgress: (progress) => updates.push(progress), pollIntervalMs: 1,
    now: () => now
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 5));
    now = 32_000;
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(updates.at(-1).elapsed_seconds, 40,
      'server elapsed remains the floor');
    now = 43_000;
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(updates.at(-1).elapsed_seconds, 42,
      'local elapsed advances through polling errors');
    assert.equal(updates.at(-1).phase, 'resolving_world');
    now = 2_000;
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(updates.at(-1).elapsed_seconds, 42,
      'elapsed never moves backwards with the local clock');
  } finally {
    finishTurn({ screen: { screen_status: 'ready' } });
    await pending;
  }
});

test('screen-only pending presentation recovery polls its committed request', async () => {
  let finishRecovery, polls = 0;
  const api = {
    recoverPendingPresentation: async (partyId, requestId) =>
      new Promise((resolve) => {
        assert.equal(partyId, 'party'); assert.equal(requestId, 'turn-7');
        finishRecovery = resolve;
      }),
    async getTurnProgress(partyId, requestId) {
      assert.equal(partyId, 'party'); assert.equal(requestId, 'turn-7');
      polls += 1;
      return { phase: 'recovering_saved_result', commit_state: 'committed' };
    }
  };
  const updates = [];
  const recovery = recoverPendingPresentation(api, 'party', {
    screen_status: 'committed_presentation_pending', turn_id: 'turn-7'
  }, { onProgress: (value) => updates.push(value), pollIntervalMs: 1 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  finishRecovery({ screen: { screen_status: 'ready' } });
  await recovery;
  const stoppedAt = polls;
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(polls, stoppedAt);
  assert.deepEqual(updates[0], {
    phase: 'recovering_saved_result', commit_state: 'committed',
    elapsed_seconds: 0
  });
});
