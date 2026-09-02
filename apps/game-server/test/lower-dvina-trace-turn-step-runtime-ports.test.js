import assert from 'node:assert/strict';
import test from 'node:test';
import { runTurnStepLoop } from '@rus/turn';
import { createAmbientOrdinaryPortionAdmission } from
  '@rus/items-property/ambient-ordinary-portion';
import { ambientContextPort } from './ambient-ordinary-portion-fixture.js';
import { createLowerDvinaTraceTurnStepRuntimePorts,
  resolveLowerDvinaTraceTurnStepCheckContext } from
  '../src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from
  '../src/runtime/lower-dvina-trace-player-safe-working.js';

import { activityOwner, actor, authorityCommittedState, createPorts, createSand,
  execution, genericCheck, loopInput, mechanics, plan, preparedOrdinary,
  projectedCheckOwner, projection, testOrdinaryPolicy, testPolicyProfilePin } from
  './lower-dvina-trace-turn-step-runtime-ports-fixture.js';

test('create_entity returns a deterministic self-contained ordinary item draft',
  async () => {
    const left = createPorts();
    const right = createPorts();
    const operation = createSand();
    const first = await left.executionRegistry.direct(operation)(
      execution(operation)
    );
    const repeated = await right.executionRegistry.direct(operation)(
      execution(operation)
    );

    assert.equal(first.write_fragments[0].target, 'party_items');
    const draft = first.write_fragments[0].value;
    assert.equal(draft.schema,
      'rus.lower_dvina_trace_turn_step_direct_operation.v1');
    assert.equal(draft.operation_kind, 'create_entity');
    assert.equal(draft.root_turn_id, 'turn:party:1');
    assert.equal(draft.step_index, 1);
    assert.equal(draft.operation_id,
      repeated.write_fragments[0].value.operation_id);
    assert.equal(draft.payload.entity_ref,
      repeated.write_fragments[0].value.payload.entity_ref);
    assert.equal('template_id' in draft.payload, false);
    assert.equal(
      draft.payload.runtime_instance_mechanics_snapshot.schema,
      'rus.items.runtime_instance_mechanics_snapshot.v1'
    );
    assert.deepEqual(
      draft.payload.runtime_instance_mechanics_snapshot.mechanics,
      operation.mechanics
    );
    assert.equal(Object.isFrozen(
      draft.payload.runtime_instance_mechanics_snapshot), true);
    assert.deepEqual(first.working_projection.inventory, {
      items: ['new_entity_1'],
      total_weight: { grams: 700 },
      load_category: 'light',
      occupied_hands: 1
    });
    assert.equal(first.working_projection.items[0].item_id, 'new_entity_1');
    assert.equal(first.working_projection.knowledge[1].fact_id, 'new_fact_1');
    assert.equal(JSON.stringify(first).includes('must-not-reach-model'), false);
  });

test('legacy ambient direct action remains available without an O2a admission port', async () => {
  const ports = createLowerDvinaTraceTurnStepRuntimePorts({
    ordinaryResultPolicy: testOrdinaryPolicy(),
    workingProjectionAuthority: createLowerDvinaTracePlayerSafeWorkingProjectionAuthority()
  });
  const result = await ports.executionRegistry.direct(createSand())(execution(createSand()));
  assert.equal(result.write_fragments[0].target, 'party_items');
});

test('revision 32 leaves active Phase9 container access to its authored owner', () => {
  const committedState = {
    materialization_trace: {
      seed_context: { scenario_definition_revision: 32 }
    },
    phase9: {}
  };
  const active = createPorts({ committedState });
  assert.equal(active.executionRegistry.domain({
    op: 'request_container_access'
  }), null);

  const inactive = createPorts({
    committedState: { ...committedState, phase9: null }
  });
  assert.equal(typeof inactive.executionRegistry.domain({
    op: 'request_container_access'
  }), 'function');
});

test('an active O2a profile fails closed when its binding has drifted', () => {
  const ports = createPorts({ requireAmbientOrdinaryAdmission: true,
    admitAmbientOrdinaryPortion: null });
  assert.throws(() => ports.executionRegistry.direct(createSand())(
    execution(createSand())), { code: 'TRACE_TURN_STEP_AMBIENT_ADMISSION_REQUIRED' });
});

