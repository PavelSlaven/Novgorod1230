import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTurnRequest,
  recoverPendingPresentation,
  submitTurnWithPresentationReplay
} from '../src/app/turn-submission.js';

test('turn controller recovers one pending presentation without replaying gameplay', async (t) => {
  await t.test('ready replay is accepted', async () => {
    const submissions = [];
    const recoveries = [];
    const request = createTurnRequest({ raw_text: 'Look around.' });
    const result = await submitTurnWithPresentationReplay({
      async submitTurn(partyId, input) {
        submissions.push({ partyId, input });
        return { screen: { screen_status: 'committed_presentation_pending' } };
      },
      async recoverPendingPresentation(partyId) {
        recoveries.push(partyId);
        return { screen: { screen_status: 'ready' } };
      }
    }, 'party-1', request);
    assert.equal(submissions.length, 1);
    assert.deepEqual(recoveries, ['party-1']);
    assert.equal(submissions[0].input.request_id,
      submissions[0].input.idempotency_key);
    assert.equal(submissions[0].input.raw_text, 'Look around.');
    assert.equal(result.screen.screen_status, 'ready');
  });
  await t.test('second pending response does not receive a third submission', async () => {
    let submissions = 0;
    let recoveries = 0;
    const request = createTurnRequest({ raw_text: 'Look around.' });
    await assert.rejects(() => submitTurnWithPresentationReplay({
      async submitTurn() {
        submissions += 1;
        return { screen: { screen_status: 'committed_presentation_pending' } };
      },
      async recoverPendingPresentation() {
        recoveries += 1;
        return { screen: { screen_status: 'committed_presentation_pending' } };
      }
    }, 'party-1', request), { code: 'PRESENTATION_PENDING' });
    assert.equal(submissions, 1);
    assert.equal(recoveries, 1);
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
