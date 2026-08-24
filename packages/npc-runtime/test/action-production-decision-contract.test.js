import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcStepPlan, validateNpcStepPlan } from '../src/semantic-decision-contracts.js';

const request = () => ({
  schema: 'npc_action_decision_request_v1', request_id: 'request-a1',
  root_turn_id: 'turn-a1', boundary_id: 'boundary-a1',
  committed_state_version: 1, working_revision: 0, decision_index: 1,
  occurred_at: { whole_minutes: '10', subminute_numerator: '0',
    subminute_denominator: '1' }, npc_ref: 'npc-a1', decision_reasons: {
    significance: 'material', categories: ['self'], signal_refs: [{
      entity_kind: 'npc_decision_signal', entity_id: 'signal-a1' }],
    perceived_changes: ['Доступны доска и нож.'] },
  historical_context: { year: 1230, season: 'summer', region: 'Новгород',
    applicable_norms: [], known_local_customs: [] }, npc: {
    profile_level: 'scene', identity: { name_or_label: 'NPC',
      age_range: 'adult', origin: null }, social_role: { role_ref: null,
      status: null, authority: [], dependencies: [] }, attributes: [], skills: [],
    body_state: { summary: null, conditions: [] }, mood: null, temperament: [],
    values: [], goals: [], fears: [], obligations: [], relationships: [],
    current_activity: { activity_ref: null, summary: null, status: 'idle',
      can_continue_automatically: false }, available_resources: [
      { item_ref: 'item:board' }, { item_ref: 'item:knife' }] },
  perception: { visible_scene: [], perceived_changes: [], heard: [], felt: [],
    present_actors: [], visible_objects: [], known_routes_and_exits: [],
    uncertainties: [] }, knowledge: { known_facts: [], beliefs: [], hypotheses: [] },
  memory: { recent_events: [], relevant_long_term_events: [],
    previous_decisions: [] }, decision_scope: { mode: 'autonomous_action',
    allowed_attribute_refs: [], allowed_skill_refs: [], operation_contract: {
      request_item_use: { allowed: [{ item_ref: 'item:board', use_kind: 'other',
        target_refs: ['item:knife'] }] } } }
});

const plan = (decisionRequest, actionProduction = null) => ({
  schema: 'npc_step_plan_v1', request_id: decisionRequest.request_id,
  root_turn_id: decisionRequest.root_turn_id, boundary_id: decisionRequest.boundary_id,
  committed_state_version: decisionRequest.committed_state_version,
  working_revision: decisionRequest.working_revision,
  decision_index: decisionRequest.decision_index, npc_ref: decisionRequest.npc_ref,
  interpretation: { npc_goal: 'обработать доску', grounded_attempt: 'срезать край',
    adaptation: 'literal' }, resolution: 'domain_request', goal_result: 'pending',
  activity: actionProduction === null
    ? { owner: 'domain', duration_class: null, effort: null }
    : { owner: 'semantic', duration_class: 'brief', effort: 'light' }, operations: [{
    op: 'request_item_use', actor_ref: decisionRequest.npc_ref, item_ref: 'item:board',
    use_kind: 'other', target_refs: ['item:knife'],
    ...(actionProduction === null ? {} : { action_production: actionProduction })
  }], check: null, reason_code: 'make_edge', reason: 'Нужен край доски.'
});

const actionProduction = () => ({
  source_refs: ['item:board'], tool_refs: ['item:knife'],
  requested_output_count: null, identity_mode: 'preserve_source', origin: null,
  result_class: 'ordinary_physical_result', material_extent: null,
  result_descriptor: { display_name: null, physical_description: 'край срезан',
    qualitative_facts: [], removed_physical_fact_refs: [], inscription_text: null,
    physical_form: null, source_fact_delta: null }, output_class: 'ordinary_mundane'
});

test('NPC item use admits A1 production and keeps ref and contract gates', () => {
  const decisionRequest = request();
  const valid = plan(decisionRequest, actionProduction());
  assert.doesNotThrow(() => buildNpcStepPlan(valid, decisionRequest));

  const unresolved = structuredClone(valid);
  unresolved.operations[0].action_production.tool_refs = ['item:unknown'];
  assert.equal(validateNpcStepPlan(unresolved, decisionRequest), false);
  assert.throws(() => buildNpcStepPlan(unresolved, decisionRequest), TypeError);

  assert.doesNotThrow(() => buildNpcStepPlan(plan(decisionRequest), decisionRequest));
});
