import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareCombatExchange } from '../src/index.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const at = { whole_minutes: '1', subminute_numerator: '0',
  subminute_denominator: '1' };

test('an all-blocked recheck produces a zero-time factual invalidation',
  async () => {
    const actor = ref('npc', 'npc-1');
    const target = ref('player_character', 'player-1');
    const intent = { schema: 'combat_intent_v1', intent_id: 'intent-npc-1',
      combat_id: 'combat-1', actor_ref: actor, intent_kind: 'engage',
      target_refs: [target], protected_refs: [], scope_ref: null,
      destination_ref: null, force_limit: 'ordinary', risk_posture: 'ordinary',
      persistence: 'until_decision_boundary', created_from_boundary_ref: {
        entity_kind: 'npc_decision_boundary', entity_id: 'boundary-npc-1' },
      state_version: '1', status: 'active' };
    const session = { schema: 'combat_session_v1', combat_id: 'combat-1',
      state_version: '1', status: 'active', started_at: at,
      scope_ref: ref('location', 'place-1'), participant_refs: [actor, target],
      participant_states: [
        { actor_ref: actor, combat_status: 'active', current_intent: intent,
          next_action_boundary_ref: null },
        { actor_ref: target, combat_status: 'active', current_intent: null,
          next_action_boundary_ref: null }], exchange_ordinal: 0,
      last_exchange_ref: null, player_response_required: false,
      last_change_set_ref: null };
    let profileCalls = 0;
    const result = await prepareCombatExchange({ session, working_state: {},
      occurred_at: at, idempotency_key: 'all-blocked-recheck',
      random_source: { next: () => assert.fail('blocked step must not roll') },
      ports: {
        resolveCombatTiming: () => ({ occurred_at: at,
          exact_duration: { exact_minutes: {
            numerator: '1', denominator: '1' } } }),
        resolveExecutionProfile: () => (++profileCalls === 1
          ? { preconditions_digest: 'initially-applicable' }
          : { applicable: false }),
        orderTechnicalSteps: ({ proposals }) => proposals,
        applyItemTransitions: () => assert.fail('blocked step must not run'),
        applyPositionTransitions: () => assert.fail('blocked step must not run'),
        resolvePerceptionAndDecisionContexts: async ({ session: current,
          working_state }) => ({ session_after: current, working_state,
          signal_records: [] })
      } });
    assert.equal(result.prepared.exchange, null);
    assert.equal(result.prepared.exact_duration.exact_minutes.numerator, '0');
    assert.deepEqual(result.prepared.technical_step_timings, []);
    assert.equal(result.prepared.session_after.exchange_ordinal, 0);
    assert.equal(result.prepared.outcome_events[0].event_kind,
      'combat_step_blocked');
    assert.equal(result.prepared.session_after.participant_states[0]
      .current_intent.status, 'invalidated');
  });
