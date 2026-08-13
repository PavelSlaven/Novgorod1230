import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLowerDvinaTracePhase6Commit } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-6-commit.js';
import { planTracePhase6SynchronizedCarry as planCarry } from
  '../src/runtime/lower-dvina-trace-phase-6-carry.js';
import { createPhase6TestTemporalOwner } from
  './lower-dvina-trace-phase-6-fixtures.js';

const planTracePhase6SynchronizedCarry = (input) => planCarry({
  ...input,
  temporalAdvanceOwner: createPhase6TestTemporalOwner({ state: input.state,
    resolve(candidate, { projection }) {
      return { disposition: 'execute', proposals: [{
        proposal_id: `temporal-event:${candidate.boundary_id}`,
        write_target: `temporal-event:${candidate.boundary_id}`
      }], state_projection: projection, follow_up_candidates: [] };
    } })
});

const REBIND_BOUNDARY = {
  boundary_id: 'trace_ld_v1_boundary_mikula_carry_load_limit_10m',
  elapsed_minutes: 10, route_progress_ppm: 500000,
  kind: 'committed_synchronized_route_boundary',
  reason_code: 'shoulder_load_limit_reached',
  outgoing: 'player_clerk', incoming: 'resolved_participating_fisher',
  shoulder: { condition_profile_ref:
      'trace_ld_v1_condition_shoulder_bruise',
    from: 'shoulder_bruise', to: 'shoulder_bruise',
    outcome: 'load_penalty' },
  rng_consumption: 'forbidden'
};

const effect = (id, deltas, outcomes = []) => ({
  effect_profile_id: id,
  exact_deltas: deltas,
  condition_outcomes: outcomes,
  selection_policy: id.includes('carried')
    ? 'fixed_by_exact_committed_branch' : 'fixed_approved_effect',
  rng_consumption: 'forbidden'
});
const contracts = {
  shed_location_ref: 'trace_ld_v1_loc_old_drying_shed',
  route: {
    route_id: 'trace_ld_v1_route_shed_to_camp_carry_onisim',
    version: 2,
    movement_method: 'stretcher_carry',
    duration_minutes: 20,
    terminal_position_outcome: 'trace_ld_v1_loc_fishing_camp',
    body_effect_profile_refs: [
      'carrier20', 'carrier10', 'carried20'
    ],
    carried_actor_rules: { single_root_clock: true,
      carrier_rebinding: { decision_boundary: REBIND_BOUNDARY } }
  },
  activity: {
    profile_id: 'trace_ld_v1_activity_make_stretcher_and_carry',
    version: 2
  },
  sourceEndpoint: { endpoint_id: 'shed-endpoint' },
  destinationEndpoint: { endpoint_id: 'camp-endpoint' },
  accessPolicy: { policy_id: 'carry-access' },
  capacity: { contract_id: 'camp-capacity' },
  terminalPlacement: {
    group: {
      location_ref: 'trace_ld_v1_loc_fishing_camp',
      zone_ref: 'working_camp',
      anchor_template_ref: 'camp-anchor-template'
    },
    carried_actor: {
      location_ref: 'trace_ld_v1_loc_fishing_camp',
      zone_ref: 'fire_rest_area'
    },
    ratsha_observation: {
      state: 'surrendered_under_group_observation',
      committed_fact_output:
        'ratsha_under_group_observation_committed'
    }
  },
  bodyEffectBindings: {
    player_clerk: 'carrier10',
    eremey_fisher: 'carrier20',
    ratsha_storehouse_helper: 'carrier20',
    resolved_participating_fisher: 'carrier10',
    onisim_boatman: {
      onisim_stabilized_unable_to_walk: 'carried20'
    }
  },
  bodyEffects: [
    effect('carrier20', { health: 0, satiety: -1, energy: -4 }),
    effect('carrier10', { health: 0, satiety: -1, energy: -2 }),
    effect('carried20', { health: 0, satiety: 0, energy: 0 }, [{
      from: 'stabilized_unable_to_walk',
      to: 'stabilized_unable_to_walk',
      outcome: 'remains_stabilized_unable_to_walk'
    }])
  ]
};

