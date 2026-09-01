import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runTurnStepLoop } from '@rus/turn';
import { createAmbientOrdinaryPortionAdmission } from
  '@rus/items-property/ambient-ordinary-portion';
import { createRuntimeInstanceMechanicsSnapshot } from '@rus/items-property';
import { ambientContextPort } from './ambient-ordinary-portion-fixture.js';
import {
  createLowerDvinaTraceTurnStepRuntimePorts,
  resolveLowerDvinaTraceTurnStepCheckContext
} from '../src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from
  '../src/runtime/lower-dvina-trace-player-safe-working.js';

const ownerProfiles = JSON.parse(await readFile(new URL(
  '../../../data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m1-content/turn-step-owner-profiles.json',
  import.meta.url
)));

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
    const prepared = {
      resolution: 'materialize', item: {
        item_id: itemId, runtime_placement: { anchor_id: 'shore' },
        item_proposal: { semantic_descriptor: {
          semantic_type: 'ordinary_object_candidate',
          name: 'длинная доска', facts: ['доска лежит на берегу']
        } },
        mechanics_snapshot: createRuntimeInstanceMechanicsSnapshot({
          schema: 'rus.items.runtime_instance_mechanics_snapshot.v1',
          version: 1, provenance: {
            source_kind: 'ordinary_direct_action_result',
            root_turn_id: 'turn:party:1', step_index: 1,
            operation_ref: 'ordinary:prepared',
            origin_kind: 'ambient_ordinary', source_refs: ['shore']
          }, mechanics: mechanics({ mass_grams: 3000,
            external_hand_cost: 1, carry_form: 'long' })
        })
      }
    };
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

function execution(operation, workingProjection = projection(), step = 1) {
  return {
    plan: {},
    request: {
      root_turn_id: 'turn:party:1',
      step_index: step,
      actor: actor()
    },
    operation,
    working_projection: workingProjection,
    check_result: null
  };
}

function createPorts(options = {}) {
  return createLowerDvinaTraceTurnStepRuntimePorts({
    ...options,
    genericCheckContextOwner:
      options.genericCheckContextOwner ?? projectedCheckOwner(),
    ordinaryResultPolicy:
      options.ordinaryResultPolicy ?? testOrdinaryPolicy(),
    admitAmbientOrdinaryPortion:
      options.admitAmbientOrdinaryPortion ?? null,
    workingProjectionAuthority:
      createLowerDvinaTracePlayerSafeWorkingProjectionAuthority()
  });
}

function testOrdinaryPolicy() {
  const policy = structuredClone(ownerProfiles.ordinary_result_policy);
  policy.candidates.find(({ semantic_type: type, name }) =>
    type === 'material_portion' && name === 'горсть мокрого песка')
    .approved_fact_texts.push(
      'песок теперь лежит плотным влажным комком');
  return policy;
}

function authorityCommittedState() {
  return {
    actor_id: 'mikula',
    player_profile: {
      attributes: { strength: { value: 9 } },
      skills: { athletics: { bonus: 1 } },
      inventory: projection().inventory
    },
    position: { location_ref: 'shore' },
    items: [],
    knowledge: projection().knowledge
  };
}

function loopInput() {
  return {
    requestId: 'turn-step:party:1',
    rootTurnId: 'turn:party:1',
    committedStateVersion: 7,
    rootPlayerAction: 'выполнить обычное действие',
    actor: actor(),
    initialWorkingProjection: projection(),
    maxInternalSteps: 8
  };
}

function actor() {
  return {
    actor_id: 'mikula',
    attributes: { strength: { value: 9, bonus: -1 } },
    skills: { athletics: { bonus: 1 } },
    body: { body_parts: { left_arm: { id: 'left_arm' } } }
  };
}

function projection() {
  return {
    actor_id: 'mikula',
    position: { location_ref: 'shore' },
    destination_refs: ['camp'],
    inventory: {
      items: [],
      total_weight: { grams: 400 },
      load_category: 'light',
      occupied_hands: 0
    },
    items: [],
    knowledge: [{
      fact_id: 'shore',
      knowledge_state: 'known_from_committed_source',
      text: 'доступный речной берег'
    }]
  };
}

function createSand() {
  return {
    op: 'create_entity',
    temp_ref: 'new_entity_1',
    semantic_type: 'material_portion',
    name: 'горсть мокрого песка',
    origin: { kind: 'ambient_ordinary', source_refs: ['shore'] },
    facts: [{
      temp_ref: 'new_fact_1',
      text: 'это мокрый речной песок, набранный с берега'
    }],
    mechanics: mechanics(),
    placement: { relation: 'held_by', target_ref: 'mikula' }
  };
}

function mechanics(overrides = {}) {
  return {
    mass_grams: 300,
    external_hand_cost: 1,
    carry_form: 'compact',
    packing_slot_cost: 1,
    quantity: { value: 1, unit: 'handful' },
    container: null,
    ...overrides
  };
}

function plan(request, overrides = {}) {
  return {
    schema: 'turn_step_plan_v1',
    request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    step_index: request.step_index,
    interpretation: {
      player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent,
      adaptation: 'literal'
    },
    resolution: 'direct',
    goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations: [],
    check: null,
    continuation: null,
    clarification: null,
    reason_code: 'ordinary_direct_action',
    reason: 'Обычное прямое действие.',
    ...overrides
  };
}

function genericCheck() {
  const outcome = {
    goal_result: 'achieved',
    additional_activity: null,
    operations: [],
    continuation: null
  };
  return {
    purpose: 'удержать обычный предмет',
    attribute_ref: 'strength',
    skill_ref: 'athletics',
    difficulty_id: 'ordinary',
    outcomes: Object.fromEntries([
      'clean_success', 'success', 'success_with_cost',
      'failure_with_consequence', 'severe_failure'
    ].map((band) => [band, structuredClone(outcome)]))
  };
}

function activityOwner(overrides = {}) {
  return {
    async resolve({ activity }) {
      return {
        profile_ref: 'approved_activity:moment_none',
        profile_pin: { artifact_id: 'test', revision: 1,
          digest: '1'.repeat(64) },
        duration_minutes: 0,
        duration_class: activity.duration_class,
        effort: activity.effort,
        body_effect_ref: null,
        body_effect_profile_ref: 'approved_body_effect:activity',
        exact_deltas: { health: 0, satiety: 0, energy: 0 },
        body_state_after: { health: 100, satiety: 100, energy: 100,
          active_conditions: [], body_parts: {} },
        ...overrides
      };
    }
  };
}

function projectedCheckOwner() {
  return {
    resolve({ check, actor: value }) {
      const attribute = value.attributes?.[check.attribute_ref];
      if (!Number.isFinite(attribute?.value)) {
        throw Object.assign(new Error('attribute gap'), {
          code: 'TRACE_TURN_STEP_CHECK_ATTRIBUTE_DATA_GAP'
        });
      }
      const skill = check.skill_ref == null
        ? { bonus: 0 } : value.skills?.[check.skill_ref];
      if (!Number.isFinite(skill?.bonus)) {
        throw Object.assign(new Error('skill gap'), {
          code: 'TRACE_TURN_STEP_CHECK_SKILL_DATA_GAP'
        });
      }
      return { attribute_value: attribute.value, skill_bonus: skill.bonus,
        state_modifier: 0, equipment_modifier: 0,
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
        } };
    }
  };
}

function testPolicyProfilePin() {
  return {
    artifact_id: 'test_turn_step_owner_profiles', revision: 1,
    digest: 'a'.repeat(64)
  };
}
