import assert from 'node:assert/strict';
import test from 'node:test';
import { createTurnStepDomainOwnerPreflight } from
  '../src/turn-step-admission.js';
import { createTurnStepExecutionRegistry, runTurnStepLoop } from
  '../src/turn-step-loop.js';
import { createTurnCommandRegistry, runTurnWorkflow } from '../src/index.js';
import { createServices, input as workflowInput, turnStepPlan } from './turn-workflow-fixture.js';

const bands = [
  'clean_success', 'success', 'success_with_cost',
  'failure_with_consequence', 'severe_failure'
];

function input() {
  return {
    requestId: 'request-1', rootTurnId: 'turn-1', committedStateVersion: 7,
    rootPlayerAction: 'пробую незнакомое действие', actor: { actor_ref: 'actor-1' },
    initialWorkingProjection: { actor_ref: 'actor-1' }
  };
}

function plan(request, extra = {}) {
  return {
    schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.remaining_intent,
      grounded_attempt: request.remaining_intent, adaptation: 'literal' },
    resolution: 'direct', goal_result: 'not_achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' },
    operations: [], check: null, continuation: null, clarification: null,
    reason_code: 'direct_step', reason: 'видимая реальная попытка', ...extra
  };
}

function unavailableGenericPlan(request) {
  return plan(request, {
    resolution: 'generic_check', goal_result: 'pending', operations: [],
    check: { purpose: 'проверить попытку', attribute_ref: 'actor-1',
      skill_ref: null, difficulty_id: 'risky',
      outcomes: Object.fromEntries(bands.map((band) => [band, {
        goal_result: 'not_achieved', additional_activity: null,
        operations: [{ op: 'request_activity', actor_ref: 'actor-1',
          activity_kind: 'wait', target_refs: [], description: 'ждать' }],
        continuation: null
      }]))
    }, reason_code: 'generic_check', reason: 'нужна проверка'
  });
}

function preflight() {
  return createTurnStepDomainOwnerPreflight({ externalRegistry: null,
    semanticBindings: [], availableOptions: new Set(), actor: { actor_ref: 'actor-1' },
    committedState: {}, services: {} });
}

function ports(turnStepModel, semanticPlanValidator, randomSource) {
  return {
    turnStepModel, semanticPlanValidator, randomSource,
    projectPlayerSafeState: async ({ working_projection }) => working_projection,
    revalidateCommittedState: async () => ({ state_version: 7 }),
    executionRegistry: createTurnStepExecutionRegistry({
      applySemanticActivity: async ({ working_projection }) => ({
        working_projection, write_fragments: []
      })
    })
  };
}

test('unavailable generic owner repairs to direct plan before RNG or effects',
  async () => {
    let calls = 0;
    let rolls = 0;
    let repair = null;
    const result = await runTurnStepLoop(input(), ports(
      async (request, context) => {
        calls += 1;
        repair = context;
        return context == null ? unavailableGenericPlan(request) : plan(request);
      }, preflight(), { next: () => { rolls += 1; return 0; } }
    ));
    assert.equal(calls, 2);
    assert.equal(repair.structural_errors[0].rule, 'domain_owner_unavailable');
    assert.equal(rolls, 0);
    assert.deepEqual(result.check_results, []);
    assert.deepEqual(result.write_fragments, []);
});

test('active conversation does not reject an unrelated direct plan', () => {
  const validate = preflight();
  const request = { player_safe_state: { active_interlocutor: {
    entity_ref: { entity_kind: 'npc', entity_id: 'npc:visible' }
  } }, available_domain_operations: [{ op: 'emit_interaction',
    target_actor_refs: ['npc:visible'] }] };
  const direct = { resolution: 'direct', operations: [], check: null };
  assert.doesNotThrow(() => validate({ plan: direct, request,
    prepared_chain_context: null }));
});