test('Phase 6 P16 plan atomically persists one owner traversal and terminal carry state', async () => {
  const state = committedState();
  state.npc_semantic_decision_traces = [{
    plan: { private_marker: 'phase6-private-semantic-plan' }
  }];
  const intent = planTracePhase6SynchronizedCarry({
    state,
    contracts,
    inputDigest: 'a'.repeat(64),
    commandIdempotencyKey: 'phase6-idem'
  });
  const factual = factualTurn(state, intent);
  factual.body_update.state_after.active_conditions[0] = {
    ...factual.body_update.state_after.active_conditions[0],
    condition_outcome: 'persists',
    condition_profile_ref: {
      state: 'shoulder_bruise',
      source_body_profile_ref: { id: 'phase6-test-body-profile' }
    }
  };
  const committed = await buildLowerDvinaTracePhase6Commit({
    partyId: state.party_id,
    factual,
    state,
    inputDigest: 'a'.repeat(64),
    visibleContext: {
      visible_scene: 'arrival',
      visible_changes: ['onisim_carried_to_camp_committed'],
      sensory_details: [], visible_npc: [], visible_objects: [],
      known_context: [], uncertainties: []
    },
    phase6Contracts: contracts
  });
  const plan = committed.plan;
  assert.equal(plan.operation_kind, 'trace_phase_6_carry');
  assert.equal(rows(plan, 'party_traversal_interval_results').length, 1);
  assert.equal(rows(plan, 'party_timed_activity_attempts').length, 1);
  assert.equal(rows(plan, 'party_body_temporal_history').length, 1);
  assert.equal(rows(plan, 'party_actor_active_conditions').length, 1);
  assert.ok(plan.expected_state_versions.some((entry) =>
    entry.target_table === 'party_actor_active_conditions'
      && entry.id === 'player_character:mikula:bruise'
      && entry.state_version === 1));
  assert.equal(rows(plan, 'party_body_temporal_history')[0].record
    .occurred_at_whole_minutes, '110');
  assert.equal(rows(plan, 'party_activity_resource_bindings').length, 2);
  const snapshot = rows(plan, 'party_state_snapshots')[0].record.state_payload;
  assert.equal(
    Object.hasOwn(snapshot, 'npc_semantic_decision_traces'),
    false
  );
  assert.equal(
    JSON.stringify(snapshot).includes('phase6-private-semantic-plan'),
    false
  );
  assert.deepEqual([
    snapshot.body_state.health,
    snapshot.body_state.energy,
    snapshot.body_state.satiety
  ], [79, 35, 57]);
  assert.equal(snapshot.position.zone_ref, 'working_camp');
  assert.equal(snapshot.phase6_carry_execution.progress_ppm, 1000000);
  const physical = plan.commit_rechecks.find(({ kind }) => kind === 'physical');
  assert.equal(physical.physical_model,
    'trace_phase6_targeted_admission');
  assert.equal('expected_inventory_digest' in physical, false);
  assert.equal('expected_inventory_snapshot' in physical, false);
  assert.equal(physical.assembly_resources.length, 2);
});

