import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepSemanticGroundingValidator } from
  '../src/runtime/lower-dvina-trace-turn-step-grounding-audit.js';
import { createTurnStepDomainOwnerPreflight } from
  '../../../packages/turn/src/turn-step-admission.js';
const request = { request_id: 'discovery-correction' };

for (const [intent, emittedQuery, material] of [
  ['и длинной ветвью осторожно прощупываю воду между обломками.',
    'длинной ветвью осторожно прощупываю воду между обломками', 'длинная ветвь'],
  ['затем сухим лоскутом вытираю край глиняной чаши.',
    'сухим лоскутом вытираю край глиняной чаши', 'сухой лоскут']
]) test(`focused audit corrects missing-material discovery without planner repair: ${material}`, async () => {
  const { request: buildRequest, output } = await import('./lower-dvina-trace-turn-step-llm-test-helpers.js');
  const { createLowerDvinaTraceTurnStepModel } = await import('../src/runtime/lower-dvina-trace-phase-2-llm.js');
  const { requestTurnStepPlanWithRepair } = await import('../../../packages/turn/src/turn-step-plan-repair.js');
  const { createTurnStepDomainOwnerPreflight } = await import('../../../packages/turn/src/turn-step-admission.js');
  const input = buildRequest({ remaining_intent: intent, step_index: 2, working_revision: 1,
    completed_steps: [{ step_index: 1, summary: 'Реплика произнесена.' }],
    player_safe_state: { position: { location_ref: 'current-place' }, items: [],
      current_visible_context: { sensory_details: ['Виден обычный хозяйственный материал.'] },
      ordinary_resolution: { discovery_available: true, scene_seed_available: false,
        container_resolution_available: false } } });
  const calls = [];
  const runner = { async run(call) {
    calls.push(call.role_id);
    if (call.role_id === 'turn_step_planner') return { output: { ...output(),
      operations: [{ op: 'request_discovery', actor_ref: input.actor.actor_ref,
        discovery_kind: 'search', target_refs: [], query: emittedQuery }] } };
    assert.equal(call.role_id, 'turn_step_grounding_auditor');
    const payload = JSON.parse(call.messages[1].content);
    assert.equal(payload.remaining_intent, intent);
    assert.equal(payload.operation.query, emittedQuery);
    assert.deepEqual(payload.operation.target_refs, ['current-place']);
    assert.equal(payload.continuation, null);
    assert.deepEqual(payload.player_safe_state.items, []);
    assert.match(call.messages[0].content, /Hidden contents, evidence\/clues[\s\S]*different_action/u);
    return { output: { mode: 'material_prerequisite', consumed_intent: null,
      prerequisite_query: material } };
  } };
  const preflight = createTurnStepDomainOwnerPreflight({ externalRegistry: null,
    semanticBindings: [], availableOptions: new Set(), actor: input.actor, committedState: {},
    services: { turnStepOrdinaryDiscoveryResolver() {},
      turnStepSemanticGroundingValidator: createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner: runner }) } });
  const result = await requestTurnStepPlanWithRepair({ request: input,
    turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner: runner }),
    semanticPlanValidator: preflight, preparedChainContext: { prior_effect_count: 1 } });
  assert.deepEqual(calls, ['turn_step_planner', 'turn_step_grounding_auditor']);
  assert.equal(result.repaired, false);
  assert.equal(result.plan.goal_result, 'pending');
  assert.equal(result.plan.resolution, 'domain_request');
  assert.deepEqual(result.plan.activity, { owner: 'domain', duration_class: null, effort: null });
  assert.deepEqual(result.plan.continuation, { remaining_intent: intent, depends_on_refs: [] });
  assert.deepEqual(result.plan.operations, [{ op: 'request_discovery', actor_ref: input.actor.actor_ref,
    discovery_kind: 'inspect', target_refs: ['current-place'], query: material }]);
});

