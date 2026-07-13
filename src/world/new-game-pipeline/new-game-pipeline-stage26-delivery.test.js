import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFirstScreenDeliveryAttempt,
  markFirstScreenDeliverySent,
  buildFirstScreenDeliveryAck,
  acknowledgeFirstScreenDelivery
} from '../src/world/new-game-pipeline/delivery/first-screen-delivery.js';
import { runStage26FirstGameScreenBlock } from '../src/world/new-game-pipeline/stages/stage26-first-game-screen.js';
import { makeActionAudit, makeSafetyAudit, makeStage26Input } from './stage26-fixtures.mjs';

async function approvedResult() {
  const input = makeStage26Input();
  return runStage26FirstGameScreenBlock({
    input,
    safetyAuditor: async ({ input: role }) => makeSafetyAudit(role.first_game_screen, input),
    actionLabelAuditor: async ({ input: role }) => makeActionAudit(role.screen_digest, input)
  });
}

test('delivery attempt is bound to immutable Stage 26 screen and preserves committed message ID', async () => {
  const result = await approvedResult();
  const attempt = createFirstScreenDeliveryAttempt({ stage26_result: result, created_at: '2026-07-11T10:00:00.000Z' });
  assert.equal(attempt.message_id, 'message-opening-001');
  assert.equal(attempt.screen_digest, result.screen_digest);
  assert.equal(attempt.status, 'pending');
  assert.equal(attempt.opening_scene_presented, false);
  assert.equal(Object.isFrozen(attempt), true);
});

test('delivery retry with same binding is idempotent', async () => {
  const result = await approvedResult();
  const first = createFirstScreenDeliveryAttempt({ stage26_result: result });
  const retry = createFirstScreenDeliveryAttempt({ stage26_result: result, existing_attempt: first });
  assert.deepEqual(retry, first);
});

test('delivery sent does not mark opening scene presented', async () => {
  const result = await approvedResult();
  const attempt = createFirstScreenDeliveryAttempt({ stage26_result: result });
  const sent = markFirstScreenDeliverySent(attempt, { sent_at: '2026-07-11T10:01:00.000Z' });
  assert.equal(sent.status, 'sent');
  assert.equal(sent.awaiting_client_ack, true);
  assert.equal(sent.opening_scene_presented, false);
});

test('opening scene becomes presented only after matching ACK', async () => {
  const result = await approvedResult();
  const sent = markFirstScreenDeliverySent(createFirstScreenDeliveryAttempt({ stage26_result: result }));
  const ack = buildFirstScreenDeliveryAck({ attempt: sent, client_ack_id: 'ack-001', acknowledged_at: '2026-07-11T10:02:00.000Z' });
  const acknowledged = acknowledgeFirstScreenDelivery({ attempt: sent, acknowledgement: ack });
  assert.equal(acknowledged.delivery_attempt.status, 'acknowledged');
  assert.equal(acknowledged.delivery_attempt.opening_scene_presented, true);
  assert.equal(acknowledged.party_state_patch.opening_scene_presented, true);
});

test('ACK with stale screen digest is rejected', async () => {
  const result = await approvedResult();
  const sent = markFirstScreenDeliverySent(createFirstScreenDeliveryAttempt({ stage26_result: result }));
  const ack = { ...buildFirstScreenDeliveryAck({ attempt: sent, client_ack_id: 'ack-001' }), screen_digest: 'sha256:stale' };
  assert.throws(() => acknowledgeFirstScreenDelivery({ attempt: sent, acknowledgement: ack }), /DELIVERY_ACK_INVALID/u);
});