test('Phase 6 P16 preserves an interrupted owner traversal and resumes the same execution', async () => {
  const state = committedState();
  state.temporal_boundary_candidates = [temporalBoundary(
    'weather-boundary', 105
  )];
  const partialIntent = planTracePhase6SynchronizedCarry({
    state, contracts, inputDigest: 'b'.repeat(64),
    commandIdempotencyKey: 'phase6-partial'
  });
  const partial = await buildLowerDvinaTracePhase6Commit({
    partyId: state.party_id,
    factual: factualTurn(state, partialIntent, 'phase6-partial'),
    state, inputDigest: 'b'.repeat(64),
    visibleContext: visible('paused'), phase6Contracts: contracts
  });
  assert.equal(rows(partial.plan,
    'party_body_temporal_history').length, 0);
  assert.equal(rows(partial.plan,
    'party_traversal_interval_results')[0].record.result_kind,
  'paused_in_transit');
  const restarted = structuredClone(rows(partial.plan,
    'party_state_snapshots')[0].record.state_payload);
  restarted.temporal_boundary_candidates = [];
  const resumedIntent = planTracePhase6SynchronizedCarry({
    state: restarted, contracts, inputDigest: 'c'.repeat(64),
    commandIdempotencyKey: 'phase6-resume'
  });
  const resumed = await buildLowerDvinaTracePhase6Commit({
    partyId: restarted.party_id,
    factual: factualTurn(restarted, resumedIntent, 'phase6-resume'),
    state: restarted, inputDigest: 'c'.repeat(64),
    visibleContext: visible('completed'), phase6Contracts: contracts
  });
  assert.equal(resumedIntent.execution_id, partialIntent.execution_id);
  assert.equal(resumedIntent.traversal.ids.execution_id,
    partialIntent.traversal.ids.execution_id);
  assert.equal(resumedIntent.traversal.interval_result.interval_ordinal, 1);
  assert.equal(rows(resumed.plan,
    'party_route_plan_executions')[0].record.state_version, 4);
  assert.equal(rows(resumed.plan,
    'party_body_temporal_history').length, 1);
  assert.equal(rows(resumed.plan,
    'party_body_temporal_history')[0].record.occurred_at_whole_minutes,
  '110');
});

test('Phase 6 commits Mikula body effect at the rebind boundary only once', async () => {
  const state = committedState();
  state.temporal_boundary_candidates = [temporalBoundary(
    'post-rebind-boundary', 112
  )];
  const partialIntent = planTracePhase6SynchronizedCarry({
    state, contracts, inputDigest: 'd'.repeat(64),
    commandIdempotencyKey: 'phase6-post-rebind-pause'
  });
  assert.equal(partialIntent.execution_after.status, 'paused');
  assert.equal(partialIntent.internal_rebinding.applied_in_this_attempt, true);
  assert.deepEqual(partialIntent.body_effects_by_subject.map(
    ({ subject_ref: subject }) => subject
  ), ['player_clerk']);
  const partial = await buildLowerDvinaTracePhase6Commit({
    partyId: state.party_id,
    factual: factualTurn(state, partialIntent, 'phase6-post-rebind-pause'),
    state, inputDigest: 'd'.repeat(64),
    visibleContext: visible('paused'), phase6Contracts: contracts
  });
  assert.equal(rows(partial.plan,
    'party_body_temporal_history').length, 1);
  assert.equal(rows(partial.plan,
    'party_body_temporal_history')[0].record.occurred_at_whole_minutes,
  '110');
  const restarted = structuredClone(rows(partial.plan,
    'party_state_snapshots')[0].record.state_payload);
  assert.deepEqual([restarted.body_state.health, restarted.body_state.energy,
    restarted.body_state.satiety], [79, 35, 57]);
  restarted.temporal_boundary_candidates = [];
  const resumedIntent = planTracePhase6SynchronizedCarry({
    state: restarted, contracts, inputDigest: 'e'.repeat(64),
    commandIdempotencyKey: 'phase6-post-rebind-resume'
  });
  assert.equal(resumedIntent.execution_after.status, 'completed');
  assert.equal(resumedIntent.internal_rebinding.applied_in_this_attempt, false);
  assert.equal(resumedIntent.body_effects_by_subject.some(
    ({ subject_ref: subject }) => subject === 'player_clerk'), false);
  const resumed = await buildLowerDvinaTracePhase6Commit({
    partyId: restarted.party_id,
    factual: factualTurn(restarted, resumedIntent,
      'phase6-post-rebind-resume'),
    state: restarted, inputDigest: 'e'.repeat(64),
    visibleContext: visible('completed'), phase6Contracts: contracts
  });
  assert.equal(rows(resumed.plan,
    'party_body_temporal_history').length, 0);
  const terminal = rows(resumed.plan,
    'party_state_snapshots')[0].record.state_payload;
  assert.deepEqual([terminal.body_state.health, terminal.body_state.energy,
    terminal.body_state.satiety], [79, 35, 57]);
});

