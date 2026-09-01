import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTemporalAdvanceOwner,
  npcTemporalEffectRegistrations
} from '@rus/turn/temporal-advance';
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
import { isPreparedPhase7RestLedger } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-7-prepared-validation.js';
import { isPreparedTurn10Ledger } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-10-prepared-validation.js';
import { fixture, loadScenarioBundle } from
  './lower-dvina-trace-phase-2-fixture.js';
import {
  approvedPhase7Contracts as approvedContracts,
  phase7AutonomousPlan as autonomousPlan,
  phase7DirectPlan as directPlan,
  phase7ItemPlan as itemPlan
} from
  './lower-dvina-trace-phase-7-contract-fixture.js';
import {
  phase7Command as commandFor,
  phase7CommittedState as committedState,
  phase7PlayerInput as playerInput
} from './lower-dvina-trace-phase-7-runtime-fixture.js';

const digest = 'a'.repeat(64);

const COMPOUND_TURN_10 =
  'Отдохнуть у огня полчаса и подсушить одежду. '
  + 'Попросить Еремея и рыбака пойти со мной к Жданко.';

test('Phase 7 exact matches admit only the registered rest command', () => {
  const command = createTracePhase7FireRestCommand({
    contracts: approvedContracts(committedState()),
    inputDigest: digest,
    npcAutonomousModel: async () => {
      throw new Error('exact matcher must not invoke autonomous model');
    },
    temporalAdvanceOwner: {
      advance() {
        throw new Error('exact matcher must not advance time');
      }
    },
    revalidateStateVersion: async () => 1
  });
  assert.equal(command.matches({
    raw_text: 'Отдохнуть у огня полчаса и подсушить одежду.'
  }), true);
  assert.equal(command.matches({
    raw_text: 'Отдохнуть у огня полчаса и подсушить одежду'
  }), true);
  assert.equal(command.matches({
    raw_text: '  Отдохнуть у огня полчаса и подсушить одежду.  '
  }), true);
  assert.equal(command.matches({ raw_text: COMPOUND_TURN_10 }), false,
    'compound Turn 10 must leave the exact path so the semantic plan can keep escort clauses');
  assert.equal(command.matches({
    raw_text: 'Давайте немного погреемся у костра и просушим одежду'
  }), false);
});

test('completed Phase 7 rest is not misclassified as Turn 10', () => {
  const rest = { owner_ref: 'lower_dvina_trace.rest_by_fire_and_dry_clothing',
    consequence: { duration_minutes: 30 } };
  assert.equal(isPreparedPhase7RestLedger({ slices: [rest] }), true);
  assert.equal(isPreparedTurn10Ledger({ slices: [rest] }), false);
});

