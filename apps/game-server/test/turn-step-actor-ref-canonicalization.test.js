import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTurnStepExecutionRegistry,
  runTurnWorkflow,
  validateTurnStepPlan,
  validateTurnStepCommitEnvelope
} from '@rus/turn';
import { validateTurnStepOperationDto } from
  '../../../packages/turn/src/turn-step-contracts/operations.js';
import { createLowerDvinaTraceTurnStepSemanticGroundingValidator } from
  '../src/runtime/lower-dvina-trace-turn-step-grounding-audit.js';
import { createServices, genericCheck, input, turnStepPlan } from
  './turn-step-actor-ref-canonicalization-fixture.js';

const actor = 'party-1';
const unknownError = (path) => ({ path, code: 'unknown_ref',
  message: 'must reference request data or an earlier temp_ref' });

function discovery(actorRef, targetRef = 'wax-seal-71') {
  return { op: 'request_discovery', actor_ref: actorRef,
    discovery_kind: 'inspect', target_refs: [targetRef],
    query: 'Изучаю оттиск печати.' };
}

function activity(actorRef, targetRef = 'linen-pad-82') {
  return { op: 'request_activity', actor_ref: actorRef,
    activity_kind: 'recover', target_refs: [targetRef],
    description: 'Привожу в порядок льняную повязку.' };
}

function domainPlan(request, operation, overrides = {}) {
  return turnStepPlan(request, { resolution: 'domain_request',
    goal_result: 'pending', activity: {
      owner: 'domain', duration_class: null, effort: null
    }, operations: [operation], ...overrides });
}

function workflow({ model, state = {}, auditResults = null } = {}) {
  const calls = [];
  const audits = [];
  const roleCalls = [];
  const executions = [];
  const failures = [];
  const dispatch = async (execution) => {
    executions.push(structuredClone(execution));
    return { working_projection: execution.working_projection,
      summary: 'owner completed the current step', write_fragments: [],
      goal_result: 'achieved', player_response_boundary: false };
  };
  const direct = async (execution) => {
    executions.push(structuredClone(execution));
    return { working_projection: execution.working_projection,
      summary: 'direct operation applied', write_fragments: [] };
  };
  const grounding = auditResults == null ? null
    : createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run(request) {
        roleCalls.push(structuredClone(request));
        const pass = auditResults[Math.min(roleCalls.length - 1,
          auditResults.length - 1)];
        return { output: { pass, concerns: pass ? []
          : [{ kind: 'operation_semantic_grounding' }] } };
      } }
    });
  const { services, commits } = createServices([], {
    command: { matches: () => false, semantic_binding: {
      binding_id: 'executor-probe', operation: 'request_discovery',
      matches: () => false
    } },
    playerSafeStateProjector: async () => ({ actor: { actor_ref: actor },
      player_safe_state: structuredClone(state) }),
    randomSource: { next: () => 0.95 },
    turnStepCheckContextResolver: async () => ({
      attribute_value: 30, skill_bonus: 0,
      policy_profile_ref: 'test_check_policy',
      policy_profile_pin: { artifact_id: 'test_turn_step_owner_profiles',
        revision: 1, digest: 'a'.repeat(64) },
      check_policy_ref: { entity_kind: 'check_policy',
        entity_id: 'test_check_policy', authoring_version: '1' },
      consequence_policy_ref: { entity_kind: 'consequence_policy',
        entity_id: 'test_consequence_policy', authoring_version: '1' }
    }),
    turnStepExecutionRegistry: createTurnStepExecutionRegistry({
      domain: { request_discovery: dispatch, request_activity: dispatch,
        request_item_use: dispatch },
      direct: { create_entity: direct, apply_body_event: direct },
      applySemanticActivity: async ({ working_projection }) => ({
        working_projection, write_fragments: []
      })
    }),
    ...(grounding == null ? {} : {
      turnStepSemanticGroundingValidator: async (request) => {
        audits.push(structuredClone(request));
        return grounding(request);
      }
    }),
    turnStepModel: async (request, repair) => {
      const raw = model(request, repair);
      const snapshot = structuredClone(raw);
      calls.push({ request: structuredClone(request),
        repair: repair == null ? null : structuredClone(repair),
        raw, snapshot });
      return raw;
    }
  });
  return { calls, audits, roleCalls, executions, failures, commits,
    async run() {
      return runTurnWorkflow({ ...input(),
        raw_text: 'Внимательно выполняю текущую попытку.' }, services, {
        onFailure: ({ error, checkpoint }) => failures.push({
          code: error.code, details: structuredClone(error.details),
          checkpoint: structuredClone(checkpoint)
        })
      });
    } };
}

