import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTurnStepPlan } from '@rus/turn';
import { executeTurnStepActorStep } from '../../../packages/turn/src/turn-step-actor-step.js';
import { createPorts, execution, actor, projection, preparedOrdinary, plan, semanticOwners } from './lower-dvina-trace-turn-step-runtime-ports-fixture.js';
import { request } from './lower-dvina-trace-turn-step-llm-test-helpers.js';
import { createLowerDvinaTraceTurnStepModel } from '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { createLowerDvinaTraceTurnStepSemanticGroundingValidator } from '../src/runtime/lower-dvina-trace-turn-step-grounding-audit.js';
import { createLowerDvinaTraceTurnStepVisibleProjector } from '../src/runtime/lower-dvina-trace-turn-step-fire-visible.js';
import { requestTurnStepPlanWithRepair } from '../../../packages/turn/src/turn-step-plan-repair.js';

for (const [name, intent, denial = false] of [
  ['длинная ветвь', 'длинной ветвью осторожно прощупываю воду между обломками.'],
  ['гладкая палочка', 'гладкой палочкой касаюсь внешней стенки глиняного горшка.'],
  ['деревянная ложка', 'деревянной ложкой касаюсь пустой чаши.', true]
]) test(`prepared ordinary item supports transient use without physical mutation: ${name}`, async () => {
  const itemId = 'ordinary_item:stable-use';
  const ordinary = preparedOrdinary(itemId);
  ordinary.item.item_proposal.semantic_descriptor.name = name;
  const state = { ...projection(), position: { location_ref: 'shore', position_id: 'shore-position' }, items: [{ item_id: itemId, name,
    placement: { scene_position_id: 'shore-position' } }], current_visible_context: {
      visible_objects: [{ entity_ref: { entity_kind: 'item', entity_id: itemId }, visible_status: 'available' }] } };
  const body = { health: 100, energy: 100, satiety: 100, active_conditions: [], body_parts: {} };
  const input = request({ root_player_action: intent, remaining_intent: intent,
    actor: { ...actor(), body }, player_safe_state: { ...state,
      ordinary_resolution: { discovery_available: true, scene_seed_available: false, container_resolution_available: false } } });
  const operation = { op: 'request_item_use', actor_ref: 'mikula', item_ref: itemId,
    use_kind: 'other', target_refs: ['shore'], description: intent };
  const roles = [];
  const roleRunner = { async run(call) {
    roles.push(call.role_id);
    if (call.role_id === 'turn_step_grounding_auditor') {
      const wire = JSON.parse(call.messages[1].content);
      assert.deepEqual(wire.operation, operation);
      assert.match(call.messages[0].content, /handled material[\s\S]*An explicit attempt to cause a result does not assert that the result happened/u);
      return { output: { pass: true, concerns: [] } };
    }
    if (denial && call.role_id === 'turn_step_planner') return { output: plan(input, {
      goal_result: 'not_achieved', reason_code: 'no_matching_operation',
      reason: 'No specific code-owned operation for this non-transforming physical use.' }) };
    if (denial) assert.match(call.messages[0].content, /Never repeat discovery for that same known item/u);
    return { output: plan(input, { resolution: 'domain_request', goal_result: 'pending',
      activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
      operations: [operation] }) };
  } };
  const { plan: approved } = await requestTurnStepPlanWithRepair({ request: input,
    turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner }),
    semanticPlanValidator: createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner }) });
  assert.equal(validateTurnStepPlan(approved, { request: input }).ok, true);
  assert.deepEqual(roles, ['turn_step_planner', ...(denial ? ['turn_step_planner_repair'] : []), 'turn_step_grounding_auditor']);
  const runtime = createPorts({ committedState: { items: [], body_state: body },
    semanticActivityOwner: semanticOwners.semanticActivityOwner });
  const before = structuredClone(ordinary);
  const result = await executeTurnStepActorStep({ plan: approved, request: input,
    workingProjection: state, preparedOrdinaryPlan: ordinary, preparedActionProductionPlans: [],
    registry: runtime.executionRegistry, ports: {} });
  assert.equal(result.goalResult, 'achieved');
  assert.equal(result.continuation, null);
  assert.equal(result.workingProjection.items[0].item_id, itemId);
  assert.deepEqual(result.workingProjection.items[0].placement, { scene_position_id: 'shore-position' });
  assert.deepEqual(result.workingProjection.items[0], state.items[0]);
  assert.deepEqual(ordinary, before);
  assert.equal(result.action_production_atomic_write_plan, null);
  const scene = { version: 1, schema: 'visible_context_package', visible_scene: 'Берег.',
    visible_changes: [], sensory_details: [], visible_objects: [], visible_npc: [],
    known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: [] };
  const visible = await createLowerDvinaTraceTurnStepVisibleProjector({ fallback: {
    project: async () => assert.fail('no fallback') } }).project({
    retrieved_state: { current_visible_context: scene },
    consequence: { visible_seed: Object.assign({}, ...result.consequenceFragments.map(c => c.visible_seed)) },
    mode_resolution: { decision_trace: { step_traces: [{ applied: true,
      step_index: input.step_index, approved_plan: approved }] } } });
  assert.deepEqual(visible.visible_changes, [
    `Вы выполнили попытку: «${intent}»`
  ]);
});