test('Phase 7 executes a direct NPC step and continues the rest interval',
  async () => {
    const state = committedState();
    const contracts = approvedContracts(state);
    const consequence = await commandFor({ state, contracts,
      model: async (request) => directPlan(request)
    }).consequence({
      retrievedState: state,
      playerInput: playerInput(state, 'direct-listen')
    });
    assert.equal(consequence.phase7.actor_step.status, 'started');
    assert.equal(
      consequence.phase7.schedule_execution.exact_elapsed.exact_minutes
        .numerator,
      '1'
    );
    assert.equal(
      consequence.phase7.schedule_execution.clock_after.whole_minutes,
      '126'
    );
    assert.equal(
      consequence.phase7.schedule_temporal.result.clock_after.whole_minutes,
      '130'
    );
    const timeUpdate = {
      clock_before: state.clock,
      clock_after: consequence.phase7.schedule_temporal.result.clock_after,
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
    const snapshot = rows(committed.plan, 'party_state_snapshots')[0]
      .record.state_payload;
    assert.equal(snapshot.clock.whole_minutes, '130');
    assert.equal(snapshot.phase7_fire_rest.schedule_result.clock_after
      .whole_minutes, '126');
    assert.equal(snapshot.npcs[1].machine_state.status, 'idle');
  });

test('Phase 7 starts the NPC actor-step at +25 before temporal continuation',
  async () => {
    const state = committedState();
    const contracts = approvedContracts(state);
    const owner = createTemporalAdvanceOwner({
      effect_registrations: [
        ...npcTemporalEffectRegistrations(),
        ...lowerDvinaTracePhase7TemporalEffectRegistrations()
      ]
    });
    const continuationInputs = [];
    const command = createTracePhase7FireRestCommand({
      contracts,
      inputDigest: digest,
      npcAutonomousModel: async (request) =>
        autonomousPlan(request, 'move_bag'),
      temporalAdvanceOwner: {
        advance(input) {
          if (input.request.clock_before.whole_minutes === '125') {
            continuationInputs.push(structuredClone(input));
          }
          return owner.advance(input);
        }
      },
      revalidateStateVersion: async () => state.party_state.state_version
    });
    const consequence = await command.consequence({
      retrievedState: state,
      playerInput: playerInput(state, 'temporal-order'),
      rootTurnId:
        `turn:${state.party_id}:${state.party_state.turn_number + 1}`
    });
    assert.equal(continuationInputs.length, 1);
    assert.equal(continuationInputs[0].stop_after_source_batch, false);
    assert.equal(continuationInputs[0].request.relevant_state_projection
      .active_npc_actor_steps[0].npc_ref, 'zhdanko-1');
    assert.equal(continuationInputs[0].request.relevant_state_projection
      .active_npc_actor_steps[0].started_at.whole_minutes, '125');
    assert.equal(continuationInputs[0].registered_effects[0].candidate
      .scheduled_at.whole_minutes, '130');
    assert.equal(consequence.phase7.temporal.terminal_candidate
      .resolution_class, 'npc_schedule');
    assert.equal(consequence.phase7.autonomous.boundary.resolution_class,
      'reaction_decision');
  });

test('Phase 7 delegates an autonomous concealment attempt to the item owner',
  async () => {
    const state = committedState();
    const contracts = approvedContracts(state);
    const consequence = await commandFor({ state, contracts,
      model: async (request) => {
        assert.deepEqual(
          request.decision_scope.operation_contract.request_item_use.allowed,
          [{
            item_ref: 'trace_ld_v1_container_road_bag',
            use_kind: 'operate',
            target_refs: ['storehouse_inside']
          }, {
            item_ref: 'trace_ld_v1_container_road_bag',
            use_kind: 'other',
            target_refs: ['storehouse_inside']
          }]
        );
        assert.equal(Object.hasOwn(
          request.decision_scope.operation_contract.request_item_use, 'item_refs'
        ), false);
        assert.equal(JSON.stringify(request.decision_scope.operation_contract)
          .includes('concealed_requires_search'), false);
        return itemPlan(request);
      }
    }).consequence({
      retrievedState: state,
      playerInput: playerInput(state, 'conceal')
    });
    const execution = consequence.phase7.schedule_execution;
    assert.equal(execution.status, 'executed');
    assert.equal(execution.execution_binding_ref, null);
    assert.equal(execution.domain_owner, '@rus/items-property');
    assert.equal(execution.property_proposal.transition_profile_id,
      'trace_ld_v1_property_bag_concealed_in_storehouse');
    assert.equal(execution.property_proposal.destination.visibility_state,
      'concealed_requires_search');
    assert.equal(execution.property_proposal.destination.zone_ref,
      'storehouse_inside');
    assert.equal(execution.movement_proposal, null);
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
    ], [70, 33, 39]);
    assert.deepEqual(bodyUpdate.state_after.active_conditions.map(
      ({ id }) => id), [
      'damp', 'mild_shivering', 'headache', 'shoulder_bruise'
    ]);
    const visibleJson = JSON.stringify(visible);
    for (const hidden of ['npc_decision_signal',
      'npc_action_decision_request', 'zhdanko_plan',
      'road_bag_new_location']) {
      assert.equal(visibleJson.includes(hidden), false);
    }
  });

