import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeTracePhase4Combat } from
  '../src/runtime/lower-dvina-trace-phase-4-combat-initialization.js';

const at = {
  whole_minutes: '620',
  subminute_numerator: '0',
  subminute_denominator: '1'
};
const state = {
  party_id: 'party-1',
  actor_id: 'mikula-1',
  party_state: { state_version: 7, turn_number: 3 }
};
const contracts = {
  ids: { shed: 'trace_ld_v1_loc_old_drying_shed' },
  actors: {
    ratsha_storehouse_helper: {
      instance_id: 'ratsha-1',
      semantic_profile: {
        identity: { canonical_name: 'Ратша' },
        combat_experience: 'limited'
      }
    }
  },
  combatBindings: {
    scope_location_ref: 'trace_ld_v1_loc_old_drying_shed',
    signal_descriptor: {
      category: 'objective',
      significance: 'material',
      perception_required: false
    },
    operation_contract: {
      allowed_intent_kinds: ['engage', 'break_contact'],
      allowed_force_limits: ['ordinary'],
      allowed_risk_postures: ['ordinary']
    }
  }
};
const semanticExchange = {
  response_kind: 'combat_handoff',
  combat_handoff: { kind: 'combat' },
  clock_after: at,
  same_time_batch_ref: {
    entity_kind: 'temporal_batch',
    entity_id: 'phase4-batch'
  },
  exchange: { exchange_id: 'conversation-exchange-1' }
};

test('Phase 4 handoff opens one common paused combat session without harm', async () => {
  let modelCalls = 0;
  const initialized = await initializeTracePhase4Combat({
    state,
    contracts,
    semanticExchange,
    playerInput: { request_id: 'turn-request-1' },
    revalidateStateVersion: async () => 7,
    npcCombatModel: async (request) => {
      modelCalls += 1;
      return {
        schema: 'npc_combat_intent_plan_v1',
        request_id: request.request_id,
        boundary_id: request.boundary_id,
        state_version: request.state_version,
        combat_id: request.combat_id,
        npc_ref: request.npc_ref,
        decision: {},
        operation: {
          op: 'set_combat_intent',
          intent_kind: 'engage',
          target_refs: [{
            entity_kind: 'player_character',
            entity_id: 'mikula-1'
          }],
          protected_refs: [],
          scope_ref: null,
          destination_ref: null,
          force_limit: 'ordinary',
          risk_posture: 'ordinary'
        },
        combat_statement: null,
        reason: 'Ратша намерен удержать угрозу перед собой.'
      };
    }
  });
  assert.equal(modelCalls, 1);
  assert.equal(initialized.session.status, 'paused_for_player');
  assert.equal(initialized.session.exchange_ordinal, 0);
  assert.equal(initialized.session.participant_states[1]
    .current_intent.intent_kind, 'engage');
  assert.equal(initialized.decision_records.length, 1);
  assert.equal('harm_packages' in initialized, false);
});

test('non-combat conversation outcome does not call the combat model', async () => {
  const result = await initializeTracePhase4Combat({
    state,
    contracts,
    semanticExchange: {
      ...semanticExchange,
      response_kind: 'speech',
      combat_handoff: null
    },
    playerInput: { request_id: 'turn-request-2' },
    npcCombatModel: async () => assert.fail('combat model must not run')
  });
  assert.equal(result, null);
});
