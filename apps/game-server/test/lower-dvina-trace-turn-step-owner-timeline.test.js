import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { createRuntimeInstanceMechanicsSnapshot } from '@rus/items-property';
import { canonicalDigest } from '@rus/materialization';
import { createCombinedWritePlanBuilder } from '@rus/turn';
import { createSpatialV3CombinedAtomicCommitter } from
  '../src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { prepareLowerDvinaTraceTurnStepPersistence } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-persistence.js';

const DIRECT_SCHEMA =
  'rus.lower_dvina_trace_turn_step_direct_operation.v1';

test('M1 semantic activity persists only the exact owner output', () => {
  const activity = semanticActivity();
  const result = prepare({
    state: baseState(),
    operations: [activity],
    factual: factual({ elapsed: 25, activities: [activity.value] })
  });
  assert.equal(result.semanticDuration, 5);
  assert.equal(result.snapshot.turn_step_activity_history[0].profile_ref,
    activity.value.profile_ref);
  assert.deepEqual(result.snapshot.turn_step_activity_history[0].profile_pin,
    profilePin());
  assert.deepEqual(result.snapshot.turn_step_activity_history[0], {
    ...activity.value,
    profile_pin: profilePin(),
    body_effect_profile_ref: 'body:brief:light',
    fragment_order: 0,
    owner_resolution: activityResolution(activity.value, 0, '10', '15'),
    request_id: 'request-1',
    change_set_id: 'change-1',
    idempotency_record_id: 'idem-1',
    base_state_version: 3
  });
  assert.deepEqual(Object.values(result.writes).flat().map(
    ({ target_table: target }) => target), [
    'party_timed_activity_executions',
    'party_timed_activity_attempts'
  ]);
  const execution = result.writes.inserts[0].record;
  const attempt = result.writes.appends[0].record;
  assert.equal(execution.execution_scope, 'standalone');
  assert.equal(execution.activity_snapshot.activity_profile_ref,
    activity.value.profile_ref);
  assert.equal(execution.started_at_whole_minutes, '10');
  assert.equal(execution.last_processed_at_whole_minutes, '15');
  assert.equal(attempt.trace.fragment_order, 0);
  assert.equal(attempt.body_effect_refs[0].entity_id, 'body:brief:light');
  assert.equal(Object.values(result.writes).flat().some(({ target_table }) =>
    ['party_clocks', 'party_actor_body_states'].includes(target_table)),
  false);
});

test('M1 owner timeline keeps global positions in an interleaved batch', () => {
  const first = semanticActivity({ id: 'activity-1' });
  const second = semanticActivity({ id: 'activity-2' });
  const create = (id) => direct('create_entity', `op-${id}`, {
    temp_ref: `${id}-temp`, entity_ref: `runtime-item:${id}`,
    semantic_type: 'material_portion', name: id,
    origin: { kind: 'ambient_ordinary', source_refs: ['shore'] },
    facts: [], runtime_instance_mechanics_snapshot: mechanics(`op-${id}`),
    placement: { location_ref: 'shore' }
  });
  const owner = factual({ elapsed: 10,
    activities: [first.value, second.value] });
  owner.time_update.semantic_activity_resolutions = [
    activityResolution(first.value, 1, '10', '15'),
    activityResolution(second.value, 3, '15', '20')
  ];
  const operations = [create('first'), first, create('second'), second];
  const result = prepare({ state: baseState(), operations, factual: owner });
  const attempts = result.writes.appends.filter(({ target_table: target }) =>
    target === 'party_timed_activity_attempts');
  assert.deepEqual(attempts.map(({ record }) => [
    record.trace.fragment_order,
    record.started_at_whole_minutes,
    record.ended_at_whole_minutes
  ]), [[1, '10', '15'], [3, '15', '20']]);

  const tamperedOrder = structuredClone(owner);
  tamperedOrder.time_update.semantic_activity_resolutions[1]
    .fragment_order = 2;
  assert.throws(() => prepare({ state: baseState(), operations,
    factual: tamperedOrder }), {
    code: 'TRACE_TURN_STEP_SEMANTIC_ACTIVITY_RECONCILIATION_FAILED'
  });

  const tamperedTime = structuredClone(owner);
  tamperedTime.time_update.semantic_activity_resolutions[1]
    .attempt.ended_at.whole_minutes = '21';
  assert.throws(() => prepare({ state: baseState(), operations,
    factual: tamperedTime }), {
    code: 'TRACE_TURN_STEP_SEMANTIC_ACTIVITY_RECONCILIATION_FAILED'
  });
});

