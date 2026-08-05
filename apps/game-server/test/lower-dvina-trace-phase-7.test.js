import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcSemanticDecisionTrace } from '@rus/npc-runtime';
import { createTemporalAdvanceOwner } from '@rus/turn/temporal-advance';
import { buildLowerDvinaTracePhase7Commit } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-7-commit.js';
import { assertPhase7NormalizedRows } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-7-read.js';
import { createTracePhase7FireRestCommand } from
  '../src/runtime/lower-dvina-trace-phase-7-command.js';
import {
  createTracePhase7BodyEffect,
  createTracePhase7VisibleProjector
} from '../src/runtime/lower-dvina-trace-phase-7-effects.js';
import { lowerDvinaTracePhase7TemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-7-temporal-effect-owner.js';
import { resolveTracePhase7Contracts } from
  '../src/runtime/lower-dvina-trace-phase-7-contracts.js';
import { fixture, loadScenarioBundle } from
  './lower-dvina-trace-phase-2-fixture.js';

const digest = 'a'.repeat(64);

test('Phase 7 resolves one +25 autonomous boundary and a 5 minute bag move',
  async () => {
    const state = committedState();
    const contracts = approvedContracts(state);
    const command = commandFor({ state, contracts, model: async (request) => {
      return autonomousPlan(request, 'move_bag');
    } });
    const consequence = await command.consequence({
      retrievedState: state,
      playerInput: playerInput(state)
    });

    assert.equal(consequence.phase7.temporal.elapsed_before_decision, 25);
    assert.deepEqual(
      consequence.phase7.temporal.result.trace.processed_boundary_ids,
      ['npc-waiting:phase7-party:zhdanko:terminal']
    );
    assert.equal(consequence.phase7.autonomous.boundary.decision_mode,
      'autonomous');
    assert.deepEqual(consequence.phase7.autonomous.consumed_signal_ids,
      [consequence.phase7.autonomous.signal.signal_id]);
    assert.equal(consequence.phase7.schedule_execution.schedule_option_id,
      'move_bag');
    assert.deepEqual(
      consequence.phase7.schedule_execution.exact_elapsed.exact_minutes,
      { numerator: '5', denominator: '1' }
    );
    assert.equal(consequence.phase7.schedule_execution.clock_after.whole_minutes,
      '130');
    assert.equal(consequence.phase7.schedule_temporal.elapsed_after_decision, 5);
  });

test('Phase 7 sends a valid non-profiled intention through actor-step once',
  async () => {
    const state = committedState();
    const contracts = approvedContracts(state);
    let modelCalls = 0;
    const command = commandFor({ state, contracts, model: async (request) => {
      modelCalls += 1;
      const plan = autonomousPlan(request, 'guard');
      plan.operations[0].activity_kind = 'guard';
      plan.operations[0].description = 'Остаться настороже у клети.';
      return plan;
    } });
    const consequence = await command.consequence({
      retrievedState: state,
      playerInput: playerInput(state, 'guard')
    });
    assert.equal(modelCalls, 1);
    assert.equal(consequence.phase7.schedule_execution.status, 'unavailable');
    assert.equal(consequence.phase7.schedule_execution.failure_code,
      'NPC_ACTIVITY_PROFILE_NOT_APPLICABLE');
    assert.equal(consequence.phase7.schedule_execution.owner,
      '@rus/turn/actor-step');
    assert.equal(consequence.phase7.schedule_execution.clock_after.whole_minutes,
      '125');
    assert.equal(consequence.phase7.schedule_temporal.result.clock_after
      .whole_minutes, '130');
  });

test('Phase 7 accepts approved wait and keeps the autonomous branch private',
  async () => {
    const state = committedState();
    const contracts = approvedContracts(state);
    const command = commandFor({ state, contracts,
      model: async (request) => autonomousPlan(request, 'wait') });
    const consequence = await command.consequence({
      retrievedState: state,
      playerInput: playerInput(state, 'wait')
    });
    assert.equal(consequence.phase7.schedule_execution.schedule_option_id,
      'wait');
    assert.equal(consequence.phase7.schedule_execution.movement_proposal, null);
    assert.equal(consequence.phase7.schedule_execution.property_proposal, null);

    const timeUpdate = {
      clock_before: state.clock,
      clock_after: consequence.phase7.schedule_execution.clock_after,
      exact_elapsed: { exact_minutes: { numerator: '30', denominator: '1' } }
    };
    const bodyUpdate = createTracePhase7BodyEffect({
      contracts,
      fallback: { apply() { throw new Error('unexpected fallback'); } }
    }).apply({ committed_state: state, consequence, time_update: timeUpdate });
    const visible = await createTracePhase7VisibleProjector({
      fallback: { async project() { throw new Error('unexpected fallback'); } }
    }).project({ consequence, body_update: bodyUpdate });

    assert.deepEqual([
      bodyUpdate.state_after.health,
      bodyUpdate.state_after.energy,
      bodyUpdate.state_after.satiety
    ], [70, 32, 39]);
    assert.deepEqual(bodyUpdate.state_after.active_conditions.map(
      ({ id }) => id), [
      'damp', 'mild_shivering', 'headache', 'shoulder_bruise'
    ]);
    const visibleJson = JSON.stringify(visible);
    for (const hidden of ['npc_action_decision_request', 'zhdanko_plan',
      'road_bag_new_location']) {
      assert.equal(visibleJson.includes(hidden), true);
      assert.equal(visible.visible_scene.includes(hidden), false);
    }
  });

test('Phase 7 replays a hydrated autonomous decision without the model',
  async () => {
    const state = committedState();
    const contracts = approvedContracts(state);
    const first = await commandFor({ state, contracts,
      model: async (request) => autonomousPlan(request, 'move_bag')
    }).consequence({ retrievedState: state, playerInput: playerInput(state) });
    const decision = first.phase7.autonomous.decision_records[0];
    const replayState = structuredClone(state);
    replayState.npc_semantic_decision_traces = [
      buildNpcSemanticDecisionTrace({
        request: decision.request,
        plan: decision.proposal.plan,
        applied_change_set_id: 'change:phase7-party:persisted-decision'
      })
    ];
    replayState.npc_decision_signals = [{
      signal: first.phase7.autonomous.signal,
      same_time_batch_key: 'persisted-batch'
    }];
    replayState.consumed_npc_decision_signal_ids = [
      first.phase7.autonomous.signal.signal_id
    ];
    let modelCalls = 0;
    const replayed = await commandFor({
      state: replayState,
      contracts,
      model: async () => {
        modelCalls += 1;
        throw new Error('persisted autonomous decision must replay');
      }
    }).consequence({
      retrievedState: replayState,
      playerInput: playerInput(replayState, 'replay')
    });
    assert.equal(modelCalls, 0);
    assert.equal(replayed.phase7.autonomous.proposal.status, 'replayed');
    assert.equal(replayed.phase7.schedule_execution.schedule_option_id,
      'move_bag');
  });

test('revision 15 materialized state resolves the approved Phase 7 chain',
  async () => {
    const revision15 = await loadScenarioBundle(15);
    const state = fixture({ scenarioBundle: revision15 }).state;
    const contracts = resolveTracePhase7Contracts({
      state, bundle: revision15
    });
    assert.equal(revision15.definition_revision, 15);
    assert.equal(contracts.zhdanko.participant_slot_ref,
      'zhdanko_storehouse_controller');
    assert.equal(contracts.roadBag.item_ref,
      'trace_ld_v1_container_road_bag');
    assert.deepEqual(contracts.autonomousActivityBindings.map(
      ({ activity_profile_ref: id }) => id), [
      'trace_ld_v1_activity_zhdanko_wait',
      'trace_ld_v1_activity_zhdanko_move_bag'
    ]);
  });

test('Phase 7 P16 persists decision, body and approved schedule atomically',
  async () => {
    const state = committedState();
    state.npc_semantic_decision_traces = [{ private_marker: 'private-plan' }];
    const contracts = approvedContracts(state);
    const command = commandFor({ state, contracts,
      model: async (request) => autonomousPlan(request, 'move_bag') });
    const consequence = await command.consequence({
      retrievedState: state,
      playerInput: playerInput(state, 'persist')
    });
    const timeUpdate = {
      clock_before: state.clock,
      clock_after: consequence.phase7.schedule_execution.clock_after,
      exact_elapsed: { exact_minutes: { numerator: '30', denominator: '1' } }
    };
    const bodyUpdate = createTracePhase7BodyEffect({
      contracts,
      fallback: { apply() { throw new Error('unexpected fallback'); } }
    }).apply({ committed_state: state, consequence, time_update: timeUpdate });
    const factual = factualTurn(state, consequence, timeUpdate, bodyUpdate);
    const committed = await buildLowerDvinaTracePhase7Commit({
      partyId: state.party_id,
      factual,
      state,
      inputDigest: digest,
      visibleContext: visibleContext(),
      phase7Contracts: contracts
    });
    const plan = committed.plan;
    assert.equal(plan.operation_kind, 'trace_phase_7_fire_rest');
    assert.equal(rows(plan, 'party_clocks').length, 1);
    assert.equal(rows(plan, 'party_timed_activity_attempts').length, 1);
    assert.equal(rows(plan, 'party_npc_decision_traces').length, 1);
    assert.equal(rows(plan, 'party_body_temporal_history').length, 1);
    assert.equal(rows(plan, 'party_npcs').length, 1);
    assert.equal(rows(plan, 'party_containers').length, 1);
    const trace = rows(plan, 'party_npc_decision_traces')[0].record;
    assert.equal(trace.decision_mode, 'autonomous');
    assert.equal(trace.semantic_request.schema,
      'npc_action_decision_request_v1');
    assert.equal(trace.semantic_plan.schema, 'npc_step_plan_v1');
    const snapshot = rows(plan, 'party_state_snapshots')[0].record.state_payload;
    assert.equal(snapshot.phase7_fire_rest.exact_elapsed_minutes, 30);
    assert.equal(snapshot.phase7_fire_rest.schedule_option_id, 'move_bag');
    assert.equal(snapshot.clock.whole_minutes, '130');
    assert.equal(snapshot.containers[0].state.zone_ref, 'river_access');
    assert.equal(snapshot.npcs[1].machine_state.spatial_zone_ref,
      'river_access');
    assert.equal(Object.hasOwn(snapshot, 'npc_semantic_decision_traces'), false);
    assert.equal(JSON.stringify(snapshot).includes('private-plan'), false);
    assert.equal(JSON.stringify(plan.visible_package_envelope)
      .includes('road_bag_new_location'), false);

    const pool = phase7ReadPool(plan, snapshot);
    await assert.doesNotReject(() =>
      assertPhase7NormalizedRows(pool, snapshot));
    const tampered = structuredClone(snapshot);
    tampered.containers[0].state.zone_ref = 'storehouse_inside';
    await assert.rejects(() => assertPhase7NormalizedRows(pool, tampered),
      ({ code }) => code === 'TRACE_PHASE_2_SESSION_READ_INVALID');
  });

test('Phase 7 P16 persists the approved wait schedule history', async () => {
  const state = committedState();
  const contracts = approvedContracts(state);
  const consequence = await commandFor({ state, contracts,
    model: async (request) => autonomousPlan(request, 'wait')
  }).consequence({
    retrievedState: state,
    playerInput: playerInput(state, 'persist-wait')
  });
  const timeUpdate = {
    clock_before: state.clock,
    clock_after: consequence.phase7.schedule_execution.clock_after,
    exact_elapsed: { exact_minutes: { numerator: '30', denominator: '1' } }
  };
  const bodyUpdate = createTracePhase7BodyEffect({
    contracts,
    fallback: { apply() { throw new Error('unexpected fallback'); } }
  }).apply({ committed_state: state, consequence, time_update: timeUpdate });
  const committed = await buildLowerDvinaTracePhase7Commit({
    partyId: state.party_id,
    factual: factualTurn(state, consequence, timeUpdate, bodyUpdate),
    state,
    inputDigest: digest,
    visibleContext: visibleContext(),
    phase7Contracts: contracts
  });
  const plan = committed.plan;
  const snapshot = rows(plan, 'party_state_snapshots')[0].record.state_payload;
  const zhdanko = snapshot.npcs.find(({ participant_slot_ref: slot }) =>
    slot === 'zhdanko_storehouse_controller');
  const attempt = rows(plan, 'party_timed_activity_attempts')[0].record;
  assert.equal(rows(plan, 'party_npcs').length, 1);
  assert.equal(rows(plan, 'party_containers').length, 0);
  assert.equal(zhdanko.machine_state.status, 'waiting');
  assert.equal(zhdanko.machine_state.npc_schedule_history.length, 1);
  assert.equal(zhdanko.machine_state.last_schedule_execution
    .schedule_option_id, 'wait');
  assert.equal(attempt.trace.npc_schedule_result.schedule_option_id, 'wait');
  assert.deepEqual(attempt.trace.npc_schedule_result,
    snapshot.phase7_fire_rest.schedule_result);
});

function commandFor({ state, contracts, model }) {
  return createTracePhase7FireRestCommand({
    contracts,
    inputDigest: digest,
    npcAutonomousModel: model,
    temporalAdvanceOwner: createTemporalAdvanceOwner({
      effect_registrations:
        lowerDvinaTracePhase7TemporalEffectRegistrations()
    }),
    revalidateStateVersion: async () => state.party_state.state_version
  });
}

function approvedContracts(state) {
  const zhdanko = state.npcs.find(
    ({ participant_slot_ref: slot }) =>
      slot === 'zhdanko_storehouse_controller'
  );
  const wait = execution('wait', 'trace_ld_v1_activity_zhdanko_wait');
  const move = execution('move_bag',
    'trace_ld_v1_activity_zhdanko_move_bag');
  return {
    autonomous: {
      target_npc_ref: 'zhdanko_storehouse_controller',
      signal_descriptor: { category: 'objective', significance: 'material' },
      available_resource_refs: ['trace_ld_v1_container_road_bag'],
      known_route_refs: ['trace_ld_v1_local_transition_storehouse_to_river_access']
    },
    restActivity: {
      profile_id: 'trace_ld_v1_activity_fire_rest', version: 1,
      duration_minutes: 30
    },
    waitActivity: {
      profile_id: 'trace_ld_v1_activity_zhdanko_wait', version: 1
    },
    bodyEffect: {
      effect_profile_id: 'trace_ld_v1_body_fire_rest_30m',
      elapsed_minutes: 30,
      exact_deltas: { health: 0, energy: 2, satiety: -1 },
      selection_policy: 'fixed_approved_effect',
      rng_consumption: 'forbidden',
      condition_outcomes: [
        outcome('trace_ld_v1_condition_wet_clothing', 'wet', 'damp',
          'clothing_partially_dried'),
        outcome('trace_ld_v1_condition_cold_shivering', 'strong_shivering',
          'mild_shivering', 'shivering_reduced'),
        outcome('trace_ld_v1_condition_headache', 'headache', 'headache',
          'headache_persists'),
        outcome('trace_ld_v1_condition_shoulder_bruise', 'shoulder_bruise',
          'shoulder_bruise', 'shoulder_bruise_persists')
      ]
    },
    npcPolicy: {
      goals: ['protect_storehouse_property'],
      fears: ['loss_of_property'],
      relations_and_obligations: ['responsible_for_storehouse']
    },
    schedulePolicy: {
      schedule_policy_id: 'trace_ld_v1_zhdanko_autonomous_schedule',
      version: 1
    },
    roadBag: {
      item_ref: 'trace_ld_v1_container_road_bag'
    },
    bagTransition: {
      transition_profile_id: 'trace_ld_v1_property_bag_to_river_access',
      schema: 'rus.items_property.approved_transition_profile.v1',
      version: 1,
      subject_ref: 'trace_ld_v1_container_road_bag',
      requires: {
        location_ref: 'trace_ld_v1_loc_storehouse',
        zone_ref: 'storehouse_inside',
        holder_ref: 'zhdanko_storehouse_controller',
        controller_ref: 'zhdanko_storehouse_controller'
      },
      writes: {
        location_ref: 'trace_ld_v1_loc_storehouse',
        zone_ref: 'river_access',
        holder_ref: 'zhdanko_storehouse_controller',
        controller_ref: 'zhdanko_storehouse_controller'
      },
      owner_change: 'forbidden',
      contained_item_effect:
        'inherit_parent_container_position_holder_and_controller'
    },
    localTransition: {
      transition_id:
        'trace_ld_v1_local_transition_storehouse_to_river_access',
      schema: 'rus.trace_local_zone_transition.v1',
      version: 1,
      location_ref: 'trace_ld_v1_loc_storehouse',
      source_zone_candidates: ['storehouse_inside'],
      destination_zone_ref: 'river_access',
      admitted_subject_classes: ['actor', 'container'],
      duration_minutes: 5,
      elapsed_accounting: { parent_execution_roles: {
        [move.execution_binding_id]: {
          role: 'root_interval', clock_write: 'single'
        }
      } },
      terminal_outcome: 'same_materialized_location_new_zone'
    },
    autonomousActivityBindings: [
      activityBinding('wait', wait, ['wait'], [], []),
      activityBinding('move_road_bag', move, ['work', 'carry'],
        ['trace_ld_v1_container_road_bag'],
        ['trace_ld_v1_container_road_bag'])
    ],
    zhdanko,
    waitingBoundary: { elapsed_minutes: 25 },
    campLocationRef: 'trace_ld_v1_loc_fishing_camp',
    activityPin: { id: 'trace_ld_v1_activity_fire_rest', version: 1,
      digest }
  };
}

function execution(option, activity, minutes = 5) {
  return {
    execution_binding_id: `trace_ld_v1_schedule_execution_${option}`,
    schedule_option_id: option,
    activity_profile_ref: activity,
    time_profile_ref: `trace_ld_v1_time_${minutes}m`,
    ...(option === 'move_bag' ? {
      movement_ref:
        'trace_ld_v1_local_transition_storehouse_to_river_access',
      property_transition_refs: [
        'trace_ld_v1_property_bag_to_river_access'
      ],
      elapsed_plan: { stages: [{ duration_minutes: minutes }] }
    } : {
      movement_ref: null,
      property_transition_refs: [],
      elapsed_plan: { stages: [{ duration_minutes: minutes }] }
    })
  };
}

function activityBinding(id, profile, activityKinds, requiredTargetRefs,
  allowedTargetRefs) {
  return {
    binding_ref: `trace_ld_v1_autonomous_activity_${id}`,
    activity_profile_ref: profile.activity_profile_ref,
    execution_profile_ref: profile.execution_binding_id,
    execution_profile: profile,
    applicability: {
      operation: 'request_activity',
      activity_kinds: activityKinds,
      required_target_refs: requiredTargetRefs,
      allowed_target_refs: allowedTargetRefs
    }
  };
}

function outcome(conditionProfileRef, from, to, outcomeCode) {
  return {
    condition_profile_ref: conditionProfileRef,
    from,
    to,
    outcome: outcomeCode
  };
}

function committedState() {
  return {
    schema: 'rus.lower_dvina_trace_turn_snapshot.v2',
    party_id: 'phase7-party',
    actor_id: 'mikula',
    party_state: {
      state_version: 7,
      session_state_version: 8,
      clock_state_version: 7,
      body_state_version: 4,
      turn_number: 7
    },
    opening_identity: { opening_screen_digest: 'opening-digest' },
    world_identity: {
      world_revision_id: 'world-revision',
      world_catalog_digest: 'world-digest'
    },
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
      location_ref: 'trace_ld_v1_loc_fishing_camp',
      zone_ref: 'working_camp',
      g4_id: 'camp-g4',
      g5_node_id: 'camp-node',
      g5_anchor_id: 'camp-anchor'
    },
    phase6_carry_execution: { status: 'completed' },
    body_state: {
      health: 70,
      energy: 30,
      satiety: 40,
      active_conditions: [
        condition('wet-clothing', 'wet'),
        condition('shivering', 'strong_shivering'),
        condition('headache', 'headache'),
        condition('bruise', 'shoulder_bruise')
      ]
    },
    body_effect_history: [],
    knowledge: [],
    items: [],
    containers: [{
      container_id: 'road-bag-1',
      template_id: 'trace_ld_v1_container_road_bag',
      holder_npc_id: 'zhdanko-1',
      state_version: 1,
      state: {
        location_ref: 'trace_ld_v1_loc_storehouse',
        zone_ref: 'storehouse_inside',
        controller_npc_id: 'zhdanko-1'
      }
    }],
    npcs: [{
      participant_slot_ref: 'onisim_boatman',
      instance_id: 'onisim-1',
      anchor_id: 'camp-anchor',
      machine_state: { spatial_zone_ref: 'fire_rest_area' }
    }, {
      participant_slot_ref: 'zhdanko_storehouse_controller',
      instance_id: 'zhdanko-1',
      anchor_id: 'storehouse-anchor',
      machine_state: {
        status: 'waiting',
        location_ref: 'trace_ld_v1_loc_storehouse',
        spatial_zone_ref: 'storehouse_inside'
      }
    }],
    temporal_boundary_candidates: [],
    npc_decision_signals: [],
    consumed_npc_decision_signal_ids: [],
    npc_semantic_decision_refs: []
  };
}

