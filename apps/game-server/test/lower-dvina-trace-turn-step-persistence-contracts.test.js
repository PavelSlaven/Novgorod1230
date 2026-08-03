import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeInstanceMechanicsSnapshot } from '@rus/items-property';
import { prepareLowerDvinaTraceTurnStepPersistence } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-persistence.js';

test('M1 reconciles exact body-owner payload without recalculation', () => {
  const payload = bodyPayload();
  const operation = direct('apply_body_event', 'body-op', {
    actor_ref: 'actor-1', body_effect_ref: payload.body_effect_ref, payload
  });
  const commit = factual(payload);
  const result = prepare([operation], commit);
  assert.equal(Object.values(result.writes).flat().some(({ target_table }) =>
    target_table === 'party_actor_body_states'), false);
  const history = result.writes.appends.find(({ target_table }) =>
    target_table === 'party_body_temporal_history');
  assert.equal(history.record.effect_ref.component_effects[0].component_ref,
    'body-op');
  assert.equal(history.record.change_set_id, 'change-1');
  assert.equal(result.snapshot.turn_step_body_history.length, 1);
  const forged = structuredClone(operation);
  forged.value.payload.payload.exact_deltas.health = -2;
  assert.throws(() => prepare([forged], commit), {
    code: 'TRACE_TURN_STEP_BODY_EVENT_RECONCILIATION_FAILED'
  });
  const extra = structuredClone(operation);
  extra.value.payload.payload.unowned_delta = true;
  assert.throws(() => prepare([extra], commit), {
    code: 'TRACE_TURN_STEP_BODY_EVENT_OWNER_INVALID'
  });
  const forgedState = structuredClone(payload);
  forgedState.state_after.health = 77;
  const forgedOperation = structuredClone(operation);
  forgedOperation.value.payload.payload = forgedState;
  const forgedCommit = structuredClone(commit);
  forgedCommit.hidden_update['turn_step_body_event:body-op'] = forgedState;
  assert.throws(() => prepare([forgedOperation], forgedCommit), {
    code: 'TRACE_TURN_STEP_BODY_EVENT_RECONCILIATION_FAILED'
  });
});

test('M1 reconciles two identical body profiles by ordered operation identity',
  () => {
    const first = bodyPayload();
    const second = bodyPayload();
    second.state_after.health = 98;
    const commit = factualBodies([
      { operation_id: 'body-op-1', payload: first },
      { operation_id: 'body-op-2', payload: second }
    ]);
    assert.doesNotThrow(() => prepare([
      direct('apply_body_event', 'body-op-1', {
        actor_ref: 'actor-1', body_effect_ref: first.body_effect_ref,
        payload: first
      }),
      direct('apply_body_event', 'body-op-2', {
        actor_ref: 'actor-1', body_effect_ref: second.body_effect_ref,
        payload: second
      })
    ], commit));
    const swapped = structuredClone(commit);
    swapped.body_update.proposal.component_proposals.reverse();
    assert.throws(() => prepare([
      direct('apply_body_event', 'body-op-1', {
        actor_ref: 'actor-1', body_effect_ref: first.body_effect_ref,
        payload: first
      }),
      direct('apply_body_event', 'body-op-2', {
        actor_ref: 'actor-1', body_effect_ref: second.body_effect_ref,
        payload: second
      })
    ], swapped), {
      code: 'TRACE_TURN_STEP_BODY_EVENT_RECONCILIATION_FAILED'
    });
  });

test('M1 rejects body consequence order that differs from the batch', () => {
  const first = bodyPayload();
  const second = bodyPayload();
  second.state_after.health = 98;
  const commit = factualBodies([
    { operation_id: 'body-op-1', payload: first },
    { operation_id: 'body-op-2', payload: second }
  ]);
  assert.throws(() => prepare([
    direct('apply_body_event', 'body-op-2', {
      actor_ref: 'actor-1', body_effect_ref: second.body_effect_ref,
      payload: second
    }),
    direct('apply_body_event', 'body-op-1', {
      actor_ref: 'actor-1', body_effect_ref: first.body_effect_ref,
      payload: first
    })
  ], commit), {
    code: 'TRACE_TURN_STEP_BODY_EVENT_RECONCILIATION_FAILED'
  });
});