test('focused prerequisite correction fails closed for malformed, copied and rejected semantics', async () => {
  const intent = 'Лоскутом протираю чашу.';
  const input = { ...request, remaining_intent: intent,
    player_safe_state: { position: { location_ref: 'current-place' },
      ordinary_resolution: { discovery_available: true, scene_seed_available: false,
        container_resolution_available: false } } };
  const proposal = { interpretation: { adaptation: 'literal' }, continuation: null,
    operations: [{ op: 'request_discovery', actor_ref: 'actor:1', discovery_kind: 'search',
      target_refs: ['current-place'], query: intent }] };
  for (const classification of [
    { mode: 'material_prerequisite', consumed_intent: null, prerequisite_query: '' },
    { mode: 'focused_discovery', consumed_intent: intent, prerequisite_query: 'лоскут' },
    { mode: 'material_prerequisite', consumed_intent: null, prerequisite_query: intent },
    { mode: 'material_prerequisite', consumed_intent: null, prerequisite_query: 'лоскут', extra: true },
    { mode: 'different_action', consumed_intent: null }
  ]) {
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner: {
      async run() { return { output: classification }; } } });
    await assert.rejects(validate({ request: input, plan: proposal,
      resolved_domain_operations: [{ path: '$.operations.0', owner_kind: 'ordinary_discovery' }] }),
    error => ['TURN_STEP_PLAN_INVALID', 'TRACE_TURN_STEP_GROUNDING_AUDIT_INVALID'].includes(error.code));
  }
});


test('empty discovery scope binds only the available current ordinary location', async () => {
  const { assembleTurnStepPlan } = await import('../src/runtime/lower-dvina-trace-turn-step-plan-assembly.js');
  const { request: buildRequest, output } = await import('./lower-dvina-trace-turn-step-llm-test-helpers.js');
  const input = buildRequest({ player_safe_state: { position: { location_ref: 'current-place' },
    ordinary_resolution: { discovery_available: true, scene_seed_available: false,
      container_resolution_available: false } } });
  const choice = { ...output(), operations: [{ op: 'request_discovery',
    actor_ref: input.actor.actor_ref, discovery_kind: 'search', target_refs: [], query: 'обычный материал' }] };
  assert.deepEqual(assembleTurnStepPlan(choice, input).operations[0].target_refs, ['current-place']);
  for (const safeState of [
    { ...input.player_safe_state, position: {} },
    { ...input.player_safe_state, ordinary_resolution: { ...input.player_safe_state.ordinary_resolution,
      discovery_available: false } }
  ]) assert.deepEqual(assembleTurnStepPlan(choice, { ...input, player_safe_state: safeState })
    .operations[0].target_refs, []);
  const explicit = { ...choice, operations: [{ ...choice.operations[0], target_refs: ['hidden-place'] }] };
  assert.deepEqual(assembleTurnStepPlan(explicit, input).operations[0].target_refs, ['hidden-place']);
  assert.deepEqual(assembleTurnStepPlan(choice, { ...input,
    available_domain_operations: [choice.operations[0]] }).operations[0].target_refs, []);
  assert.deepEqual(choice.operations[0].target_refs, []);
});

test('semantic correction repeats owner admission without repeating the semantic role', async () => {
  const original = { resolution: 'domain_request', continuation: null,
    operations: [{ op: 'request_discovery', query: 'ordinary query' }] };
  for (const correctedQuery of ['missing owner', 'authored clue']) {
    let calls = 0;
    const validate = createTurnStepDomainOwnerPreflight({
      externalRegistry: { domain: operation => operation.query === 'ordinary query' ? () => {} : null },
      semanticBindings: [{ command: { option_id: 'clue' }, binding: {
        operation: 'request_discovery', matches: ({ operation }) => operation.query === 'authored clue' } }],
      availableOptions: new Set(['clue']), actor: {}, committedState: {},
      services: { async turnStepSemanticGroundingValidator() {
        calls += 1;
        return { corrected_plan: { ...original,
          operations: [{ op: 'request_discovery', query: correctedQuery }],
          continuation: { remaining_intent: 'complete physical intent', depends_on_refs: [] } } };
      } } });
    await assert.rejects(validate({ plan: original,
      request: { remaining_intent: 'complete physical intent', player_safe_state: {} },
      prepared_chain_context: { prior_effect_count: 1 } }), { code: 'TURN_STEP_PLAN_INVALID' });
    assert.equal(calls, 1);
  }
});


