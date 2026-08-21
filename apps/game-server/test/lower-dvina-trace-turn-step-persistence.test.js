import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeInstanceMechanicsSnapshot } from '@rus/items-property';
import { canonicalDigest } from '@rus/materialization';
import {
  prepareLowerDvinaTraceTurnStepPersistence
} from '../src/infrastructure/postgres/lower-dvina-trace-turn-step-persistence.js';
import {
  bindCommitEnvelopeToBatch,
  commitEnvelope
} from './lower-dvina-trace-turn-step-envelope-fixture.js';

const DIRECT_SCHEMA =
  'rus.lower_dvina_trace_turn_step_direct_operation.v1';

test('domain-only rev13 persistence keeps the exact envelope while rev12 stays unchanged',
  () => {
    const state = baseState();
    const domainFactual = factual({ elapsed: 0 });
    domainFactual.body_update.state_after = structuredClone(state.body_state);
    const envelope = canonicalEnvelope(domainFactual);
    envelope.mode_resolution.decision_trace.selected_option_id =
      'registered-domain-option';
    const rev13 = prepareLowerDvinaTraceTurnStepPersistence({
      partyId: 'p', state, snapshot: structuredClone(state),
      factual: domainFactual, changeSetId: 'change-1', idemId: 'idem-1',
      writePlan: {
        turn_id: 'turn:p:1', base_state_version: 3,
        command_trace: structuredClone(envelope.mode_resolution.decision_trace),
        write_targets: [], turn_step_commit: envelope
      }
    });
    assert.deepEqual(rev13.snapshot.last_turn.turn_step_commit, envelope);
    assert.equal(rev13.snapshot.last_turn.turn_step_idempotency_record_id,
      'idem-1');

    const rev12 = prepareLowerDvinaTraceTurnStepPersistence({
      partyId: 'p', state, snapshot: structuredClone(state),
      factual: factual(), changeSetId: 'change-1', idemId: 'idem-1',
      writePlan: {
        turn_id: 'turn:p:1', base_state_version: 3,
        command_trace: { decision_protocol: 'code_exact_fast_path_v1' },
        write_targets: []
      }
    });
    assert.deepEqual(rev12.snapshot, state);
  });

test('delegated domain no-batch accepts exact nonzero clock and body arithmetic',
  () => {
    const state = baseState();
    const domainFactual = factual({ elapsed: 8 });
    domainFactual.body_update = {
      owner: '@rus/body-state', applied: true,
      proposal: { exact_deltas: { health: 0, satiety: -1, energy: -2 } },
      state_after: { ...structuredClone(state.body_state),
        satiety: 89, energy: 78 }
    };
    const envelope = canonicalEnvelope(domainFactual);
    const result = prepareLowerDvinaTraceTurnStepPersistence({
      partyId: 'p', state, snapshot: structuredClone(state),
      factual: domainFactual, changeSetId: 'change-1', idemId: 'idem-1',
      writePlan: {
        turn_id: 'turn:p:1', base_state_version: 3,
        command_trace: structuredClone(envelope.mode_resolution.decision_trace),
        write_targets: [{ target: 'party_state', value: domainFactual }],
        turn_step_commit: envelope
      }
    });

    assert.deepEqual(result.snapshot.last_turn.turn_step_commit, envelope);
    assert.deepEqual(result.writes,
      { inserts: [], updates: [], appends: [], deletes: [] });
  });

test('delegated domain no-batch rejects factual envelope divergence', () => {
  const state = baseState();
  const domainFactual = factual({ elapsed: 0 });
  domainFactual.body_update.state_after = structuredClone(state.body_state);
  const cases = [
    ['consequence', (envelope) => {
      envelope.consequence.state_changes = [{ kind: 'forged_change' }];
    }],
    ['hidden update', (envelope) => {
      envelope.hidden_update = { forged_hidden_state: true };
    }]
  ];
  for (const [name, tamper] of cases) {
    const envelope = canonicalEnvelope(domainFactual);
    envelope.mode_resolution.decision_trace.selected_option_id =
      'registered-domain-option';
    tamper(envelope);
    assert.throws(() => prepareLowerDvinaTraceTurnStepPersistence({
      partyId: 'p', state, snapshot: structuredClone(state),
      factual: domainFactual, changeSetId: 'change-1', idemId: 'idem-1',
      writePlan: {
        turn_id: 'turn:p:1', base_state_version: 3,
        command_trace: structuredClone(envelope.mode_resolution.decision_trace),
        write_targets: [{ target: 'party_state', value: domainFactual }],
        turn_step_commit: envelope
      }
    }), { code: 'TRACE_TURN_STEP_DIRECT_COMMIT_CONTRACT_GAP' }, name);
  }
});

