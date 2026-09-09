import assert from 'node:assert/strict';
import test from 'node:test';
import { requestTurnStepPlan, validateTurnStepPlan } from '@rus/turn';
import { requestTurnStepPlanWithRepair } from
  '../../../packages/turn/src/turn-step-loop.js';
import { createTurnStepDomainOwnerPreflight } from
  '../../../packages/turn/src/turn-step-domain-owner-preflight.js';
import { createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import {
  groundedPlan,
  output,
  request
} from './lower-dvina-trace-turn-step-llm-test-helpers.js';

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

test('repair role receives original output, request, and structural errors', async () => {
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
    original_output: { resolution: 'domain_request', operation_choice: 'missing' }
  });
  assert.equal(seen.role_id, 'turn_step_planner_repair');
  assert.deepEqual(seen.overrides, { temperature: 0, maxTokens: 20_000 });
  const payload = JSON.parse(seen.messages[1].content);
  assert.deepEqual(Object.keys(payload).sort(), ['original_output', 'request', 'structural_errors']);
  assert.deepEqual(payload.original_output,
    { resolution: 'domain_request', operation_choice: 'missing' });
  assert.deepEqual(payload.request, input);
  assert.deepEqual(payload.structural_errors, structuralErrors);
  assert.equal(seen.messages[0].content.includes('Repair only listed validation errors'), true);
  assert.match(seen.messages[0].content,
    /only error is.*activity\.owner[\s\S]*action production requires semantic activity[\s\S]*keep domain_request and the original action_production operation[\s\S]*duration_class and effort[\s\S]*Never clear operations or switch to direct/u);
  assert.equal(seen.messages[0].content.includes(
    'owner absence is not evidence of impossibility or fantasy'), true);
  assert.equal(seen.messages[0].content.includes(
    'Never combine move_entity and action_production in one plan'), true);
  assert.equal(seen.messages[0].content.includes(
    'semantic grounding wins: do not move the discarded ref'), true);
  assert.equal(seen.messages[0].content.includes(
    '{"op":"move_entity","entity_ref":"<grounded source ref>","placement"'), true);
  assert.equal(seen.messages[0].content.includes(
    'never preserve a ref whose descriptors identify another object'), true);
  assert.equal(seen.messages[0].content.includes(
    'For action_production_identity_grounding'), true);
  assert.equal(seen.messages[0].content.includes(
    'remove the unavailable domain operation instead of preserving it'), true);
  assert.equal(seen.messages[0].content.includes(
    'For continuation_progress, preserve the original action order'), true);
  assert.equal(seen.messages[0].content.includes(
    'Equality between continuation.remaining_intent and request.remaining_intent'), true);
  assert.equal(seen.messages[0].content.includes(
    'does not prove that the selected operation consumed none of the intent'), true);
  assert.equal(seen.messages[0].content.includes(
    'keep it and remove that covered event'), true);
  assert.equal(seen.messages[0].content.includes(
    'never return the discarded later operation in operations'), true);
  assert.equal(seen.messages[0].content.includes(
    'plus any preceding ownerless ambient utterance'), true);
  assert.equal(seen.messages[0].content.includes(
    'preserve only independent actions after it'), true);
  assert.equal(seen.messages[0].content.includes(
    'Re-plan only fields named by structural_errors; do not invent operations or refs.'), true);
  assert.equal(seen.messages[0].content.includes(
    'restore the matching supplied semantic mapping'), true);
  assert.equal(seen.messages[0].content.includes(
    'one domain operation exactly equal to a supplied code-owned choice'), true);
  assert.equal(seen.messages[0].content.includes(
    'never substitute a broad authored operation choice'), true);
  assert.equal(seen.messages[0].content.includes(
    'For ordinary_discovery_query_identity follow the required ordinary discovery repair below'), true);
  assert.equal(JSON.stringify(payload).includes('turn_step_repair_context_v1'), false);
});