for (const [kind, intent, material] of [
  ['reality_limited', 'и длинной ветвью осторожно прощупываю воду между обломками.', 'длинная ветвь'],
  ['unsupported_attempt', 'затем сухим лоскутом вытираю край чаши.', 'сухой лоскут']
]) test(`unsupported denial metadata uses one focused audit, zero planner repairs: ${kind}`, async () => {
  const { request: buildRequest, output } = await import('./lower-dvina-trace-turn-step-llm-test-helpers.js');
  const { createLowerDvinaTraceTurnStepModel } = await import('../src/runtime/lower-dvina-trace-phase-2-llm.js');
  const { requestTurnStepPlanWithRepair } = await import('../../../packages/turn/src/turn-step-plan-repair.js');
  const input = buildRequest({ remaining_intent: intent, player_safe_state: {
    position: { location_ref: 'current-location' }, items: [],
    ordinary_resolution: { discovery_available: true, scene_seed_available: false,
      container_resolution_available: false } } });
  const calls = [];
  const roleRunner = { async run(call) {
    calls.push(call.role_id);
    if (call.role_id === 'turn_step_planner') return { output: { ...output(), direct_result_kind: kind } };
    assert.equal(call.role_id, 'turn_step_grounding_auditor', 'full planner repair is forbidden');
    const payload = JSON.parse(call.messages[1].content);
    assert.equal(payload.remaining_intent, intent);
    assert.equal(payload.correction_candidate, 'missing_ordinary_referent');
    assert.match(call.messages[0].content, /НЕ выбранный игроком discovery[\s\S]*ОБЯЗАТЕЛЬНО верни/u);
    assert.match(call.messages[0].content, /ТОЛЬКО БЕЗ correction_candidate/u);
    assert.equal(payload.continuation, null);
    assert.deepEqual(payload.operation, { op: 'request_discovery', actor_ref: input.actor.actor_ref,
      discovery_kind: 'inspect', target_refs: ['current-location'], query: intent });
    // Captured old response interpreted the pseudo-operation as a different action.
    return { output: payload.correction_candidate === 'missing_ordinary_referent'
      ? { mode: 'material_prerequisite', consumed_intent: null, prerequisite_query: material }
      : { mode: 'different_action', consumed_intent: null } };
  } };
  const validate = createTurnStepDomainOwnerPreflight({ externalRegistry: null,
    semanticBindings: [], availableOptions: new Set(), actor: input.actor, committedState: {},
    services: { turnStepOrdinaryDiscoveryResolver() {},
      turnStepSemanticGroundingValidator: createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner }) } });
  const result = await requestTurnStepPlanWithRepair({ request: input,
    turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner }), semanticPlanValidator: validate });
  assert.deepEqual(calls, ['turn_step_planner', 'turn_step_grounding_auditor']);
  assert.equal(result.repaired, false);
  assert.equal(result.plan.direct_result_kind, null);
  assert.equal(result.plan.resolution, 'domain_request');
  assert.equal(result.plan.goal_result, 'pending');
  assert.equal(result.plan.interpretation.adaptation, 'literal');
  assert.deepEqual(result.plan.continuation, { remaining_intent: intent, depends_on_refs: [] });
  assert.deepEqual(result.plan.operations, [{ op: 'request_discovery', actor_ref: input.actor.actor_ref,
    discovery_kind: 'inspect', target_refs: ['current-location'], query: material }]);
});