test('source-grounding audit rejects a semantically mismatched domain plan',
  async () => {
    const model = async () => {};
    model.validateSourceGrounding = async () => ({ pass: false, errors: [{
      path: '$.operations.0.action_production.source_refs',
      rule: 'source_semantic_grounding', code: 'source_semantic_grounding',
      message: 'source mismatch'
    }] });
    const validate = createTurnStepDomainOwnerPreflight({
      externalRegistry: { domain: () => () => {} }, semanticBindings: [],
      availableOptions: new Set(), actor: {}, committedState: {},
      services: { turnStepModel: model }
    });
    await assert.rejects(validate({ plan: {
      resolution: 'domain_request', operations: [{ op: 'request_item_use',
        action_production: { source_refs: ['item:knife'] } }], check: null
    }, request: { remaining_intent: 'сделать опору из доски',
      player_safe_state: {} }, prepared_chain_context: null }), (error) => {
      assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
      assert.equal(error.details.errors[0].code,
        'source_semantic_grounding');
      return true;
    });
  });

test('planner receives only available exact domain operation DTOs', async () => {
  const dto = { op: 'request_activity', actor_ref: 'party-1', activity_kind: 'recover', target_refs: [], description: 'Помочь.' };
  const wait = { ...dto, activity_kind: 'wait', description: 'Ждать.' };
  const run = async (available) => {
    const { services } = createServices([], { command: { matches: () => false,
      availability: () => ({ version: 1, schema: 'turn_availability_decision', status: available ? 'available' : 'blocked', can_attempt: available, reasons: [], check_requests: [] }),
      semantic_binding: { binding_id: 'activity', operation: 'request_activity',
        operation_dtos: [dto, wait], matches: () => false } },
      playerSafeStateProjector: () => ({ actor: { actor_ref: 'party-1' }, player_safe_state: {} }),
      turnStepExecutionRegistry: createTurnStepExecutionRegistry({
        applySemanticActivity: async ({ working_projection }) => ({
          working_projection, write_fragments: [] })
      }) });
    if (!available) {
      const fallback = services.commandRegistry.get('inspect_cart');
      services.commandRegistry = createTurnCommandRegistry([{ ...fallback,
        semantic_binding: null, availability: () => ({ version: 1,
          schema: 'turn_availability_decision', status: 'available', can_attempt: true,
          reasons: [], check_requests: [] }) }, { ...fallback,
        command_id: 'activity', option_id: 'activity', availability: () => ({
          version: 1, schema: 'turn_availability_decision', status: 'blocked',
          can_attempt: false, reasons: [], check_requests: [] }), semantic_binding: {
          binding_id: 'activity', operation: 'request_activity', operation_dto: dto,
          matches: () => false } }]);
    }
    let request; services.turnStepModel = (value) => (request = value, turnStepPlan(value));
    await runTurnWorkflow(workflowInput(), services); return request;
  };
  assert.deepEqual((await run(true)).available_domain_operations, [dto, wait]);
  assert.deepEqual((await run(false)).available_domain_operations, []);
});

test('prepared followup candidates bind each available precursor to its successor',
  async () => {
    const parentA = activity('prepare-a');
    const parentB = activity('prepare-b');
    const successor = activity('continue');
    const unrelated = activity('unrelated');
    const { services } = createServices();
    services.playerSafeStateProjector = () => ({
      actor: { actor_ref: 'party-1' }, player_safe_state: {}
    });
    services.turnStepExecutionRegistry = createTurnStepExecutionRegistry({
      applySemanticActivity: async ({ working_projection }) => ({
        working_projection, write_fragments: []
      })
    });
    const base = services.commandRegistry.get('inspect_cart');
    const command = (id, operation, preparedFollowupRef = null) => ({
      ...base, command_id: id, option_id: id,
      ...(preparedFollowupRef == null ? {} : {
        prepared_followup_ref: preparedFollowupRef
      }),
      semantic_binding: {
        binding_id: id, operation: 'request_activity', operation_dto: operation,
        matches: ({ operation: candidate }) => candidate.description === operation.description
      }
    });
    services.commandRegistry = createTurnCommandRegistry([
      command('parent-a', parentA, 'successor'),
      command('parent-b', parentB, 'successor'),
      command('successor', successor),
      command('unrelated', unrelated)
    ]);
    let captured;
    services.turnStepModel = (request) => {
      captured = request;
      return turnStepPlan(request);
    };
    await runTurnWorkflow(workflowInput(), services);
    assert.deepEqual(captured.prepared_followup_candidates, [
      { prepared_followup_ref: 'successor', precursor_operation: parentA,
        operation: successor },
      { prepared_followup_ref: 'successor', precursor_operation: parentB,
        operation: successor }
    ]);

    const bindings = [
      ['parent-a', parentA, 'successor'],
      ['parent-b', parentB, 'successor'],
      ['successor', successor],
      ['unrelated', unrelated]
    ].map(([id, operation, preparedFollowupRef]) => ({
      command: { option_id: id, prepared_followup_ref: preparedFollowupRef },
      binding: {
        operation: 'request_activity',
        matches: ({ operation: candidate }) => candidate.description === operation.description
      }
    }));
    const validate = createTurnStepDomainOwnerPreflight({ externalRegistry: null,
      semanticBindings: bindings, availableOptions: new Set(bindings.map(
        ({ command }) => command.option_id)), actor: { actor_ref: 'party-1' },
      committedState: {}, services: {} });
    const request = { player_safe_state: {} };
    const markerPlan = (operation, marker) => ({ operations: [operation],
      continuation: { prepared_followup_ref: marker }, check: null });
    assert.doesNotThrow(() => validate({ plan: markerPlan(parentA, 'successor'),
      request, prepared_chain_context: null }));
    assert.doesNotThrow(() => validate({ plan: markerPlan(parentB, 'successor'),
      request, prepared_chain_context: null }));
    assert.throws(() => validate({ plan: markerPlan(unrelated, 'successor'),
      request, prepared_chain_context: null }), { code: 'TURN_STEP_PLAN_INVALID' });
  });