test('ordinary discovery repair requires a lossless non-overlapping split',
  async () => {
    const remainingIntent = 'Осмотреть плащ и затем уйти с берега.';
    let prompt;
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run(call) {
        prompt = call.messages[0].content;
        return { output: output() };
      }
    } });
    await model(request({ remaining_intent: remainingIntent }), {
      original_output: {}, structural_errors: [{
        path: '$.operations.0.query',
        code: 'ordinary_discovery_query_identity'
      }]
    });
    assert.match(prompt,
      /Required ordinary discovery repair:[\s\S]*without omission or overlap[\s\S]*whole intent is one focused inspect or search[\s\S]*set continuation to null[\s\S]*independent later action remains[\s\S]*exact trailing uncovered text[\s\S]*Never repeat continuation text inside query/u);
    assert.match(prompt, /Осмотреть плащ и затем уйти с берега\./u);
  });

test('repair drops a field rejected as an additional property', async () => {
  const input = request();
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run() { return { output: output() }; }
  } });
  const plan = await model(input, {
    original_output: { ...output(), interpretation: {
      ...output().interpretation, adaptation_type: 'literal' } },
    structural_errors: [{ path: '$.interpretation.adaptation_type',
      code: 'additional_property', message: 'is forbidden' }]
  });
  assert.equal('adaptation_type' in plan.interpretation, false);
});

test('unrelated repair cannot invent a code-owned operation selector',
  async () => {
    const operation = { op: 'request_discovery', actor_ref: 'actor_mikula',
      discovery_kind: 'inspect', target_refs: ['location:wreck'],
      query: 'Подробно осмотреть место крушения' };
    const generic = { ...operation,
      query: 'Осмотреть берег в поисках сухого топлива' };
    const input = request({ remaining_intent: generic.query,
      available_domain_operations: [operation] });
    const original = { ...output(), interpretation: {
      player_goal: generic.query, adaptation: 'literal'
    }, resolution: 'domain_request', operations: [generic] };
    delete original.operation_choice;
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run() { return { output: { ...original,
        interpretation: { ...original.interpretation,
          grounded_attempt: generic.query },
        operations: [operation],
        operation_choice: 'domain_operation_1_request_discovery_inspect',
        operation_family: 'request_discovery' } }; }
    } });
    const repaired = await model(input, { original_output: original,
      structural_errors: [{ path: '$.interpretation.grounded_attempt',
        code: 'required', message: 'is required' }] });
    assert.deepEqual(repaired.operations, [generic]);
    assert.equal(Object.hasOwn(repaired, 'operation_choice'), false);
    assert.equal(Object.hasOwn(repaired, 'operation_family'), false);
  });

test('unrelated repair preserves the selected exact operation DTO', async () => {
  const exact = { op: 'request_discovery', actor_ref: 'actor_mikula',
    discovery_kind: 'inspect', target_refs: ['location:wreck'],
    query: 'Подробно осмотреть место крушения' };
  const unrelated = { ...exact, query: 'Искать обычное топливо' };
  const input = request({ available_domain_operations: [exact] });
  const original = { ...output(), interpretation: {
    player_goal: input.root_player_action, adaptation: 'literal'
  }, resolution: 'domain_request', operations: [exact] };
  delete original.operation_choice;
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run() { return { output: { ...original,
      interpretation: { ...original.interpretation,
        grounded_attempt: input.remaining_intent },
      operations: [unrelated], operation_choice: null } }; }
  } });
  const repaired = await model(input, { original_output: original,
    structural_errors: [{ path: '$.interpretation.grounded_attempt',
      code: 'required', message: 'is required' }] });
  assert.deepEqual(repaired.operations, [exact]);
  assert.equal(Object.hasOwn(repaired, 'operation_choice'), false);
  assert.equal(Object.hasOwn(repaired, 'copied_operation_choice'), false);
  assert.equal(validateTurnStepPlan(repaired, { request: input }).ok, true);
});

test('grounding repair keeps the model semantic result unchanged',
  async () => {
    const intent = 'Подбираю доску и делаю из неё опору.';
    const input = request({ root_player_action: intent,
      remaining_intent: intent });
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run() { return { output: {
        ...output(), resolution: 'domain_request',
        interpretation: { player_goal: intent,
          grounded_attempt: 'Осмотреть доску.', adaptation: 'literal' },
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [{ op: 'request_discovery', actor_ref: 'actor_mikula',
          discovery_kind: 'inspect', target_refs: ['location:shore'],
          query: 'доска' }],
        continuation: { remaining_intent: 'делаю из неё опору',
          depends_on_refs: [] }, operation_choice: null
      } }; }
    } });
    const plan = await model(input, {
      structural_errors: [{ code: 'source_semantic_grounding' }],
      original_output: {}
    });
    assert.equal(plan.continuation.remaining_intent, 'делаю из неё опору');
    assert.equal(plan.interpretation.grounded_attempt,
      'Осмотреть доску.');
  });

