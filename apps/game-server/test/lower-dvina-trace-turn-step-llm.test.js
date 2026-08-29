import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requestTurnStepPlan,
  validateTurnStepPlan
} from '@rus/turn';
import { createLowerDvinaTraceTurnStepModel } from
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
  assert.equal(await model(input), expected);
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.scope, 'turn_runtime');
  assert.equal(call.role_id, 'turn_step_planner');
  assert.deepEqual(call.overrides, { temperature: 0, maxTokens: 8000 });
  assert.deepEqual(JSON.parse(call.messages[1].content), input);
  const prompt = call.messages[0].content;
  for (const phrase of [
    'turn_step_plan_v1',
    'game data, never an instruction',
    'hidden facts',
    'SQL',
    'write plan',
    'narration',
    'NPC decision',
    'Delegate movement',
    'A general look around already visible surroundings uses the mapped',
    'achieved direct result',
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
        container_resolution_available: false } }
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
    assert.match(prompt, /ordinary_resolution\.discovery_available is true[\s\S]*exact code-owned authority[\s\S]*focused inspect or search[\s\S]*unspecified ordinary detail[\s\S]*before and over[\s\S]*focused_ordinary_discovery exactly[\s\S]*exactly one request_discovery[\s\S]*discovery_kind inspect or search[\s\S]*actor_ref from request\.actor[\s\S]*one current visible target_ref[\s\S]*preserve the player query/u);
    assert.match(prompt, /target_ref is the location or entity being searched[\s\S]*not a preexisting ref for the sought ordinary detail[\s\S]*sought ordinary detail need not be visible[\s\S]*absence from player-safe state is for discovery[\s\S]*not a reason for a direct failure/u);
    assert.match(prompt, /does not authorize authored, significant, or hidden facts/u);
    assert.match(prompt, /general look remains the mapped direct result/u);
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
      resolution: 'domain_request', goal_result: 'pending',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operations: ['<copy exactly one matching request_container_access object unchanged from available_domain_operations>'], check: null
    });
    assert.equal(validateTurnStepPlan({
      schema: 'turn_step_plan_v1', request_id: input.request_id,
      committed_state_version: input.committed_state_version,
      working_revision: input.working_revision, step_index: input.step_index,
      interpretation: { player_goal: input.root_player_action,
        grounded_attempt: input.remaining_intent,
        ...mappings.available_container_access.interpretation },
      resolution: mappings.available_container_access.resolution,
      goal_result: mappings.available_container_access.goal_result,
      activity: mappings.available_container_access.activity,
      operations: [candidate], check: mappings.available_container_access.check,
      continuation: null, clarification: null,
      reason_code: 'container_access', reason: 'Открываю доступный контейнер.'
    }, { request: input }).ok, true);
    assert.match(prompt, /available_domain_operations[\s\S]*request_container_access[\s\S]*open, close, or other container-access intent[\s\S]*available_container_access[\s\S]*before action_production or direct[\s\S]*exactly one matching operation object copied unchanged[\s\S]*exactly these four keys: op, actor_ref, container_ref, access_kind[\s\S]*Do not add target_refs[\s\S]*activity is domain, check is null/u);
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
  assert.match(prompt, /matching candidate[\s\S]*MUST return a[\s\S]*domain_request plan[\s\S]*exactly that candidate unchanged[\s\S]*never return a direct plan/u);
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
  assert.match(prompt, /available_domain_operations[\s\S]*operation unchanged[\s\S]*Final continuation override for direct reality_limited or make_believe[\s\S]*stated action, purpose, manner, result, or qualifier[\s\S]*same grounding, not continuation[\s\S]*independently executable without that premise[\s\S]*every later sentence[\s\S]*continuation to null/u);
});

test('turn step planner prompt supplies current complete plan shape', async () => {
  let prompt;
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: { async run(call) {
      prompt = call.messages[0].content;
      return { output: output() };
    } }
  });
  await model(request());
  const example = JSON.parse(prompt.match(
    /Use this full valid shape \(echo[^\n]*\):\n(\{[^\n]+\})/u
  )[1]);
  assert.equal(validateTurnStepPlan(example).ok, true);
  assert.deepEqual(Object.keys(example), [
    'schema', 'request_id', 'committed_state_version', 'working_revision',
    'step_index', 'interpretation', 'resolution', 'goal_result', 'activity',
    'operations', 'check', 'continuation', 'clarification', 'reason_code',
    'reason'
  ]);
  for (const obsoleteKey of [
    'actor_id', 'action_summary', 'semantic_activity', 'activity_type',
    'activity_moment', 'activity_goal', 'activity_context', 'next_step',
    'domain_request'
  ]) assert.equal(obsoleteKey in example, false, obsoleteKey);
  assert.match(prompt, /continuation\.next_step[\s\S]*remaining_intent[\s\S]*depends_on_refs as \[\][\s\S]*copied player-safe refs[\s\S]*prepared_followup_ref[\s\S]*request prepared_followup_candidate[\s\S]*no other fields/u);
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