test('M1 batch collapses create, move, facts and mechanics to atomic final rows',
  () => {
    const state = baseState();
    const operations = [
      direct('create_entity', 'op-create', {
        temp_ref: 'sand-temp',
        entity_ref: 'runtime-item:sand',
        semantic_type: 'material_portion',
        name: 'горсть мокрого песка',
        origin: { kind: 'ambient_ordinary', source_refs: ['shore'] },
        facts: [{ fact_id: 'fact:sand:wet', temp_ref: 'wet',
          text: 'это мокрый речной песок' }],
        runtime_instance_mechanics_snapshot: mechanics('op-create', 300),
        placement: { holder_character_id: 'actor-1',
          physical_position: 'hands' }
      }),
      direct('move_entity', 'op-move', {
        entity_ref: 'runtime-item:sand',
        placement: { location_ref: 'shore' }
      }),
      direct('change_entity_facts', 'op-facts', {
        entity_ref: 'runtime-item:sand',
        remove_fact_refs: ['fact:sand:wet'],
        add_facts: [{ fact_id: 'fact:sand:packed', temp_ref: 'packed',
          text: 'песок собран плотным комком' }]
      }),
      direct('set_entity_mechanics', 'op-mechanics', {
        entity_ref: 'runtime-item:sand',
        reason: 'песок уплотнён',
        runtime_instance_mechanics_snapshot:
          mechanics('op-mechanics', 280)
      })
    ];
    const result = prepare({ state, operations });

    assert.deepEqual(result.writes.inserts.map((write) =>
      `${write.target_table}:${write.id}`), [
      'party_items:runtime-item:sand',
      'party_item_placements:runtime-item:sand',
      'party_character_knowledge:actor-1:fact:sand:packed'
    ]);
    assert.equal(result.writes.updates.length, 0);
    const itemWrite = result.writes.inserts[0].record;
    assert.equal(itemWrite.template_id, null);
    assert.equal(itemWrite.profile_id, null);
    assert.equal(itemWrite.category_id, null);
    assert.equal(itemWrite.run_id, null);
    assert.equal(itemWrite.quantity, 1);
    assert.equal(itemWrite.state.runtime_instance_mechanics_snapshot
      .mechanics.mass_grams, 280);
    assert.deepEqual(itemWrite.state.ordinary_metadata.semantic_facts.map(
      ({ fact_id: id }) => id), ['fact:sand:packed']);
    assert.equal(result.writes.inserts[1].record.anchor_id, 'anchor-shore');
    assert.equal(result.writes.inserts[1].record.holder_character_id, null);
    assert.equal(result.snapshot.items.some(
      ({ item_id: id }) => id === 'authored-item'), true,
    'authored state is preserved');
    assert.equal(result.snapshot.items.find(
      ({ item_id: id }) => id === 'runtime-item:sand')
      .runtime_instance_mechanics_snapshot.mechanics.mass_grams, 280);
    assert.equal(result.snapshot.last_turn.turn_step_operation_batch
      .operations.length, 4);
    assert.deepEqual(result.snapshot.last_turn.decision_trace,
      { decision_protocol: 'turn_step_plan_v1', step_traces: [{ step: 1 }] });
  });

