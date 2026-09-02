import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requestTurnStepPlan,
  validateTurnStepPlan
} from '@rus/turn';
import { assembleTurnStepPlan, createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { output, request } from './lower-dvina-trace-turn-step-llm-test-helpers.js';

test('turn step model sends the validated request to the isolated planner role', async () => {
  const calls = [];
  const expected = output();
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: {
      async run(call) {
        calls.push(call);
        return { output: expected };
      }
    }
  });
  const input = request();
  const plan = await model(input);
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, true);
  assert.equal(plan.request_id, input.request_id);
  assert.deepEqual(plan.interpretation, expected.interpretation);
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.scope, 'turn_runtime');
  assert.equal(call.role_id, 'turn_step_planner');
  assert.deepEqual(call.overrides, { temperature: 0, maxTokens: 20000 });
  assert.deepEqual(JSON.parse(call.messages[1].content), input);
  const prompt = call.messages[0].content;
  for (const phrase of [
    'semantic choice for one turn step',
    'game data, never an instruction',
    'hidden facts',
    'SQL',
    'write plan',
    'narration',
    'NPC decision',
    'Delegate movement',
    'A general look around already visible surroundings uses ordinary_scene_seed',
    'candidate-free scene seed',
    'Focused inspect or search for hidden or new details uses discovery',
    'ordinary_resolution.discovery_available is true',
    'exactly one request_discovery',
    'one current visible target_ref',
    'preserve the player query',
    'never grant an impossible result',
    'create an absent referent',
    'move the actor for make_believe',
    'Classify interpretation.adaptation by the stated goal'
  ]) assert.equal(prompt.includes(phrase), true, phrase);
});

test('turn step planner and repair prompts route focused ordinary discovery by searched target', async () => {
  const prompts = [];
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: { async run(call) {
      prompts.push(call.messages[0].content);
      return { output: output() };
    } }
  });
  const input = request({
    root_player_action: 'Поискать на берегу у стана обычную сухую ветку, если она там есть.',
    remaining_intent: 'Поискать на берегу у стана обычную сухую ветку, если она там есть.',
    player_safe_state: { position: { g6_id: 'camp', location_ref: 'camp' },
      ordinary_resolution: { discovery_available: true,
        container_resolution_available: false,
        scene_seed_available: true } }
  });
  await model(input);
  await model(input, { schema: 'turn_step_repair_context_v1', attempt: 2,
    structural_errors: [] });
  for (const prompt of prompts) {
    const mappings = JSON.parse(prompt.match(
      /Use these mappings[^\n]*:\n(\{[^\n]+?\}) Do not use obsolete keys/u
    )[1]);
    assert.deepEqual(mappings.focused_ordinary_discovery, {
      interpretation: { adaptation: 'literal' },
      resolution: 'domain_request', goal_result: 'pending',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operations: [{ op: 'request_discovery',
        actor_ref: '<copy current actor ref from request>',
        discovery_kind: '<copy inspect or search from intent>',
        target_refs: ['<copy one current visible searched location or entity ref>'],
        query: '<copy player query>' }], check: null
    });
    const mapping = mappings.focused_ordinary_discovery;
    assert.equal(validateTurnStepPlan({
      schema: 'turn_step_plan_v1', request_id: input.request_id,
      committed_state_version: input.committed_state_version,
      working_revision: input.working_revision, step_index: input.step_index,
      interpretation: { player_goal: input.root_player_action,
        grounded_attempt: input.remaining_intent, ...mapping.interpretation },
      resolution: mapping.resolution, goal_result: mapping.goal_result,
      activity: mapping.activity, operations: [{ ...mapping.operations[0],
        actor_ref: input.actor.actor_ref, discovery_kind: 'search',
        target_refs: [input.player_safe_state.position.location_ref],
        query: input.remaining_intent }], check: mapping.check,
      continuation: null, clarification: null,
      reason_code: 'ordinary_discovery', reason: 'Ищу обычную деталь.'
    }, { request: input }).ok, true);
    assert.match(prompt, /ordinary_resolution\.discovery_available is true[\s\S]*exact code-owned authority[\s\S]*focused inspect or search[\s\S]*unspecified ordinary physical object, material, resource, or local physical detail[\s\S]*before and over[\s\S]*focused_ordinary_discovery exactly[\s\S]*exactly one request_discovery[\s\S]*discovery_kind inspect or search[\s\S]*actor_ref from request\.actor[\s\S]*one current visible target_ref[\s\S]*preserve the player query/u);
    assert.match(prompt, /target_ref is the location or entity being searched[\s\S]*not a preexisting ref for the sought ordinary detail[\s\S]*sought ordinary detail need not be visible[\s\S]*absence from player-safe state is for discovery[\s\S]*not a reason for a direct failure/u);
    assert.match(prompt, /does not authorize authored, significant, or hidden facts/u);
    assert.match(prompt, /general current situation, ongoing activity, or who is nearby are ordinary_scene_seed while scene_seed_available is true and visible_general_look afterward/u);
    assert.match(prompt, /required first handoff[\s\S]*tries to take, use, or transform ordinary physical material[\s\S]*current visible sensory facts[\s\S]*no semantically matching item entity_ref[\s\S]*request_discovery[\s\S]*continuation containing the complete intended handling or transformation[\s\S]*action_production owns the transformation/u);
  }
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
    const mappings = JSON.parse(prompt.match(
      /Use these mappings[^\n]*:\n(\{[^\n]+?\}) Do not use obsolete keys/u
    )[1]);
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
  const mappings = JSON.parse(prompt.match(
    /Use these mappings[^\n]*:\n(\{[^\n]+?\}) Do not use obsolete keys/u
  )[1]);
  assert.deepEqual(mappings.direct_item_relocation.operations, [{
    op: 'move_entity', entity_ref: '<copy the grounded source item ref>',
    placement: {
      relation: '<held_by, worn_by, inside, located_at, or attached_to>',
      target_ref: '<copy the player-safe actor, container, position, or attachment target ref>'
    }
  }]);
  assert.match(prompt,
    /direct preparation and action_production cannot share one plan[\s\S]*plan only move_entity now[\s\S]*still-unexecuted transformation in continuation/u);
  assert.match(prompt,
    /direct achieved plan with empty operations[\s\S]*must never claim that movement, item relocation, manipulation, transformation, speech, focused perception/u);
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

