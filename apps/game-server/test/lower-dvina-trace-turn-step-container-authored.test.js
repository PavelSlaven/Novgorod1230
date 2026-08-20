import assert from 'node:assert/strict';
import test from 'node:test';
import { runTurnStepLoop } from '@rus/turn';
import { createLowerDvinaTraceTurnStepRuntimePorts } from
  '../src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from
  '../src/runtime/lower-dvina-trace-player-safe-working.js';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';

test('open then take moves one existing authored sword in the same root turn',
  async () => {
    const requests = [];
    const result = await runScenario({
      items: [chest(), sword()],
      model(request) {
        requests.push(structuredClone(request));
        return request.step_index === 1
          ? domainPlan(request, openOperation(), {
              remaining_intent: 'взять существующий меч из сундука',
              depends_on_refs: ['chest']
            })
          : directPlan(request, [{
              op: 'move_entity', entity_ref: 'sword',
              placement: { relation: 'held_by', target_ref: 'actor' }
            }]);
      }
    });
    assert.equal(requests[0].player_safe_state.items.some(
      ({ item_id: ref }) => ref === 'sword'), false);
    assert.equal(requests[1].player_safe_state.items.some(
      ({ item_id: ref }) => ref === 'sword'), true);
    assert.deepEqual(result.working_projection.items.find(
      ({ item_id: ref }) => ref === 'sword').placement,
    { holder_character_id: 'actor', physical_position: 'hands' });
    assert.deepEqual(result.working_projection.items.find(
      ({ item_id: ref }) => ref === 'sword').ownership,
    { owner_ref: 'other-actor' });
    assert.deepEqual(result.working_projection.inventory, {
      items: ['sword'], total_weight: { grams: 1500 },
      load_category: 'light', occupied_hands: 1
    });
    assert.deepEqual(result.write_fragments.map(
      ({ value }) => value.operation_kind).filter(Boolean), [
      'request_container_access', 'move_entity'
    ]);
  });

test('authored move uses committed mechanics and rejects overload', async () => {
  const heavyMechanics = { ...swordMechanics(), mass_grams: 100_000 };
  const ports = runtimePorts([sword({
    placement: { location_ref: 'shore' }
  })], { mechanics: heavyMechanics });
  const projection = {
    ...initialProjection([]),
    items: [sword({ placement: { location_ref: 'shore' } })]
  };
  const operation = {
    op: 'move_entity', entity_ref: 'sword',
    placement: { relation: 'held_by', target_ref: 'actor' }
  };
  await assert.rejects(() => ports.executionRegistry.direct(operation)(
    execution(operation, projection)
  ), { code: 'ITEM_RUNTIME_INVENTORY_LOAD_INVALID' });
});

test('absent sword terminates after access without creating one', async () => {
  const result = await runScenario({
    items: [chest()],
    model(request) {
      return request.step_index === 1
        ? domainPlan(request, openOperation(), {
            remaining_intent: 'взять меч, только если он существует',
            depends_on_refs: ['chest']
          })
        : directPlan(request, [], 'not_achieved');
    }
  });
  assert.equal(result.stop_reason, 'terminal');
  assert.equal(result.working_projection.items.some(
    ({ item_id: ref }) => ref === 'sword'), false);
  assert.equal(result.write_fragments.some(
    ({ value }) => value.operation_kind === 'create_entity'), false);
});

test('locked container opens only through one shared check success outcome',
  async () => {
    let rolls = 0;
    const result = await runScenario({
      items: [chest({ open_state: 'locked' }), sword()],
      randomSource: { next() { rolls += 1; return 0.95; } },
      model: (request) => lockedPlan(request)
    });
    assert.equal(rolls, 1);
    assert.equal(result.check_results[0].outcome.band, 'clean_success');
    assert.equal(result.working_projection.items.some(
      ({ item_id: ref }) => ref === 'sword'), true);
    assert.deepEqual(result.write_fragments.map(
      ({ value }) => value.operation_kind).filter(Boolean),
    ['request_container_access']);
  });