test('M1 retirement preserves the row as retired and removes player projection',
  () => {
    const state = baseState();
    const snapshot = mechanics('seed', 100);
    state.items.push({
      item_id: 'runtime-item:old',
      instance_id: 'runtime-item:old',
      template_id: null,
      profile_id: null,
      category_id: null,
      name: 'щепка',
      quantity: 1,
      condition_state: 'ordinary_runtime_instance',
      legal_status: 'unowned_ordinary_runtime',
      placement: { holder_character_id: 'actor-1',
        physical_position: 'hands' },
      runtime_instance_mechanics_snapshot: snapshot,
      state: {
        lifecycle_status: 'active',
        runtime_instance_mechanics_snapshot: snapshot,
        ordinary_metadata: {
          semantic_type: 'material_portion', name: 'щепка',
          origin: { kind: 'ambient_ordinary', source_refs: ['shore'] },
          semantic_facts: [], operation_history: []
        }
      }
    });
    const result = prepare({ state, operations: [direct(
      'retire_entity', 'op-retire', {
        entity_ref: 'runtime-item:old', reason: 'израсходован'
      })] });
    const retiredSnapshot = result.snapshot.items.find(
      ({ item_id: id }) => id === 'runtime-item:old');
    assert.equal(retiredSnapshot.state.lifecycle_status, 'retired');
    assert.equal(result.writes.deletes.length, 0);
    assert.equal(result.writes.updates[0].target_table, 'party_items');
    assert.equal(result.writes.updates[0].record.condition_state, 'retired');
    assert.equal(result.writes.updates[0].record.state.lifecycle_status,
      'retired');
  });

test('M1 rejects a bad later operation and duplicate identity',
  () => {
    const create = direct('create_entity', 'duplicate', {
      temp_ref: 'sand-temp', entity_ref: 'runtime-item:sand',
      semantic_type: 'material_portion', name: 'горсть мокрого песка',
      origin: { kind: 'ambient_ordinary', source_refs: ['shore'] },
      facts: [], runtime_instance_mechanics_snapshot: mechanics('duplicate'),
      placement: { holder_character_id: 'actor-1',
        physical_position: 'hands' }
    });
    assert.throws(() => prepare({ state: baseState(), operations: [
      create,
      { ...direct('move_entity', 'duplicate', {
        entity_ref: 'runtime-item:sand',
        placement: { location_ref: 'shore' }
      }) }
    ] }), { code: 'TRACE_TURN_STEP_OPERATION_DUPLICATE' });
    const forged = structuredClone(create);
    forged.value.schema = 'unknown.v1';
    assert.throws(() => prepare({ state: baseState(), operations: [
      create, forged
    ] }), { code: 'TRACE_TURN_STEP_OPERATION_SCHEMA_UNKNOWN' });
    const authoredState = baseState();
    const proof = authoredProof(authoredState.items[0]);
    const authoredMove = prepare({ state: authoredState, operations: [direct(
      'move_entity', 'authored-move', {
        entity_ref: 'authored-item',
        placement: { holder_character_id: 'actor-1',
          physical_position: 'hands' },
        authored_source: proof
      })] });
    assert.deepEqual(authoredMove.snapshot.items[0].placement, {
      holder_character_id: 'actor-1', physical_position: 'hands'
    });
    assert.equal(authoredMove.writes.updates.some(({ target_table: table,
      id }) => table === 'party_item_placements'
        && id === 'authored-item'), true);
    assert.equal(authoredMove.writes.updates.some(({ target_table: table,
      id }) => table === 'party_items' && id === 'authored-item'), true);
    assert.throws(() => prepare({ state: baseState(), operations: [direct(
      'move_entity', 'authored-unproved', {
        entity_ref: 'authored-item', placement: { location_ref: 'shore' }
      })] }), { code: 'TRACE_TURN_STEP_AUTHORED_SOURCE_PROOF_INVALID' });
    assert.throws(() => prepare({ state: baseState(), operations: [direct(
      'move_entity', 'authored-tampered', {
        entity_ref: 'authored-item', placement: { location_ref: 'shore' },
        authored_source: { ...proof, source_digest: 'tampered' }
      })] }), { code: 'TRACE_TURN_STEP_AUTHORED_SOURCE_PROOF_INVALID' });
  });