function condition(storageId, id) {
  return {
    storage_condition_id: storageId,
    id,
    status: 'active',
    state_version: 1,
    condition_profile_ref: { entity_id: storageId, state: id }
  };
}

function autonomousPlan(request, option) {
  const move = option === 'move_bag';
  return {
    schema: 'npc_step_plan_v1',
    request_id: request.request_id,
    root_turn_id: request.root_turn_id,
    boundary_id: request.boundary_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    decision_index: request.decision_index,
    npc_ref: request.npc_ref,
    interpretation: {
      npc_goal: move ? 'подготовить имущество' : 'продолжить ожидание',
      grounded_attempt: move ? 'перенести сумку' : 'ждать ещё пять минут',
      adaptation: 'literal'
    },
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{
      op: 'request_activity',
      actor_ref: request.npc_ref,
      activity_kind: move ? 'work' : 'wait',
      target_refs: move ? ['trace_ld_v1_container_road_bag'] : [],
      description: move ? 'Перенести дорожную сумку.' : 'Ждать ещё.'
    }],
    check: null,
    reason_code: move ? 'prepare_departure' : 'continue_waiting',
    reason: 'Ратша не вернулся к ожидаемому сроку.'
  };
}

function playerInput(state, suffix = 'move') {
  return {
    party_id: state.party_id,
    request_id: `phase7-${suffix}-request`,
    idempotency_key: `phase7-${suffix}-idem`,
    raw_text: 'Отдохнуть у огня полчаса и подсушить одежду'
  };
}

