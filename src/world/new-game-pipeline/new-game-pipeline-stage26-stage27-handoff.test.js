import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acknowledgeFirstScreenDelivery,
  buildFirstScreenDeliveryAck,
  buildStage27FirstTurnInput,
  createFirstScreenDeliveryAttempt,
  markFirstScreenDeliverySent,
  validateStage26ToStage27IntentHandoff
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
  const acknowledgement = buildFirstScreenDeliveryAck({ attempt, client_ack_id: 'ack-001' });
  const ackResult = acknowledgeFirstScreenDelivery({ attempt, acknowledgement });
  return { result, attempt: ackResult.delivery_attempt, ackResult };
}

test('Stage 27 accepts only acknowledged approved Stage 26 screen and intent-not-fact input', async () => {
  const { result, attempt, ackResult } = await fixture();
  const stage27 = buildStage27FirstTurnInput({
    stage26_result: result,
    delivery_attempt: attempt,
    delivery_ack_result: ackResult,
    selected_action_option_id: 'option-look-gate',
    raw_text: 'Осторожно осматриваю ворота.'
  });
  assert.equal(stage27.schema, 'first_turn_pipeline_input');
  assert.equal(stage27.player_input.contract, 'intent_not_fact');
  assert.equal(stage27.player_input.selected_action_option_id, 'option-look-gate');
});

test('Stage 27 is blocked before delivery ACK', async () => {
  const input = makeStage26Input();
  const result = await runStage26FirstGameScreenBlock({
    input,
    safetyAuditor: async ({ input: role }) => makeSafetyAudit(role.first_game_screen, input),
    actionLabelAuditor: async ({ input: role }) => makeActionAudit(role.screen_digest, input)
  });
  const pending = createFirstScreenDeliveryAttempt({ stage26_result: result });
  const concerns = validateStage26ToStage27IntentHandoff({ stage26_result: result, delivery_attempt: pending, delivery_ack_result: null });
  assert.ok(concerns.some((item) => item.code === 'STAGE27_DELIVERY_NOT_ACKNOWLEDGED'));
});

test('Stage 27 rejects action option not present in approved screen', async () => {
  const { result, attempt, ackResult } = await fixture();
  assert.throws(() => buildStage27FirstTurnInput({
    stage26_result: result,
    delivery_attempt: attempt,
    delivery_ack_result: ackResult,
    selected_action_option_id: 'option-invented'
  }), /STAGE27_HANDOFF_INVALID/u);
});
