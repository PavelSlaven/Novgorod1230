import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNpcDecisionSignal,
  evaluateNpcDecisionSignals,
  validateNpcDecisionSignal
} from '../src/decision-signals.js';
import { validateSocialDeliveryResult } from '../src/conversation-contracts.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const occurredAt = {
  whole_minutes: '10',
  subminute_numerator: '0',
  subminute_denominator: '1'
};

function signal(category, significance, eventId = `${category}-${significance}`) {
  return buildNpcDecisionSignal({
    occurred_at: occurredAt,
    category,
    significance,
    source_event_ref: ref('world_event', eventId),
    subject_ref: ref('npc', 'guard'),
    perception_required: false
  });
}

test('common NPC decision vocabulary is closed to five categories and two significance bands', () => {
  const categories = ['self', 'others', 'environment', 'objective', 'communication'];
  const significanceBands = ['material', 'critical'];

  for (const category of categories) {
    for (const significance of significanceBands) {
      assert.equal(validateNpcDecisionSignal(signal(category, significance)), true);
    }
  }

  assert.throws(
    () => signal('conversation', 'material'),
    (error) => error?.code === 'NPC_DECISION_SIGNAL_INVALID'
  );
  assert.throws(
    () => signal('communication', 'important'),
    (error) => error?.code === 'NPC_DECISION_SIGNAL_INVALID'
  );
});

test('one NPC and same-time batch produce one boundary for all resolved signals', () => {
  const result = evaluateNpcDecisionSignals({
    npc_ref: ref('npc', 'guard'),
    active_mode: 'conversation',
    current_intent: null,
    decision_capability: true,
    resolved_signals: [
      signal('communication', 'material', 'statement-1'),
      signal('environment', 'critical', 'alarm-1')
    ],
    consumed_signal_ids: [],
    same_time_batch_ref: ref('temporal_batch', 'batch-1'),
    state_version: '4'
  });

  assert.equal(
    result.boundary.boundary_id,
    'npc-decision:conversation:batch-1:guard'
  );
  assert.deepEqual(result.boundary.categories, ['environment', 'communication']);
  assert.equal(result.boundary.significance, 'critical');
  assert.equal(result.boundary.signal_refs.length, 2);
});

test('social delivery describes an observed outcome and cannot select a response', () => {
  const delivery = {
    schema: 'social_delivery_result_v1',
    check_resolution_id: 'resolution-1',
    outcome_band: 'success',
    delivery_quality: 'credible',
    observable_effects: ['steady_voice']
  };

  assert.equal(validateSocialDeliveryResult(delivery), true);
  assert.equal(validateSocialDeliveryResult({
    ...delivery,
    selected_response_ref: ref('conversation_response', 'accept')
  }), false);
});