test('M1 cross-binds composite body identity to consequence body effect', () => {
  const payload = bodyPayload();
  const operation = direct('apply_body_event', 'body-op', {
    actor_ref: 'actor-1', body_effect_ref: payload.body_effect_ref, payload
  });
  const commit = factual(payload);
  commit.consequence.body_effect_ref = 'body:composite';
  assert.doesNotThrow(() => prepare([operation], commit));
  commit.body_update.proposal.profile_ref = 'body:forged';
  assert.throws(() => prepare([operation], commit), {
    code: 'TRACE_TURN_STEP_BODY_EVENT_RECONCILIATION_FAILED'
  });
});

test('M1 cross-binds exact composite body proposal to ordered components',
  () => {
    const payload = bodyPayload();
    const operation = direct('apply_body_event', 'body-op', {
      actor_ref: 'actor-1', body_effect_ref: payload.body_effect_ref, payload
    });
    const cases = [
      ['composite shape', (proposal) => { proposal.forged = true; }],
      ['component shape', (proposal) => {
        proposal.component_proposals[0].forged = true;
      }],
      ['profile revision', (proposal) => {
        proposal.profile_pin.revision += 1;
      }],
      ['profile digest', (proposal) => {
        proposal.profile_pin.digest = 'f'.repeat(64);
      }],
      ['exact delta', (proposal) => { proposal.exact_deltas.health -= 1; }],
      ['component context', (proposal) => {
        proposal.component_proposals[0].selected_context = {
          ...proposal.component_proposals[0].selected_context,
          severity: 'major'
        };
      }]
    ];
    for (const [name, tamper] of cases) {
      const commit = factual(payload);
      tamper(commit.body_update.proposal);
      assert.throws(() => prepare([operation], commit), {
        code: 'TRACE_TURN_STEP_BODY_EVENT_RECONCILIATION_FAILED'
      }, name);
    }
  });

test('M1 derives every composite body state from persisted body state', () => {
  const state = baseState();
  const payload = bodyPayload();
  payload.state_after.health = 1;
  const operation = direct('apply_body_event', 'body-op', {
    actor_ref: 'actor-1', body_effect_ref: payload.body_effect_ref, payload
  });
  assert.throws(() => prepare([operation], factual(payload), state), {
    code: 'TRACE_TURN_STEP_BODY_EVENT_RECONCILIATION_FAILED'
  });

  state.body_state.active_conditions = [{ id: 'bruise', effect: 'pain' }];
  payload.state_after = { health: 99, satiety: 90, energy: 80,
    active_conditions: [{ id: 'healed', effect: 'recovered',
      cause: payload.body_effect_ref }] };
  const validConditions = factual(payload);
  validConditions.body_update.proposal.component_proposals[0]
    .condition_transitions = [{ from: 'bruise', to: 'healed',
      outcome: 'recovered' }];
  assert.doesNotThrow(() => prepare([operation], validConditions, state));

  payload.state_after = { health: 99, satiety: 90, energy: 80,
    active_conditions: [{ id: 'bruise', effect: 'pain' }] };
  const forgedConditions = factual(payload);
  forgedConditions.body_update.proposal.component_proposals[0]
    .condition_transitions = [{ from: 'bruise', to: 'healed',
      outcome: 'recovered' }];
  assert.throws(() => prepare([operation], forgedConditions, state), {
    code: 'TRACE_TURN_STEP_BODY_EVENT_RECONCILIATION_FAILED'
  });
});

test('M1 separates fractional mechanics quantity from SQL instance count', () => {
  const result = prepare([create('op-fraction', 'runtime-item:fraction',
    mechanics('op-fraction', 0.25))]);
  assert.equal(result.writes.inserts[0].record.quantity, 1);
  assert.equal(result.writes.inserts[0].record.state
    .runtime_instance_mechanics_snapshot.mechanics.quantity.value, 0.25);
});

test('M1 cross-binds mechanics provenance to the enclosing operation', () => {
  assert.throws(() => prepare([
    create('op-create', 'runtime-item:sand', mechanics('wrong-operation'))
  ]), { code: 'TRACE_TURN_STEP_RUNTIME_MECHANICS_PROVENANCE_MISMATCH' });
});

test('M1 rejects undefined required item payload fields with typed errors', () => {
  assert.throws(() => prepare([direct('move_entity', 'op-move', {
    entity_ref: 'runtime-item:missing', placement: undefined
  })]), { code: 'TRACE_TURN_STEP_OPERATION_BATCH_INVALID' });
  assert.throws(() => prepare([direct('change_entity_facts', 'op-facts', {
    entity_ref: 'runtime-item:missing', remove_fact_refs: undefined,
    add_facts: undefined
  })]), { code: 'TRACE_TURN_STEP_OPERATION_BATCH_INVALID' });
});