test('the second internal step sees and mutates the first working projection',
  async () => {
    const ports = createPorts({
      semanticActivityOwner: activityOwner()
    });
    const requests = [];
    const result = await runTurnStepLoop(loopInput(), {
      executionRegistry: ports.executionRegistry,
      turnStepModel: async (request) => {
        requests.push(structuredClone(request));
        return request.step_index === 1
          ? plan(request, {
              goal_result: 'pending',
              operations: [createSand()],
              continuation: {
                remaining_intent: 'изменить текущий факт о песке',
                depends_on_refs: ['new_entity_1']
              }
            })
          : plan(request, {
              goal_result: 'achieved',
              operations: [{
                op: 'change_entity_facts',
                entity_ref: 'new_entity_1',
                remove_fact_refs: ['new_fact_1'],
                add_facts: [{
                  temp_ref: 'new_fact_2',
                  text: 'песок теперь лежит плотным влажным комком'
                }]
              }]
            });
      },
      projectPlayerSafeState: async ({ working_projection: value }) => value,
      revalidateCommittedState: async () => true
    });

    assert.equal(requests.length, 2);
    assert.equal(requests[1].working_revision, 1);
    assert.equal(requests[1].player_safe_state.items[0].item_id,
      'new_entity_1');
    assert.equal(requests[1].player_safe_state.knowledge[1].fact_id,
      'new_fact_1');
    assert.equal(result.working_projection.knowledge.some(
      ({ fact_id: ref }) => ref === 'new_fact_1'), false);
    assert.equal(result.working_projection.knowledge.some(
      ({ fact_id: ref }) => ref === 'new_fact_2'), true);
    assert.deepEqual(result.write_fragments.map(({ target }) => target), [
      'party_items', 'party_events', 'party_items', 'party_events'
    ]);
    assert.equal(JSON.stringify(requests[1]).includes(
      'must-not-reach-model'), false);
  });

test('direct projections require the same submit-scoped authority', async () => {
  const committedState = authorityCommittedState();
  const initial = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    actor_id: 'mikula'
  }).player_safe_state;
  const authority = createLowerDvinaTracePlayerSafeWorkingProjectionAuthority();
  const ports = createLowerDvinaTraceTurnStepRuntimePorts({
    ordinaryResultPolicy: testOrdinaryPolicy(),
    admitAmbientOrdinaryPortion: createAmbientOrdinaryPortionAdmission({
      loadCommittedContext: async () => ambientContextPort()
    }),
    workingProjectionAuthority: authority
  });
  const sand = { ...createSand(), facts: [] };
  const created = await ports.executionRegistry.direct(sand)(
    execution(sand, initial)
  );

  const admitted = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    working_projection: structuredClone(created.working_projection),
    working_projection_authority: authority,
    actor_id: 'mikula'
  });
  assert.equal(admitted.player_safe_state.items[0].item_id, 'new_entity_1');

  assert.throws(() => projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    working_projection: structuredClone(created.working_projection),
    actor_id: 'mikula'
  }), { code: 'TRACE_PLAYER_SAFE_WORKING_PROJECTION_INVALID' });
  const foreign = createLowerDvinaTracePlayerSafeWorkingProjectionAuthority();
  assert.throws(() => projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState,
    working_projection: structuredClone(created.working_projection),
    working_projection_authority: foreign,
    actor_id: 'mikula'
  }), { code: 'TRACE_PLAYER_SAFE_WORKING_PROJECTION_INVALID' });
});

test('entity operations reject stale refs and unsupported projection relations',
  async () => {
    const ports = createPorts();
    const move = ports.executionRegistry.direct({ op: 'move_entity' });
    await assert.rejects(() => move(execution({
      op: 'move_entity',
      entity_ref: 'hidden-item',
      placement: { relation: 'held_by', target_ref: 'mikula' }
    })), { code: 'TRACE_TURN_STEP_REF_NOT_CURRENT' });

    const created = await ports.executionRegistry.direct(createSand())(
      execution(createSand())
    );
    await assert.rejects(() => move(execution({
      op: 'move_entity',
      entity_ref: 'new_entity_1',
      placement: { relation: 'inside', target_ref: 'new_entity_1' }
    }, created.working_projection)), {
      code: 'ITEM_RUNTIME_PLACEMENT_CYCLE'
    });
  });

