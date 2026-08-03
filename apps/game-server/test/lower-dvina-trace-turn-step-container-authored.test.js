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
  assert.throws(() => ports.executionRegistry.direct(operation)(
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

function runtimePorts(items, { mechanics = swordMechanics() } = {}) {
  return createLowerDvinaTraceTurnStepRuntimePorts({
    committedState: { actor_id: 'actor', items },
    resolveItemMechanics(ref) {
      return ref === 'sword' ? mechanics : null;
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
