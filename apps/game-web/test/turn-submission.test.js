import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTurnRequest,
  recoverPendingPresentation,
  submitTurnWithPresentationReplay
} from '../src/app/turn-submission.js';

test('turn controller replays one pending presentation with same client request', async (t) => {
  await t.test('ready replay is accepted', async () => {
    const calls = [];
    const request = createTurnRequest({ raw_text: 'Look around.' });
    const result = await submitTurnWithPresentationReplay({
      async submitTurn(partyId, input) {
        calls.push({ partyId, input });
        return calls.length === 1
          ? { screen: { screen_status: 'committed_presentation_pending' } }
          : { screen: { screen_status: 'ready' } };
      }
    }, 'party-1', request);
    assert.equal(calls.length, 2);
    assert.strictEqual(calls[0].input, calls[1].input);
    assert.equal(calls[0].input.request_id, calls[0].input.idempotency_key);
    assert.equal(calls[0].input.raw_text, 'Look around.');
    assert.equal(result.screen.screen_status, 'ready');
  });
  await t.test('second pending response does not receive a third submission', async () => {
    let calls = 0;
    const request = createTurnRequest({ raw_text: 'Look around.' });
    await assert.rejects(() => submitTurnWithPresentationReplay({
      async submitTurn() {
        calls += 1;
        return { screen: { screen_status: 'committed_presentation_pending' } };
      }
    }, 'party-1', request), { code: 'PRESENTATION_PENDING' });
    assert.equal(calls, 2);
  });
});

test('pending screen recovery uses recovery endpoint only for pending screen', async () => {
  const calls = [];
  assert.equal(recoverPendingPresentation({ recoverPendingPresentation(partyId) {
    calls.push(partyId); return Promise.resolve('ready');
  } }, 'party-1', { screen_status: 'committed_presentation_pending' }) instanceof Promise, true);
  assert.equal(await recoverPendingPresentation({}, 'party-1', { screen_status: 'ready' }), null);
  assert.deepEqual(calls, ['party-1']);
});