test('authored items reject facts, mechanics and retirement ordinary paths',
  async () => {
    const ports = runtimePorts([sword({
      placement: { location_ref: 'shore' }
    })]);
    const projection = {
      ...initialProjection([]),
      items: [sword({ placement: { location_ref: 'shore' } })]
    };
    for (const operation of [{
      op: 'change_entity_facts', entity_ref: 'sword',
      remove_fact_refs: [], add_facts: []
    }, {
      op: 'set_entity_mechanics', entity_ref: 'sword',
      mechanics: swordMechanics(), reason: 'forbidden'
    }, {
      op: 'retire_entity', entity_ref: 'sword', reason: 'forbidden'
    }]) {
      assert.throws(() => ports.executionRegistry.direct(operation)(execution(
        operation, projection
      )), { code: 'TRACE_TURN_STEP_RUNTIME_ENTITY_REQUIRED' });
    }
  });

test('committed access survives restart and only then reveals authored contents',
  async () => {
    const committed = committedProjectionState();
    const before = projectLowerDvinaTracePlayerSafeState({
      committed_state: committed, actor_id: 'actor'
});

    assert.equal(before.player_safe_state.items.some(
      ({ item_id: ref }) => ref === 'sword'), false);

    const firstPorts = runtimePorts(committed.items);
    const opened = await firstPorts.executionRegistry.domain(openOperation())(
      execution(openOperation(), before.player_safe_state)
    );
    const patch = opened.write_fragments[0].value.payload.state_patch;
    const restartedState = structuredClone(committed);
    restartedState.items = restartedState.items.map((item) =>
      item.item_id === 'chest'
        ? { ...item, ...patch, state: { ...(item.state ?? {}), ...patch } }
        : item);
    const after = projectLowerDvinaTracePlayerSafeState({
      committed_state: restartedState, actor_id: 'actor'
    });
    assert.equal(after.player_safe_state.items.some(
      ({ item_id: ref }) => ref === 'sword'), true);

    const restartedPorts = runtimePorts(restartedState.items);
    const moved = await restartedPorts.executionRegistry.direct({
      op: 'move_entity'
    })(execution({
      op: 'move_entity', entity_ref: 'sword',
      placement: { relation: 'held_by', target_ref: 'actor' }
    }, after.player_safe_state));
    assert.equal(moved.working_projection.inventory.items.includes('sword'),
      true);
  });

test('O2b reveal registers sealed mechanics for a same-turn move', async () => {
  const requests = [],turnRequests=[], items = [chest({ commit_state: 'committed', mechanics_profile_ref: 'chest-mechanics', ordinary_contents_context: ordinaryContext() })];
  const run = (rootPlayerAction) => { const ports = runtimePorts(items, { ordinaryContainerContentsResolver: async ({ stage_a_request }) => { requests.push(stage_a_request); const child = ordinaryChild(); return { pass: true, materialized_items: [child], ordinary_materialization_atomic_write_plan: { schema: 'ordinary_container_contents_atomic_write_plan_v2', write_plan_digest: 'sealed-test-plan', scope_ref: { entity_kind: 'container', entity_id: 'chest' }, container_transition:{access_kind:'open_and_view',state_patch:{open_state:'open',contents_state:'known',access_state:{access:'open'}},revealed_refs:[child.item_id]}, items: [ordinaryPlanItem(child.item_id)] }, errors: [] }; } }); return runTurnStepLoop({ requestId: 'request', rootTurnId: 'turn', committedStateVersion: 1, rootPlayerAction, actor: actor(), initialWorkingProjection: initialProjection(items), maxInternalSteps: 8 }, { executionRegistry: ports.executionRegistry, resolveCheckContext: ports.resolveCheckContext, turnStepModel: async (request) => { turnRequests.push(structuredClone(request)); return request.step_index === 1
    ? domainPlan(request, openOperation(), { remaining_intent:
      'взять обнаруженный предмет', depends_on_refs: ['chest'] })
    : directPlan(request, [{ op: 'move_entity', entity_ref:
      request.player_safe_state.items.find(({name}) => name === 'кусок трута')
        ?.item_id,
      placement:{ relation:'held_by', target_ref:'actor' } }]); }, projectPlayerSafeState: async ({ working_projection: projection }) => projection, revalidateCommittedState: async () => true }); };
  const first = await run('открываю сундук и беру меч');
  assert.deepEqual(first.working_projection.items.find(({ item_id }) =>
    item_id === 'ordinary-child').placement,
  { holder_character_id:'actor', physical_position:'hands' });
  assert.equal(first.working_projection.inventory.items.includes(
    'ordinary-child'), true);
  assert.equal(turnRequests[0].player_safe_state.items.some(({item_id}) =>
    item_id === 'ordinary-child'),false);
  const revealed=turnRequests[1].player_safe_state.items.find(({item_id}) =>
    item_id === 'ordinary-child');
  assert.equal(revealed.name,'кусок трута');
  assert.equal(revealed.semantic_type,'fire_tinder');
  assert.equal(requests.length,1);
  await run('открываю сундук и беру золото');
  assert.equal(requests.length, 2); assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests[0].schema,
    'rus.items.existing_container_ordinary_seed_request.v2');
  assert.equal(requests[0].technical_limits.max_new_entities,4);
  assert.equal(requests[0].candidate_query, null); assert.equal(JSON.stringify(requests[0]).includes('меч'), false);
});