async function resolveWorkflow(harness) {
  let result;
  try { result = await harness.run(); }
  catch (error) {
    assert.fail(`${error.code}: ${JSON.stringify(error.details)}`);
  }
  assert.equal(result.status, 'resolved');
  assert.equal(harness.commits.length, 1);
  for (const call of harness.calls) assert.deepEqual(call.raw, call.snapshot);
  return harness.commits[0].turn_step_commit.loop_trace.step_traces[0];
}

function actorDiagnostic(oldValue, path = '$.operations[0].actor_ref',
  attempt = 1) {
  return { attempt, path, old_value: oldValue, new_value: actor };
}

for (const { name, operation, target } of [
  { name: 'discovery', operation: discovery('unknown-executor-71'),
    target: 'wax-seal-71' },
  { name: 'activity', operation: activity('unknown-executor-82'),
    target: 'linen-pad-82' }
]) {
  test(`workflow canonicalizes an unknown ${name} executor once`, async () => {
    const harness = workflow({
      state: { visible_entities: [{ entity_ref: target }] },
      model: (request) => domainPlan(request, structuredClone(operation))
    });
    const trace = await resolveWorkflow(harness);
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.calls[0].repair, null);
    assert.equal(harness.executions.length, 1);
    assert.equal(harness.executions[0].operation.actor_ref, actor);
    assert.equal(trace.approved_plan.operations[0].actor_ref, actor);
    assert.deepEqual(trace.canonicalizations,
      [actorDiagnostic(operation.actor_ref)]);
    assert.equal(trace.repaired, false);
  });
}

test('workflow leaves the correct executor untouched without diagnostics', async () => {
  const operation = discovery(actor);
  const harness = workflow({
    state: { visible_entities: [{ entity_ref: 'wax-seal-71' }] },
    model: (request) => domainPlan(request, operation)
  });
  const trace = await resolveWorkflow(harness);
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.executions.length, 1);
  assert.deepEqual(harness.executions[0].operation, operation);
  assert.deepEqual(trace.approved_plan.operations[0], operation);
  assert.equal(Object.hasOwn(trace, 'canonicalizations'), false);
});

for (const { name, foreignRef, state } of [
  { name: 'NPC', foreignRef: 'npc-bookbinder-93',
    state: { visible_entities: [{ npc_ref: 'npc-bookbinder-93' },
      { entity_ref: 'wax-seal-71' }] } },
  { name: 'item', foreignRef: 'item-cloth-case-94',
    state: { visible_entities: [{ item_ref: 'item-cloth-case-94' },
      { entity_ref: 'wax-seal-71' }] } }
]) {
  test(`known ${name} executor reaches the semantic validator unchanged`, async () => {
    const harness = workflow({ state, auditResults: [false],
      model: (request) => domainPlan(request, discovery(foreignRef)) });
    await assert.rejects(harness.run, (error) => {
      assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
      assert.equal(error.details.repair_attempted, true);
      assert.ok(error.details.errors.some(({ code }) =>
        code === 'operation_semantic_grounding'));
      assert.equal(error.details.errors.some(({ code }) => code === 'unknown_ref'), false);
      assert.equal(Object.hasOwn(error.details, 'canonicalizations'), false);
      return true;
    });
    assert.equal(harness.calls.length, 2);
    assert.equal(harness.calls[1].repair.attempt, 2);
    assert.equal(harness.audits.length, 2);
    assert.equal(harness.roleCalls.length, 2);
    for (const audit of harness.audits) {
      assert.equal(audit.plan.operations[0].actor_ref, foreignRef);
      assert.equal(validateTurnStepPlan(audit.plan,
        { request: audit.request }).ok, true);
    }
    for (const call of harness.calls) assert.deepEqual(call.raw, call.snapshot);
    assert.equal(harness.executions.length, 0);
    assert.equal(harness.commits.length, 0);
  });
}