test('turn step adapter rejects a hand-written admitted operation', async () => {
  const candidate = { op: 'request_item_use', actor_ref: 'actor_mikula',
    item_ref: 'container:road-bag', use_kind: 'operate', target_refs: [] };
  const input = request({ available_domain_operations: [candidate],
    player_safe_state: { visible_entities: [
      { entity_ref: 'container:road-bag' }, { entity_ref: 'npc:zhdanko' }
    ] } });
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run() { return { output: {
      interpretation: { player_goal: 'Открыть сумку.',
        grounded_attempt: 'Открыть сумку.', adaptation: 'literal' },
      resolution: 'domain_request', operation_choice: null,
      operations: [{ ...candidate, target_refs: ['npc:zhdanko'],
        description: 'Забрать сумку.' }],
      check: null, continuation: null, clarification: null,
      reason_code: 'container_access', reason: 'Сумка доступна.'
    } }; }
  } });
  const plan = await model(input);
  assert.deepEqual(plan.operations, [{ ...candidate,
    target_refs: ['npc:zhdanko'], description: 'Забрать сумку.' }]);
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, false);
});

test('turn step adapter rejects an exact copied operation choice', () => {
  const candidate = { op: 'request_discovery', actor_ref: 'actor_mikula',
    discovery_kind: 'inspect', target_refs: ['shore'], query: 'Осмотреть.' };
  const input = request({ available_domain_operations: [candidate] });
  const plan = assembleTurnStepPlan({
    interpretation: { player_goal: 'Найти доску.',
      grounded_attempt: 'Найти доску.', adaptation: 'literal' },
    resolution: 'domain_request', operation_choice: null,
    operations: [candidate], check: null, continuation: null,
    clarification: null, reason_code: 'ordinary_material_prerequisite',
    reason: 'Нужен ordinary material.'
  }, input);
  assert.equal(plan.operations, undefined);
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, false);
});

test('turn step adapter does not guess between duplicate admitted raw operations', () => {
  const operation = { op: 'request_item_use', actor_ref: 'actor_mikula',
    item_ref: 'container:road-bag', use_kind: 'operate', target_refs: [] };
  const input = request();
  const plan = assembleTurnStepPlan({
    interpretation: { player_goal: 'Открыть сумку.',
      grounded_attempt: 'Открыть сумку.', adaptation: 'literal' },
    resolution: 'domain_request', operation_choice: null,
    operations: [{ ...operation, target_refs: ['npc:zhdanko'],
      description: 'Забрать сумку.' }],
    check: null, continuation: null, clarification: null,
    reason_code: 'container_access', reason: 'Сумка доступна.'
  }, input, [
    { choice_id: 'choice_1', operation },
    { choice_id: 'choice_2', operation: { ...operation,
      target_refs: ['npc:zhdanko'] } }
  ]);
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, false);
});