test('revision 15 materialized state resolves the approved Phase 7 chain',
  async () => {
    const revision15 = await loadScenarioBundle(15);
    const state = fixture({ scenarioBundle: revision15 }).state;
    state.body_state.active_conditions = [{ id: 'mild_shivering' }];
    const contracts = resolveTracePhase7Contracts({
      state, bundle: revision15
    });
    assert.equal(revision15.definition_revision, 15);
    assert.equal(contracts.zhdanko.participant_slot_ref,
      'zhdanko_storehouse_controller');
    assert.equal(contracts.roadBag.item_ref,
      'trace_ld_v1_container_road_bag');
    assert.deepEqual(contracts.bodyEffect.condition_outcomes.find(
      ({ condition_profile_ref: ref }) =>
        ref === 'trace_ld_v1_condition_cold_shivering'
    ), {
      condition_profile_ref: 'trace_ld_v1_condition_cold_shivering',
      from: 'mild_shivering', to: 'mild_shivering', outcome: 'persists'
    });
    assert.equal(Object.hasOwn(
      revision15.autonomous_semantic_bindings,
      'activity_profile_bindings'
    ), false);
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

    const forgedTracePlan = structuredClone(plan);
    const forgedCausality = rows(
      forgedTracePlan, 'party_timed_activity_attempts'
    )[0].record.trace.causality;
    const forgedTraceRef = {
      entity_kind: 'npc_decision_trace',
      entity_id: 'unpersisted-request'
    };
    forgedCausality.decision_trace_ref = structuredClone(forgedTraceRef);
    forgedCausality.actor_step_completion_candidate.source_ref
      = structuredClone(forgedTraceRef);
    forgedCausality.actor_step_completion_candidate.causal_parent_refs
      = [structuredClone(forgedTraceRef)];
    await assert.rejects(() => assertPhase7NormalizedRows(
      phase7ReadPool(forgedTracePlan, snapshot), snapshot
    ), ({ code }) => code === 'TRACE_PHASE_2_SESSION_READ_INVALID');

    const scalarTamperedSnapshot = structuredClone(snapshot);
    const scalarTamperedPlan = structuredClone(plan);
    const candidateId = 'npc-waiting:substituted:zhdanko:terminal';
    const transitionId = `waiting-transition:${candidateId}`;
    const tamperedDecision = rows(
      scalarTamperedPlan, 'party_npc_decision_traces'
    )[0].record;
    const signal = tamperedDecision.signal_records[0];
    const boundary = tamperedDecision.boundary_snapshot;
    const signalId =
      `decision-signal:npc_activity_factual_transition:${transitionId}:${
        signal.subject_ref.entity_id}:${signal.category}`;
    const batchId = 'temporal-batch:substituted';
    const boundaryId =
      `npc-decision:autonomous:${batchId}:${boundary.npc_ref.entity_id}`;
    scalarTamperedSnapshot.phase7_fire_rest.waiting_terminal_candidate_id
      = candidateId;
    scalarTamperedSnapshot.phase7_fire_rest.waiting_transition_id
      = transitionId;
    scalarTamperedSnapshot.phase7_fire_rest.decision_signal_id
      = signalId;
    scalarTamperedSnapshot.phase7_fire_rest.decision_boundary_id
      = boundaryId;
    const tamperedCausality = rows(
      scalarTamperedPlan, 'party_timed_activity_attempts'
    )[0].record.trace.causality;
    tamperedCausality.waiting_terminal_candidate.boundary_id = candidateId;
    tamperedCausality.waiting_terminal_candidate.idempotency_key = candidateId;
    tamperedCausality.waiting_terminal_candidate_ref.entity_id = candidateId;
    tamperedCausality.waiting_transition.transition_id = transitionId;
    tamperedCausality.waiting_transition.source_candidate_ref.entity_id
      = candidateId;
    tamperedCausality.waiting_transition.causal_parent_refs[0].entity_id
      = candidateId;
    tamperedCausality.waiting_transition_ref.entity_id = transitionId;
    tamperedCausality.decision_signal_ref.entity_id = signalId;
    tamperedCausality.decision_boundary_ref.entity_id = boundaryId;
    signal.signal_id = signalId;
    signal.idempotency_key = signalId;
    signal.source_event_ref.entity_id = transitionId;
    signal.causal_parent_refs[0].entity_id = candidateId;
    boundary.same_time_batch_ref.entity_id = batchId;
    boundary.boundary_id = boundaryId;
    boundary.idempotency_key = boundaryId;
    boundary.signal_refs[0].entity_id = signalId;
    tamperedDecision.boundary_id = boundaryId;
    await assert.rejects(() => assertPhase7NormalizedRows(
      phase7ReadPool(scalarTamperedPlan, scalarTamperedSnapshot),
      scalarTamperedSnapshot
    ), ({ code }) => code === 'TRACE_PHASE_2_SESSION_READ_INVALID');
  });