test('M1 direct-only persistence fails closed before inventing replay identity',
  () => {
    assert.throws(() => prepare({
      state: baseState(),
      operations: [direct('move_entity', 'op-move', {
        entity_ref: 'runtime-item:missing',
        placement: { location_ref: 'shore' }
      })],
      factual: null
    }), { code: 'TRACE_TURN_STEP_DIRECT_COMMIT_CONTRACT_GAP' });
  });

test('M1 persists formal access on an existing authored container', () => {
  const result = prepare({ state: baseState(), operations: [direct(
    'request_container_access', 'container-open', {
      container_ref: 'authored-item', access_kind: 'open_and_view',
      state_patch: {
        open_state: 'open', contents_state: 'known',
        access_state: { access: 'open' }
      },
      revealed_refs: []
    })] });
  const container = result.snapshot.items.find(
    ({ item_id: ref }) => ref === 'authored-item');
  assert.equal(container.open_state, 'open');
  assert.equal(container.contents_state, 'known');
  assert.equal(result.writes.updates.some(({ target_table: table, id }) =>
    table === 'party_items' && id === 'authored-item'), true);
});

test('M1 rejects container access payload detached from its code owner', () => {
  const forgedClose = direct('request_container_access', 'container-close', {
    container_ref: 'authored-item', access_kind: 'close',
    state_patch: { open_state: 'open', contents_state: 'known',
      access_state: { access: 'open' } },
    revealed_refs: ['forged-hidden-item']
  });
  const state = baseState();
  state.items.push({ item_id: 'contained-item', template_id: 'template-2',
    profile_id: 'profile-2', placement: { container_id: 'authored-item' } });
  const forgedReveal = direct('request_container_access', 'container-open', {
    container_ref: 'authored-item', access_kind: 'open',
    state_patch: { open_state: 'open', contents_state: 'known',
      access_state: { access: 'open' } },
    revealed_refs: ['forged-hidden-item']
  });
  for (const operation of [forgedClose, forgedReveal]) {
    const envelope = commitEnvelope({ clarification: false, check: false });
    for (const trace of [envelope.loop_trace.step_traces[0],
      envelope.mode_resolution.decision_trace.step_traces[0]]) {
      trace.resolution = 'domain_request';
      trace.approved_plan.resolution = 'domain_request';
      trace.approved_plan.activity = {
        owner: 'domain', duration_class: null, effort: null
      };
    }
    bindCommitEnvelopeToBatch(envelope,
      { value: { operations: [operation] } });
    assert.throws(() => prepare({ state, operations: [operation],
      commitEnvelope: envelope }), {
      code: 'TRACE_TURN_STEP_OPERATION_PLAN_MISMATCH'
    });
  }
});

test('M1 accepts only the exact canonical turn-step commit envelope', () => {
  const operation = direct('request_container_access', 'op-envelope', {
    container_ref: 'authored-item', access_kind: 'open',
    state_patch: { open_state: 'open', contents_state: 'known',
      access_state: { access: 'open' } }, revealed_refs: []
  });
  const envelope = commitEnvelope({ clarification: false, check: false });
  for (const trace of [envelope.loop_trace.step_traces[0],
    envelope.mode_resolution.decision_trace.step_traces[0]]) {
    trace.resolution = 'domain_request';
    trace.approved_plan.resolution = 'domain_request';
    trace.approved_plan.activity = {
      owner: 'domain', duration_class: null, effort: null
    };
  }
  bindCommitEnvelopeToBatch(envelope, { value: { operations: [operation] } });
  assert.doesNotThrow(() => prepare({ state: baseState(),
    operations: [operation], commitEnvelope: envelope }));
  const malformed = canonicalEnvelope(factual());
  malformed.alternate_payload = {};
  assert.throws(() => prepare({
    state: baseState(), operations: [operation], commitEnvelope: malformed
  }), { code: 'TRACE_TURN_STEP_DIRECT_COMMIT_CONTRACT_GAP' });
});