test('transient use revalidates actor, current item control and visible targets; A1 stays unclaimed', () => {
  const runtime = createPorts();
  const op = { op: 'request_item_use', actor_ref: 'mikula', item_ref: 'known',
    use_kind: 'other', target_refs: [], description: 'Касаюсь предмета орудием.' };
  const state = { ...projection(), items: [{ item_id: 'known', name: 'орудие',
    placement: { holder_character_id: 'mikula', physical_position: 'hands' } }] };
  const handler = runtime.executionRegistry.domain(op);
  assert.equal(runtime.executionRegistry.domain({ ...op, action_production: {} }), null);
  assert.equal(runtime.executionRegistry.domain({ ...op, description: undefined }), null);
  for (const [operation, projected] of [[{ ...op, actor_ref: 'other' }, state],
    [{ ...op, item_ref: 'hidden' }, state], [{ ...op, target_refs: ['hidden'] }, state],
    [op, { ...state, items: [{ ...state.items[0], placement: { scene_position_id: 'shore-position' } }] }]]) {
    assert.throws(() => handler(execution(operation, projected)));
  }
  const result = handler(execution(op, state));
  assert.deepEqual(result.write_fragments, []);
  assert.deepEqual(result.working_projection, state);
});

test('transient use cannot turn an attempted contact into a discovered fact or durable result', async () => {
  const input = request({ remaining_intent: 'Касаюсь поверхности орудием.',
    player_safe_state: { items: [{ item_id: 'tool', name: 'орудие',
      placement: { holder_character_id: 'actor_mikula', physical_position: 'hands' } }] } });
  for (const description of ['На дне обнаружен тайник.', 'Орудие превратилось в крюк.']) {
    const validator = createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner: {
      async run(call) {
        const wire = JSON.parse(call.messages[1].content);
        assert.equal(wire.operation.description, description);
        assert.match(call.messages[0].content, /discovered fact[\s\S]*durable physical change/u);
        return { output: { pass: false, concerns: [{ kind: 'operation_semantic_grounding' }] } };
      }
    } });
    await assert.rejects(validator({ request: input, plan: { operations: [{
      op: 'request_item_use', actor_ref: input.actor.actor_ref, item_ref: 'tool',
      use_kind: 'other', target_refs: [], description }], continuation: null } }),
    { code: 'TURN_STEP_PLAN_INVALID' });
  }
});

test('in-place scope is exact in both grounding and runtime; hidden and forged placements fail closed', async () => {
  const operation = { op: 'request_item_use', actor_ref: 'mikula', item_ref: 'tool',
    use_kind: 'other', target_refs: [], description: 'Касаюсь поверхности орудием.' };
  const visible = { entity_ref: { entity_kind: 'item', entity_id: 'tool' }, visible_status: 'available' };
  const base = { ...projection(), position: { location_ref: 'shore', position_id: 'here' },
    items: [{ item_id: 'tool', name: 'орудие', placement: { scene_position_id: 'here' } }],
    current_visible_context: { visible_objects: [visible] } };
  const runtime = createPorts();
  const validator = createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner: {
    async run() { assert.fail('Invalid physical access rejects before semantic audit.'); }
  } });
  for (const state of [
    { ...base, current_visible_context: { visible_objects: [] } },
    { ...base, current_visible_context: { visible_objects: [{ ...visible, visible_status: 'inaccessible' }] } },
    ...[{ scene_position_id: 'elsewhere' }, { scene_position_id: 'here', location_ref: 'elsewhere' },
      { scene_position_id: 'here', container_id: 'closed' }, { holder_character_id: 'other' },
      { scene_position_id: 'here', holder_character_id: 'mikula' }]
      .map(placement => ({ ...base, items: [{ ...base.items[0], placement }] })),
    { ...base, items: [{ ...base.items[0], access_state: 'blocked' }] }
  ]) {
    const input = { ...execution(operation, state), request: { actor: { actor_id: 'mikula' }, player_safe_state: state } };
    assert.throws(() => runtime.executionRegistry.domain(operation)(input), { code: 'TRACE_TURN_STEP_ITEM_USE_ACCESS_INVALID' });
    await assert.rejects(validator({ plan: { operations: [operation] }, request: input.request }), { code: 'TURN_STEP_PLAN_INVALID' });
  }
});