function factualTurn(state, consequence, timeUpdate, bodyUpdate) {
  return {
    player_input: playerInput(state, 'persist'),
    mode_resolution: {
      option_id: 'rest_by_fire_and_dry_clothing',
      turn_id: 'phase7-turn',
      decision_trace: {
        state_version: state.party_state.state_version,
        action_set_digest: 'action-set'
      }
    },
    consequence,
    time_update: timeUpdate,
    body_update: bodyUpdate
  };
}

function visibleContext() {
  return {
    visible_scene: 'У костра прошло полчаса.',
    visible_changes: ['elapsed_30_minutes'],
    sensory_details: ['Одежда немного подсохла.'],
    visible_npc: [],
    visible_objects: [],
    known_context: ['Одежда всё ещё сыровата.'],
    uncertainties: []
  };
}

function rows(plan, table) {
  return [...plan.inserts, ...plan.updates, ...plan.appends]
    .filter(({ target_table: id }) => id === table);
}

function phase7ReadPool(plan, snapshot) {
  const one = (table) => rows(plan, table)[0]?.record;
  return {
    async query(sql) {
      let resultRows;
      if (sql.includes('party_timed_activity_executions')) {
        resultRows = [one('party_timed_activity_executions')];
      } else if (sql.includes('party_timed_activity_attempts')) {
        resultRows = [one('party_timed_activity_attempts')];
      } else if (sql.includes('party_npcs')) {
        const persisted = one('party_npcs');
        const npc = snapshot.npcs.find(
          ({ instance_id: id }) => id === persisted.npc_id);
        resultRows = [{ ...npc, ...persisted }];
      } else if (sql.includes('party_containers')) {
        const persisted = one('party_containers');
        const container = snapshot.containers.find(
          ({ container_id: id }) => id === persisted.container_id);
        resultRows = [{ ...container, ...persisted }];
      } else if (sql.includes('party_actor_active_conditions')) {
        resultRows = snapshot.body_state.active_conditions.map(
          (condition) => ({
            condition_id: condition.storage_condition_id,
            condition_profile_ref: condition.condition_profile_ref,
            status: condition.status,
            state_version: condition.state_version
          })).sort((left, right) => left.condition_id.localeCompare(
            right.condition_id));
      } else if (sql.includes('party_body_temporal_history')) {
        resultRows = [one('party_body_temporal_history')];
      } else {
        throw new Error(`Unexpected Phase 7 read query: ${sql}`);
      }
      return { rowCount: resultRows.length, rows: resultRows };
    }
  };
}