test('prepared continuation recomputes domain operation DTOs from current state', async () => {
  const dto = { op: 'request_activity', actor_ref: 'party-1', activity_kind: 'recover', target_refs: [], description: 'Помочь.' };
  const { services } = createServices([], { command: {
    matches: () => false,
    availability: ({ committed_state: state }) => ({ version: 1,
      schema: 'turn_availability_decision',
      status: state.after_prepare ? 'blocked' : 'available',
      can_attempt: !state.after_prepare, reasons: [], check_requests: [] }),
    consequence: () => ({ version: 1, schema: 'turn_consequence_package',
      status: 'resolved', duration_minutes: 1, visible_seed: {}, hidden_update: {},
      state_changes: [], suggested_actions: [] }),
    semantic_binding: { binding_id: 'activity', operation: 'request_activity',
      operation_dto: dto, matches: ({ operation }) => operation.op === 'request_activity' } },
    playerSafeStateProjector: () => ({ actor: { actor_ref: 'party-1' }, player_safe_state: {} }),
    turnStepExecutionRegistry: createTurnStepExecutionRegistry({
      applySemanticActivity: async ({ working_projection }) => ({
        working_projection, write_fragments: [], player_response_boundary: true })
    }) });
  services.turnStepPreparedDomainEffect = {
    supports: ({ operation }) => operation.op === 'request_activity',
    currentState: () => ({ after_prepare: true }),
    apply: async ({ working_projection }) => ({ working_projection,
      summary: 'prepared', write_fragments: [], player_response_boundary: false,
      prepared_effect_request: { effect_kind: 'domain_command', owner_ref: 'inspect_cart',
        operation_ref: 'request_activity', availability: { version: 1,
          schema: 'turn_availability_decision', status: 'available', can_attempt: true,
          reasons: [], check_requests: [] }, consequence: { duration_minutes: 1 } } })
  };
  services.turnStepPreparedEffectContext = { current_clock: clock(0), current_body_state: body() };
  services.turnStepPreparedEffectTimeOwner = ({ prepared_chain_context: context }) => ({
    version: 2, schema: 'turn_time_update', owner: '@rus/time-events-history',
    clock_before: context.current_clock, clock_after: clock(1),
    exact_elapsed: { exact_minutes: { numerator: '1', denominator: '1' } },
    nearest_boundary: null
  });
  services.turnStepPreparedEffectBodyOwner = ({ prepared_chain_context: context }) => ({
    version: 1, schema: 'turn_body_update', owner: '@rus/body-state',
    applied: false, proposal: null, state_after: context.current_body_state
  });
  const requests = [];
  services.turnStepModel = (request) => {
    requests.push(request);
    if (request.step_index === 2) throw new Error('second request captured');
    return turnStepPlan(request, { resolution: 'domain_request',
      goal_result: 'pending',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operations: [dto], continuation: {
        remaining_intent: 'осмотреться', depends_on_refs: [] } });
  };
  await assert.rejects(() => runTurnWorkflow(workflowInput(), services),
    /second request captured/u);
  assert.deepEqual(requests.map((request) => request.available_domain_operations), [[dto], []]);
});