for (const [name, intent, wrongDescription] of [
  ['длинная ветвь', 'и длинной ветвью осторожно прощупываю воду между обломками.', 'осторожно прощупываю водой между обломками длинной ветвью'],
  ['сухой лоскут', 'сухим лоскутом вытираю край чаши.', 'вытираю край чашей']
]) for (const missing of [true, false]) test(`transient source/description trial avoids full repair: ${name}, missing=${missing}`, async () => {
  const { createTurnStepDomainOwnerPreflight } = await import('../../../packages/turn/src/turn-step-admission.js');
  const itemId = 'ordinary:stable';
  const state = { ...projection(), position: { location_ref: 'shore', position_id: 'here' },
    items: missing ? [] : [{ item_id: itemId, name, placement: { scene_position_id: 'here' } }],
    current_visible_context: { visible_objects: missing ? [] : [{
      entity_ref: { entity_kind: 'item', entity_id: itemId }, visible_status: 'available' }] },
    ordinary_resolution: { discovery_available: true, scene_seed_available: false, container_resolution_available: false } };
  const input = request({ root_player_action: intent, remaining_intent: intent, actor: actor(), player_safe_state: state });
  const operation = { op: 'request_item_use', actor_ref: 'mikula', item_ref: missing ? 'invented-placeholder' : itemId,
    use_kind: 'other', target_refs: [], description: missing ? intent : wrongDescription };
  const calls = [];
  const roleRunner = { async run(call) {
    calls.push(call.role_id);
    if (call.role_id === 'turn_step_planner') return { output: plan(input, {
      resolution: 'direct', goal_result: 'not_achieved', operations: [operation],
      activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' } }) };
    assert.equal(call.role_id, 'turn_step_grounding_auditor', 'full planner repair is forbidden');
    const payload = JSON.parse(call.messages[1].content);
    if (missing) {
      assert.equal(payload.correction_candidate, 'missing_ordinary_referent');
      assert.equal(payload.operation.query, intent);
      assert.deepEqual(payload.operation.target_refs, ['shore']);
      assert.deepEqual(payload.player_safe_state.items, []);
      return { output: { mode: 'material_prerequisite', consumed_intent: null, prerequisite_query: name } };
    }
    assert.equal(payload.operation.item_ref, itemId);
    assert.equal(payload.operation.description, intent);
    return { output: { pass: true, concerns: [] } };
  } };
  const runtime = createPorts();
  const preflight = createTurnStepDomainOwnerPreflight({ externalRegistry: runtime.executionRegistry,
    semanticBindings: [], availableOptions: new Set(), actor: input.actor, committedState: {},
    services: { turnStepOrdinaryDiscoveryResolver() {},
      turnStepSemanticGroundingValidator: createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner }) } });
  const result = await requestTurnStepPlanWithRepair({ request: input,
    turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner }), semanticPlanValidator: preflight });
  assert.deepEqual(calls, ['turn_step_planner', 'turn_step_grounding_auditor']);
  assert.equal(result.repaired, false);
  assert.equal(result.plan.direct_result_kind, null);
  assert.equal(validateTurnStepPlan(result.plan, { request: input }).ok, true);
  if (missing) {
    assert.deepEqual(result.plan.operations, [{ op: 'request_discovery', actor_ref: 'mikula',
      discovery_kind: 'inspect', target_refs: ['shore'], query: name }]);
    assert.deepEqual(result.plan.continuation, { remaining_intent: intent, depends_on_refs: [] });
  } else {
    assert.deepEqual(result.plan.operations, [{ ...operation, description: intent }]);
    assert.equal(result.plan.continuation, null);
    const executed = runtime.executionRegistry.domain(result.plan.operations[0])(
      execution(result.plan.operations[0], state));
    assert.deepEqual(executed.write_fragments, []);
    assert.deepEqual(executed.working_projection, state);
    assert.equal(Object.values(executed.consequence_fragment.visible_seed)[0].description, intent);
    const visible = await createLowerDvinaTraceTurnStepVisibleProjector({ fallback: { project: async () => assert.fail() } })
      .project({ retrieved_state: { current_visible_context: { version: 1, schema: 'visible_context_package',
        visible_scene: 'Берег', visible_changes: [], uncertainties: [], sensory_details: [], visible_objects: [],
        visible_npc: [], known_context: [], allowed_tensions: [], do_not_imply: [] } },
      consequence: { visible_seed: { ...executed.consequence_fragment.visible_seed,
        turn_step_activity: { kind: 'semantic_activity', duration_minutes: 5 } } },
      mode_resolution: { decision_trace: { remaining_intent: null,
        step_traces: [{ step_index: input.step_index, applied: true, approved_plan: result.plan }] } } });
    assert.deepEqual(visible.visible_changes, [
      `Вы выполнили попытку: «${intent}»`
    ]);
  }
});