test('moving closed unresolved container resolves concealed child before mass',
  async () => {
    let calls = 0;
    let forgedReveal = true;
    const container = chest({commit_state:'committed',
      mechanics_profile_ref:'chest-mechanics',
      ordinary_contents_context:ordinaryContext(),placement:{location_ref:'shore'}});
    const ports = runtimePorts([container], {
      ordinaryContainerContentsResolver:async () => {
        calls += 1; const children=[ordinaryChild(),ordinaryChild(
          'ordinary-child-2','fire_starter','береста')];
        return {pass:true,materialized_items:children,errors:[],
          ordinary_materialization_atomic_write_plan:{schema:
            'ordinary_container_contents_atomic_write_plan_v2',
          write_plan_digest:'sealed-test-plan',scope_ref:{entity_kind:
            'container',entity_id:'chest'},container_transition:forgedReveal
              ? {access_kind:'open_and_view',state_patch:{open_state:'open',
                contents_state:'known',access_state:{access:'open'}},
                revealed_refs:children.map(({item_id})=>item_id)}
              : {access_kind:'resolve_concealed',state_patch:{contents_state:
                'resolved_concealed'},revealed_refs:[]},
          items:[ordinaryPlanItem(children[0].item_id),
            ordinaryPlanItem(children[1].item_id,120)]}};
      }
    });
    const operation={op:'move_entity',entity_ref:'chest',placement:{
      relation:'held_by',target_ref:'actor'}};
    await assert.rejects(ports.executionRegistry.direct(operation)(execution(
      operation,initialProjection([container]))),{
      code:'TRACE_TURN_STEP_CONTAINER_ORDINARY_RESOLUTION_INVALID'});
    forgedReveal=false;
    const moved=await ports.executionRegistry.direct(operation)(execution(
      operation,initialProjection([container])));
    assert.equal(calls,2);
    assert.equal(moved.ordinary_materialization_atomic_write_plan
      .container_transition.access_kind,'resolve_concealed');
    assert.equal(moved.working_projection.items.some(({item_id}) =>
      item_id === 'ordinary-child'),false);
    assert.equal(moved.working_projection.inventory.total_weight.grams,700);
    const drop={op:'move_entity',entity_ref:'chest',placement:{
      relation:'located_at',target_ref:'shore'}};
    const dropped=await ports.executionRegistry.direct(drop)(execution(
      drop,moved.working_projection));
    assert.equal(calls,2);
    assert.equal(dropped.ordinary_materialization_atomic_write_plan,
      undefined);
    assert.equal(dropped.working_projection.inventory.total_weight.grams,0);
  });