test('M1 omits entities and facts created then retired in one batch', () => {
  const created = create('op-create', 'runtime-item:chip',
    mechanics('op-create'));
  created.value.payload.facts = [{
    fact_id: 'fact:chip:fresh', temp_ref: 'fresh', text: 'свежая щепка'
  }];
  const result = prepare([created, direct('retire_entity', 'op-retire', {
    entity_ref: 'runtime-item:chip', reason: 'сожжена'
  })]);
  assert.equal(result.snapshot.items.some(
    ({ item_id: id }) => id === 'runtime-item:chip'), false);
  assert.equal(result.snapshot.knowledge.some(
    ({ fact_id: id }) => id === 'fact:chip:fresh'), false);
  assert.equal(Object.values(result.writes).flat().length, 0);
});

test('M1 final inventory validation rejects combined batch over-capacity', () => {
  const state = baseState();
  state.containers = [{ container_id: 'pouch-1', template_id: 'pouch' }];
  state.container_placements = [{
    container_id: 'pouch-1', holder_character_id: 'actor-1',
    physical_position: 'worn'
  }];
  state.container_profiles = [{
    template_id: 'pouch', mass_grams: 100, external_hand_cost: 0,
    carry_form: 'compact', packing_slot_cost: 1, packing_bundle_size: 1,
    capacity: 1
  }];
  const first = create('op-first', 'runtime-item:first',
    mechanics('op-first'));
  const second = create('op-second', 'runtime-item:second',
    mechanics('op-second'));
  first.value.payload.placement = { container_id: 'pouch-1' };
  second.value.payload.placement = { container_id: 'pouch-1' };
  assert.throws(() => prepare([first, second], factual(), state), {
    code: 'CONTAINER_CAPACITY_EXCEEDED'
  });
});

test('M1 final inventory validation rejects active child of retired host', () => {
  const host = create('op-host', 'runtime-item:host', mechanics('op-host'));
  const child = create('op-child', 'runtime-item:child',
    mechanics('op-child'));
  child.value.payload.placement = { attached_item_id: 'runtime-item:host' };
  assert.throws(() => prepare([host, child,
    direct('retire_entity', 'op-retire-host', {
      entity_ref: 'runtime-item:host', reason: 'разрушен'
    })]), { code: 'INVENTORY_ITEM_NOT_FOUND' });
});

function prepare(operations, commit = factual(), state = baseState()) {
  return prepareLowerDvinaTraceTurnStepPersistence({
    partyId: 'p', state, snapshot: structuredClone(state), factual: commit,
    changeSetId: 'change-1', idemId: 'idem-1',
    writePlan: {
      turn_id: 'turn:p:1', base_state_version: 3,
      command_trace: { decision_protocol: 'turn_step_plan_v1',
        step_traces: [{ step: 1 }] },
      write_targets: [{ target: 'party_turn_step_operations', value: {
        version: 1, schema: 'party_turn_step_operation_batch_v1',
        root_turn_id: 'turn:p:1', committed_state_version: 3, operations
      }}]
    }
  });
}

function baseState() {
  return {
    party_id: 'p', actor_id: 'actor-1',
    party_state: { state_version: 3, turn_number: 3 },
    player_profile: { attributes: { strength: { value: 10 } } },
    body_state: { health: 100, satiety: 90, energy: 80,
      active_conditions: [] },
    clock: { whole_minutes: '10', subminute_numerator: '0',
      subminute_denominator: '1' },
    position: { location_ref: 'shore', g5_anchor_id: 'anchor-shore' },
    items: [{ item_id: 'authored-item', template_id: 'template-1',
      profile_id: 'profile-1', category_id: 'category-1', quantity: 1,
      inventory_profile: { mass_grams: 100, external_hand_cost: 0,
        carry_form: 'compact', packing_slot_cost: 1,
        packing_bundle_size: 1 },
      placement: { anchor_id: 'anchor-shore' } }],
    containers: [], container_placements: [], container_profiles: [],
    container_compatibility: [], npcs: [],
    knowledge: [{ fact_id: 'shore', knowledge_state: 'known' }],
    last_turn: { visible_package: { package_id: 'visible-1' } }
  };
}

function factual(body = null) {
  return factualBodies(body == null ? [] : [{
    operation_id: 'body-op', payload: body
  }]);
}