test('missing-item trial accepts only the captured source error set and never duplicates a known item', async () => {
  const { assembleTurnStepPlan } = await import('../src/runtime/lower-dvina-trace-turn-step-plan-assembly.js');
  const captured = [{ path: '$.operations[0].item_ref', code: 'unknown_ref' },
    { path: '$.operations.0.item_ref', code: 'source_placement_grounding' }];
  for (const variant of ['captured', 'extra-error', 'known-inaccessible']) {
    const input = request({ actor: actor(), remaining_intent: 'Лоскутом протираю чашу.',
      player_safe_state: { position: { location_ref: 'shore', zone_ref: 'placeholder' },
        items: variant === 'known-inaccessible' ? [{ item_id: 'placeholder',
          placement: { holder_character_id: 'other' } }] : [],
        ordinary_resolution: { discovery_available: true, scene_seed_available: false,
          container_resolution_available: false } } });
    const original = assembleTurnStepPlan(plan(input, { operations: [{ op: 'request_item_use',
      actor_ref: 'mikula', item_ref: 'placeholder', use_kind: 'other', target_refs: [],
      description: input.remaining_intent }], activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' } }), input);
    const errors = variant === 'extra-error' ? [...captured, { path: '$.check', code: 'type' }] : captured;
    let planners = 0;
    let focused = 0;
    const grounding = createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner: { async run() {
      focused += 1;
      return { output: { mode: 'material_prerequisite', consumed_intent: null, prerequisite_query: 'сухой лоскут' } };
    } } });
    const pending = requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: async () => { planners += 1; return original; },
      semanticPlanValidator: context => {
        if (context.plan.operations[0].op === 'request_item_use') throw Object.assign(new Error('missing source'),
          { code: 'TURN_STEP_PLAN_INVALID', details: { errors } });
        return grounding({ ...context, resolved_domain_operations: [{ path: '$.operations.0', owner_kind: 'ordinary_discovery' }] });
      } });
    if (variant === 'captured') {
      const result = await pending;
      assert.equal(result.repaired, false);
      assert.equal(planners, 1);
      assert.equal(focused, 1);
      assert.deepEqual(result.plan.continuation, { remaining_intent: input.remaining_intent, depends_on_refs: [] });
    } else {
      await assert.rejects(pending, { code: 'TURN_STEP_PLAN_INVALID' });
      assert.equal(focused, 0);
    }
  }
});

test('exact-intent description trial still rejects transformation, discovery and independent actions', async () => {
  for (const intent of ['Вытачиваю из палочки крюк.', 'Палочкой обнаруживаю спрятанное письмо.',
    'Палочкой касаюсь чаши, затем иду к воротам.']) {
    const input = request({ actor: actor(), remaining_intent: intent, player_safe_state: {
      items: [{ item_id: 'tool', placement: { holder_character_id: 'mikula', physical_position: 'hands' } }] } });
    const operation = { op: 'request_item_use', actor_ref: 'mikula', item_ref: 'tool',
      use_kind: 'other', target_refs: [], description: 'Касаюсь поверхностью.' };
    let planners = 0;
    const descriptions = [];
    const roleRunner = { async run(call) {
      if (call.role_id === 'turn_step_planner' || call.role_id === 'turn_step_planner_repair') {
        planners += 1;
        return { output: plan(input, { operations: [operation],
          activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' } }) };
      }
      descriptions.push(JSON.parse(call.messages[1].content).operation.description);
      assert.match(call.messages[0].content, /Copying the intent is not proof/u);
      return { output: { pass: false, concerns: [{ kind: 'operation_semantic_grounding' }] } };
    } };
    await assert.rejects(requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner }),
      semanticPlanValidator: createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner }) }),
    { code: 'TURN_STEP_PLAN_INVALID' });
    assert.equal(planners, 2);
    assert.deepEqual(descriptions, [intent, intent]);
  }
});