test('Phase 7 P16 rejects a schedule detached from temporal completion',
  async () => {
    const state = committedState();
    const contracts = approvedContracts(state);
    const consequence = await commandFor({ state, contracts,
      model: async (request) => autonomousPlan(request, 'move_bag')
    }).consequence({
      retrievedState: state,
      playerInput: playerInput(state, 'tampered-completion')
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
    const tampered = structuredClone(consequence);
    tampered.phase7.schedule_execution.exact_elapsed.exact_minutes.numerator
      = '0';
    await assert.rejects(() => buildLowerDvinaTracePhase7Commit({
      partyId: state.party_id,
      factual: factualTurn(state, tampered, timeUpdate, bodyUpdate),
      state,
      inputDigest: digest,
      visibleContext: visibleContext(),
      phase7Contracts: contracts
    }), ({ code }) => code === 'TRACE_PHASE_7_OWNER_RESULT_INVALID');

    const fractionalClock = structuredClone(timeUpdate);
    fractionalClock.clock_after.subminute_numerator = '1';
    fractionalClock.clock_after.subminute_denominator = '2';
    await assert.rejects(() => buildLowerDvinaTracePhase7Commit({
      partyId: state.party_id,
      factual: factualTurn(
        state, consequence, fractionalClock, bodyUpdate
      ),
      state,
      inputDigest: digest,
      visibleContext: visibleContext(),
      phase7Contracts: contracts
    }), ({ code }) => code === 'TRACE_PHASE_7_OWNER_RESULT_INVALID');
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

test('Phase 7 P16 persists an item-owner concealment without movement',
  async () => {
    const state = committedState();
    const contracts = approvedContracts(state);
    const consequence = await commandFor({ state, contracts,
      model: async (request) => itemPlan(request)
    }).consequence({
      retrievedState: state,
      playerInput: playerInput(state, 'persist-conceal')
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
    const snapshot = rows(committed.plan, 'party_state_snapshots')[0]
      .record.state_payload;
    assert.equal(snapshot.containers[0].state.visibility_state,
      'concealed_requires_search');
    assert.equal(snapshot.containers[0].state.zone_ref, 'storehouse_inside');
    assert.equal(snapshot.npcs[1].machine_state.spatial_zone_ref,
      'storehouse_inside');
  });

function factualTurn(state, consequence, timeUpdate, bodyUpdate) {
  return {
    player_input: playerInput(state, 'persist'),
    mode_resolution: {
      option_id: 'rest_by_fire_and_dry_clothing',
      turn_id: consequence.phase7.autonomous.request.root_turn_id,
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
      } else if (sql.includes('party_npc_decision_traces')) {
        resultRows = [one('party_npc_decision_traces')];
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