function createdEntity(tempRef) {
  return { op: 'create_entity', temp_ref: tempRef,
    semantic_type: 'textile', name: 'льняной лоскут',
    origin: { kind: 'direct_partition', source_refs: ['linen-pad-82'] },
    facts: [], mechanics: { mass_grams: 1, external_hand_cost: 0,
      carry_form: 'compact', packing_slot_cost: 0, quantity: null,
      container: null }, placement: { relation: 'held_by', target_ref: actor } };
}

test('an earlier temp_ref remains a known foreign executor', async () => {
  const tempRef = 'temp-linen-piece-95';
  const operation = activity(tempRef);
  const harness = workflow({
    auditResults: [true],
    state: { visible_entities: [{ entity_ref: 'linen-pad-82' }] },
    model: (request) => domainPlan(request, operation, {
      operations: [createdEntity(tempRef), operation]
    })
  });
  await assert.rejects(harness.run, (error) => {
    assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
    assert.equal(error.details.repair_attempted, true);
    assert.deepEqual(error.details.errors.map(({ path, code }) => [path, code]),
      [['$.operations.0', 'operation_semantic_grounding']]);
    assert.equal(Object.hasOwn(error.details, 'canonicalizations'), false);
    return true;
  });
  assert.equal(harness.calls[0].request.player_safe_state
    .visible_entities.some(({ entity_ref }) => entity_ref === tempRef), false);
  assert.equal(harness.calls.length, 2);
  assert.equal(harness.calls[1].repair.attempt, 2);
  assert.equal(harness.calls[1].repair.original_output.operations[1].actor_ref,
    tempRef);
  assert.equal(harness.audits.length, 2);
  for (const audit of harness.audits) {
    assert.equal(audit.plan.operations[1].actor_ref, tempRef);
    assert.equal(validateTurnStepPlan(audit.plan,
      { request: audit.request }).ok, true);
    assert.equal(Object.hasOwn(audit.plan, 'canonicalizations'), false);
  }
  for (const call of harness.calls) assert.deepEqual(call.raw, call.snapshot);
  assert.equal(harness.roleCalls.length, 0);
  assert.equal(harness.executions.length, 0);
  assert.equal(harness.commits.length, 0);
});

function bodyEvent(actorRef) {
  return { op: 'apply_body_event', actor_ref: actorRef, mechanism: 'strain',
    severity: 'minor', body_part_ref: null, description: 'Мышцы напряглись.' };
}

for (const { name, path, build } of [
  { name: 'body actor', path: '$.operations[0].actor_ref',
    build: (request) => turnStepPlan(request,
      { operations: [bodyEvent('unknown-body-96')] }) },
  { name: 'target', path: '$.operations[0].target_refs[0]',
    build: (request) => domainPlan(request,
      discovery(actor, 'unknown-target-97')) }
]) {
  test(`workflow rejects an unknown ${name} without repair or execution`, async () => {
    const harness = workflow({ model: build });
    await assert.rejects(harness.run, (error) => {
      assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
      assert.deepEqual(error.details.errors, [unknownError(path)]);
      assert.equal(error.details.repair_attempted, false);
      assert.equal(error.details.repair_suppressed,
        'deterministic_structure_invalid');
      return true;
    });
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.executions.length, 0);
    assert.equal(harness.commits.length, 0);
  });
}

test('workflow canonicalizes the executor in the single repair attempt', async () => {
  const harness = workflow({
    state: { visible_entities: [{ entity_ref: 'wax-seal-71' }] },
    auditResults: [false, true],
    model: (request, repair) => domainPlan(request,
      discovery(repair == null ? actor : 'unknown-repair-executor-98'))
  });
  const trace = await resolveWorkflow(harness);
  assert.equal(harness.calls.length, 2);
  assert.equal(harness.roleCalls.length, 2);
  assert.equal(harness.calls[1].repair.attempt, 2);
  assert.deepEqual(harness.calls[1].repair.structural_errors.map(({ code }) => code),
    ['operation_semantic_grounding']);
  assert.equal(harness.executions.length, 1);
  assert.equal(harness.executions[0].operation.actor_ref, actor);
  assert.deepEqual(trace.canonicalizations,
    [actorDiagnostic('unknown-repair-executor-98', '$.operations[0].actor_ref', 2)]);
  assert.equal(trace.repaired, true);
});

