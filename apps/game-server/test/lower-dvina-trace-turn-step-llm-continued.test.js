import { promptMappings } from './lower-dvina-trace-turn-step-llm-test-helpers.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requestTurnStepPlan,
  validateTurnStepPlan
} from '@rus/turn';
import { assembleTurnStepPlan, createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { createLowerDvinaTraceTurnStepSemanticGroundingValidator } from
  '../src/runtime/lower-dvina-trace-turn-step-grounding-audit.js';
import { output, request } from './lower-dvina-trace-turn-step-llm-test-helpers.js';

test('later generic ordinary discovery drops only an exact stale root query',
  async () => {
    const rootIntent = 'Найти среди обломков сухой материал, прежде чем идти через кусты.';
    const remainingIntent = 'прежде чем идти через кусты.';
    const input = request({ root_player_action: rootIntent,
      remaining_intent: remainingIntent, step_index: 2, working_revision: 1,
      completed_steps: [{ step_index: 1, summary: 'Поиск выполнен.' }],
      player_safe_state: {
        position: { location_ref: 'shore' }, ordinary_resolution: {
          discovery_available: true, container_resolution_available: false,
          scene_seed_available: true
        }
      } });
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run() { return { output: {
        interpretation: { player_goal: rootIntent,
          grounded_attempt: remainingIntent, adaptation: 'literal' },
        resolution: 'domain_request', operation_choice: null,
        operations: [{ op: 'request_discovery', actor_ref: 'actor_mikula',
          discovery_kind: 'search', target_refs: ['shore'],
          query: rootIntent }], check: null, continuation: null,
        clarification: null,
        direct_result_kind: null, reason_code: 'ordinary_discovery',
        reason: 'Повторный carrier.'
      } }; }
    } });
    let auditCalls = 0;
    const validateGrounding =
      createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner: {
        async run(call) {
          auditCalls += 1;
          return { output: { mode: 'focused_discovery', consumed_intent:
            JSON.parse(call.messages[1].content).remaining_intent } };
        }
      } });
    for (const repairContext of [null, {
      schema: 'turn_step_repair_context_v1', attempt: 2,
      original_output: {}, structural_errors: [{
        path: '$.operations.0.query', code: 'ordinary_discovery_query_identity',
        message: 'must equal the current remaining_intent'
      }]
    }]) {
      const plan = await model(input, repairContext);
      assert.equal(plan.operations[0].query, remainingIntent);
      assert.equal(plan.continuation, null);
      const validation = validateTurnStepPlan(plan, { request: input });
      assert.equal(validation.ok, true, JSON.stringify(validation.errors));
      assert.equal(await validateGrounding({ plan, request: input,
        resolved_domain_operations: [{ path: '$.operations.0',
          owner_kind: 'ordinary_discovery' }] }), true);
    }
    assert.equal(auditCalls, 2);
    const unsafe = assembleTurnStepPlan({
      interpretation: { player_goal: rootIntent,
        grounded_attempt: 'Найти сухую ветку.', adaptation: 'literal' },
      resolution: 'domain_request', operation_choice: null,
      operations: [{ op: 'request_discovery', actor_ref: 'actor_mikula',
        discovery_kind: 'search', target_refs: ['shore'],
        query: 'сухая ветка' }], check: null, continuation: {
        remaining_intent: 'Потом идти.', depends_on_refs: []
      }, clarification: null, direct_result_kind: null,
      reason_code: 'ordinary_discovery', reason: 'Ищу ветку.'
    }, { ...input, root_player_action:
      'Найти сухую ветку. Разжечь огонь. Потом идти.', remaining_intent:
      'Найти сухую ветку. Разжечь огонь. Потом идти.', step_index: 1 });
    assert.equal(unsafe.operations[0].query, 'сухая ветка');
    assert.equal(unsafe.continuation.remaining_intent, 'Потом идти.');
    await assert.rejects(validateGrounding({ plan: unsafe,
      request: { ...input, root_player_action:
        'Найти сухую ветку. Разжечь огонь. Потом идти.', remaining_intent:
        'Найти сухую ветку. Разжечь огонь. Потом идти.', step_index: 1 },
      resolved_domain_operations: [{ path: '$.operations.0',
        owner_kind: 'ordinary_discovery' }] }), {
      code: 'TURN_STEP_PLAN_INVALID'
    });
  });

