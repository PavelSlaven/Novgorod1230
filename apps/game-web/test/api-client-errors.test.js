import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/api/client.js';

test('missing API error message does not expose raw HTTP status', async () => {
  const api = createApiClient({ fetchImpl: async () => new Response('{}', {
    status: 503, headers: { 'content-type': 'application/json' }
  }) });
  await assert.rejects(api.health(), (error) => {
    assert.equal(error.message,
      'Запрос временно недоступен. Попробуйте ещё раз.');
    assert.doesNotMatch(error.message, /HTTP|503/u);
    return true;
  });
});

test('submitTurn deadline aborts fetch and leaves commit outcome unknown', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requestSignal;
  const api = createApiClient({ fetchImpl: async (_url, options) => {
    requestSignal = options.signal;
    return new Promise(() => {});
  } });

  const submitted = api.submitTurn('party', { request_id: 'turn-1' });
  let timeoutError;
  const settled = submitted.then(() => false, (error) => {
    timeoutError = error;
    return true;
  });
  await Promise.resolve();
  t.mock.timers.runAll();

  assert.equal(await settled, true);
  assert.equal(requestSignal.aborted, true);
  assert.equal(timeoutError.code, 'TURN_REQUEST_TIMEOUT');
  assert.match(timeoutError.message, /Повторите отправку или восстановите результат/u);
  assert.equal(timeoutError.turn_commit_status, undefined);
});

test('submitTurn deadline keeps its error when fetch rejects synchronously on abort', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const api = createApiClient({ fetchImpl: (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      }, { once: true });
    }) });

  const submitted = api.submitTurn('party', { request_id: 'turn-2' });
  await Promise.resolve();
  t.mock.timers.runAll();

  await assert.rejects(submitted, (error) => {
    assert.equal(error.code, 'TURN_REQUEST_TIMEOUT');
    assert.equal(error.name, 'GameWebError');
    assert.match(error.message, /Повторите отправку или восстановите результат/u);
    assert.equal(error.turn_commit_status, undefined);
    return true;
  });
});
