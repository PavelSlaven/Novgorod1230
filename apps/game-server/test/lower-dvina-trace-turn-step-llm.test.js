import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requestTurnStepPlan,
  validateTurnStepPlan,
  validateWorldProcessStepPlan
} from '@rus/turn';
import {
  validateConversationContributionPlan,
  validatePlayerConversationContributionPlan
} from '@rus/npc-runtime';
import { validateNarrationOutput } from '@rus/narration';
import {
  createLowerDvinaTraceNarrationService,
  createLowerDvinaTraceNpcSemanticModel,
  createLowerDvinaTracePlayerConversationModel,
  createLowerDvinaTraceTurnStepModel
} from '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { requestTurnStepPlanWithRepair } from
  '../../../packages/turn/src/turn-step-loop.js';
import { createLowerDvinaTraceWorldProcessStepModel } from
  '../src/runtime/lower-dvina-trace-world-process-llm.js';

function request(overrides = {}) {
  return {
    schema: 'turn_step_request_v1',
    request_id: 'turn-request-42',
    root_turn_id: 'turn-42',
    committed_state_version: 17,
    working_revision: 0,
    step_index: 1,
    max_internal_steps: 8,
    root_player_action: 'открываю сундук',
    remaining_intent: 'открыть сундук',
    completed_steps: [],
    actor: { actor_ref: 'actor_mikula' },
    player_safe_state: { visible_entities: [{ entity_ref: 'chest_1' }] },
    ...overrides
  };
}

function output() {
  return {
    schema: 'turn_step_plan_v1',
    request_id: 'turn-request-42'
  };
}

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
    'never grant an impossible result',
    'create an absent referent',
    'move the actor for make_believe',
    'Classify interpretation.adaptation by the stated goal'
  ]) assert.equal(prompt.includes(phrase), true, phrase);
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
  assert.match(prompt, /Sentence boundary is a continuation boundary[\s\S]*first independently executable sentence[\s\S]*later non-empty sentences[\s\S]*preserve all of them in continuation[\s\S]*goal_result pending[\s\S]*never let one selected operation consume them[\s\S]*Only clauses inside the same sentence may form one composite operation[\s\S]*explicitly represents their single event[\s\S]*Every domain_request uses goal_result pending[\s\S]*continuation is present, goal_result must be pending/u);
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
  assert.match(prompt, /continuation\.next_step[\s\S]*two fields[\s\S]*remaining_intent[\s\S]*depends_on_refs is \[\][\s\S]*copied player-safe refs[\s\S]*no other fields/u);
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

test('conversation prompts supply complete shapes and request-bound mappings',
  async () => {
    const calls = [];
    const roleRunner = { async run(call) {
      calls.push(call);
      return { output: {} };
    } };
    await createLowerDvinaTracePlayerConversationModel({ roleRunner })({});
    await createLowerDvinaTraceNpcSemanticModel({ roleRunner })({});

    const [player, npc] = calls.map(({ messages }) => messages[0].content);
    const playerShape = JSON.parse(player.match(
      /Use this complete JSON shape;[^\n]*:\n(\{[^\n]+\})/u
    )[1]);
    const npcShape = JSON.parse(npc.match(
      /Use this complete JSON shape;[^\n]*:\n(\{[^\n]+\})/u
    )[1]);
    const mappings = JSON.parse(player.match(
      /Use these mappings for matching cases:\n(\{[^\n]+\})/u
    )[1]);
    assert.equal(playerShape.schema,
      'player_conversation_contribution_plan_v1');
    assert.equal(playerShape.input_mode, '<verbatim or intent_paraphrase>');
    assert.deepEqual(Object.keys(playerShape), [
      'schema', 'request_id', 'conversation_id', 'state_version', 'speaker_ref',
      'input_mode', 'contribution_kind', 'primary_addressee_ref',
      'intended_addressee_refs', 'affected_actor_refs', 'speech',
      'interpretation', 'resolution', 'activity', 'supporting_operations',
      'check', 'handoff'
    ]);
    assert.equal(npcShape.schema, 'conversation_contribution_plan_v1');
    assert.deepEqual(Object.keys(npcShape), [
      'schema', 'request_id', 'boundary_id', 'conversation_id', 'exchange_id',
      'state_version', 'speaker_ref', 'contribution_kind',
      'primary_addressee_ref', 'intended_addressee_refs',
      'affected_actor_refs', 'speech', 'interpretation', 'resolution',
      'activity', 'supporting_operations', 'check', 'handoff', 'reason'
    ]);
    assert.deepEqual(mappings.ordinary_speech, {
      contribution_kind: 'speech', interpretation: { adaptation: 'literal' },
      resolution: 'automatic', supporting_operations: [], check: null,
      handoff: null
    });
    const nonSpeechKinds = [
      'silence', 'leave_conversation', 'action_handoff', 'combat_handoff'
    ];
    assert.deepEqual(nonSpeechKinds.map((kind) =>
      mappings[kind].contribution_kind), nonSpeechKinds);
    for (const kind of nonSpeechKinds) {
      assert.equal(mappings[kind].contribution_kind, kind);
      assert.equal(mappings[kind].speech, null);
      assert.deepEqual(mappings[kind].supporting_operations, []);
      assert.equal(mappings[kind].check, null);
    }
    assert.equal(mappings.action_handoff.handoff.kind, 'actor_step');
    assert.equal(mappings.combat_handoff.handoff.kind, 'combat');
    assert.equal(mappings.social_check.resolution, 'check_required');
    assert.deepEqual(Object.keys(mappings.social_check.check.outcomes), [
      'clean_success', 'success', 'success_with_cost',
      'failure_with_consequence', 'severe_failure'
    ]);
    for (const prompt of [player, npc]) {
      assert.match(prompt, /emit_interaction/u);
      assert.match(prompt, /operation_contract/u);
      assert.match(prompt, /check_required/u);
      assert.match(prompt, /do not invent or substitute refs/u);
    }
    assert.match(player, /input_mode verbatim/u);
    assert.match(npc, /decision_scope allowed check refs/u);
    for (const prompt of [player, npc]) {
      assert.match(prompt, /speech: null/u);
      assert.match(prompt, /refs\/handoff only from request contract/u);
      assert.match(prompt, /greet, farewell, question, answer, inform/u);
      assert.match(prompt, /supporting_operations must be \[required_supporting_operation\]/u);
    }
    assert.match(npc, /required_check\.attribute_ref, skill_ref, and difficulty_band/u);
  });