test('M1 time commit is anchored to state and exact elapsed', () => {
  const activity = semanticActivity();
  const shifted = factual({ elapsed: 10, activities: [activity.value] });
  shifted.time_update.clock_before = timestamp('11');
  shifted.time_update.clock_after = timestamp('21');
  shifted.time_update.semantic_activity_resolutions = [
    activityResolution(activity.value, 0, '11', '16')
  ];
  assert.throws(() => prepare({ state: baseState(), operations: [activity],
    factual: shifted }), {
    code: 'TRACE_TURN_STEP_TIME_RECONCILIATION_FAILED'
  });

  const badElapsed = factual({ elapsed: 10, activities: [activity.value] });
  badElapsed.time_update.exact_elapsed.exact_minutes.numerator = '9';
  assert.throws(() => prepare({ state: baseState(), operations: [activity],
    factual: badElapsed }), {
    code: 'TRACE_TURN_STEP_TIME_RECONCILIATION_FAILED'
  });

  const missingClock = baseState();
  delete missingClock.clock;
  assert.throws(() => prepare({ state: missingClock, operations: [activity],
    factual: factual({ elapsed: 10, activities: [activity.value] }) }), {
    code: 'TRACE_TURN_STEP_TIME_RECONCILIATION_FAILED'
  });
});

test('M1 validates a zero exact time window without semantic activity', () => {
  const create = direct('create_entity', 'op-zero-time', {
    temp_ref: 'zero-temp', entity_ref: 'runtime-item:zero-time',
    semantic_type: 'material_portion', name: 'щепка',
    origin: { kind: 'ambient_ordinary', source_refs: ['shore'] },
    facts: [], runtime_instance_mechanics_snapshot: mechanics('op-zero-time'),
    placement: { location_ref: 'shore' }
  });
  const owner = factual({ elapsed: 0 });
  assert.doesNotThrow(() => prepare({ state: baseState(),
    operations: [create], factual: owner }));
  owner.time_update.exact_elapsed.exact_minutes.numerator = '1';
  assert.throws(() => prepare({ state: baseState(), operations: [create],
    factual: owner }), {
    code: 'TRACE_TURN_STEP_TIME_RECONCILIATION_FAILED'
  });
});

test('M1 rejects a semantic body effect without an applied body owner', () => {
  const activity = semanticActivity();
  const owner = factual({ activities: [activity.value] });
  owner.consequence.body_effect_ref = 'body:composite';
  assert.throws(() => prepare({ state: baseState(), operations: [activity],
    factual: owner }), {
    code: 'TRACE_TURN_STEP_BODY_EVENT_RECONCILIATION_FAILED'
  });
});

test('M1 rejects owner activity time that normalized storage cannot represent',
  () => {
    const activity = semanticActivity({ duration: 0, durationClass: 'moment' });
    assert.throws(() => prepare({
      state: baseState(), operations: [activity],
      factual: factual({ elapsed: 0, activities: [activity.value] })
    }), { code: 'TRACE_TURN_STEP_SEMANTIC_ACTIVITY_PERSISTENCE_GAP' });
  });