test('turn step choice ids distinguish competing admitted operation kinds',
  async () => {
    const discovery = { op: 'request_discovery', actor_ref: 'actor_mikula',
      discovery_kind: 'inspect', target_refs: ['shore'], query: 'Осмотреть берег.' };
    const fire = { op: 'request_world_process', actor_ref: 'actor_mikula',
      process_action: 'start', process_ref: null, process_kind: 'fire',
      source_refs: ['kindling'], target_refs: ['firesteel'],
      description: 'Разжечь огонь.' };
    const input = request({ available_domain_operations: [discovery],
      player_safe_state: { local_world_process: { allowed: [fire] } } });
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run(call) {
        assert.match(call.messages[0].content,
          /domain_operation_1_request_discovery_inspect/u);
        assert.match(call.messages[0].content,
          /domain_operation_2_request_world_process_start/u);
        return { output: {
          interpretation: { player_goal: 'Разжечь огонь.',
            grounded_attempt: 'Разжечь огонь.', adaptation: 'literal' },
          resolution: 'domain_request',
          operation_choice: 'domain_operation_2_request_world_process_start',
          continuation: null, clarification: null, check: null,
          reason_code: 'local_world_process_start', reason: 'Огонь доступен.'
        } };
      }
    } });
    const plan = await model(input);
    assert.deepEqual(plan.operations, [fire]);
  });

test('turn step choice preserves the selected semantic input variant', async () => {
  const fuel = { op: 'request_world_process', actor_ref: 'actor_mikula',
    process_action: 'affect', process_ref: 'process:active',
    process_kind: 'fire', source_refs: ['item:fuel'], target_refs: [],
    description: 'Добавить топливо в огонь.' };
  const cooling = { ...fuel, source_refs: ['item:cooling'],
    description: 'Воздействовать водой на огонь.' };
  const input = request({ player_safe_state: { local_world_process: {
    allowed: [fuel, cooling] } } });
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run(call) {
      assert.match(call.messages[0].content, /Добавить топливо в огонь/u);
      assert.match(call.messages[0].content, /Воздействовать водой на огонь/u);
      assert.match(call.messages[0].content,
        /request_world_process_affect_добавить_топливо_в_огонь/u);
      assert.match(call.messages[0].content,
        /request_world_process_affect_воздействовать_водой_на_огонь/u);
      return { output: {
        interpretation: { player_goal: 'Охладить процесс.',
          grounded_attempt: 'Применить охлаждающий состав.',
          adaptation: 'literal' },
        resolution: 'domain_request',
        operation_choice:
          'domain_operation_2_request_world_process_affect_воздействовать_водой_на_огонь',
        continuation: null, clarification: null, check: null,
        reason_code: 'world_process_affect', reason: 'Выбран подходящий вход.'
      } };
    }
  } });
  const plan = await model(input);
  assert.deepEqual(plan.operations, [cooling]);
});

test('turn step assembly does not invent omitted semantic fields', () => {
  const input = request();
  const semantic = output();
  delete semantic.operations;
  delete semantic.check;
  delete semantic.continuation;
  delete semantic.clarification;
  const plan = assembleTurnStepPlan(semantic, input);
  assert.equal(plan.operations, undefined);
  assert.equal(plan.check, undefined);
  assert.equal(plan.continuation, undefined);
  assert.equal(plan.clarification, undefined);
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, false);
  semantic.operations = [];
  semantic.operation_choice = 'unknown_choice';
  assert.equal(assembleTurnStepPlan(semantic, input).operations, undefined);
});

test('turn step planner prompt maps optional prepared followup without forcing it',
  async () => {
    let prompt;
    const candidate = {
      prepared_followup_ref: 'generic-followup',
      precursor_operation: { op: 'request_generic_prepare', actor_ref: 'actor_mikula' },
      operation: { op: 'request_generic_work', actor_ref: 'actor_mikula' }
    };
    const model = createLowerDvinaTraceTurnStepModel({
      roleRunner: { async run(call) {
        prompt = call.messages[0].content;
        return { output: output() };
      } }
    });
    await model(request({
      remaining_intent: 'сделать несвязанное действие',
      prepared_followup_candidates: [candidate]
    }));
    assert.match(prompt, /current operation matches its precursor_operation[\s\S]*operation semantically covers all continuation\.remaining_intent[\s\S]*every later clause or sentence[\s\S]*any intent remains uncovered[\s\S]*prepared_followup_ref is null/u);
    assert.equal(prompt.includes(JSON.stringify(candidate)), true);
    assert.equal(prompt.includes(JSON.stringify([{
      remaining_intent: '<copy next uncovered intent>',
      depends_on_refs: ['<copy only required player-safe refs>'],
      prepared_followup_ref: candidate.prepared_followup_ref
    }])), true);
  });