test('only the accepted attempt contributes executor diagnostics', async () => {
  for (const repairedActor of ['unknown-accepted-executor-100', actor]) {
    const harness = workflow({
      state: { visible_entities: [{ entity_ref: 'wax-seal-71' }] },
      auditResults: [false, true],
      model: (request, repair) => domainPlan(request,
        discovery(repair == null ? 'unknown-discarded-executor-99' : repairedActor))
    });
    const trace = await resolveWorkflow(harness);
    assert.equal(harness.calls.length, 2);
    assert.equal(harness.executions.length, 1);
    assert.equal(harness.executions[0].operation.actor_ref, actor);
    assert.equal(harness.audits[0].plan.operations[0].actor_ref, actor);
    if (repairedActor === actor) {
      assert.equal(Object.hasOwn(trace, 'canonicalizations'), false);
    } else {
      assert.deepEqual(trace.canonicalizations,
        [actorDiagnostic(repairedActor, '$.operations[0].actor_ref', 2)]);
    }
  }
});

test('workflow canonicalizes an executor in a nested check outcome', async () => {
  const oldRef = 'unknown-outcome-executor-101';
  const harness = workflow({
    state: { visible_entities: [{ entity_ref: 'linen-pad-82' }] },
    model: (request) => turnStepPlan(request, { resolution: 'generic_check',
      goal_result: 'pending', operations: [],
      check: genericCheck({ clean_success: { goal_result: 'achieved',
        additional_activity: null, operations: [activity(oldRef)],
        continuation: null } }) })
  });
  const trace = await resolveWorkflow(harness);
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.executions.length, 1);
  assert.equal(harness.executions[0].operation.actor_ref, actor);
  assert.equal(trace.approved_plan.check.outcomes.clean_success.operations[0]
    .actor_ref, actor);
  assert.equal(trace.check_outcome, 'clean_success');
  assert.deepEqual(trace.canonicalizations, [actorDiagnostic(oldRef,
    '$.check.outcomes.clean_success.operations[0].actor_ref')]);
});

for (const { name, operation, path } of [
  { name: 'body actor', operation: bodyEvent('unknown-outcome-body-102'),
    path: '$.check.outcomes.clean_success.operations[0].actor_ref' },
  { name: 'target', operation: activity(actor, 'unknown-outcome-target-103'),
    path: '$.check.outcomes.clean_success.operations[0].target_refs[0]' }
]) {
  test(`nested unknown ${name} remains a deterministic structural failure`, async () => {
    const harness = workflow({ model: (request) => turnStepPlan(request,
      { resolution: 'generic_check', goal_result: 'pending', operations: [],
        check: genericCheck({ clean_success: { goal_result: 'achieved',
          additional_activity: null, operations: [operation], continuation: null } }) }) });
    await assert.rejects(harness.run, (error) => {
      assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
      assert.deepEqual(error.details.errors, [unknownError(path)]);
      assert.equal(error.details.repair_attempted, false);
      assert.equal(error.details.repair_suppressed, 'deterministic_structure_invalid');
      return true;
    });
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.executions.length, 0);
    assert.equal(harness.commits.length, 0);
  });
}

function a1Operation(actorRef) {
  return { op: 'request_item_use', actor_ref: actorRef,
    item_ref: 'linen-panel-104', use_kind: 'other', target_refs: [],
    description: 'Отделяю лоскут от полотнища.',
    action_production: { source_refs: ['linen-panel-104'], tool_refs: [],
      requested_output_count: null, identity_mode: 'independent_outputs',
      origin: 'direct_partition', result_class: 'partial_transformation',
      material_extent: 'minor', result_descriptor: {
        display_name: 'лоскут полотна',
        physical_description: 'отдельный лоскут льняного полотна',
        qualitative_facts: [], removed_physical_fact_refs: [],
        inscription_text: null, physical_form: 'regular',
        source_fact_delta: {
          physical_description: 'полотно с отделённым лоскутом',
          qualitative_facts: [], removed_physical_fact_refs: [],
          physical_form: 'regular'
        }
      }, output_class: 'ordinary_mundane' }
  };
}

