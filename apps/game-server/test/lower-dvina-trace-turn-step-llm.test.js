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
import {
  createLowerDvinaTraceNarrationService,
  createLowerDvinaTraceNpcSemanticModel,
  createLowerDvinaTracePlayerConversationModel,
  createLowerDvinaTraceTurnStepModel
} from '../src/runtime/lower-dvina-trace-phase-2-llm.js';
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
    'A reality_limited physical attempt uses the mapped moderate effort',
    'absent spaceship is make_believe',
    'create no spaceship or other entity',
    'do not move the actor'
  ]) assert.equal(prompt.includes(phrase), true, phrase);
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
  assert.match(prompt, /Do not use obsolete keys interpretation\.actor_id/u);
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
    await model(request());
    const mappings = JSON.parse(prompt.match(
      /Use these mappings[^\n]*:\n(\{[^\n]+\})/u
    )[1]);
    assert.deepEqual(mappings.reality_limited_physical_attempt, {
      interpretation: { adaptation: 'reality_limited' },
      resolution: 'direct', goal_result: 'not_achieved',
      activity: { owner: 'semantic', duration_class: 'moment', effort: 'moderate' },
      operations: [], check: null
    });
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
    }
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
  assert.equal(shape.process_outcome, input.allowed_outcomes[0]);
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
                  ? 'reality_limited physical attempt uses the mapped moderate effort'
                  : 'absent spaceship is make_believe'), true);
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
  assert.equal(seen.messages[0].content.includes('Repair only the listed structural errors'), true);
  assert.equal(JSON.stringify(payload).includes('invalid_output'), false);
  assert.equal(JSON.stringify(payload).includes('turn_step_repair_context_v1'), false);
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

test('narration audit sends compact contract example with sufficient exact role budget', async () => {
  const calls = [];
  const narration = createLowerDvinaTraceNarrationService({
    roleRunner: { async run(call) {
      calls.push(call);
      return { output: call.role_id === 'legacy.narrator.dossier'
        ? { version: 1, schema: 'narration_output', output_id: 'out-1', prose: 'Двор тих.', action_options: [], used_references: [], self_check: {} }
        : { version: 1, schema: 'narration_audit', pass: true, concerns: [], evidence: ['visible facts only'] } };
    } }
  });
  await narration.run({
    version: 1, schema: 'narration_request', request_id: 'narration-1',
    surface: 'turn', visible_context: {}
  });
  const audit = calls[1];
  assert.equal(audit.role_id, 'legacy.narrator.audit');
  assert.deepEqual(audit.overrides, { temperature: 0, maxTokens: 1800 });
  const example = JSON.parse(audit.messages[0].content.match(
    /Complete valid passing example: (\{[^.]+\})\./u
  )[1]);
  assert.deepEqual(example, {
    version: 1, schema: 'narration_audit', pass: true,
    concerns: [], evidence: ['visible facts only']
  });
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
    allowed_outcomes: ['no_effect', 'continue', 'complete']
  };
}
