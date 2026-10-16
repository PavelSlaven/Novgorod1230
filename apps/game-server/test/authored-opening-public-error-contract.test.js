import test from 'node:test';
import assert from 'node:assert/strict';
import { serverError } from '../src/errors.js';
import { errorEnvelope } from '../src/http/contracts.js';
import { createApiClient } from '../../game-web/src/api/client.js';

const code = 'AUTHORED_OPENING_AUDIT_REJECTED';
const message = 'Не удалось начать игру. Попробуйте ещё раз.';
const originalMessages = [
  'Authored opening narration failed closed.',
  'Произвольное исходное сообщение отказа.'
];

function openingFailure(originalMessage, status = 409) {
  const error = serverError(code, originalMessage, {
    status,
    details: {
      codes: ['STAGE23_AUDIT_CHECK_FAILED'],
      opening_rejection: { prose: 'Скрытый черновик вступления.' }
    }
  });
  error.diagnostics = { trace: 'private-opening-trace' };
  return error;
}

for (const originalMessage of originalMessages) {
  test(`opening rejection replaces original message: ${originalMessage}`, () => {
    for (const developerMode of [false, true]) {
      const failure = errorEnvelope(openingFailure(originalMessage), {
        requestId: 'opening-request', developerMode
      });
      assert.equal(failure.status, 409);
      assert.deepEqual(failure.body, {
        version: 1, schema: 'rus_api_error', ok: false,
        request_id: 'opening-request', error: { code, message }
      });
    }
  });
}

test('opening rejection keeps its public code and HTTP 409 regardless of original status', () => {
  for (const status of [400, 500]) {
    const failure = errorEnvelope(openingFailure(originalMessages[0], status));
    assert.equal(failure.status, 409);
    assert.deepEqual(failure.body.error, { code, message });
  }
});

test('browser API client receives only safe opening rejection text and HTTP 409', async () => {
  for (const originalMessage of originalMessages) {
    const failure = errorEnvelope(openingFailure(originalMessage), {
      developerMode: true
    });
    const api = createApiClient({ fetchImpl: async () => new Response(
      JSON.stringify(failure.body), {
        status: failure.status,
        headers: { 'content-type': 'application/json' }
      }) });
    await assert.rejects(api.startNewGame({ scenario_id: 'test-opening' }), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.httpStatus, 409);
      assert.equal(error.message, message);
      assert.equal(error.details, null);
      assert.equal(error.diagnostics, undefined);
      return true;
    });
  }
});