async function runScenario({ items, model, randomSource = null }) {
  const ports = runtimePorts(items);
  return runTurnStepLoop({
    requestId: 'request', rootTurnId: 'turn', committedStateVersion: 1,
    rootPlayerAction: 'открываю сундук и беру меч',
    actor: actor(), initialWorkingProjection: initialProjection(items),
    maxInternalSteps: 8
  }, {
    executionRegistry: ports.executionRegistry,
    resolveCheckContext: ports.resolveCheckContext,
    randomSource,
    turnStepModel: model,
    projectPlayerSafeState: async ({ working_projection: projection }) =>
      projection,
    revalidateCommittedState: async () => true
  });
}

function runtimePorts(items, { mechanics = swordMechanics(), ordinaryContainerContentsResolver = null } = {}) {
  const containers=items.filter((item) => item.contents_state != null)
    .map((item) => ({...structuredClone(item),container_id:item.item_id,
      state:{...(item.state ?? {}),contents_state:item.contents_state,
        ...(item.ordinary_contents_context == null ? {} : {
          ordinary_contents_context:structuredClone(
            item.ordinary_contents_context)})}}));
  return createLowerDvinaTraceTurnStepRuntimePorts({
    committedState: { actor_id: 'actor',
      items:items.filter((item) => item.contents_state == null),containers },
    ordinaryContainerContentsResolver,
    resolveItemMechanics(ref) {
      return ref === 'sword' ? mechanics
        : ref === 'chest' ? chestMechanics() : null;
    },
    semanticActivityOwner: {
      resolve({ activity }) {
        return {
          profile_ref: 'activity',
          profile_pin: { artifact_id: 'activity', revision: 1,
            digest: 'a'.repeat(64) },
          duration_minutes: 0,
          duration_class: activity.duration_class,
          effort: activity.effort,
          body_effect_ref: null,
          body_effect_profile_ref: 'body:none',
          exact_deltas: { health: 0, satiety: 0, energy: 0 },
          body_state_after: actor().body
        };
      }
    },
    genericCheckContextOwner: {
      resolve() {
        return {
          attribute_value: 30, skill_bonus: 0, state_modifier: 0,
          equipment_modifier: 0, circumstance_modifier: 0,
          policy_profile_ref: 'container-check',
          policy_profile_pin: { artifact_id: 'container-check', revision: 1,
            digest: 'b'.repeat(64) },
          check_policy_ref: { entity_kind: 'check_policy',
            entity_id: 'container-check', authoring_version: '1' },
          consequence_policy_ref: { entity_kind: 'consequence_policy',
            entity_id: 'container-outcomes', authoring_version: '1' }
        };
      }
    },
    workingProjectionAuthority:
      createLowerDvinaTracePlayerSafeWorkingProjectionAuthority()
  });
}

function ordinaryContext() { return { container_ref: 'chest', template_id: 'chest-template',
  mechanics_profile_ref: 'chest-mechanics', owner_controller_ref: 'owner:actor',
  property_ref: 'property:owner', site_function_ref: 'site:store',
  economic_context_ref: 'economy:household', context_bound_permission_refs: [],
  ordinary_policy: { schema: 'rus.items.existing_container_ordinary_policy.v2', version: 2,
    unresolved_ordinary_contents: true, technical_limits: { schema:
      'rus.items.existing_container_ordinary_limits.v1', version: 1,
      max_new_entities: 4 } }, authoritative_status: 'absent' }; }
function ordinaryChild(item_id='ordinary-child',semantic_type='fire_tinder',
  name='кусок трута') { return { item_id, semantic_type,name,
  authority: 'ordinary', disclosure: 'concealed', admission_class: 'common_mundane',
  is_container: false, evidence: false, authentic_document: false, hidden_history: false,
  secret_cache: false, placement: { container_id: 'chest' } }; }