test('workflow combines A1 description and executor diagnostics without duplicates', async () => {
  const operation = a1Operation('unknown-a1-executor-105');
  const harness = workflow({
    state: { items: [{ item_id: 'linen-panel-104', name: 'льняное полотнище' }] },
    model: (request) => domainPlan(request, operation, {
      activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' }
    })
  });
  const trace = await resolveWorkflow(harness);
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.executions.length, 1);
  const executed = harness.executions[0].operation;
  assert.equal(executed.actor_ref, actor);
  assert.equal(Object.hasOwn(executed, 'description'), false);
  assert.deepEqual(executed.action_production, operation.action_production);
  assert.equal(trace.approved_plan.operations[0].actor_ref, actor);
  assert.equal(Object.hasOwn(trace.approved_plan.operations[0], 'description'), false);
  assert.deepEqual([...trace.canonicalizations].sort((a, b) =>
    a.path.localeCompare(b.path)), [
    actorDiagnostic(operation.actor_ref),
    { attempt: 1, path: '$.operations[0].description',
      removed_fields: ['description'] }
  ]);
});

test('commit accepts exact executor diagnostics and rejects malformed records', async () => {
  const harness = workflow({
    state: { visible_entities: [{ entity_ref: 'wax-seal-71' }] },
    model: (request) => domainPlan(request, discovery('unknown-commit-executor-106'))
  });
  const trace = await resolveWorkflow(harness);
  assert.deepEqual(trace.canonicalizations,
    [actorDiagnostic('unknown-commit-executor-106')]);
  const envelope = harness.commits[0].turn_step_commit;
  assert.deepEqual(validateTurnStepCommitEnvelope(envelope), { ok: true, errors: [] });
  const mutations = [
    { name: 'path', mutate: (candidate) => {
      candidate.canonicalizations[0].path = '$.operations[0].target_refs[0]';
    } },
    { name: 'actor', mutate: (candidate) => {
      candidate.canonicalizations[0].new_value = 'foreign-executor-107';
    } },
    { name: 'approved plan actor', mutate: (candidate) => {
      candidate.approved_plan.operations[0].actor_ref = 'wax-seal-71';
    } },
    { name: 'attempt', mutate: (candidate) => {
      candidate.canonicalizations[0].attempt = 2;
    } },
    { name: 'duplicate', mutate: (candidate) => {
      candidate.canonicalizations.push(structuredClone(candidate.canonicalizations[0]));
    } },
    { name: 'known old value', mutate: (candidate) => {
      candidate.canonicalizations[0].old_value = 'wax-seal-71';
    } }
  ];
  for (const { name, mutate } of mutations) {
    const candidate = structuredClone(envelope);
    mutate(candidate.loop_trace.step_traces[0]);
    mutate(candidate.mode_resolution.decision_trace.step_traces[0]);
    assert.deepEqual(candidate.loop_trace.step_traces,
      candidate.mode_resolution.decision_trace.step_traces);
    const validation = validateTurnStepCommitEnvelope(candidate);
    assert.equal(validation.ok, false, name);
    assert.ok(validation.errors.includes(
      'step_traces must contain exact ordered code-owned traces'), name);
  }
  assert.deepEqual(validateTurnStepCommitEnvelope(envelope), { ok: true, errors: [] });
});

test('operation DTO validates self-contained references without mutation', () => {
  const operation = discovery('actor-outside-request', 'target-outside-request');
  const before = structuredClone(operation);
  const validation = validateTurnStepOperationDto(operation);
  assert.deepEqual(validation, { ok: true, errors: [] });
  assert.deepEqual(operation, before);
  assert.equal(Object.isFrozen(validation), true);
  assert.equal(Object.isFrozen(validation.errors), true);
});

test('operation DTO preserves exact structural errors without mutation', () => {
  const cases = [
    { value: null, errors: [{ path: '$[0]', code: 'type',
      message: 'must be an object' }] },
    { value: activity('actor-outside-request'), errors: [] },
    { value: { ...activity('actor-outside-request'),
      target_refs: ['target-outside-request', 'target-outside-request'] },
    errors: [{ path: '$[0].target_refs[1]', code: 'unique',
      message: 'duplicate reference' }] },
    { value: discovery(''), errors: [{ path: '$[0].actor_ref', code: 'type',
      message: 'must be a non-empty string' }] },
    { value: { ...discovery('actor-outside-request'), extra: true },
      errors: [{ path: '$[0].extra', code: 'additional_property',
        message: 'is forbidden' }] }
  ];
  for (const { value, errors } of cases) {
    const before = structuredClone(value);
    assert.deepEqual(validateTurnStepOperationDto(value),
      { ok: errors.length === 0, errors });
    assert.deepEqual(value, before);
  }
});