test('same-turn prepared ordinary item can move through the generic owner',
  async () => {
    const ports = createPorts();
    const itemId = 'ordinary_item:prepared-board';
    const prepared = preparedOrdinary(itemId);
    const visible = projection();
    visible.items.push({ item_id: itemId, name: 'длинная доска',
      semantic_type: 'ordinary_object_candidate',
      placement: { anchor_id: 'shore' } });
    const input = execution({ op: 'move_entity', entity_ref: itemId,
      placement: { relation: 'held_by', target_ref: 'mikula' } }, visible);
    input.prepared_ordinary_materialization_atomic_write_plan = prepared;

    const moved = await ports.executionRegistry.direct({ op: 'move_entity' })(
      input);
    assert.equal(moved.working_projection.items[0].placement
      .holder_character_id, 'mikula');
    assert.equal(moved.working_projection.inventory.occupied_hands, 1);
    assert.equal(moved.write_fragments[0].value.payload.entity_ref, itemId);
  });

test('ordinary discovery projects its prepared item into the same root',
  async () => {
    const itemId = 'ordinary_item:discovered-board';
    const prepared = preparedOrdinary(itemId);
    const ports = createPorts({ ordinaryDiscoveryResolver: async (input) => ({
      working_projection: input.working_projection,
      write_fragments: [], summary: 'ordinary discovery resolved',
      ordinary_materialization_atomic_write_plan: prepared
    }) });
    const discovered = await ports.ordinaryDiscoveryResolver(execution({
      op: 'request_discovery', actor_ref: 'mikula', discovery_kind: 'search',
      target_refs: ['shore'], query: 'найти доску'
    }));
    assert.equal(discovered.working_projection.items[0].item_id, itemId);

    const moveInput = execution({ op: 'move_entity', entity_ref: itemId,
      placement: { relation: 'held_by', target_ref: 'mikula' } },
    discovered.working_projection, 2);
    moveInput.prepared_ordinary_materialization_atomic_write_plan = prepared;
    const moved = await ports.executionRegistry.direct({ op: 'move_entity' })(
      moveInput);
    assert.equal(moved.working_projection.items[0].placement
      .holder_character_id, 'mikula');
  });

test('committed runtime mechanics hydrate a fresh per-turn adapter', async () => {
  const initial = createPorts();
  const created = await initial.executionRegistry.direct(createSand())(
    execution(createSand())
  );
  const payload = created.write_fragments[0].value.payload;
  const item = created.working_projection.items[0];
  const committedState = {
    items: [{
      item_id: payload.entity_ref,
      runtime_instance_mechanics_snapshot:
        payload.runtime_instance_mechanics_snapshot
    }],
    knowledge: []
  };
  const restarted = createPorts({
    committedState
  });
  const committedProjection = {
    ...projection(),
    items: [{ ...item, item_id: payload.entity_ref,
      instance_id: payload.entity_ref }],
    inventory: {
      items: [payload.entity_ref],
      total_weight: { grams: 700 },
      load_category: 'light',
      occupied_hands: 1
    }
  };
  const moved = await restarted.executionRegistry.direct({
    op: 'move_entity'
  })(execution({
    op: 'move_entity',
    entity_ref: payload.entity_ref,
    placement: { relation: 'located_at', target_ref: 'shore' }
  }, committedProjection));
  assert.equal(moved.working_projection.inventory.total_weight.grams, 400);
  assert.equal(moved.working_projection.inventory.occupied_hands, 0);

  assert.throws(() => createPorts({
    committedState: { items: [{ item_id: 'broken-runtime-item' }] }
  }), { code: 'TRACE_TURN_STEP_COMMITTED_RUNTIME_MECHANICS_INVALID' });
});