test('conversation non-speech mappings have validator-valid shapes', () => {
  const variants = [{ kind: 'silence', handoff: null }, {
    kind: 'leave_conversation', handoff: null
  }, {
    kind: 'action_handoff', handoff: { kind: 'actor_step', intent: 'continue' }
  }, {
    kind: 'combat_handoff', handoff: {
      kind: 'combat', intent: 'fight',
      target_actor_refs: [{ entity_kind: 'npc', entity_id: 'npc-1' }]
    }
  }];
  for (const { kind, handoff } of variants) {
    const body = {
      contribution_kind: kind, primary_addressee_ref: null,
      intended_addressee_refs: [], affected_actor_refs: [], speech: null,
      interpretation: { intent: kind, grounded_contribution: kind,
        adaptation: 'literal' }, resolution: 'automatic',
      activity: { duration_class: 'brief', effort: 'none' },
      supporting_operations: [], check: null, handoff
    };
    assert.equal(validatePlayerConversationContributionPlan({
      schema: 'player_conversation_contribution_plan_v1', request_id: 'request-1',
      conversation_id: 'conversation-1', state_version: 1,
      speaker_ref: { entity_kind: 'player_character', entity_id: 'player-1' },
      input_mode: 'intent_paraphrase', ...body
    }), true, kind);
    assert.equal(validateConversationContributionPlan({
      schema: 'conversation_contribution_plan_v1', request_id: 'request-1',
      boundary_id: 'boundary-1', conversation_id: 'conversation-1',
      exchange_id: 'exchange-1', state_version: 1,
      speaker_ref: { entity_kind: 'npc', entity_id: 'npc-1' }, ...body,
      reason: 'NPC chooses this contribution.'
    }), true, kind);
  }
});

test('world process prompt supplies complete bounded plan shape', async () => {
  let prompt;
  const input = worldProcessRequest();
  const model = createLowerDvinaTraceWorldProcessStepModel({
    roleRunner: { async run(call) {
      prompt = call.messages[0].content;
      return { output: { schema: 'world_process_step_plan_v1' } };
    } }
  });
  await model(input);
  const shape = JSON.parse(prompt.match(
    /Use this complete valid shape:\n(\{[^\n]+\})/u
  )[1]);
  assert.equal(validateWorldProcessStepPlan(shape, input), true);
  assert.deepEqual(Object.keys(shape), [
    'schema', 'request_id', 'process_ref', 'process_state_version',
    'interpretation', 'process_outcome', 'affected_refs', 'fact_changes',
    'reason_code'
  ]);
  assert.equal(shape.process_outcome, input.outcome_contract[0].process_outcome);
  assert.equal(shape.reason_code, input.outcome_contract[0].reason_code);
  assert.deepEqual(shape.fact_changes, []);
  assert.match(prompt, /affected_refs may contain only unique refs supplied by request/u);
});

