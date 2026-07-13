import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acknowledgeFirstScreenDelivery,
  buildFirstScreenDeliveryAck,
  createFirstScreenDeliveryAttempt,
  markFirstScreenDeliverySent
} from '../src/world/new-game-pipeline/delivery/first-screen-delivery.js';
import { runStage26FirstGameScreenBlock } from '../src/world/new-game-pipeline/stages/stage26-first-game-screen.js';
import { makeActionAudit, makeSafetyAudit, makeStage26Input } from './stage26-fixtures.mjs';

async function fixture() {
  const input = makeStage26Input();
  const result = await runStage26FirstGameScreenBlock({
    input,
    safetyAuditor: async ({ input: role }) => makeSafetyAudit(role.first_game_screen, input),
    actionLabelAuditor: async ({ input: role }) => makeActionAudit(role.screen_digest, input)
  });
  const attempt = markFirstScreenDeliverySent(createFirstScreenDeliveryAttempt({ stage26_result: result }));
  const ack = buildFirstScreenDeliveryAck({ attempt, client_ack_id: 'ack-001', acknowledged_at: '2026-07-11T10:02:00.000Z' });
  return { result, attempt, ack };
}

test('duplicate identical ACK returns same result', async () => {
  const { attempt, ack } = await fixture();
  const first = acknowledgeFirstScreenDelivery({ attempt, acknowledgement: ack });
  const retry = acknowledgeFirstScreenDelivery({ attempt, acknowledgement: ack, existing_ack_result: first });
  assert.deepEqual(retry, first);
});

test('conflicting duplicate ACK is rejected', async () => {
  const { attempt, ack } = await fixture();
  const first = acknowledgeFirstScreenDelivery({ attempt, acknowledgement: ack });
  const conflict = { ...ack, client_ack_id: 'ack-002' };
  assert.throws(() => acknowledgeFirstScreenDelivery({ attempt, acknowledgement: conflict, existing_ack_result: first }), /DELIVERY_ACK_CONFLICT/u);
});