test('move, mechanics and retirement remain limited to admitted runtime items',
  async () => {
    const ports = createPorts();
    const create = ports.executionRegistry.direct(createSand());
    const first = await create(execution({
      ...createSand(),
      name: 'кусок коры',
      facts: [],
      mechanics: mechanics({ mass_grams: 100, external_hand_cost: 0 })
    }));
    const secondOperation = {
      ...createSand(),
      temp_ref: 'new_entity_2',
      name: 'щепка',
      origin: {
        kind: 'direct_partition',
        source_refs: ['new_entity_1']
      },
      facts: [],
      mechanics: mechanics({ mass_grams: 50, external_hand_cost: 0 }),
      placement: { relation: 'located_at', target_ref: 'shore' }
    };
    const second = await create(execution(
      secondOperation,
      first.working_projection
    ));
    const set = ports.executionRegistry.direct({
      op: 'set_entity_mechanics'
    });
    const changed = await set(execution({
      op: 'set_entity_mechanics',
      entity_ref: 'new_entity_2',
      mechanics: mechanics({ mass_grams: 40, external_hand_cost: 1 }),
      reason: 'щепка физически укорочена'
    }, second.working_projection));
    assert.equal(changed.write_fragments[0].value.payload
      .runtime_instance_mechanics_snapshot.mechanics.mass_grams, 40);

    const moved = await ports.executionRegistry.direct({ op: 'move_entity' })(
      execution({
        op: 'move_entity',
        entity_ref: 'new_entity_2',
        placement: { relation: 'held_by', target_ref: 'mikula' }
      }, changed.working_projection)
    );
    assert.equal(moved.working_projection.inventory.occupied_hands, 1);
    assert.equal(moved.working_projection.inventory.total_weight.grams, 540);

    const retired = await ports.executionRegistry.direct({
      op: 'retire_entity'
    })(execution({
      op: 'retire_entity',
      entity_ref: 'new_entity_1',
      reason: 'кора полностью пошла на щепку'
    }, moved.working_projection));
    assert.equal(retired.working_projection.items.some(
      ({ item_id: ref }) => ref === 'new_entity_1'), false);

    const fresh = createPorts();
    const ambient = await fresh.executionRegistry.direct(createSand())(
      execution(createSand())
    );
    assert.throws(() => fresh.executionRegistry.direct({
      op: 'set_entity_mechanics'
    })(execution({
      op: 'set_entity_mechanics',
      entity_ref: 'new_entity_1',
      mechanics: mechanics({ mass_grams: 1 }),
      reason: 'неподтверждённое изменение'
    }, ambient.working_projection)), {
      code: 'TRACE_TURN_STEP_MECHANICS_CHANGE_UNPROVEN'
    });
  });

test('apply_body_event delegates without calculating body deltas', async () => {
  const operation = {
    op: 'apply_body_event',
    actor_ref: 'mikula',
    mechanism: 'impact',
    severity: 'minor',
    body_part_ref: 'left_arm',
    description: 'левое предплечье ударилось о камень'
  };
  const missing = createPorts();
  await assert.rejects(() => missing.executionRegistry.direct(operation)(
    execution(operation)
  ), { code: 'TRACE_TURN_STEP_BODY_EVENT_OWNER_MISSING' });

  let received = null;
  const delegated = createPorts({
    bodyEventOwner: {
      async resolve(request) {
        received = request;
        return {
          body_effect_ref: 'approved_body_effect:impact_minor',
          composite_body_effect_ref: 'approved_body_effect:composite',
          payload: {
            body_effect_ref: 'approved_body_effect:impact_minor',
            profile_pin: { artifact_id: 'test', revision: 1,
              digest: '1'.repeat(64) },
            selected_context: { kind: 'direct_body_event',
              mechanism: 'impact', severity: 'minor',
              body_part_ref: 'left_arm' },
            exact_deltas: { health: -1 },
            state_after: { health: 99 }
          }
        };
      }
    }
  });
  const result = await delegated.executionRegistry.direct(operation)(
    execution(operation)
  );

  assert.equal(received.event.description, operation.description);
  assert.equal(result.player_response_boundary, true);
  assert.equal(result.consequence_fragment.body_effect_ref,
    'approved_body_effect:composite');
  assert.equal(JSON.stringify(result.consequence_fragment.visible_seed)
    .includes('exact_deltas'), false);
  assert.deepEqual(
    Object.values(result.consequence_fragment.hidden_update)[0],
    {
      body_effect_ref: 'approved_body_effect:impact_minor',
      profile_pin: { artifact_id: 'test', revision: 1,
        digest: '1'.repeat(64) },
      selected_context: { kind: 'direct_body_event', mechanism: 'impact',
        severity: 'minor', body_part_ref: 'left_arm' },
      exact_deltas: { health: -1 }, state_after: { health: 99 }
    }
  );
  assert.equal(result.write_fragments[0].value.schema,
    'rus.lower_dvina_trace_turn_step_direct_operation.v1');
});