test('assembler derives redundant A1 carrier refs from semantic source refs',
  async () => {
    const input = request();
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run() { return { output: {
        ...output(), resolution: 'domain_request',
        activity: { owner: 'semantic', duration_class: 'brief',
          effort: 'light' }, operations: [{ op: 'request_item_use',
          actor_ref: 'actor_mikula', item_ref: 'wrong', use_kind: 'other',
          target_refs: ['also-wrong'], action_production: {
            source_refs: ['source', 'binding'], tool_refs: ['tool'],
            requested_output_count: null, identity_mode: 'preserve_source',
            origin: null, result_class: 'ordinary_physical_result',
            material_extent: 'whole', result_descriptor: {
              display_name: null, physical_description: 'bound support',
              qualitative_facts: ['bound'], removed_physical_fact_refs: [],
              inscription_text: null, physical_form: 'long',
              source_fact_delta: null }, output_class: 'ordinary_mundane'
          } }], operation_choice: null
      } }; }
    } });
    const plan = await model(input);
    assert.equal(plan.operations[0].item_ref, 'source');
    assert.deepEqual(plan.operations[0].target_refs, ['binding', 'tool']);
  });

test('one repair receives structural and semantic grounding errors together',
  async () => {
    const calls = [];
    const input = request();
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run(call) {
        calls.push(call);
        if (calls.length > 1) return { output: output() };
        return { output: { ...output(), resolution: 'domain_request',
          activity: { owner: 'domain', duration_class: null, effort: null },
          operations: [{ op: 'request_item_use', actor_ref: 'actor_mikula',
            item_ref: 'knife', use_kind: 'other', target_refs: [],
            action_production: { source_refs: ['knife'], tool_refs: [],
              requested_output_count: null, identity_mode: 'preserve_source',
              origin: null, result_class: 'ordinary_physical_result',
              material_extent: null, result_descriptor: { display_name: null,
                physical_description: 'настил из досок', qualitative_facts: [],
                removed_physical_fact_refs: [], inscription_text: null,
                physical_form: null, source_fact_delta: null },
              output_class: 'ordinary_mundane' } }], operation_choice: null
        } };
      }
    } });
    const semanticPlanValidator = async ({ plan }) => {
      if (!plan.operations?.[0]?.action_production) return true;
      throw Object.assign(new Error('source mismatch'), {
        code: 'TURN_STEP_PLAN_INVALID', details: { errors: [{
          path: '$.operations.0.action_production.source_refs',
          code: 'source_semantic_grounding', message: 'source mismatch'
        }] }
      });
    };
    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: model, semanticPlanValidator });
    const repair = JSON.parse(calls[1].messages[1].content);
    assert.equal(result.repaired, true);
    assert.equal(repair.structural_errors.some(({ code }) =>
      code === 'resolution'), true);
    assert.equal(repair.structural_errors.some(({ code }) =>
      code === 'source_semantic_grounding'), true);
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
  assert.deepEqual(repairPayload.original_output, {});
  assert.equal(repairPayload.structural_errors.length > 0, true);
});