test('denial metadata trial cannot accept a denial or bypass another structural error', async () => {
  const { request: buildRequest, output } = await import('./lower-dvina-trace-turn-step-llm-test-helpers.js');
  const { assembleTurnStepPlan } = await import('../src/runtime/lower-dvina-trace-turn-step-plan-assembly.js');
  const { requestTurnStepPlanWithRepair } = await import('../../../packages/turn/src/turn-step-plan-repair.js');
  const input = buildRequest();
  const base = assembleTurnStepPlan({ ...output(), direct_result_kind: 'unknown_kind' }, input);
  for (const [extra, trialExpected] of [[{}, true], [{ direct_result_kind: 'no_state_gesture' }, false],
    [{ interpretation: { ...base.interpretation, adaptation: 'reality_limited' } }, false],
    [{ request_id: 'wrong-request' }, false]]) {
    let planners = 0;
    let trials = 0;
    await assert.rejects(requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: async () => { planners += 1; return { ...base, ...extra }; },
      semanticPlanValidator: async (context) => {
        if (context.allow_denial_metadata_projection) {
          trials += 1;
          assert.equal(context.plan.direct_result_kind, null);
        }
        return true;
      } }), { code: 'TURN_STEP_PLAN_INVALID' });
    assert.equal(trials, trialExpected ? 1 : 0);
    assert.equal(planners, 2);
  }
});


test('disabled and authority-constrained denial never obtain an ordinary prerequisite', async () => {
  const { request: buildRequest, output } = await import('./lower-dvina-trace-turn-step-llm-test-helpers.js');
  const { createLowerDvinaTraceTurnStepModel } = await import('../src/runtime/lower-dvina-trace-phase-2-llm.js');
  const { requestTurnStepPlanWithRepair } = await import('../../../packages/turn/src/turn-step-plan-repair.js');
  for (const enabled of [false, true]) {
    const input = buildRequest({ remaining_intent: 'Читаю скрытое доказательство подлинности.',
      player_safe_state: { position: { location_ref: 'current-location' },
        ordinary_resolution: { discovery_available: enabled, scene_seed_available: false,
          container_resolution_available: false } } });
    const calls = [];
    const runner = { async run(call) {
      calls.push(call.role_id);
      if (call.role_id === 'turn_step_planner') return { output: { ...output(), direct_result_kind: 'unknown_kind' } };
      if (call.role_id === 'turn_step_grounding_auditor') return {
        output: { mode: 'different_action', consumed_intent: null } };
      return { output: { ...output(), direct_result_kind: null,
        interpretation: { ...output().interpretation, adaptation: 'reality_limited' } } };
    } };
    const validate = createTurnStepDomainOwnerPreflight({ externalRegistry: null,
      semanticBindings: [], availableOptions: new Set(), actor: input.actor, committedState: {},
      services: { turnStepOrdinaryDiscoveryResolver() {},
        turnStepSemanticGroundingValidator: createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner: runner }) } });
    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner: runner }), semanticPlanValidator: validate });
    assert.deepEqual(calls, ['turn_step_planner', ...(enabled ? ['turn_step_grounding_auditor'] : []), 'turn_step_planner_repair']);
    assert.equal(result.plan.interpretation.adaptation, 'reality_limited');
    assert.deepEqual(result.plan.operations, []);
    assert.equal(result.plan.direct_result_kind, null);
  }
});


test('explicit correction mode does not override a different_action verdict', async () => {
  const input = { request_id: 'denial-candidate', remaining_intent: 'Выявляю скрытое доказательство.',
    actor: { actor_ref: 'actor:1' }, player_safe_state: { position: { location_ref: 'here' },
      ordinary_resolution: { discovery_available: true, scene_seed_available: false,
        container_resolution_available: false } } };
  let calls = 0;
  const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner: { async run(call) {
    calls += 1;
    const payload = JSON.parse(call.messages[1].content);
    assert.equal(payload.correction_candidate, 'missing_ordinary_referent');
    assert.equal(payload.remaining_intent, input.remaining_intent);
    return { output: { mode: 'different_action', consumed_intent: null } };
  } } });
  await assert.rejects(validate({ request: input, plan: {
    interpretation: { adaptation: 'literal' }, resolution: 'direct', goal_result: 'not_achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' },
    operations: [], check: null, continuation: null, clarification: null, direct_result_kind: null },
    allow_denial_metadata_projection: true, material_prerequisite_candidate: true }),
  { code: 'TURN_STEP_PLAN_INVALID' });
  assert.equal(calls, 1);
});