function ordinaryPlanItem(item_id,mass_grams=80) { return { item_id,
  runtime_mechanics_snapshot:{ schema:
    'rus.items.runtime_instance_mechanics_snapshot.v1', version:1,
  provenance:{ source_kind:'ordinary_world_materialization',
    root_turn_id:'turn', step_index:1,
    operation_ref:'request_container_access:chest',
    origin_kind:'existing_container_ordinary', source_refs:['basis:stored'] },
  mechanics:{ mass_grams, external_hand_cost:0, carry_form:'compact',
    packing_slot_cost:1, quantity:{ value:1, unit:'item' },
    container:null } } }; }

function initialProjection(items) {
  return {
    actor_id: 'actor', position: { location_ref: 'shore' },
    inventory: { items: [], total_weight: { grams: 0 },
      load_category: 'light', occupied_hands: 0 },
    items: items.filter(({ item_id: ref }) => ref !== 'sword')
      .map((item) => structuredClone(item)),
    knowledge: []
  };
}

function chest(overrides = {}) {
  return {
    item_id: 'chest', template_id: 'chest-template', name: 'сундук',
    visible: true, open_state: 'closed', contents_state: 'contents_hidden',
    placement: { location_ref: 'shore' }, ...overrides
  };
}

function sword(overrides = {}) {
  return {
    item_id: 'sword', template_id: 'sword-template', name: 'меч',
    ownership: { owner_ref: 'other-actor' },
    placement: { container_id: 'chest' }, ...overrides
  };
}

function swordMechanics() {
  return {
    mass_grams: 1500, external_hand_cost: 1, carry_form: 'long',
    packing_slot_cost: 2, packing_bundle_size: 1, quantity: null,
    container: null
  };
}

function chestMechanics() { return {mass_grams:500,external_hand_cost:1,
  carry_form:'regular',packing_slot_cost:1,quantity:null,
  container:{capacity:4}}; }

function actor() {
  return {
    actor_id: 'actor', attributes: { strength: { value: 12 } },
    body: { health: 100, satiety: 100, energy: 100,
      active_conditions: [], body_parts: {} }
  };
}

function committedProjectionState() {
  return {
    actor_id: 'actor',
    player_profile: {
      attributes: { strength: { value: 12 } },
      inventory: { items: [], total_weight: { grams: 0 },
        load_category: 'light', occupied_hands: 0 }
    },
    body_state: actor().body,
    position: { location_ref: 'shore' },
    items: [chest(), sword()],
    knowledge: []
  };
}

function openOperation() {
  return {
    op: 'request_container_access', actor_ref: 'actor',
    container_ref: 'chest', access_kind: 'open_and_view'
  };
}

function domainPlan(request, operation, continuation) {
  return plan(request, {
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [operation], continuation
  });
}

function directPlan(request, operations, goalResult = 'achieved') {
  return plan(request, { operations, goal_result: goalResult });
}

function lockedPlan(request) {
  const outcome = (band) => ({
    goal_result: band === 'clean_success' ? 'achieved' : 'not_achieved',
    additional_activity: null,
    operations: band === 'clean_success' ? [openOperation()] : [],
    continuation: null
  });
  return plan(request, {
    resolution: 'generic_check', goal_result: 'pending', operations: [],
    check: {
      purpose: 'открыть замок', attribute_ref: 'strength', skill_ref: null,
      difficulty_id: 'risky', outcomes: Object.fromEntries([
        'clean_success', 'success', 'success_with_cost',
        'failure_with_consequence', 'severe_failure'
      ].map((band) => [band, outcome(band)]))
    }
  });
}

function plan(request, overrides = {}) {
  return {
    schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    step_index: request.step_index,
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent, adaptation: 'literal' },
    resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations: [], check: null, continuation: null, clarification: null,
    reason_code: 'test', reason: 'test', ...overrides
  };
}

function execution(operation, projection) {
  return {
    plan: {}, request: { root_turn_id: 'turn', step_index: 1,
      actor: actor() }, operation, working_projection: projection,
    check_result: null
  };
}