test('turn step planner routes an exposed ambient portion through its capability ref', async () => {
  const capabilityRef = 'capability:alluvial-silt-portion-v9';
  const input = request({
    root_player_action: 'Зачерпнуть пригоршню речного ила и сжать её.',
    remaining_intent: 'Зачерпнуть пригоршню речного ила и сжать её.',
    player_safe_state: { visible_context: { visible_objects: [{
      entity_ref: { entity_kind: 'ambient_ordinary_capability', entity_id: capabilityRef },
      display_label: 'пригоршня речного ила', recognition: 'code_owned_source_capability',
      visible_status: 'available', ambient_portion_bounds: { quantity_unit: 'scoop',
        min_quantity: 2, max_quantity: 4, min_mass_grams: 70, max_mass_grams: 900 }
    }] } }
  });
  let prompt;
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: { async run(call) {
    prompt = call.messages[0].content;
    return { output: {
      interpretation: { player_goal: input.root_player_action,
        grounded_attempt: 'Зачерпнуть пригоршню речного ила.', adaptation: 'literal' },
      resolution: 'direct', goal_result: 'achieved',
      activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' },
      operation_choice: null,
      operations: [{ op: 'create_entity', temp_ref: 'taken-silt',
        semantic_type: 'material_portion', name: 'пригоршня речного ила',
        origin: { kind: 'ambient_ordinary', source_refs: [capabilityRef] }, facts: [],
        mechanics: { mass_grams: 300, external_hand_cost: 1, carry_form: 'compact',
          packing_slot_cost: 1, quantity: { value: 3, unit: 'scoop' }, container: null },
        placement: { relation: 'held_by', target_ref: input.actor.actor_ref } }],
      check: null, continuation: { remaining_intent: 'Сжать взятую порцию.',
        depends_on_refs: ['taken-silt'] }, clarification: null,
      reason_code: 'ambient_ordinary_portion_take', reason: 'Беру видимую порцию.'
    } };
  } } });
  const plan = await model(input);
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, true);
  assert.deepEqual(plan.operations[0].origin,
    { kind: 'ambient_ordinary', source_refs: [capabilityRef] });
  assert.equal(plan.goal_result, 'pending');
  assert.deepEqual(plan.continuation,
    { remaining_intent: 'Сжать взятую порцию.', depends_on_refs: ['taken-silt'] });
  assert.match(prompt, /ambient_ordinary_capability[\s\S]*exact code-owned permission and source[\s\S]*not an existing item alias or a discovery target[\s\S]*ambient_ordinary_portion_take before ordinary_material_prerequisite or action_production[\s\S]*sole origin\.source_refs[\s\S]*quantity\.unit from its ambient_portion_bounds[\s\S]*quantity\.value and mass_grams only within those exact min\/max bounds[\s\S]*effective type, name, mechanics, source, and profile values at commit[\s\S]*Never substitute any nearby, worn, held, or listed item ref[\s\S]*making that compound plan pending/u);
});

test('turn step planner and repair prompts map available container access exactly', async () => {
  const prompts = [];
  const candidate = {
    op: 'request_container_access', actor_ref: 'actor_mikula',
    container_ref: 'container:road-bag', access_kind: 'open'
  };
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: { async run(call) {
      prompts.push(call.messages[0].content);
      return { output: output() };
    } }
  });
  const input = request({
    root_player_action: 'открыть дорожную сумку',
    remaining_intent: 'открыть дорожную сумку',
    player_safe_state: { visible_entities: [{ entity_ref: 'container:road-bag' }] },
    available_domain_operations: [candidate]
  });
  await model(input);
  await model(input, { schema: 'turn_step_repair_context_v1', attempt: 2,
    structural_errors: [] });
  for (const prompt of prompts) {
    const mappings = promptMappings(prompt);
    assert.deepEqual(mappings.available_container_access, {
      interpretation: { adaptation: 'literal' },
      resolution: 'domain_request',
      operation_choice: '<select matching supplied choice_id>', check: null
    });
    assert.match(prompt, /available_domain_operations[\s\S]*request_container_access[\s\S]*open, close, or other container-access intent[\s\S]*available_container_access[\s\S]*before action_production or direct[\s\S]*exactly one matching supplied choice_id[\s\S]*do not reproduce or alter its operation DTO/u);
  }
});

test('turn step planner maps local fire only through its visible capability', async () => {
  let prompt;
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: { async run(call) {
      prompt = call.messages[0].content;
      return { output: output() };
    } }
  });
  await model(request({ remaining_intent: 'вылить воду на огонь',
    player_safe_state: { local_world_process: {
      semantic_grounding_available: true,
      ignition_basis_refs: ['item:firesteel'],
      active_process_refs: ['fire:active'], allowed: [{
        op: 'request_world_process', actor_ref: 'actor_mikula',
        process_action: 'affect', process_ref: 'fire:active',
        process_kind: 'fire', source_refs: ['item:water'], target_refs: [],
        description: 'Воздействовать на огонь.' }] },
      items: [{ item_id: 'item:water' }] }
  }));
  assert.match(prompt, /local_world_process\.semantic_grounding_available/u);
  assert.match(prompt, /matching candidate[\s\S]*MUST return a[\s\S]*domain_request semantic choice[\s\S]*supplied choice_id[\s\S]*never return a direct plan/u);
  assert.match(prompt, /local_world_process_affect/u);
  assert.match(prompt, /one visible whole water ref/u);
  assert.match(prompt, /Do not emit request_world_process otherwise/u);
});