function committedState() {
  const profile = (id, template) => ({
    inventory_profile_id: id,
    item_template_ref: template,
    mass_grams: 2500,
    carry_form: 'long',
    external_hand_cost: 1
  });
  return {
    schema: 'rus.lower_dvina_trace_turn_snapshot.v2',
    party_id: 'phase6-party',
    actor_id: 'mikula',
    party_state: {
      state_version: 6,
      session_state_version: 7,
      clock_state_version: 6,
      body_state_version: 3,
      turn_number: 6
    },
    world_identity: {
      world_revision_id: 'world-revision',
      world_catalog_digest: 'world-digest'
    },
    opening_identity: { opening_screen_digest: 'opening-digest' },
    player_profile: { attributes: { strength: { value: 9 } } },
    clock: {
      whole_minutes: '100',
      subminute_numerator: '0',
      subminute_denominator: '1'
    },
    clock_weather_light: { clock: {
      whole_minutes: '100', subminute_numerator: '0',
      subminute_denominator: '1'
    } },
    position: {
      location_ref: 'trace_ld_v1_loc_old_drying_shed',
      g4_id: 'shed-g4',
      g5_node_id: 'shed-node',
      g5_anchor_id: 'shed-anchor'
    },
    prepared_scenes: [{
      location_profile_ref: 'trace_ld_v1_loc_fishing_camp',
      node: { instance_id: 'camp-node' },
      anchor: {
        instance_id: 'camp-anchor',
        template_id: 'camp-anchor-template'
      }
    }],
    phase5_treatment: { activity_execution: { status: 'completed' },
      status: 'completed' },
    phase5_history: [{ treatment: { final: true, attempt: {
      resource_consumptions: [
        { resource_ref: { entity_id: 'net' } },
        { resource_ref: { entity_id: 'poles' } }
      ]
    } } }],
    sealed_selections: [{ selection_kind: 'audience', records: [{
      selected_id: 'background_fisher_2'
    }] }],
    knowledge: [
      { fact_id: 'onisim_first_aid_completed' },
      { fact_id: 'ratsha_surrender_without_further_harm_committed' }
    ],
    temporal_boundary_candidates: [],
    body_state: {
      health: 79, energy: 37, satiety: 58,
      active_conditions: [{
        storage_condition_id: 'bruise', id: 'shoulder_bruise',
        status: 'active', state_version: 1
      }]
    },
    items: [{
      template_id: 'trace_ld_v1_item_fishing_net', item_id: 'net',
      quantity: 1, condition_state: 'serviceable',
      placement: { holder_npc_id: 'onisim',
        physical_position: 'external' },
      ownership: { owner_npc_id: 'eremey',
        controller_npc_id: 'onisim' },
      state: { accessibility: 'applied_not_available_as_resource',
        use_state: 'temporary_leg_splint_support' },
      inventory_profile: profile('net-profile',
        'trace_ld_v1_item_fishing_net')
    }, {
      template_id: 'trace_ld_v1_item_carry_poles', item_id: 'poles',
      quantity: 1, condition_state: 'serviceable',
      placement: { holder_npc_id: 'onisim',
        physical_position: 'external' },
      ownership: { owner_npc_id: 'background-one',
        controller_npc_id: 'onisim' },
      state: { accessibility: 'applied_not_available_as_resource',
        use_state: 'temporary_leg_splint_frame' },
      inventory_profile: profile('poles-profile',
        'trace_ld_v1_item_carry_poles')
    }],
    npcs: [
      actor('eremey_fisher', 'eremey'),
      actor('ratsha_storehouse_helper', 'ratsha'),
      actor('background_fisher_1', 'background-one'),
      actor('background_fisher_2', 'fisher'),
      actor('onisim_boatman', 'onisim', {
        body_condition: { state: 'stabilized_unable_to_walk' }
      })
    ]
  };
}