test('repair preserves invalid output and supplied choices without inventing an operation',
  async () => {
    const calls = [];
    const input = request({ available_domain_operations: [{
      op: 'request_movement', actor_ref: 'actor_mikula',
      movement_kind: 'route', target_ref: 'location:admitted-only',
      description: 'Move along the visible route.'
    }] });
    const model = createLowerDvinaTraceTurnStepModel({
      roleRunner: { async run(call) {
        calls.push(call);
        if (calls.length === 1) return { output: {
          ...output(), resolution: 'domain_request',
          operation_choice: 'invented-choice'
        } };
        return { output: output() };
      } }
    });
    const result = await requestTurnStepPlanWithRepair({
      request: input, turnStepModel: model
    });

    const repairPayload = JSON.parse(calls[1].messages[1].content);
    assert.equal(result.repaired, true);
    assert.deepEqual(result.plan.operations, []);
    assert.equal(repairPayload.original_output.resolution, 'domain_request');
    assert.equal(repairPayload.original_output.operations, undefined);
    assert.deepEqual(repairPayload.request.available_domain_operations,
      input.available_domain_operations);
    for (const call of calls) {
      assert.match(call.messages[0].content,
        /operation_choice is exactly one scalar supplied choice_id string or null/u);
      assert.match(call.messages[0].content,
        /"operation_choice":"domain_operation_1_request_movement_route"/u);
    }
    assert.match(calls[1].messages[0].content,
      /replace an invalid object wrapper[\s\S]*with its inner supplied ID string/u);
  });

test('repair accepts an exact copied code-owned choice without trusting a new DTO',
  async () => {
    const operation = { op: 'request_discovery', actor_ref: 'actor_mikula',
      discovery_kind: 'inspect', target_refs: ['location:wreck'],
      query: 'Осмотреть место крушения' };
    const input = request({ available_domain_operations: [operation] });
    let calls = 0;
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run() {
        calls += 1;
        if (calls === 1) return { output: {
          ...output(), resolution: 'domain_request', operations: undefined,
          operation_choice: undefined
        } };
        return { output: { ...output(), resolution: 'domain_request',
          activity: { owner: 'domain', duration_class: null, effort: null },
          operations: undefined,
          operation_choice: 'domain_operation_1_request_discovery_inspect' } };
      }
    } });

    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: model });

    assert.equal(result.repaired, true);
  assert.deepEqual(result.plan.operations, [operation]);
});

test('semantic repair cannot reselect the rejected exact operation', async () => {
  const operation = { op: 'request_discovery', actor_ref: 'actor_mikula',
    discovery_kind: 'inspect', target_refs: ['location:wreck'],
    query: 'Inspect authored wreck evidence.' };
  const ordinary = { ...operation, query: 'Inspect ordinary boards.' };
  const input = request({ available_domain_operations: [operation],
    player_safe_state: { observed_evidence_inspection: {
      semantic_grounding_available: true,
      candidates: [{ fact_ref: 'fact:charred-post-mark',
        text: 'На столбе видна отметина.' }]
    } } });
  let prompt;
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run(call) {
      prompt = call.messages[0].content;
      return { output: output() };
    }
  } });
  await model(input, { original_output: { resolution: 'domain_request',
    operations: [ordinary] }, structural_errors: [{
    path: '$.operations', code: 'operation_semantic_grounding',
    rejected_operation: operation
  }] });
  assert.match(prompt, /Code-owned exact operation choices are:\n\[\]/u);
  assert.match(prompt,
    /operation_semantic_grounding[\s\S]*every compared referent[\s\S]*observed_evidence_inspection[\s\S]*exact supplied candidate refs/u);
  assert.match(prompt,
    /comparison counterpart or requested detail is missing[\s\S]*focused_ordinary_discovery[\s\S]*missing referent[\s\S]*complete comparison in continuation/u);
});

test('mismatched echoed operation cannot silently replace selected choice',
  async () => {
    const selected = { op: 'request_discovery', actor_ref: 'actor_mikula',
      discovery_kind: 'inspect', target_refs: ['location:wreck'],
      query: 'Осмотреть место крушения' };
    const ordinary = { ...selected, target_refs: ['chest_1'],
      query: 'Осмотреть клочок шерсти' };
    const input = request({ available_domain_operations: [selected] });
    const calls = [];
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run(call) {
        calls.push(call);
        return { output: calls.length === 1 ? {
          ...output(), resolution: 'domain_request',
          activity: { owner: 'domain', duration_class: null, effort: null },
          operation_choice: 'domain_operation_1_request_discovery_inspect',
          operations: [ordinary]
        } : {
          ...output(), resolution: 'domain_request',
          activity: { owner: 'domain', duration_class: null, effort: null },
          operation_choice: null, operations: [ordinary]
        } };
      }
    } });

    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: model });

    assert.equal(result.repaired, true);
    assert.deepEqual(result.plan.operations, [ordinary]);
    assert.deepEqual(calls.map(({ role_id }) => role_id), [
      'turn_step_planner', 'turn_step_planner_repair'
    ]);
    const repair = JSON.parse(calls[1].messages[1].content);
    assert.equal(repair.original_output.operation_choice,
      'domain_operation_1_request_discovery_inspect');
    assert.deepEqual(repair.original_output.operations, [ordinary]);
    assert.match(calls[1].messages[0].content,
      /operations must accompany operation_choice[\s\S]*exactly that selected DTO/u);
    assert.match(calls[1].messages[0].content,
      /domain_owner_unavailable on request_discovery with multiple target_refs[\s\S]*keep exactly one visible target[\s\S]*remaining targets plus the comparison in continuation/u);
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