test('impossible jump and absent spaceship plans stay grounded model contracts',
  async (t) => {
    const cases = [{
      name: 'jump',
      action: 'Прыгну очень высоко и осмотрю окрестности как птица',
      adaptation: 'reality_limited',
      groundedAttempt:
        'подпрыгнуть на реальную человеческую высоту и попытаться осмотреться',
      effort: 'moderate',
      reasonCode: 'goal_exceeds_human_jump'
    }, {
      name: 'spaceship',
      action: 'Сажусь в космический корабль и улетаю',
      adaptation: 'make_believe',
      groundedAttempt: 'изобразить посадку в корабль и полёт на месте',
      effort: 'light',
      reasonCode: 'absent_spaceship_make_believe'
    }];
    for (const current of cases) {
      await t.test(current.name, async () => {
        const input = request({
          root_player_action: current.action,
          remaining_intent: current.action
        });
        const model = createLowerDvinaTraceTurnStepModel({
          roleRunner: {
            async run(call) {
              assert.equal(call.messages[0].content.includes(
                current.name === 'jump'
                  ? 'real or ordinary referents with a physically limited action mean reality_limited'
                  : 'absent fantastical required referent means make_believe'), true);
              return { output: groundedPlan(input, current) };
            }
          }
        });
        const plan = await requestTurnStepPlan({
          request: input,
          turnStepModel: model
        });
        assert.equal(plan.interpretation.adaptation, current.adaptation);
        assert.equal(plan.interpretation.grounded_attempt,
          current.groundedAttempt);
        assert.equal(plan.goal_result, 'not_achieved');
        assert.deepEqual(plan.operations, []);
      });
    }
  });

test('repair role receives only the original request and structural errors', async () => {
  let seen;
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: {
      async run(call) {
        seen = call;
        return { output: output() };
      }
    }
  });
  const input = request();
  const structuralErrors = [{
    path: '$.operations',
    code: 'resolution',
    message: 'domain_request requires exactly one domain operation'
  }];
  await model(input, {
    schema: 'turn_step_repair_context_v1',
    attempt: 2,
    structural_errors: structuralErrors,
    invalid_output: { forbidden: true }
  });
  assert.equal(seen.role_id, 'turn_step_planner_repair');
  assert.deepEqual(seen.overrides, { temperature: 0, maxTokens: 4000 });
  const payload = JSON.parse(seen.messages[1].content);
  assert.deepEqual(Object.keys(payload).sort(), ['request', 'structural_errors']);
  assert.deepEqual(payload.request, input);
  assert.deepEqual(payload.structural_errors, structuralErrors);
  assert.equal(seen.messages[0].content.includes('Repair only listed validation errors'), true);
  assert.equal(seen.messages[0].content.includes(
    'direct semantic plan limited to visible facts and physical reality'), true);
  assert.equal(JSON.stringify(payload).includes('invalid_output'), false);
  assert.equal(JSON.stringify(payload).includes('turn_step_repair_context_v1'), false);
});

test('primary JSON parse failure uses one structural repair only', async () => {
  const calls = [];
  const input = request();
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: { async run(call) {
      calls.push(call);
      if (calls.length === 1) throw Object.assign(new Error('bad JSON'), {
        code: 'json_parse_failed'
      });
      return { output: groundedPlan(input, {
        adaptation: 'literal', groundedAttempt: 'открыть сундук',
        effort: 'light', reasonCode: 'repaired'
      }) };
    } }
  });
  const result = await requestTurnStepPlanWithRepair({
    request: input, turnStepModel: model
  });
  assert.equal(result.repaired, true);
  assert.deepEqual(calls.map(({ role_id }) => role_id), [
    'turn_step_planner', 'turn_step_planner_repair'
  ]);
  const repairPayload = JSON.parse(calls[1].messages[1].content);
  assert.equal(JSON.stringify(repairPayload).includes('bad JSON'), false);
  assert.equal(repairPayload.structural_errors.length > 0, true);
});

test('planner errors other than primary JSON parsing do not repair', async () => {
  let calls = 0;
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: { async run() {
      calls += 1;
      throw Object.assign(new Error('provider failed'), { code: 'http_500' });
    } }
  });
  await assert.rejects(requestTurnStepPlanWithRepair({
    request: request(), turnStepModel: model
  }), { code: 'http_500' });
  assert.equal(calls, 1);
});

