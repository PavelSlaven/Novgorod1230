import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNpcDecisionBoundary
} from '@rus/npc-runtime';
import {
  appendNpcDecisionTraceWrites
} from '../src/infrastructure/postgres/npc-semantic-conversation-decision-writes.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const at = {
  whole_minutes: '30',
  subminute_numerator: '0',
  subminute_denominator: '1'
};

test('semantic decision writer persists autonomous request identity', () => {
  const boundary = buildNpcDecisionBoundary({
    decision_mode: 'autonomous',
    scheduled_at: at,
    npc_ref: ref('npc', 'zhdanko'),
    same_time_batch_ref: ref('temporal_batch', 'rest-batch'),
    significance: 'material',
    categories: ['objective'],
    signal_refs: [ref('npc_decision_signal', 'signal-1')],
    state_version: '7'
  });
  const request = autonomousRequest(boundary);
  const plan = autonomousPlan(request);
  const appends = [];

  appendNpcDecisionTraceWrites({
    appends,
    decisionRecords: [{
      request,
      boundary,
      orderedSignals: [{ signal_id: 'signal-1' }],
      proposal: { plan }
    }],
    partyId: 'party-1',
    changeSetId: 'change-1',
    rootTurnId: 'turn-1',
    workingRevision: 0
  });

  assert.equal(appends.length, 1);
  const record = appends[0].record;
  assert.equal(appends[0].target_table, 'party_npc_decision_traces');
  assert.equal(record.npc_id, 'zhdanko');
  assert.equal(record.state_version, 7);
  assert.equal(record.decision_mode, 'autonomous');
  assert.deepEqual(record.semantic_request, request);
  assert.deepEqual(record.semantic_plan, plan);
});

function autonomousRequest(boundary) {
  return {
    schema: 'npc_action_decision_request_v1',
    request_id: 'request-1',
    root_turn_id: 'turn-1',
    boundary_id: boundary.boundary_id,
    committed_state_version: 7,
    working_revision: 0,
    decision_index: 1,
    occurred_at: at,
    npc_ref: 'zhdanko',
    decision_reasons: {
      significance: 'material',
      categories: ['objective'],
      signal_refs: boundary.signal_refs,
      perceived_changes: ['Ожидание завершилось.']
    },
    historical_context: {
      year: 1230, season: 'late_summer', region: 'Нижняя Двина',
      applicable_norms: [], known_local_customs: []
    },
    npc: {
      profile_level: 'scene',
      profile_ref: 'zhdanko-profile',
      identity: { name_or_label: 'Жданко', age_range: 'adult', origin: null },
      social_role: {
        role_ref: 'storehouse_controller', status: 'управляющий',
        authority: [], dependencies: []
      },
      attributes: [], skills: [],
      body_state: { summary: 'может действовать', conditions: [] },
      mood: { state: 'тревожен', intensity: 'material' },
      temperament: [], values: [], goals: [], fears: [], obligations: [],
      relationships: [],
      current_location: {
        location_ref: 'storehouse',
        zone_ref: 'storehouse_inside'
      },
      current_activity: {
        activity_ref: null, summary: null, status: 'decision_required',
        can_continue_automatically: false
      },
      available_resources: [{ item_ref: 'road-bag' }]
    },
    perception: {
      visible_scene: [], perceived_changes: [], heard: [], felt: [],
      present_actors: [], visible_objects: [], known_routes_and_exits: [],
      uncertainties: []
    },
    knowledge: { known_facts: [], beliefs: [], hypotheses: [] },
    memory: {
      recent_events: [], relevant_long_term_events: [], previous_decisions: []
    },
    decision_scope: {
      mode: 'autonomous_action', allowed_attribute_refs: [],
      allowed_skill_refs: [],
      operation_contract: { request_activity: {} }
    }
  };
}

function autonomousPlan(request) {
  return {
    schema: 'npc_step_plan_v1',
    request_id: request.request_id,
    root_turn_id: request.root_turn_id,
    boundary_id: request.boundary_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    decision_index: request.decision_index,
    npc_ref: request.npc_ref,
    interpretation: {
      npc_goal: 'подготовиться к уходу',
      grounded_attempt: 'начать перенос сумки',
      adaptation: 'literal'
    },
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{
      op: 'request_activity', actor_ref: 'zhdanko', activity_kind: 'work',
      target_refs: ['road-bag'], description: 'Начать перенос сумки.'
    }],
    check: null,
    reason_code: 'prepare_departure',
    reason: 'Ожидание завершилось.'
  };
}
