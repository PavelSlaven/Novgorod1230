import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNpcStepPlan } from '../src/semantic-decision-contracts.js';

test('autonomous plan admits only exact NPC-safe world-process capability', () => {
  const request = requestFixture();
  const plan = planFixture(request);
  assert.equal(validateNpcStepPlan(plan, request), true);
  const unbounded = structuredClone(request);
  unbounded.decision_scope.operation_contract.request_world_process = {};
  assert.equal(validateNpcStepPlan(plan, unbounded), false);
  plan.operations[0].source_refs = ['foreign-fuel'];
  assert.equal(validateNpcStepPlan(plan, request), false);
});

function requestFixture() {
  return {
    schema: 'npc_action_decision_request_v1', request_id: 'request-fire',
    root_turn_id: 'turn-fire', boundary_id: 'boundary-fire',
    committed_state_version: 1, working_revision: 0, decision_index: 1,
    occurred_at: { whole_minutes: '10', subminute_numerator: '0',
      subminute_denominator: '1' }, npc_ref: 'npc-fire', decision_reasons: {
      significance: 'material', categories: ['environment'], signal_refs: [{
        entity_kind: 'npc_decision_signal', entity_id: 'signal-fire' }],
      perceived_changes: ['Доступны топливо и кресало.'] },
    historical_context: { year: 1230, season: 'summer', region: 'Новгород',
      applicable_norms: [], known_local_customs: [] }, npc: {
      profile_level: 'scene', identity: { name_or_label: 'NPC',
        age_range: 'adult', origin: null }, social_role: { role_ref: null,
        status: null, authority: [], dependencies: [] }, attributes: [],
      skills: [], body_state: { summary: null, conditions: [] }, mood: null,
      temperament: [], values: [], goals: [], fears: [], obligations: [],
      relationships: [], current_activity: { activity_ref: null, summary: null,
        status: 'idle', can_continue_automatically: false },
      available_resources: [{ item_ref: 'npc-fuel' },
        { item_ref: 'npc-ignition' }] }, perception: { visible_scene: [],
      perceived_changes: [], heard: [], felt: [], present_actors: [],
      visible_objects: [], known_routes_and_exits: [], uncertainties: [] },
    knowledge: { known_facts: [], beliefs: [], hypotheses: [] }, memory: {
      recent_events: [], relevant_long_term_events: [], previous_decisions: [] },
    decision_scope: { mode: 'autonomous_action', allowed_attribute_refs: [],
      allowed_skill_refs: [], operation_contract: { request_world_process: {
        allowed: [{ process_action: 'start', process_ref: null,
          process_kind: 'fire', source_refs: ['npc-fuel'],
          target_refs: ['npc-ignition'] }] } } }
  };
}

function planFixture(request) {
  return { schema: 'npc_step_plan_v1', request_id: request.request_id,
    root_turn_id: request.root_turn_id, boundary_id: request.boundary_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    decision_index: request.decision_index, npc_ref: request.npc_ref,
    interpretation: { npc_goal: 'разжечь огонь',
      grounded_attempt: 'использовать топливо и кресало', adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_world_process', actor_ref: request.npc_ref,
      process_action: 'start', process_ref: null, process_kind: 'fire',
      source_refs: ['npc-fuel'], target_refs: ['npc-ignition'],
      description: 'Разжечь огонь.' }], check: null,
    reason_code: 'local_fire_needed', reason: 'Нужен огонь.' };
}