test('invalid repaired plan does not receive a second repair', async () => {
  const calls = [];
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: { async run(call) {
      calls.push(call);
      if (calls.length === 1) throw Object.assign(new Error('bad JSON'), {
        code: 'json_parse_failed'
      });
      return { output: {} };
    } }
  });
  await assert.rejects(requestTurnStepPlanWithRepair({
    request: request(), turnStepModel: model
  }), (error) => {
    assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
    assert.equal(error.details.repair_attempted, true);
    return true;
  });
  assert.deepEqual(calls.map(({ role_id }) => role_id), [
    'turn_step_planner', 'turn_step_planner_repair'
  ]);
});

test('turn step model fails closed for missing runner or non-object output', async () => {
  assert.throws(
    () => createLowerDvinaTraceTurnStepModel(),
    { code: 'TRACE_PHASE_2_DEPENDENCY_MISSING' }
  );
  for (const invalid of [null, 'not-json-object', []]) {
    const model = createLowerDvinaTraceTurnStepModel({
      roleRunner: { async run() { return { output: invalid }; } }
    });
    await assert.rejects(
      () => model(request()),
      { code: 'TRACE_PHASE_2_DEPENDENCY_MISSING' }
    );
  }
});

test('narration uses one current writer role and one targeted repair at most', async () => {
  const calls = [];
  const repairedOutput = { version: 1, schema: 'narration_output', output_id: 'narration-1', prose: 'Двор тих.', action_options: [], used_references: [], self_check: {} };
  const narration = createLowerDvinaTraceNarrationService({
    roleRunner: { async run(call) {
      calls.push(call);
      return { output: call.role_id === 'gameplay_narrator'
        ? {}
        : call.role_id === 'gameplay_narrator_format_repair'
          ? repairedOutput
        : null };
    } }
  });
  await narration.run({
    version: 1, schema: 'narration_request', request_id: 'narration-1',
    surface: 'turn', visible_context: {
      version: 1, schema: 'visible_context_package', visible_scene: 'Двор тих.',
      visible_changes: [], sensory_details: [], visible_npc: [], visible_objects: [],
      known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: []
    }
  });
  const shape = '{"version":1,"schema":"narration_output","output_id":"<request_id>","prose":"<visible-only prose>","action_options":[],"used_references":[],"self_check":{}}';
  const repairShape = shape.replace('<request_id>', '<request.request_id>');
  assert.equal(calls[0].messages[0].content.includes(shape), true);
  assert.equal(calls[0].messages[0].content.includes('Copy request_id exactly into output_id'), true);
  assert.equal(calls[0].scope, 'turn_runtime');
  assert.equal(calls[0].role_id, 'gameplay_narrator');
  assert.equal(calls[1].role_id, 'gameplay_narrator_format_repair');
  assert.equal(calls[1].messages[0].content.includes(repairShape), true);
  assert.equal(calls[1].messages[0].content.includes('request.visible_context'), true);
  assert.equal(validateNarrationOutput(repairedOutput).ok, true);
  assert.equal(calls.length, 2);
});

function groundedPlan(input, current) {
  return {
    schema: 'turn_step_plan_v1',
    request_id: input.request_id,
    committed_state_version: input.committed_state_version,
    working_revision: input.working_revision,
    step_index: input.step_index,
    interpretation: {
      player_goal: input.root_player_action,
      grounded_attempt: current.groundedAttempt,
      adaptation: current.adaptation
    },
    resolution: 'direct',
    goal_result: 'not_achieved',
    activity: {
      owner: 'semantic',
      duration_class: 'moment',
      effort: current.effort
    },
    operations: [],
    check: null,
    continuation: null,
    clarification: null,
    reason_code: current.reasonCode,
    reason: 'Фактическая попытка не создаёт невозможный результат.'
  };
}

function worldProcessRequest() {
  return {
    schema: 'world_process_step_request_v1', request_id: 'world-process-42',
    party_state_version: 7, process_state_version: 2,
    process_mode: 'local_exact', process_kind: 'fire',
    process: { process_ref: 'fire:1', scope_ref: 'shore:1',
      causal_basis_ref: 'hearth:1', status: 'active',
      started_at: { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' },
      next_boundary_at: { whole_minutes: '1', subminute_numerator: '0', subminute_denominator: '1' },
      fuel_bindings: [{ fuel_ref: 'wood:1', fuel_class: 'ordinary_solid_fuel_unit' }] },
    current_timestamp: { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' },
    trigger: 'actor_affected', subject_state: { source_refs: ['water:1'] },
    environment_state: { scope_ref: 'shore:1' },
    outcome_contract: [
      { process_outcome: 'no_effect', reason_code: 'affect_no_effect',
        applicability: 'input does not materially change process' },
      { process_outcome: 'continue', reason_code: 'affect_continues_process',
        applicability: 'input changes process without ending it' },
      { process_outcome: 'complete', reason_code: 'affect_completes_process',
        applicability: 'input ends process' }
    ]
  };
}