test('direct continuation does not reuse initial domain operation DTOs', async () => {
  const dto = { op: 'request_activity', actor_ref: 'party-1',
    activity_kind: 'recover', target_refs: [], description: 'Помочь.' };
  const { services } = createServices([], { command: { matches: () => false,
    availability: () => ({ version: 1, schema: 'turn_availability_decision',
      status: 'available', can_attempt: true, reasons: [], check_requests: [] }),
    semantic_binding: { binding_id: 'activity', operation: 'request_activity',
      operation_dto: dto, matches: () => false } },
    playerSafeStateProjector: () => ({ actor: { actor_ref: 'party-1' },
      player_safe_state: {} }),
    turnStepExecutionRegistry: createTurnStepExecutionRegistry({
      applySemanticActivity: async ({ working_projection }) => ({
        working_projection, write_fragments: [], player_response_boundary: false })
    }) });
  const requests = [];
  services.turnStepModel = (request) => {
    requests.push(request);
    if (request.step_index === 2) throw new Error('second request captured');
    return turnStepPlan(request, { goal_result: 'pending', continuation: {
      remaining_intent: 'осмотреться', depends_on_refs: [] } });
  };
  await assert.rejects(() => runTurnWorkflow(workflowInput(), services),
    /second request captured/u);
  assert.deepEqual(requests.map((request) => request.available_domain_operations),
    [[dto], []]);
});

function clock(value) {
  return { whole_minutes: String(value), subminute_numerator: '0', subminute_denominator: '1' };
}

function body() {
  return { health: 100, satiety: 100, energy: 100, active_conditions: [] };
}

function activity(description) {
  return { op: 'request_activity', actor_ref: 'party-1', activity_kind: 'wait',
    target_refs: [], description };
}

test('structural then unavailable owner consumes no third repair', async () => {
  let calls = 0;
  await assert.rejects(() => runTurnStepLoop(input(), ports(
    async (request) => {
      calls += 1;
      return calls === 1
        ? { ...plan(request), request_id: 'forged' }
        : unavailableGenericPlan(request);
    }, preflight(), null
  )), (error) => {
    assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
    assert.equal(error.details.repair_attempted, true);
    assert.equal(error.details.errors[0].rule, 'domain_owner_unavailable');
    return true;
  });
  assert.equal(calls, 2);
});

test('repair with same operation recomputes owner for changed plan context', () => {
  const validate = createTurnStepDomainOwnerPreflight({ externalRegistry: null,
    semanticBindings: [{ command: { option_id: 'choice' }, binding: {
      operation: 'request_activity', matches: ({ plan: value }) =>
        value.reason_code === 'bound'
    } }], availableOptions: new Set(['choice']), actor: { actor_ref: 'actor-1' },
    committedState: {}, services: {} });
  const request = { remaining_intent: 'ждать', player_safe_state: {} };
  const operation = { op: 'request_activity' };
  assert.throws(() => validate({ plan: { reason_code: 'unbound',
    operations: [operation], check: null }, request,
  prepared_chain_context: null }), { code: 'TURN_STEP_PLAN_INVALID' });
  assert.doesNotThrow(() => validate({ plan: { reason_code: 'bound',
    operations: [operation], check: null }, request,
  prepared_chain_context: null }));
});

test('active prepared chain defers one unavailable domain request', () => {
  const request = { remaining_intent: 'ждать', player_safe_state: {} };
  assert.doesNotThrow(() => preflight()({ plan: {
    resolution: 'domain_request', operations: [{ op: 'request_activity' }],
    check: null
  }, request, prepared_chain_context: { prior_effect_count: 1 } }));
  assert.throws(() => preflight()({ plan: {
    resolution: 'domain_request', operations: [{ op: 'request_activity' }],
    check: null
  }, request, prepared_chain_context: null }), { code: 'TURN_STEP_PLAN_INVALID' });
});
