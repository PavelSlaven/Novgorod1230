import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcDecisionBoundary } from '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '../src/npc-semantic-decision.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const requestedAt = {
  whole_minutes: '10',
  subminute_numerator: '0',
  subminute_denominator: '1'
};

function boundary(stateVersion = '2') {
  return buildNpcDecisionBoundary({
    decision_mode: 'autonomous',
    scheduled_at: requestedAt,
    npc_ref: ref('npc', 'speaker'),
    same_time_batch_ref: ref('temporal_batch', 'batch-1'),
    significance: 'material',
    categories: ['objective'],
    signal_refs: [ref('npc_decision_signal', 'signal-1')],
    state_version: stateVersion
  });
}

function request({ current = false } = {}) {
  return {
    schema: 'npc_action_decision_request_v1',
    request_id: current
      ? 'autonomous-request-current'
      : 'autonomous-request-1',
    root_turn_id: 'turn-1',
    boundary_id: 'npc-decision:autonomous:batch-1:speaker',
    committed_state_version: current ? 3 : 2,
    working_revision: current ? 1 : 0,
    decision_index: 1,
    occurred_at: requestedAt,
    npc_ref: 'speaker',
    decision_reasons: {
      significance: 'material',
      categories: ['objective'],
      signal_refs: [ref('npc_decision_signal', 'signal-1')],
      perceived_changes: ['Ожидание завершилось без возвращения Ратши.']
    },
    historical_context: {
      year: 1230,
      season: 'late_summer',
      region: 'Нижняя Двина',
      applicable_norms: [],
      known_local_customs: []
    },
    npc: {
      profile_level: 'scene',
      profile_ref: 'zhdanko-profile',
      identity: {
        name_or_label: 'Жданко',
        age_range: 'adult',
        origin: null
      },
      social_role: {
        role_ref: 'storehouse_controller',
        status: 'управляющий',
        authority: [],
        dependencies: []
      },
      attributes: [],
      skills: [],
      body_state: { summary: 'может действовать', conditions: [] },
      mood: { state: 'тревожен', intensity: 'material' },
      temperament: [],
      values: [],
      goals: [{ goal_ref: 'prepare_departure' }],
      fears: [{ fear_ref: 'accountability' }],
      obligations: [],
      relationships: [],
      current_location: {
        location_ref: 'storehouse',
        zone_ref: 'storehouse_inside'
      },
      current_activity: {
        activity_ref: 'wait-ratsha',
        summary: 'ожидает возвращения Ратши',
        status: 'decision_required',
        can_continue_automatically: false
      },
      available_resources: [{ item_ref: 'road-bag' }]
    },
    perception: {
      visible_scene: [],
      perceived_changes: [],
      heard: [],
      felt: [],
      present_actors: [],
      visible_objects: [],
      known_routes_and_exits: [],
      uncertainties: []
    },
    knowledge: { known_facts: [], beliefs: [], hypotheses: [] },
    memory: {
      recent_events: [],
      relevant_long_term_events: [],
      previous_decisions: []
    },
    decision_scope: {
      mode: 'autonomous_action',
      allowed_attribute_refs: [],
      allowed_skill_refs: [],
      operation_contract: {
        request_activity: { activity_refs: ['move-bag'] }
      }
    }
  };
}

function plan(sourceRequest) {
  return {
    schema: 'npc_step_plan_v1',
    request_id: sourceRequest.request_id,
    root_turn_id: sourceRequest.root_turn_id,
    boundary_id: sourceRequest.boundary_id,
    committed_state_version: sourceRequest.committed_state_version,
    working_revision: sourceRequest.working_revision,
    decision_index: sourceRequest.decision_index,
    npc_ref: sourceRequest.npc_ref,
    interpretation: {
      npc_goal: 'подготовиться к уходу',
      grounded_attempt: 'начать перенос дорожной сумки',
      adaptation: 'literal'
    },
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{
      op: 'request_activity',
      actor_ref: sourceRequest.npc_ref,
      activity_kind: 'work',
      target_refs: ['road-bag'],
      description: 'Начать перенос дорожной сумки.'
    }],
    check: null,
    reason_code: 'prepare_departure',
    reason: 'Ратша не вернулся к сроку.'
  };
}

function rebuiltContext() {
  return {
    boundary: boundary('3'),
    request: request({ current: true }),
    ordered_signals: [{ signal_id: 'signal-1' }]
  };
}

test('stale invalid initial NPC response is rebuilt without format repair',
  async () => {
    const modelContexts = [];
    let revalidationCalls = 0;
    let rebuildCalls = 0;
    const result = await requestNpcSemanticDecision({
      boundary: boundary(),
      request: request(),
      semanticModel: async (source, context) => {
        modelContexts.push(context);
        return source.committed_state_version === 2
          ? { schema: 'broken', non_cloneable: () => {} }
          : plan(source);
      },
      revalidateStateVersion: async () => {
        revalidationCalls += 1;
        return 3;
      },
      rebuildDecisionContext: async ({ discarded_plan: discardedPlan }) => {
        rebuildCalls += 1;
        assert.equal(discardedPlan, null);
        return rebuiltContext();
      }
    });

    assert.equal(result.status, 'planned');
    assert.equal(result.plan.committed_state_version, 3);
    assert.deepEqual(modelContexts.map(({ repair }) => repair), [null, null]);
    assert.equal(revalidationCalls, 2);
    assert.equal(rebuildCalls, 1);
  });

test('NPC state becoming stale during format repair rebuilds before application',
  async () => {
    const modelContexts = [];
    const stateVersions = [2, 3, 3];
    let revalidationCalls = 0;
    let rebuildCalls = 0;
    const result = await requestNpcSemanticDecision({
      boundary: boundary(),
      request: request(),
      semanticModel: async (source, context) => {
        modelContexts.push(context);
        return modelContexts.length === 1 ? { schema: 'broken' } : plan(source);
      },
      revalidateStateVersion: async () => {
        const version = stateVersions[revalidationCalls];
        revalidationCalls += 1;
        return version;
      },
      rebuildDecisionContext: async () => {
        rebuildCalls += 1;
        return rebuiltContext();
      }
    });

    assert.equal(result.status, 'planned');
    assert.equal(result.plan.committed_state_version, 3);
    assert.equal(modelContexts.length, 3);
    assert.equal(modelContexts[0].repair, null);
    assert.notEqual(modelContexts[1].repair, null);
    assert.equal(modelContexts[2].repair, null);
    assert.equal(revalidationCalls, 3);
    assert.equal(rebuildCalls, 1);
  });