test('M1 owner timeline commits through the existing P16 transaction',
  async () => {
    const state = baseState();
    const activity = semanticActivity();
    const prepared = prepare({ state, operations: [direct(
      'create_entity', 'op-create', {
        temp_ref: 'sand-temp', entity_ref: 'runtime-item:sand',
        semantic_type: 'material_portion', name: 'горсть мокрого песка',
        origin: { kind: 'ambient_ordinary', source_refs: ['shore'] },
        facts: [], runtime_instance_mechanics_snapshot: mechanics('op-create'),
        placement: { holder_character_id: 'actor-1',
          physical_position: 'hands' }
      }), activity], factual: factual({ activities: [activity.value],
        activityOrders: [1] }) });
    const visiblePayload = {
      schema: 'temporal_visible_package.v1',
      perceived_scene: 'Берег.', perceived_changes: ['Песок собран.'],
      sensory_details: [], visible_npcs: [], visible_objects: [],
      known_context: [], uncertainties: [], hypotheses: [],
      player_safe_interruption: null, allowed_action_affordances: []
    };
    const pins = [{
      dependency_role: 'source_authoring',
      entity_ref: { entity_kind: 'activity_profile', entity_id: 'profile' },
      version_pin: { pin_kind: 'authoring_version', authoring_version: '1',
        state_version: null }
    }];
    const baseWrites = {
      inserts: [{ target_table: 'party_state_snapshots', id: 'p:4', record: {
        party_id: 'p', state_version: 4, state_payload: prepared.snapshot,
        state_digest: canonicalDigest(prepared.snapshot)
      }}],
      updates: [
        { target_table: 'parties', id: 'p', record: {
          party_id: 'p', status: 'active'
        }},
        { target_table: 'party_server_sessions', id: 'p', record: {
          party_id: 'p', screen: {}, turn_number: 1,
          last_turn_id: 'turn:p:1', updated_change_set_id: 'change-1'
        }},
        { target_table: 'party_clocks', id: 'p', record: {
          party_id: 'p', whole_minutes: '10', subminute_numerator: '0',
          subminute_denominator: '1', updated_change_set_id: 'change-1'
        }}
      ],
      appends: [{ target_table: 'party_v3_change_sets', id: 'change-1',
        record: { id: 'change-1', party_id: 'p',
          operation_kind: 'trace_wreck_inspection',
          idempotency_record_id: 'idem-1' }}],
      deletes: []
    };
    const writes = Object.fromEntries(['inserts', 'updates', 'appends',
      'deletes'].map((mode) => [mode, [
        ...baseWrites[mode], ...prepared.writes[mode]
      ]]));
    const rechecks = ['physical', 'state', 'pin', 'endpoint', 'route',
      'capacity', 'time', 'change_set'].map((kind) => {
      const value = { kind, ...(kind === 'state'
        ? { expected_party_state_version: 3 } : {}) };
      return { ...value, digest: computeSpatialV3CanonicalDigest(value) };
    });
    const envelope = {
      package_id: 'visible-1', party_id: 'p', turn_id: 'turn:p:1',
      committed_state_version: '4', change_set_id: 'change-1',
      package_digest: computeSpatialV3CanonicalDigest(visiblePayload),
      visible_payload: visiblePayload, presentation_status: 'pending',
      projection_policy_ref: { entity_ref: {
        entity_kind: 'visibility_modifier', entity_id: 'projection'
      }, authoring_version: '1' },
      dependency_pins: { pins, canonical_digest: canonicalDigest(pins) },
      idempotency_record_id: 'idem-1'
    };
    const builder = createCombinedWritePlanBuilder({
      verifyApproval: async () => ({ ok: true })
    });
    const built = await builder.build({
      plan_id: 'plan-1', party_id: 'p', write_plan_kind: 'semantic_commit',
      operation_kind: 'trace_wreck_inspection',
      canonical_input_digest: `sha256:${'a'.repeat(64)}`,
      expected_state_versions: [
        { target_table: 'parties', id: 'p', state_version: 3 },
        { target_table: 'party_server_sessions', id: 'p', state_version: 3 },
        { target_table: 'party_clocks', id: 'p', state_version: 3 }
      ],
      validation_report: { status: 'pass',
        digest: `sha256:${'b'.repeat(64)}` },
      idempotency: { id: 'idem-1', key: 'idem-key',
        semantic_command_snapshot: { decision_trace: {
          decision_protocol: 'turn_step_plan_v1', step_traces: [{ step: 1 }]
        } }, semantic_command_digest: `sha256:${'c'.repeat(64)}`,
        semantic_dependency_pins: {}, request_id: 'request-1' },
      change_set: { id: 'change-1' },
      visible_package_envelope: envelope,
      approved_write_sets: [writes],
      lock_context: { owner_keys: ['actor:actor-1'], execution_keys: [],
        g4_keys: [], physical_keys: Object.values(writes).flat().map(
          (write) => `party_runtime.${write.target_table}:${write.id}`) },
      commit_rechecks: rechecks
    });
    assert.equal(built.ok, true, JSON.stringify(built.error));
    const sql = [];
    const tx = { async query(statement) {
      sql.push(statement);
      if (statement.includes('SELECT party_id,operation_kind')) {
        return { rows: [], rowCount: 0 };
      }
      if (statement.includes('SELECT id,canonical_input_digest')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    }};
    const committer = createSpatialV3CombinedAtomicCommitter({
      withTransaction: (work) => work(tx),
      recheck: async () => ({ ok: true })
    });
    const committed = await committer.commit({ plan: built.plan,
      created_at_turn: 1 });
    assert.equal(committed.ok, true, JSON.stringify(committed.error));
    for (const table of [
      'party_items', 'party_item_placements',
      'party_timed_activity_executions', 'party_timed_activity_attempts'
    ]) {
      assert.equal(sql.filter((statement) =>
        statement.includes(`INSERT INTO party_runtime."${table}"`)).length, 1);
    }
  });

function prepare({ state, operations, factual: factualValue = factual() }) {
  return prepareLowerDvinaTraceTurnStepPersistence({
    partyId: 'p',
    writePlan: {
      turn_id: 'turn:p:1',
      base_state_version: 3,
      command_trace: {
        decision_protocol: 'turn_step_plan_v1', step_traces: [{ step: 1 }]
      },
      write_targets: [{
        target: 'party_turn_step_operations',
        value: {
          version: 1,
          schema: 'party_turn_step_operation_batch_v1',
          root_turn_id: 'turn:p:1',
          committed_state_version: 3,
          operations
        }
      }]
    },
    state,
    snapshot: structuredClone(state),
    factual: factualValue,
    changeSetId: 'change-1',
    idemId: 'idem-1'
  });
}

function factual({ elapsed = 10, activities = [],
  activityOrders = null } = {}) {
  let activityMinute = 10;
  const resolutions = activities.map((activity, index) => {
    const start = activityMinute;
    activityMinute += activity.duration_minutes;
    return activityResolution(activity, activityOrders?.[index] ?? index,
      String(start), String(activityMinute));
  });
  const semanticMinutes = activities.reduce((sum, activity) =>
    sum + activity.duration_minutes, 0);
  return {
    player_input: {
      idempotency_key: 'idem-key', request_id: 'request-1', raw_text: 'ход'
    },
    mode_resolution: { decision_trace: {
      decision_protocol: 'turn_step_plan_v1', step_traces: [{ step: 1 }]
    } },
    consequence: {
      duration_minutes: elapsed,
      hidden_update: {},
      state_changes: activities.map((activity) => ({
        kind: 'semantic_activity',
        activity_id: activity.activity_id,
        profile_ref: activity.profile_ref,
        profile_pin: profilePin(),
        duration_class: activity.duration_class,
        effort: activity.effort,
        body_effect_profile_ref:
          `body:${activity.duration_class}:${activity.effort}`,
        body_effect_context: {
          kind: 'semantic_activity',
          duration_class: activity.duration_class,
          effort: activity.effort
        }
      }))
    },
    hidden_update: {},
    time_update: {
      clock_before: timestamp('10'),
      clock_after: timestamp(String(10 + elapsed)),
      exact_elapsed: { exact_minutes: {
        numerator: String(elapsed), denominator: '1'
      } },
      semantic_activity_elapsed: { exact_minutes: {
        numerator: String(semanticMinutes), denominator: '1'
      } },
      semantic_activity_resolutions: resolutions
    },
    body_update: {
      owner: '@rus/body-state', applied: false, proposal: null,
      state_after: null
    }
  };
}

function baseState() {
  return {
    party_id: 'p', actor_id: 'actor-1',
    party_state: { state_version: 3, turn_number: 3 },
    player_profile: { attributes: { strength: { value: 10 } } },
    clock: timestamp('10'),
    position: { location_ref: 'shore', g5_anchor_id: 'anchor-shore' },
    items: [{
      item_id: 'authored-item', template_id: 'template-1',
      profile_id: 'profile-1', category_id: 'category-1', quantity: 1,
      inventory_profile: {
        mass_grams: 100, external_hand_cost: 0, carry_form: 'compact',
        packing_slot_cost: 1, packing_bundle_size: 1
      },
      placement: { anchor_id: 'anchor-shore' }
    }],
    containers: [], container_placements: [], container_profiles: [],
    container_compatibility: [], npcs: [],
    knowledge: [{ fact_id: 'shore', knowledge_state: 'known' }],
    last_turn: { visible_package: { package_id: 'visible-1' } }
  };
}

function semanticActivity({ id = 'activity-1', duration = 5,
  durationClass = 'brief' } = {}) {
  return { target: 'party_events', value: {
    version: 1,
    schema: 'rus.lower_dvina_trace_turn_step_semantic_activity.v1',
    activity_id: id,
    root_turn_id: 'turn:p:1',
    step_index: 1,
    profile_ref: `approved:${durationClass}-light`,
    duration_class: durationClass,
    duration_minutes: duration,
    effort: 'light'
  } };
}

function activityResolution(activity, fragmentOrder, start, end) {
  const exact = { exact_minutes: {
    numerator: String(activity.duration_minutes), denominator: '1'
  } };
  return {
    version: 1,
    schema: 'turn_semantic_activity_resolution_v1',
    activity_id: activity.activity_id,
    root_turn_id: activity.root_turn_id,
    step_index: activity.step_index,
    fragment_order: fragmentOrder,
    profile_ref: activity.profile_ref,
    profile_pin: profilePin(),
    duration_class: activity.duration_class,
    effort: activity.effort,
    body_effect_profile_ref:
      `body:${activity.duration_class}:${activity.effort}`,
    execution: {
      status: 'completed', execution_scope: 'standalone',
      original_duration: exact, started_at: timestamp(start),
      ended_at: timestamp(end)
    },
    attempt: {
      attempt_ordinal: 0, planned_time: exact, actual_time: exact,
      result_kind: 'completed', started_at: timestamp(start),
      ended_at: timestamp(end)
    }
  };
}

function direct(operationKind, operationId, payload) {
  return { target: 'party_items', value: {
    version: 1, schema: DIRECT_SCHEMA,
    operation_id: operationId, root_turn_id: 'turn:p:1', step_index: 1,
    operation_kind: operationKind, payload
  } };
}

function mechanics(operationRef) {
  return createRuntimeInstanceMechanicsSnapshot({
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
    provenance: {
      source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:p:1', step_index: 1,
      operation_ref: operationRef, origin_kind: 'ambient_ordinary',
      source_refs: ['shore']
    },
    mechanics: {
      mass_grams: 300, external_hand_cost: 1, carry_form: 'compact',
      packing_slot_cost: 1,
      quantity: { value: 1, unit: 'handful' }, container: null
    }
  });
}

function profilePin() {
  return { artifact_id: 'turn-step-owner-profiles', revision: 1,
    digest: '1'.repeat(64) };
}

function timestamp(wholeMinutes) {
  return { whole_minutes: wholeMinutes, subminute_numerator: '0',
    subminute_denominator: '1' };
}