test('active conversation allows unrelated direct action without repair', async () => {
    const interaction = { op: 'emit_interaction', actor_ref: 'actor_mikula',
      target_actor_refs: ['npc:visible'], interaction_kind: 'speech',
      content: 'Talk to the visible interlocutor.', instrument_refs: [] };
    const validate = createTurnStepDomainOwnerPreflight({ externalRegistry: {
      domain: (operation) => operation.op === 'emit_interaction' ? () => {} : null
    }, semanticBindings: [], availableOptions: new Set(), actor: {},
    committedState: {}, services: {},
    isDomainStepOperation: (operation) => operation === 'emit_interaction',
    turnCommandError: (code, message, details) =>
      Object.assign(new Error(message), { code, details }) });
    const intent = 'Look at the shore.';
    const input = request({ root_player_action: intent, remaining_intent: intent,
      player_safe_state: { active_interlocutor: { entity_ref: {
        entity_kind: 'npc', entity_id: 'npc:visible'
      }, display_label: 'Visible interlocutor' } }, available_domain_operations: [interaction] });
    const calls = [];
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run(call) { calls.push(call); return { output: output() }; }
    } });
    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: model, semanticPlanValidator: validate });
    assert.equal(result.repaired, false);
    assert.deepEqual(result.plan.operations, []);
    assert.deepEqual(calls.map(({ role_id }) => role_id), ['turn_step_planner']);
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

test('unresolved grounding or closed shape fails after repair', async () => {
  const input = request({ player_safe_state: {
    items: [{ item_id: 'boards', category_id: 'wooden_boards' }]
  } });
  let calls = 0;
  const invalid = (code) => Object.assign(new Error('semantic mismatch'), {
    code: 'TURN_STEP_PLAN_INVALID', details: { errors: [{
      path: '$.operations.0.action_production',
      code,
      message: 'must remain grounded'
    }] }
  });
  const candidate = { ...output(), resolution: 'domain_request',
    activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
    operations: [{ op: 'request_item_use', actor_ref: 'actor_mikula',
      item_ref: 'boards', use_kind: 'other', target_refs: [],
      action_production: { source_refs: ['boards'], tool_refs: [],
        requested_output_count: null, identity_mode: 'preserve_source',
        origin: null, result_class: 'ordinary_physical_result',
        material_extent: null, result_descriptor: { display_name: null,
          physical_description: 'moved boards', qualitative_facts: [],
          removed_physical_fact_refs: [], inscription_text: null,
          physical_form: null, source_fact_delta: null },
        output_class: 'ordinary_mundane' } }], operation_choice: null };
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run() { calls += 1; return { output: candidate }; }
  } });
  for (const code of ['material_transformation_grounding',
    'material_extent_shape']) {
    await assert.rejects(() => requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: model,
      semanticPlanValidator: async () => { throw invalid(code); }
    }), (error) => error.code === 'TURN_STEP_PLAN_INVALID'
      && error.details.repair_attempted === true);
  }
  assert.equal(calls, 4);
});

test('empty unrecoverable domain request fails after repair', async () => {
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: { async run() { return { output: {
      ...output(), resolution: 'domain_request', goal_result: 'pending',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operations: [], operation_choice: null
    } }; } }
  });
  await assert.rejects(() => requestTurnStepPlanWithRepair({
    request: request({ available_domain_operations: [] }), turnStepModel: model
  }), (error) => error.code === 'TURN_STEP_PLAN_INVALID'
    && error.details.repair_attempted === true);
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
