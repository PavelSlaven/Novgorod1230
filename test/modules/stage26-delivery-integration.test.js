import test from 'node:test';
import assert from 'node:assert/strict';
import { runStage26FirstGameScreen } from '@rus/new-game/stages/stage-26';
import {
  acknowledgeFirstScreenDelivery,
  buildFirstScreenDeliveryAck,
  buildStage27FirstTurnInput,
  createFirstScreenDeliveryAttempt,
  markFirstScreenDeliverySent
} from '@rus/presentation/opening-delivery';
import { validateStage26ToStage27HandoffContract } from '@rus/contracts';
import { makeActionAudit, makeSafetyAudit, makeStage26Input } from '../fixtures/stage26-fixtures.mjs';

test('modular Stage 26 result passes delivery acknowledgement and Stage 27 handoff', async () => {
  const input = makeStage26Input();
  const stage26 = await runStage26FirstGameScreen({
    input,
    safetyAuditor: async ({ input: roleInput }) => makeSafetyAudit(roleInput.first_game_screen, input),
    actionLabelAuditor: async ({ input: roleInput }) => makeActionAudit(roleInput.screen_digest, input)
  });
  assert.equal(stage26.pass, true);
  assert.deepEqual(validateStage26ToStage27HandoffContract(stage26), []);

  const pending = createFirstScreenDeliveryAttempt({ stage26_result: stage26, created_at: '2026-07-11T00:00:00.000Z' });
  const sent = markFirstScreenDeliverySent(pending, { sent_at: '2026-07-11T00:00:01.000Z' });
  const acknowledgement = buildFirstScreenDeliveryAck({ attempt: sent, client_ack_id: 'ack-stage26-real', acknowledged_at: '2026-07-11T00:00:02.000Z' });
  const acknowledged = acknowledgeFirstScreenDelivery({ attempt: sent, acknowledgement });
  const turnInput = buildStage27FirstTurnInput({
    stage26_result: stage26,
    delivery_attempt: acknowledged.delivery_attempt,
    delivery_ack_result: acknowledged,
    selected_action_option_id: stage26.first_game_screen.action_panel.suggested_actions[0].option_id,
    received_at: '2026-07-11T00:00:03.000Z'
  });
  assert.equal(turnInput.player_input.contract, 'intent_not_fact');
  assert.equal(turnInput.turn_policy.must_not_treat_player_words_as_world_facts, true);
});
