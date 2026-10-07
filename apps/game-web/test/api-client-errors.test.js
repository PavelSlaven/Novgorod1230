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
