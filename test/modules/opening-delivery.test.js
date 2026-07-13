import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStage26ScreenDigest } from '@rus/contracts';
import {
  acknowledgeFirstScreenDelivery,
  buildFirstScreenDeliveryAck,
  buildStage27FirstTurnInput,
  createFirstScreenDeliveryAttempt,
  markFirstScreenDeliverySent,
  validateDeliveryAttempt
} from '@rus/presentation/opening-delivery';

function stage26Fixture() {
  const screen = {
    version: 1,
    schema: 'first_game_screen',
    request_id: 'req-delivery',
    screen_status: 'ready',
    position_panel: { position_ref: { g1_id: 'g1-1', g5_anchor_id: 'a-1' } },
    action_panel: { suggested_actions: [{ option_id: 'act-1', label: 'Inspect' }] },
    delivery_state: { message_id: 'msg-1' }
  };
  return {
    version: 1,
    schema: 'stage26_first_game_screen_result',
    request_id: 'req-delivery',
    pass: true,
    party_id: 'party-1',
    transaction_id: 'tx-1',
    screen_digest: computeStage26ScreenDigest(screen),
    visible_context_package_digest: 'sha256:' + 'a'.repeat(64),
    narrator_output_digest: 'sha256:' + 'b'.repeat(64),
    postcommit_state_digest: 'sha256:' + 'c'.repeat(64),
    delivery_permission: {
      can_create_delivery_attempt: true,
      can_show_screen: true,
      can_accept_first_turn_intent: true
    },
    first_game_screen: screen
  };
}

test('opening delivery is deterministic and acknowledgement is idempotent', () => {
  const stage26 = stage26Fixture();
  const pending = createFirstScreenDeliveryAttempt({ stage26_result: stage26, created_at: '2026-07-11T00:00:00.000Z' });
  assert.equal(validateDeliveryAttempt(pending, stage26).length, 0);
  const sent = markFirstScreenDeliverySent(pending, { sent_at: '2026-07-11T00:00:01.000Z' });
  const ack = buildFirstScreenDeliveryAck({ attempt: sent, client_ack_id: 'ack-1', acknowledged_at: '2026-07-11T00:00:02.000Z' });
  const result = acknowledgeFirstScreenDelivery({ attempt: sent, acknowledgement: ack });
  const repeated = acknowledgeFirstScreenDelivery({ attempt: sent, acknowledgement: ack, existing_ack_result: result });
  assert.deepEqual(repeated, result);
  assert.equal(result.party_state_patch.current_phase, 'awaiting_player_input');
});

test('first turn input remains intent, not asserted world fact', () => {
  const stage26 = stage26Fixture();
  const pending = createFirstScreenDeliveryAttempt({ stage26_result: stage26, created_at: '2026-07-11T00:00:00.000Z' });
  const sent = markFirstScreenDeliverySent(pending, { sent_at: '2026-07-11T00:00:01.000Z' });
  const ack = buildFirstScreenDeliveryAck({ attempt: sent, client_ack_id: 'ack-1', acknowledged_at: '2026-07-11T00:00:02.000Z' });
  const ackResult = acknowledgeFirstScreenDelivery({ attempt: sent, acknowledgement: ack });
  const input = buildStage27FirstTurnInput({
    stage26_result: stage26,
    delivery_attempt: ackResult.delivery_attempt,
    delivery_ack_result: ackResult,
    selected_action_option_id: 'act-1',
    received_at: '2026-07-11T00:00:03.000Z'
  });
  assert.equal(input.player_input.contract, 'intent_not_fact');
  assert.equal(input.turn_policy.must_not_treat_player_words_as_world_facts, true);
});