function temporalBoundary(id, wholeMinutes) {
  return {
    boundary_id: id, boundary_kind: 'exact_timer',
    scheduled_at: { whole_minutes: String(wholeMinutes),
      subminute_numerator: '0', subminute_denominator: '1' },
    source_ref: { entity_kind: 'party_route_plan_execution_event',
      entity_id: `source:${id}` },
    primary_subject_ref: { entity_kind: 'party', entity_id: 'phase6-party' },
    subject_refs: [], scope_ref: { entity_kind: 'party',
      entity_id: 'phase6-party' },
    rule_ref: { entity_ref: { entity_kind: 'action_contract', entity_id: id },
      authoring_version: 'v1' },
    policy_ref: { entity_ref: { entity_kind: 'activity_contract',
      entity_id: 'phase6-pause' }, authoring_version: 'v1' },
    preconditions_digest: 'a'.repeat(64),
    resolution_class: 'execution_outcome', interrupt_effect: 'background',
    visibility_policy_ref: { entity_ref: {
      entity_kind: 'visibility_modifier', entity_id: 'visible'
    }, authoring_version: 'v1' },
    idempotency_key: `phase6:${id}:${wholeMinutes}`,
    causal_parent_refs: []
  };
}

function actor(participantSlotRef, instanceId, machineState = {}) {
  return { participant_slot_ref: participantSlotRef,
    instance_id: instanceId, anchor_id: 'shed-anchor',
    machine_state: machineState };
}

function factualTurn(state, intent, idempotencyKey = 'phase6-idem') {
  const traversal = intent.traversal;
  const playerEffect = intent.body_effects_by_subject.find(
    ({ subject_ref: subject }) => subject === 'player_clerk'
  );
  const applied = playerEffect != null;
  const delta = playerEffect?.effect?.exact_deltas ?? {
    health: 0, energy: 0, satiety: 0
  };
  return {
    player_input: {
      party_id: state.party_id,
      request_id: `${idempotencyKey}-request`,
      idempotency_key: idempotencyKey,
      raw_text: 'Сделать носилки и отнести Онисима в стан'
    },
    mode_resolution: {
      option_id: 'make_stretcher_and_carry_onisim_to_camp',
      turn_id: 'phase6-turn',
      decision_trace: {
        state_version: state.party_state.state_version,
        action_set_digest: 'action-set'
      }
    },
    consequence: {
      phase6_kind: 'synchronized_carry',
      carry: { intent, traversal }
    },
    time_update: {
      clock_before: traversal.clock_before,
      clock_after: traversal.clock_update.world_time_after,
      exact_elapsed: { exact_minutes: intent.exact_elapsed }
    },
    body_update: {
      applied,
      proposal: applied ? { profile_ref: playerEffect.profile_ref } : null,
      state_after: applied ? {
        ...structuredClone(state.body_state),
        health: state.body_state.health + delta.health,
        energy: state.body_state.energy + delta.energy,
        satiety: state.body_state.satiety + delta.satiety
      } : structuredClone(state.body_state)
    }
  };
}

function visible(status) {
  return {
    visible_scene: status,
    visible_changes: status === 'completed'
      ? ['onisim_carried_to_camp_committed'] : [],
    sensory_details: [], visible_npc: [], visible_objects: [],
    known_context: [], uncertainties: []
  };
}

function rows(plan, table) {
  return [...plan.inserts, ...plan.updates, ...plan.appends]
    .filter(({ target_table: id }) => id === table);
}