test('turn step planner prompt preserves only compound intent outside capability coverage', async () => {
  let prompt;
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: { async run(call) {
      prompt = call.messages[0].content;
      return { output: output() };
    } }
  });
  await model(request({ remaining_intent: 'сначала отдохнуть, потом поговорить' }));
  const mappings = promptMappings(prompt);
  assert.deepEqual(mappings.direct_item_relocation.operations, [{
    op: 'move_entity', entity_ref: '<copy the grounded source item ref>',
    placement: {
      relation: '<held_by, worn_by, inside, located_at, or attached_to>',
      target_ref: '<copy the player-safe actor, container, position, or attachment target ref>'
    }
  }]);
  assert.match(prompt,
    /direct preparation and action_production cannot share one plan[\s\S]*explicit requested destination or spatial relation[\s\S]*no exact player-safe target ref[\s\S]*source's committed placement[\s\S]*preserve it as unexecuted continuation[\s\S]*item-local[\s\S]*never placement, attachment, holder, wearer, destination, or relocation[\s\S]*ordered explicit relocation, transformation, and placement[\s\S]*first move_entity now[\s\S]*each later placement again needs move_entity/u);
  assert.match(prompt,
    /Direct empty achieved or partially_achieved[\s\S]*player_safe_item_observation[\s\S]*supplied sensory facts[\s\S]*new physical detail/u);
  assert.match(prompt, /operation choice covers the intent[\s\S]*choice_id[\s\S]*Final continuation override for direct reality_limited or make_believe[\s\S]*stated action, purpose, manner, result, or qualifier[\s\S]*same grounding, not continuation[\s\S]*independently executable without that premise[\s\S]*every later sentence[\s\S]*continuation to null/u);
});

test('turn step planner prompt requests semantic choice without deterministic envelope', async () => {
  let prompt;
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: { async run(call) {
      prompt = call.messages[0].content;
      return { output: output() };
    } }
  });
  await model(request());
  const example = JSON.parse(prompt.match(
    /A direct semantic example is:\n(\{[^\n]+\})/u
  )[1]);
  for (const deterministic of ['schema', 'request_id',
    'committed_state_version', 'working_revision', 'step_index']) {
    assert.equal(Object.hasOwn(example, deterministic), false);
  }
  assert.equal(example.operation_choice, null);
  for (const obsoleteKey of [
    'actor_id', 'action_summary', 'semantic_activity', 'activity_type',
    'activity_moment', 'activity_goal', 'activity_context', 'next_step',
    'domain_request'
  ]) assert.equal(obsoleteKey in example, false, obsoleteKey);
  assert.match(prompt, /continuation\.next_step[\s\S]*remaining_intent[\s\S]*depends_on_refs as \[\][\s\S]*copied player-safe refs[\s\S]*prepared_followup_ref[\s\S]*request prepared_followup_candidate[\s\S]*no other fields/u);
  assert.match(prompt,
    /Process independent actions in their stated order[\s\S]*later action never outranks an earlier feasible action/u);
  assert.match(prompt,
    /travel is the current earliest independently executable action[\s\S]*later travel clause never outranks an earlier manipulation/u);
  assert.match(prompt,
    /Never invent a preliminary relocation[\s\S]*without explicitly relocating it, plan the manipulation itself/u);
  assert.match(prompt,
    /Never represent cutting, tearing, partitioning, reshaping, wrapping, binding[\s\S]*action_production independent_outputs[\s\S]*complete later use[\s\S]*continuation/u);
});

test('turn step planner assembles exact domain operation and preserves independent continuation', async () => {
  const candidate = { op: 'request_activity', actor_ref: 'actor_mikula',
    activity_kind: 'recover', target_refs: [],
    description: 'Выполнить первое действие.' };
  const input = request({
    root_player_action: 'Выполнить первое действие. Попросить спутника пойти со мной.',
    remaining_intent: 'Выполнить первое действие. Попросить спутника пойти со мной.',
    available_domain_operations: [candidate]
  });
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run(call) {
      assert.match(call.messages[0].content,
        /"choice_id":"domain_operation_1_request_activity_recover"/u);
      return { output: {
        interpretation: { player_goal: input.root_player_action,
          grounded_attempt: 'Выполнить первое действие.', adaptation: 'literal' },
        resolution: 'domain_request',
        operation_choice: 'domain_operation_1_request_activity_recover',
        continuation: { remaining_intent: 'Попросить спутника пойти со мной.',
          depends_on_refs: [] }, clarification: null, check: null,
        reason_code: 'domain_activity', reason: 'Первое действие доступно.'
      } };
    }
  } });
  const plan = await model(input);
  assert.equal(plan.request_id, input.request_id);
  assert.equal(plan.goal_result, 'pending');
  assert.deepEqual(plan.activity,
    { owner: 'domain', duration_class: null, effort: null });
  assert.deepEqual(plan.operations, [candidate]);
  assert.equal(plan.continuation.remaining_intent,
    'Попросить спутника пойти со мной.');
});
