import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNpcCombatIntentPlan } from '@rus/npc-runtime';
import { createLowerDvinaTraceNpcCombatModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { assembleNpcCombatPlan } from
  '../src/runtime/lower-dvina-trace-combat-llm.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });

function combatRequest() {
  return {
    schema: 'npc_combat_decision_request_v1', request_id: 'combat-request-1',
    boundary_id: 'boundary-1', state_version: '2', combat_id: 'combat-1',
    exchange_ordinal: 0,
    decided_at: { whole_minutes: '1', subminute_numerator: '0',
      subminute_denominator: '1' },
    npc_ref: ref('npc', 'npc-1'),
    decision_reasons: { significance: 'material', categories: ['self'],
      signal_refs: [ref('npc_decision_signal', 'signal-1')],
      perceived_changes: ['Угроза приблизилась.'] },
    current_intent: null, npc_subjective_state: {}, perceived_combat_state: {},
    relevant_memory: [], operation_contract: {
      allowed_intent_kinds: ['engage'],
      engageable_actor_refs: [ref('player_character', 'player-1')],
      controllable_actor_refs: [], protectable_refs: [], holdable_scope_refs: [],
      reachable_destination_refs: [], break_contact_destination_refs: [],
      allowed_force_limits: ['ordinary'], allowed_risk_postures: ['ordinary'],
      surrender_available: false, cease_hostility_available: false,
      combat_statement_available: false
    }
  };
}

test('combat model assembles code-owned intent DTO for primary and repair', async () => {
  const calls = [];
  const output = { decision: { intent_summary: 'Сдержать противника.',
    grounded_goal: 'Не дать ему приблизиться.', adaptation: 'literal' },
  intent_choice: 'intent_1', selected_ref_choices: ['ref_1'],
  force_choice: 'force_1', risk_choice: 'risk_1',
  combat_statement: null, reason: 'Он представляет угрозу.' };
  const model = createLowerDvinaTraceNpcCombatModel({ roleRunner: {
    run: async (request) => { calls.push(request); return { output }; }
  } });
  const request = combatRequest();
  for (const context of [undefined, { repair: { original_output: {},
    validation_errors: ['invalid'] } }]) {
    const plan = await model(request, context);
    assert.equal(validateNpcCombatIntentPlan(plan, request), true);
    assert.equal(plan.request_id, request.request_id);
    assert.deepEqual(plan.npc_ref, request.npc_ref);
    assert.deepEqual(plan.operation.target_refs,
      request.operation_contract.engageable_actor_refs);
  }
  assert.equal(calls[0].role_id, 'npc_combat_decider');
  assert.equal(calls[1].role_id, 'npc_combat_decider_format_repair');
  for (const call of calls) {
    const prompt = call.messages[0].content;
    assert.match(prompt, /Return only the semantic NPC combat choice/u);
    assert.match(prompt, /"choice_id":"intent_1"/u);
    assert.match(prompt, /"choice_id":"ref_1"/u);
    assert.doesNotMatch(prompt, /Copy request_id/u);
  }
});

test('combat assembly does not default omitted semantic refs or statement', () => {
  const request = combatRequest();
  const plan = assembleNpcCombatPlan({ decision: {
    intent_summary: 'Сдержать противника.', grounded_goal: 'Не подпустить.',
    adaptation: 'literal' }, intent_choice: 'intent_1',
  force_choice: 'force_1', risk_choice: 'risk_1', reason: 'Угроза.' }, request);
  assert.equal(plan.operation.target_refs, undefined);
  assert.equal(plan.combat_statement, undefined);
  assert.equal(validateNpcCombatIntentPlan(plan, request), false);
});