test('generic check context uses only projected actor-owned numeric values',
  async () => {
    const context = resolveLowerDvinaTraceTurnStepCheckContext({
      check: {
        attribute_ref: 'strength',
        skill_ref: 'athletics',
        attribute_value: 99,
        skill_bonus: 99
      },
      actor: actor(),
      working_projection: projection()
    }, projectedCheckOwner());
    assert.deepEqual(context, {
      attribute_value: 9,
      skill_bonus: 1,
      state_modifier: 0,
      equipment_modifier: 0,
      circumstance_modifier: 0,
      policy_profile_ref: 'test_check_policy',
      policy_profile_pin: testPolicyProfilePin(),
      check_policy_ref: {
        entity_kind: 'check_policy', entity_id: 'test_check_policy',
        authoring_version: '1'
      },
      consequence_policy_ref: {
        entity_kind: 'consequence_policy',
        entity_id: 'test_consequence_policy', authoring_version: '1'
      }
    });
    assert.throws(() => resolveLowerDvinaTraceTurnStepCheckContext({
      check: { attribute_ref: 'missing', skill_ref: null },
      actor: actor(),
      working_projection: projection()
    }, projectedCheckOwner()), {
      code: 'TRACE_TURN_STEP_CHECK_ATTRIBUTE_DATA_GAP'
    });

    const ports = createPorts({
      semanticActivityOwner: activityOwner()
    });
    const result = await runTurnStepLoop(loopInput(), {
      executionRegistry: ports.executionRegistry,
      resolveCheckContext: ports.resolveCheckContext,
      randomSource: { next: () => 0.5 },
      projectPlayerSafeState: async ({ working_projection: value }) => value,
      revalidateCommittedState: async () => true,
      turnStepModel: async (request) => plan(request, {
        resolution: 'generic_check',
        goal_result: 'pending',
        operations: [],
        check: genericCheck(),
        continuation: null
      })
    });
    assert.deepEqual(result.check_results[0].modifiers, {
      attribute: -1,
      skill: 1,
      state: 0,
      equipment: 0,
      circumstances: 0
    });
    assert.equal(result.check_results[0].difficulty, 10);
    assert.equal(result.write_fragments[0].target, 'party_events');
    assert.equal(result.consequence_fragments[0].duration_minutes, 0);
  });

test('semantic activity requires an approved owner and preserves its profile',
  async () => {
    const operation = {
      op: 'apply_semantic_activity',
      activity: {
        owner: 'semantic', duration_class: 'short', effort: 'heavy'
      }
    };
    const missing = createPorts();
    await assert.rejects(() => missing.executionRegistry.semanticActivity()(
      execution(operation)
    ), { code: 'TRACE_TURN_STEP_SEMANTIC_ACTIVITY_OWNER_MISSING' });

    const ports = createPorts({
      semanticActivityOwner: activityOwner({
        profile_ref: 'approved_activity:short_heavy',
        duration_minutes: 17
      })
    });
    const result = await ports.executionRegistry.semanticActivity()(
      execution(operation)
    );
    assert.equal(result.consequence_fragment.duration_minutes, 17);
    assert.equal(result.player_response_boundary, true);
    assert.equal(result.write_fragments[0].target, 'party_events');
    assert.equal(result.write_fragments[0].value.profile_ref,
      'approved_activity:short_heavy');
    assert.deepEqual(result.consequence_fragment.state_changes[0], {
      kind: 'semantic_activity',
      activity_id: result.write_fragments[0].value.activity_id,
      profile_ref: 'approved_activity:short_heavy',
      profile_pin: { artifact_id: 'test', revision: 1,
        digest: '1'.repeat(64) },
      duration_class: 'short',
      effort: 'heavy',
      body_effect_profile_ref: 'approved_body_effect:activity',
      body_effect_context: { kind: 'semantic_activity',
        duration_class: 'short', effort: 'heavy' }
    });
  });