for (const [name, template, needed, intent, words] of [
  ['хозяйственный нож', 'template:knife', 'длинная ветвь', 'и длинной ветвью осторожно прощупываю воду между обломками.', 'Онисим!'],
  ['деревянная ложка', 'template:spoon', 'сухой лоскут', 'и сухим лоскутом вытираю край чаши.', 'Постой!']
]) test(`compound speech then non-actionable template ref uses focused missing-material correction: ${name}`, async () => {
  const { request: buildRequest, output } = await import('./lower-dvina-trace-turn-step-llm-test-helpers.js');
  const { createLowerDvinaTraceTurnStepModel } = await import('../src/runtime/lower-dvina-trace-phase-2-llm.js');
  const { requestTurnStepPlanWithRepair } = await import('../../../packages/turn/src/turn-step-plan-repair.js');
  const root = `Говорю «${words}» ${intent}`;
  const input = buildRequest({ root_player_action: root, remaining_intent: root, player_safe_state: {
    position: { location_ref: 'shore' }, items: [{ item_id: 'stable:held', template_id: template, name,
      placement: { holder_character_id: 'actor_mikula', physical_position: 'worn_quick' } }],
    ordinary_resolution: { discovery_available: true, scene_seed_available: false, container_resolution_available: false } } });
  const calls = [];
  const runner = { async run(call) {
    calls.push(call.role_id);
    const payload = JSON.parse(call.messages[1].content);
    if (call.role_id === 'turn_step_planner') return { output: payload.step_index === 1
      ? { ...output(), resolution: 'direct', goal_result: 'pending', direct_result_kind: 'player_utterance',
        activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
        utterance: { speaker_ref: 'actor_mikula', input_mode: 'verbatim', utterance_text: words },
        continuation: { remaining_intent: intent, depends_on_refs: [] } }
      : { ...output(), operations: [{ op: 'request_item_use', actor_ref: 'actor_mikula', item_ref: template,
        use_kind: 'other', target_refs: [], description: intent }],
        activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' } } };
    assert.equal(call.role_id, 'turn_step_grounding_auditor', 'full planner repair is forbidden');
    if (payload.utterance) return { output: { speech_faithful: true, required_input_mode: 'verbatim', unexecuted_intent: intent } };
    assert.equal(payload.correction_candidate, 'missing_ordinary_referent');
    assert.equal(payload.remaining_intent, intent);
    assert.deepEqual(payload.player_safe_state.items, input.player_safe_state.items);
    return { output: { mode: 'material_prerequisite', consumed_intent: null, prerequisite_query: needed } };
  } };
  const grounding = createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner: runner });
  const validator = createTurnStepDomainOwnerPreflight({
    externalRegistry: { domain: operation => operation.op === 'request_item_use' ? () => {} : null },
    semanticBindings: [], availableOptions: new Set(), actor: input.actor, committedState: {},
    services: { turnStepOrdinaryDiscoveryResolver() {}, turnStepSemanticGroundingValidator: grounding } });
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: runner });
  const spoken = await requestTurnStepPlanWithRepair({ request: input, turnStepModel: model, semanticPlanValidator: validator });
  assert.equal(spoken.plan.utterance.utterance_text, words);
  const next = { ...input, step_index: 2, working_revision: 1, remaining_intent: spoken.plan.continuation.remaining_intent,
    completed_steps: [{ step_index: 1, summary: 'Реплика произнесена.' }] };
  const result = await requestTurnStepPlanWithRepair({ request: next, turnStepModel: model, semanticPlanValidator: validator });
  assert.equal(result.repaired, false);
  assert.deepEqual(result.plan.continuation, { remaining_intent: intent, depends_on_refs: [] });
  assert.deepEqual(result.plan.operations, [{ op: 'request_discovery', actor_ref: 'actor_mikula',
    discovery_kind: 'inspect', target_refs: ['shore'], query: needed }]);
  assert.equal(input.player_safe_state.items[0].item_id, 'stable:held');
  assert.deepEqual(calls, ['turn_step_planner', 'turn_step_grounding_auditor', 'turn_step_planner', 'turn_step_grounding_auditor']);
});