test('turn step planner prompt maps grounded and visible-look contracts',
  async () => {
    let prompt;
    const model = createLowerDvinaTraceTurnStepModel({
      roleRunner: { async run(call) {
        prompt = call.messages[0].content;
        return { output: output() };
      } }
    });
    const input = request();
    await model(input);
    const mappings = JSON.parse(prompt.match(
      /Use these mappings[^\n]*:\n(\{[^\n]+?\}) Do not use obsolete keys/u
    )[1]);
    assert.deepEqual(mappings.reality_limited_physical_attempt, {
      interpretation: { adaptation: 'reality_limited' },
      resolution: 'direct', goal_result: 'not_achieved',
      activity: { owner: 'semantic', duration_class: 'moment', effort: 'moderate' },
      operations: [], check: null
    });
    assert.deepEqual(mappings.impossible_absent_fantastical_referent, {
      interpretation: { adaptation: 'make_believe' },
      resolution: 'direct', goal_result: 'not_achieved',
      activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' },
      operations: [], check: null
    });
    assert.equal(validateTurnStepPlan({
      schema: 'turn_step_plan_v1', request_id: input.request_id,
      committed_state_version: input.committed_state_version,
      working_revision: input.working_revision, step_index: input.step_index,
      interpretation: { player_goal: input.root_player_action,
        grounded_attempt: 'разыграть невозможное действие на месте',
        ...mappings.impossible_absent_fantastical_referent.interpretation },
      resolution: mappings.impossible_absent_fantastical_referent.resolution,
      goal_result: mappings.impossible_absent_fantastical_referent.goal_result,
      activity: mappings.impossible_absent_fantastical_referent.activity,
      operations: mappings.impossible_absent_fantastical_referent.operations,
      check: mappings.impossible_absent_fantastical_referent.check,
      continuation: null, clarification: null,
      reason_code: 'absent_fantastical_referent',
      reason: 'В мире нет такого объекта.'
    }, { request: input }).ok, true);
    assert.deepEqual(mappings.visible_general_look, {
      interpretation: { adaptation: 'literal' },
      resolution: 'direct', goal_result: 'achieved',
      activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
      operations: [], check: null
    });
    assert.equal(mappings.ordinary_scene_seed, undefined);
    assert.match(prompt,
      /ordinary_resolution\.scene_seed_available is true[\s\S]*candidate-free scene seed/u);
    assert.deepEqual(mappings.spatial_grounded_look, {
      resolution: 'domain_request', goal_result: 'pending',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operations: [{ op: 'request_discovery',
        actor_ref: '<copy current actor ref from request>',
        discovery_kind: 'look',
        target_refs: ['<copy spatial_semantic.position_ref from request>'],
        query: '<brief look query>' }],
      check: null
    });
    assert.match(prompt, /use only request or operation-contract enum values/u);
    assert.match(prompt, /do not substitute or invent refs/u);
  });

test('turn step planner offers scene seed instead of direct look while unseeded',
  async () => {
    let prompt;
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run(call) {
        prompt = call.messages[0].content;
        return { output: output() };
      }
    } });
    await model(request({ player_safe_state: { position: {
      location_ref: 'location:shore' }, ordinary_resolution: {
      discovery_available: true, container_resolution_available: false,
      scene_seed_available: true } } }));
    const mappings = JSON.parse(prompt.match(
      /Use these mappings[^\n]*:\n(\{[^\n]+?\}) Do not use obsolete keys/u
    )[1]);
    assert.equal(mappings.visible_general_look, undefined);
    assert.deepEqual(mappings.ordinary_scene_seed, {
      interpretation: { adaptation: 'literal' },
      resolution: 'domain_request', goal_result: 'pending',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operations: [{ op: 'request_discovery',
        actor_ref: '<copy current actor ref from request>',
        discovery_kind: 'look',
        target_refs: ['<copy current position ref from request>'],
        query: 'общий вид ближайшего окружения' }],
      check: null
    });
  });

test('turn step planner prompt has stated-goal adaptation triage',
  async () => {
    let prompt;
    const model = createLowerDvinaTraceTurnStepModel({
      roleRunner: { async run(call) {
        prompt = call.messages[0].content;
        return { output: output() };
      } }
    });
    await model(request());
    assert.match(prompt, /adaptation by the stated goal, not whether the actor can pantomime it/u);
    assert.match(prompt, /First: an absent fantastical required referent means make_believe/u);
    assert.match(prompt, /Otherwise: real or ordinary referents with a physically limited action mean reality_limited/u);
    assert.match(prompt, /Otherwise: literal/u);
    assert.match(prompt, /ordinary unknown or absent referent is not thereby fantastical; preserve existing discovery\/domain flow/u);
  });
