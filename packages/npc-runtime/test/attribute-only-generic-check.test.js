import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNpcStepPlan } from '../src/semantic-decision-contracts.js';

test('NPC generic check allows an attribute without a skill', () => {
  const request = actionRequest();
  const plan = genericPlan(request, null);
  assert.equal(validateNpcStepPlan(plan, request), true);
  assert.equal(validateNpcStepPlan(genericPlan(request, 'foreign-skill'), request), false);
});

test('an unseen routine generic attempt uses the same bounded qualitative scale', () => {
  const request = actionRequest();
  const plan = genericPlan(request, null);
  plan.interpretation = { npc_goal: 'прислушаться',
    grounded_attempt: 'разобрать обычный близкий звук', adaptation: 'literal' };
  plan.check = { ...plan.check, purpose: 'разобрать обычный близкий звук' };
  assert.equal(validateNpcStepPlan(plan, request), true);
  assert.equal(plan.check.difficulty_id, 'ordinary');
});

function actionRequest() {
  return { schema: 'npc_action_decision_request_v1', request_id: 'request',
    root_turn_id: 'turn', boundary_id: 'boundary', committed_state_version: 1,
    working_revision: 0, decision_index: 1, occurred_at: timestamp(), npc_ref: 'npc',
    decision_reasons: { significance: 'material', categories: ['self'],
      signal_refs: [{ entity_kind: 'npc_decision_signal', entity_id: 'signal' }],
      perceived_changes: ['слышен шум'] }, historical_context: { year: null, season: null,
      region: null, applicable_norms: [], known_local_customs: [] }, npc: {
      profile_level: 'scene', identity: { name_or_label: null, age_range: null, origin: null },
      social_role: { role_ref: null, status: null, authority: [], dependencies: [] },
      attributes: [], skills: [], body_state: { summary: null, conditions: [] }, mood: null,
      temperament: [], values: [], goals: [], fears: [], obligations: [], relationships: [],
      current_activity: { activity_ref: null, summary: null, status: 'idle',
        can_continue_automatically: false }, available_resources: [] },
    perception: { visible_scene: [], perceived_changes: [], heard: [], felt: [],
      present_actors: [], visible_objects: [], known_routes_and_exits: [], uncertainties: [] },
    knowledge: { known_facts: [], beliefs: [], hypotheses: [] },
    memory: { recent_events: [], relevant_long_term_events: [], previous_decisions: [] },
    decision_scope: { mode: 'autonomous_action', allowed_attribute_refs: ['attention'],
      allowed_skill_refs: [], operation_contract: {} } };
}

function genericPlan(request, skill_ref) {
  const outcome = (goal_result) => ({ goal_result, additional_activity: null, operations: [] });
  return { schema: 'npc_step_plan_v1', request_id: request.request_id,
    root_turn_id: request.root_turn_id, boundary_id: request.boundary_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, decision_index: request.decision_index,
    npc_ref: request.npc_ref, interpretation: { npc_goal: 'осмотреться',
      grounded_attempt: 'осмотреться', adaptation: 'literal' }, resolution: 'generic_check',
    goal_result: 'pending', activity: { owner: 'semantic', duration_class: 'brief', effort: 'none' },
    operations: [], check: { purpose: 'осмотреться', attribute_ref: 'attention', skill_ref,
      difficulty_id: 'ordinary', outcomes: {
        clean_success: outcome('achieved'), success: outcome('achieved'),
        success_with_cost: outcome('partially_achieved'),
        failure_with_consequence: outcome('not_achieved'), severe_failure: outcome('not_achieved') } },
    reason_code: 'observe', reason: 'NPC осматривается.' };
}

function timestamp() { return { whole_minutes: '1', subminute_numerator: '0',
  subminute_denominator: '1' }; }