function prepare({
  state,
  operations,
  factual: factualValue = factual(),
  canonical = false,
  commitEnvelope = null
}) {
  const writePlan = {
    turn_id: 'turn:p:1',
    base_state_version: 3,
    command_trace: {
      decision_protocol: 'turn_step_plan_v1',
      step_traces: [{ step: 1 }]
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
  };
  if (canonical || commitEnvelope) {
    writePlan.turn_step_commit = commitEnvelope
      ?? canonicalEnvelope(factualValue);
  }
  return prepareLowerDvinaTraceTurnStepPersistence({
    partyId: 'p', writePlan, state, snapshot: structuredClone(state),
    factual: canonical || commitEnvelope ? null : factualValue,
    changeSetId: 'change-1', idemId: 'idem-1'
  });
}

function baseState() {
  return {
    party_id: 'p',
    actor_id: 'actor-1',
    party_state: { state_version: 3, turn_number: 3 },
    player_profile: { attributes: { strength: { value: 10 } } },
    body_state: { health: 100, satiety: 90, energy: 80,
      active_conditions: [] },
    clock: {
      whole_minutes: '10', subminute_numerator: '0',
      subminute_denominator: '1'
    },
    position: { location_ref: 'shore', g5_anchor_id: 'anchor-shore' },
    items: [{
      item_id: 'authored-item', template_id: 'template-1',
      profile_id: 'profile-1', category_id: 'category-1', quantity: 1,
      inventory_profile: authoredProfile(),
      placement: { anchor_id: 'anchor-shore' }
    }],
    containers: [],
    container_placements: [], container_profiles: [],
    container_compatibility: [],
    npcs: [],
    knowledge: [{ fact_id: 'shore', knowledge_state: 'known' }],
    last_turn: { visible_package: { package_id: 'visible-1' } }
  };
}

function authoredProof(item) {
  const identity = {
    item_id: item.item_id ?? item.instance_id,
    template_id: item.template_id,
    profile_id: item.profile_id ?? null
  };
  return {
    ...identity,
    source_digest: canonicalDigest({
      ...identity,
      placement: item.placement ?? null,
      ownership: item.ownership ?? null,
      mechanics: item.inventory_profile
        ?? item.state?.inventory_profile_snapshot ?? null
    })
  };
}

function factual({ elapsed = 10, activities = [], activityOrders = null,
  bodyPayload: body = null } = {}) {
  const hiddenUpdate = body == null ? {} : {
    turn_step_body_event: structuredClone(body)
  };
  const componentProposals = body == null ? [] : [{
    schema: 'rus.body_state.fixed_approved_effect_proposal.v1',
    profile_ref: body.body_effect_ref,
    profile_pin: structuredClone(body.profile_pin),
    selected_context: structuredClone(body.selected_context),
    exact_deltas: structuredClone(body.exact_deltas),
    condition_transitions: [],
    selection_policy: body.selection_policy,
    rng_consumption: body.rng_consumption
  }];
  let activityMinute = 10;
  const activityResolutions = activities.map((activity, index) => {
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
    mode_resolution: {
      decision_trace: {
        decision_protocol: 'turn_step_plan_v1', step_traces: [{ step: 1 }]
      }
    },
    consequence: {
      duration_minutes: elapsed,
      hidden_update: structuredClone(hiddenUpdate),
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
    hidden_update: hiddenUpdate,
    time_update: {
      clock_before: {
        whole_minutes: '10', subminute_numerator: '0',
        subminute_denominator: '1'
      },
      clock_after: {
        whole_minutes: String(10 + elapsed), subminute_numerator: '0',
        subminute_denominator: '1'
      },
      exact_elapsed: { exact_minutes: {
        numerator: String(elapsed), denominator: '1'
      } },
      semantic_activity_elapsed: { exact_minutes: {
        numerator: String(semanticMinutes), denominator: '1'
      } },
      semantic_activity_resolutions: activityResolutions
    },
    body_update: body == null ? {
      owner: '@rus/body-state', applied: false, proposal: null,
      state_after: null
    } : {
      owner: '@rus/body-state', applied: true,
      proposal: {
        schema: 'rus.body_state.composite_fixed_effect_proposal.v1',
        profile_ref: 'body:composite',
        profile_pin: profilePin(),
        component_proposals: componentProposals,
        exact_deltas: structuredClone(body.exact_deltas),
        selection_policy: 'ordered_committed_step_components',
        rng_consumption: 'forbidden'
      },
      state_after: structuredClone(body.state_after)
    }
  };
}

function direct(operationKind, operationId, payload) {
  return {
    target: operationKind === 'apply_body_event'
      ? 'party_state' : 'party_items',
    value: {
      version: 1,
      schema: DIRECT_SCHEMA,
      operation_id: operationId,
      root_turn_id: 'turn:p:1',
      step_index: 1,
      operation_kind: operationKind,
      payload
    }
  };
}

function mechanics(operationRef, mass = 300, quantity = 1) {
  return createRuntimeInstanceMechanicsSnapshot({
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1',
    version: 1,
    provenance: {
      source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:p:1',
      step_index: 1,
      operation_ref: operationRef,
      origin_kind: 'ambient_ordinary',
      source_refs: ['shore']
    },
    mechanics: {
      mass_grams: mass,
      external_hand_cost: 1,
      carry_form: 'compact',
      packing_slot_cost: 1,
      quantity: { value: quantity, unit: 'handful' },
      container: null
    }
  });
}

function semanticActivity({ id = 'activity-1', duration = 5,
  durationClass = 'brief' } = {}) {
  return {
    target: 'party_events',
    value: {
      version: 1,
      schema: 'rus.lower_dvina_trace_turn_step_semantic_activity.v1',
      activity_id: id,
      root_turn_id: 'turn:p:1',
      step_index: 1,
      profile_ref: `approved:${durationClass}-light`,
      duration_class: durationClass,
      duration_minutes: duration,
      effort: 'light'
    }
  };
}

function activityResolution(activity, fragmentOrder, start, end) {
  const timestamp = (whole) => ({ whole_minutes: whole,
    subminute_numerator: '0', subminute_denominator: '1' });
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
    execution: { status: 'completed', execution_scope: 'standalone',
      original_duration: exact, started_at: timestamp(start),
      ended_at: timestamp(end) },
    attempt: { attempt_ordinal: 0, planned_time: exact,
      actual_time: exact, result_kind: 'completed',
      started_at: timestamp(start), ended_at: timestamp(end) }
  };
}

function bodyPayload() {
  return {
    body_effect_ref: 'body:impact:minor',
    profile_pin: profilePin(),
    selected_context: {
      kind: 'direct_body_event', mechanism: 'impact', severity: 'minor',
      body_part_ref: 'left_arm'
    },
    exact_deltas: { health: -1, satiety: 0, energy: 0 },
    state_after: { health: 99, satiety: 90, energy: 80 },
    selection_policy: 'fixed_approved_effect',
    rng_consumption: 'forbidden'
  };
}

function profilePin() {
  return { artifact_id: 'turn-step-owner-profiles', revision: 1,
    digest: '1'.repeat(64) };
}

function authoredProfile() {
  return { mass_grams: 100, external_hand_cost: 0, carry_form: 'compact',
    packing_slot_cost: 1, packing_bundle_size: 1 };
}

function canonicalEnvelope(legacy) {
  return {
    version: 1,
    schema: 'turn_step_commit_envelope_v1',
    party_id: 'p',
    root_turn_id: 'turn:p:1',
    base_state_version: 3,
    player_input: structuredClone(legacy.player_input),
    mode_resolution: structuredClone(legacy.mode_resolution),
    checks: [],
    consequence: structuredClone(legacy.consequence),
    time_update: structuredClone(legacy.time_update),
    body_update: structuredClone(legacy.body_update),
    hidden_update: structuredClone(legacy.hidden_update),
    visible_context: {},
    loop_trace: {
      version: 1,
      schema: 'turn_step_commit_trace_v1',
      root_turn_id: 'turn:p:1',
      request_id: legacy.player_input.request_id,
      committed_state_version: 3,
      status: 'resolved',
      stop_reason: 'completed',
      working_revision: 1,
      next_step_index: 2,
      remaining_intent: null,
      completed_steps: [],
      step_traces: [],
      check_results: [],
      clarification: null
    }
  };
}