function factualBodies(bodies) {
  const hidden = Object.fromEntries(bodies.map(({ operation_id: id,
    payload }) => [`turn_step_body_event:${id}`, payload]));
  const components = bodies.map(({ payload: body }) => ({
    schema: 'rus.body_state.fixed_approved_effect_proposal.v1',
    profile_ref: body.body_effect_ref,
    profile_pin: body.profile_pin,
    selected_context: body.selected_context,
    exact_deltas: body.exact_deltas,
    condition_transitions: [],
    state_after: body.state_after,
    selection_policy: body.selection_policy,
    rng_consumption: body.rng_consumption
  }));
  const compositeDeltas = Object.fromEntries(
    ['health', 'satiety', 'energy'].map((metric) => [
      metric,
      components.reduce((sum, component) =>
        sum + component.exact_deltas[metric], 0)
    ])
  );
  return {
    player_input: { idempotency_key: 'idem-key', request_id: 'request-1',
      raw_text: 'ход' },
    mode_resolution: { decision_trace: {
      decision_protocol: 'turn_step_plan_v1', step_traces: [{ step: 1 }]
    } },
    consequence: { duration_minutes: 10, hidden_update: hidden,
      state_changes: bodies.map(({ operation_id: operationId,
        payload: body }) => ({
        kind: 'direct_body_event', operation_id: operationId,
        body_effect_profile_ref: body.body_effect_ref,
        profile_pin: body.profile_pin,
        body_effect_context: body.selected_context
      })) },
    hidden_update: hidden,
    time_update: {
      clock_before: { whole_minutes: '10', subminute_numerator: '0',
        subminute_denominator: '1' },
      clock_after: { whole_minutes: '20', subminute_numerator: '0',
        subminute_denominator: '1' },
      exact_elapsed: { exact_minutes: {
        numerator: '10', denominator: '1'
      } },
      semantic_activity_elapsed: { exact_minutes: {
        numerator: '0', denominator: '1'
      } },
      semantic_activity_resolutions: []
    },
    body_update: bodies.length === 0
      ? { applied: false, proposal: null, state_after: null } : {
      applied: true,
      proposal: {
        schema: 'rus.body_state.composite_fixed_effect_proposal.v1',
        profile_ref: 'body:composite', profile_pin: {
        artifact_id: 'owner-profiles', revision: 1,
        digest: '1'.repeat(64)
      },
        component_proposals: components,
        exact_deltas: compositeDeltas,
        selection_policy: 'ordered_committed_step_components',
        rng_consumption: 'forbidden' },
      state_after: bodies.at(-1).payload.state_after
    }
  };
}

function create(operationId, entityRef, snapshot) {
  return direct('create_entity', operationId, {
    temp_ref: `${entityRef}:temp`, entity_ref: entityRef,
    semantic_type: 'material_portion', name: 'предмет',
    origin: { kind: 'ambient_ordinary', source_refs: ['shore'] },
    facts: [], runtime_instance_mechanics_snapshot: snapshot,
    placement: { location_ref: 'shore' }
  });
}

function direct(kind, id, payload) {
  return { target: kind === 'apply_body_event' ? 'party_state' : 'party_items',
    value: { version: 1,
      schema: 'rus.lower_dvina_trace_turn_step_direct_operation.v1',
      operation_id: id, root_turn_id: 'turn:p:1', step_index: 1,
      operation_kind: kind, payload } };
}

function mechanics(operationRef, quantity = 1) {
  return createRuntimeInstanceMechanicsSnapshot({
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
    provenance: { source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:p:1', step_index: 1,
      operation_ref: operationRef, origin_kind: 'ambient_ordinary',
      source_refs: ['shore'] },
    mechanics: { mass_grams: 20, external_hand_cost: 1,
      carry_form: 'compact', packing_slot_cost: 1,
      quantity: { value: quantity, unit: 'portion' }, container: null }
  });
}

function bodyPayload() {
  return {
    body_effect_ref: 'body:impact:minor',
    profile_pin: { artifact_id: 'owner-profiles', revision: 1,
      digest: '1'.repeat(64) },
    selected_context: { kind: 'direct_body_event', mechanism: 'impact',
      severity: 'minor', body_part_ref: 'left_arm' },
    exact_deltas: { health: -1, satiety: 0, energy: 0 },
    state_after: { health: 99, satiety: 90, energy: 80,
      active_conditions: [] },
    selection_policy: 'fixed_approved_effect', rng_consumption: 'forbidden'
  };
}
