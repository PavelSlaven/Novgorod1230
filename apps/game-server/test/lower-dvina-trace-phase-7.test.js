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
import { npcRoutineTemporalRegistration } from '../src/runtime/npc-routine-temporal.js';
import { phase7StateBeforeSchedule } from '../src/runtime/lower-dvina-trace-phase-7-state-projection.js';
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
import { addPhase7RoutineBoundary, externalBoundary, factualTurn, phase7ReadPool, rows, timeUpdate,
  versioned, visibleContext } from
  './lower-dvina-trace-phase-7-persistence-fixture.js';
import { applyOrdinaryAggregateTransition } from '@rus/materialization';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from
  '../src/runtime/lower-dvina-trace-ordinary-discovery.js';
import { enabled as enabledO1 } from './lower-dvina-trace-o1-fixture.js';

const digest = 'a'.repeat(64);

const COMPOUND_TURN_10 =
  'Отдохнуть у огня полчаса и подсушить одежду. '
  + 'Попросить Еремея и рыбака пойти со мной к Жданко.';

async function commitReadReplay(state, contracts, consequence, label,
  previousPlans = []) {
  const update = timeUpdate(state, consequence, consequence.duration_minutes);
  const body = createTracePhase7BodyEffect({ contracts,
    fallback: { apply() { throw new Error('unexpected fallback'); } }
  }).apply({ committed_state: state, consequence, time_update: update });
  const factual = factualTurn(state, consequence, update, body);
  const input = { partyId: state.party_id, factual, state,
    inputDigest: digest, visibleContext: visibleContext(),
    phase7Contracts: contracts };
  const commit = await buildLowerDvinaTracePhase7Commit(input);
  const snapshot = rows(commit.plan, 'party_state_snapshots')[0]
    .record.state_payload;
  await assert.doesNotReject(() => assertPhase7NormalizedRows(
    phase7ReadPool([...previousPlans, commit.plan], snapshot), snapshot),
  `${label}: commit read`);
  const replay = await buildLowerDvinaTracePhase7Commit(input);
  assert.equal(replay.plan.digest, commit.plan.digest,
    `${label}: same-key replay has the same persisted plan`);
  await assert.doesNotReject(() => assertPhase7NormalizedRows(
    phase7ReadPool([...previousPlans, replay.plan], snapshot), snapshot),
  `${label}: replay read`);
  assert.equal(snapshot.party_state.turn_number,
    state.party_state.turn_number + 1, `${label}: next committed turn`);
  return { commit, replay, snapshot };
}

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

test('needs-check replaces the whole NPC plan with wait before actor-step',
  async () => {
    const state = committedState();
    const contracts = approvedContracts(state);
    const queueId = 'needs_check.csv#HNT0024';
    let npcOperationCalls = 0;
    const diagnostics = [];
    const capability = {
      operation: 'request_discovery',
      capability: { owner: '@rus/turn', allowed: [{
        discovery_kinds: ['inspect'], target_refs: ['storehouse_inside']
      }] },
      supports: ({ operation }) => operation.op === 'request_discovery',
      async execute() {
        npcOperationCalls += 1;
        throw new Error('blocked NPC plan must not execute');
      }
    };
    const consequence = await commandFor({ state, contracts,
      npcOwnerCapabilities: [capability],
      assertNeedsCheckAllowed: async ({ candidate }) => {
        assert.equal(candidate.path, 'O1.request.query');
        assert.equal(candidate.name, 'Колёсная прялка');
        throw Object.assign(new Error('blocked NPC proposal'), {
          code: 'TURN_MATERIALIZATION_NEEDS_CHECK_BLOCKED',
          details: { path: candidate.path, queue_id: queueId,
            queue_ids: [queueId] }
        });
      },
      recordNeedsCheckFilter: (record) => diagnostics.push(record),
      model: async (request) => ({ ...autonomousPlan(request, 'wait'),
        operations: [{ op: 'request_discovery', actor_ref: request.npc_ref,
          discovery_kind: 'inspect', target_refs: ['storehouse_inside'],
          query: 'Колёсная прялка' }] })
    }).consequence({ retrievedState: state,
      playerInput: playerInput(state, 'needs-check-npc') });

    assert.equal(npcOperationCalls, 0);
    assert.deepEqual(diagnostics, [{ path: 'O1.request.query',
      queue_ids: [queueId] }]);
    assert.equal(consequence.status, 'resolved');
    assert.equal(consequence.duration_minutes, 30);
    assert.equal(consequence.phase7.schedule_temporal.rest_completed, true);
    assert.equal(consequence.phase7.schedule_temporal.result.clock_after
      .whole_minutes, '130');
    assert.equal(consequence.phase7.actor_step.status, 'started');
    assert.equal(consequence.phase7.actor_step.semantic_operation.op,
      'request_activity');
    assert.equal(consequence.phase7.actor_step.semantic_operation.activity_kind,
      'wait');
    assert.deepEqual(consequence.phase7.actor_step_owner_outputs, {
      write_fragments: [], consequence_fragment: null,
      ordinary_materialization_atomic_write_plan: null,
      action_production_atomic_write_plans: [], local_fire_atomic_write_plans: [],
      spatial_semantic_atomic_write_plan: null
    });

    const { commit, snapshot: next } = await commitReadReplay(
      state, contracts, consequence, 'full rest with blocked NPC plan');
    assert.equal(next.party_state.state_version, state.party_state.state_version + 1);
    assert.equal(next.clock.whole_minutes, '130');
    assert.equal(JSON.stringify(next).includes(queueId), false,
      'queue IDs remain in developer diagnostics only');
    const persistedDecision = rows(commit.plan, 'party_npc_decision_traces')[0]
      .record;
    assert.equal(persistedDecision.semantic_plan.operations.length, 1);
    assert.equal(persistedDecision.semantic_plan.operations[0].op,
      'request_activity');
    assert.equal(rows(commit.plan, 'party_items').length, 0,
      'refused NPC operation creates no item rows');
    assert.equal(rows(commit.plan, 'party_timed_activity_executions')[0]
      .record.status, 'completed',
    'the replacement wait schedule is persisted as a normal activity');
    assert.equal(next.phase7_fire_rest.status, 'completed');
  });

test('NPC O1 descriptor filter lets fire rest commit without materialization',
  async () => {
    const state = committedState();
    state.position.g6_id = 'shore';
    state.position.position_id = 'shore-position';
    const contracts = approvedContracts(state);
    const queueId = 'needs_check.csv#HNT0024';
    const catalog = enabledO1();
    catalog.ordinary_aggregate = applyOrdinaryAggregateTransition({
      aggregate: catalog.ordinary_aggregate,
      transition: { kind: 'seed', request_identity: 'fixture-seed',
        expected_state_version: 0, density_band: 'ordinary',
        identity_budget: 1, background_groups: [] }
    });
    catalog.version_pins.ordinary_state_version =
      catalog.ordinary_aggregate.state_version;
    catalog.objective_context.ordinary_state = {
      ...catalog.objective_context.ordinary_state,
      seeded: true, density_band: 'ordinary', remaining_identity_budget: 1
    };
    const trace = [];
    const guardCandidates = [];
    let ordinaryResult = null;
    const o1 = createLowerDvinaTraceOrdinaryDiscoveryResolver({
      partyId: state.party_id, inputDigest: () => digest,
      requestSubject: 'npc', loadEnablement: async () => catalog,
      ordinaryMaterializationModel: Object.assign(async (request) => ({
        schema: 'ordinary_materialization_plan_v1',
        request_id: request.request_id, resolution: 'materialize',
        density_band_proposal: null, background_groups: [],
        entities: [{ semantic_descriptor: {
          semantic_type: 'household_tool', name: 'механизм',
          facts: ['Колёсная прялка'] }, authority_class: 'ordinary',
          admission_class: 'common_mundane', availability_class: 'common',
          functional_bucket: 'other_ordinary',
          presence_expectation: 'plausible', supporting_basis_ref: 'basis',
          causal_basis: { basis_kind: 'household_use', basis_refs: ['basis'] },
          property_basis_ref: 'property',
          placement_proposal: { scope_ref: 'shore', position_ref: 'bench' },
          mechanics_proposal: { mass_grams: 100, external_hand_cost: 0,
            carry_form: 'bulky', packing_slot_cost: 1,
            quantity: { value: 1, unit: 'item' }, container: null }
        }], presence_resolutions: [], reason_code: 'materialize'
      }), { verifyStageBCutover: async () => {} }),
      assertNeedsCheckAllowed: async ({ candidate, matchOnly }) => {
        guardCandidates.push(candidate);
        if (candidate.path === 'O1.request.query') return [];
        assert.equal(candidate.path,
          'O1.proposed_entity.semantic_descriptor');
        assert.equal(matchOnly, true);
        return [{ queue_id: queueId }];
      }, recordNeedsCheckFilter: (entry) => trace.push(entry)
    });
    let ownerCalls = 0;
    const capability = {
      operation: 'request_discovery',
      capability: { owner: '@rus/turn', allowed: [{
        discovery_kinds: ['search'], target_refs: ['shore']
      }] },
      supports: ({ operation }) => operation.op === 'request_discovery'
        && operation.discovery_kind === 'search'
        && operation.target_refs?.[0] === 'shore',
      async execute(execution) {
        ownerCalls += 1;
        ordinaryResult = await o1({ schema: 'turn_step_ordinary_discovery_request_v1',
          operation: execution.operation, plan: execution.plan,
          request: { root_turn_id: execution.request.root_turn_id,
            step_index: execution.request.decision_index },
          actor: { actor_id: execution.request.npc_ref },
          committed_state: { ...execution.committed_state,
            position: { ...execution.committed_state.position,
              g6_id: 'shore' } },
          working_projection: execution.working_projection });
        if (ordinaryResult.consequence_fragment?.visible_seed
            ?.ordinary_presence_seed?.resolution === 'no_change') {
          const { consequence_fragment, ...ownerOutput } = ordinaryResult;
          return ownerOutput;
        }
        return ordinaryResult;
      }
    };
    const consequence = await commandFor({ state, contracts,
      npcOwnerCapabilities: [capability],
      assertNeedsCheckAllowed: async ({ candidate }) => {
        assert.equal(candidate.path, 'O1.request.query');
        return [];
      },
      recordNeedsCheckFilter: (entry) => trace.push(entry),
      model: async (request) => ({ ...autonomousPlan(request, 'wait'),
        operations: [{ op: 'request_discovery', actor_ref: request.npc_ref,
          discovery_kind: 'search', target_refs: ['shore'],
          query: 'деревянная деталь' }] })
    }).consequence({ retrievedState: state,
      playerInput: playerInput(state, 'npc-o1-descriptor-filter') });

    assert.equal(ownerCalls, 1);
    assert.equal(consequence.status, 'resolved');
    assert.equal(consequence.duration_minutes, 30);
    assert.equal(consequence.phase7.schedule_temporal.result.clock_after
      .whole_minutes, '130');
    assert.equal(consequence.phase7.actor_step.semantic_operation.op,
      'request_discovery');
    assert.equal(consequence.phase7.actor_step_owner_outputs
      .ordinary_materialization_atomic_write_plan, null);
    assert.equal(ordinaryResult.summary, 'ordinary discovery resolved',
      JSON.stringify(ordinaryResult));
    assert.deepEqual(guardCandidates.map(({ path }) => path), [
      'O1.request.query', 'O1.proposed_entity.semantic_descriptor'
    ]);
    assert.equal(ordinaryResult.known_resolution.resolution, 'no_change');
    assert.deepEqual(trace, [{ path:
      'O1.proposed_entity.semantic_descriptor', queue_ids: [queueId] }]);
    const { commit, snapshot } = await commitReadReplay(state, contracts,
      consequence, 'NPC O1 descriptor filter');
    assert.equal(snapshot.clock.whole_minutes, '130');
    assert.equal(rows(commit.plan, 'party_items').length, 0);
    assert.equal(snapshot.phase7_fire_rest.status, 'completed');
  });

test('deferred rest segment persists and replays the blocked-plan wait',
  async () => {
    const state = committedState();
    const contracts = approvedContracts(state);
    const queueId = 'needs_check.csv#HNT0024';
    const capability = {
      operation: 'request_discovery',
      capability: { owner: '@rus/turn', allowed: [{
        discovery_kinds: ['search'], target_refs: ['storehouse_inside']
      }] },
      supports: ({ operation }) => operation.op === 'request_discovery',
      async execute() { throw new Error('blocked NPC plan must not execute'); }
    };
    const consequence = await commandFor({ state, contracts,
      preparedFollowupRef: 'prepared:shore-search',
      npcOwnerCapabilities: [capability],
      assertNeedsCheckAllowed: async ({ candidate }) => {
        assert.equal(candidate.path, 'O1.request.query');
        assert.equal(candidate.name, 'самопрялка');
        throw Object.assign(new Error('blocked NPC proposal'), {
          code: 'TURN_MATERIALIZATION_NEEDS_CHECK_BLOCKED',
          details: { path: candidate.path, queue_ids: [queueId] }
        });
      },
      model: async (request) => ({ ...autonomousPlan(request, 'wait'),
        operations: [{ op: 'request_discovery', actor_ref: request.npc_ref,
          discovery_kind: 'search', target_refs: ['storehouse_inside'],
          query: 'самопрялка' }] })
    }).consequence({ retrievedState: state,
      playerInput: playerInput(state, 'needs-check-deferred'),
      semanticPlan: { continuation: {
        remaining_intent: 'Осмотреть берег.', depends_on_refs: [],
        prepared_followup_ref: 'prepared:shore-search'
      } }
    });

    assert.equal(consequence.duration_minutes, 25);
    assert.equal(consequence.phase7.schedule_temporal.rest_completed, false,
      'the prepared followup ends a segment, not the full rest');
    assert.equal(consequence.phase7.schedule_execution.clock_after.whole_minutes,
      '125');
    assert.equal(consequence.phase7.actor_step.semantic_operation.activity_kind,
      'wait');
    const { commit, snapshot } = await commitReadReplay(state, contracts, consequence,
      'deferred 25-minute segment');
    assert.equal(snapshot.clock.whole_minutes, '125');
    assert.equal(snapshot.phase7_fire_rest.status, 'paused');
    assert.equal(snapshot.phase7_fire_rest.exact_elapsed_minutes, 25);

    const resumedContracts = approvedContracts(snapshot);
    const resumed = await commandFor({ state: snapshot,
      contracts: resumedContracts,
      model: async () => { throw new Error('deferred rest resume skips NPC decision'); }
    }).consequence({ retrievedState: snapshot,
      playerInput: playerInput(snapshot, 'needs-check-deferred-resume') });
    assert.equal(resumed.duration_minutes, 5);
    assert.equal(resumed.phase7.schedule_temporal.rest_completed, true);
    const { snapshot: completed } = await commitReadReplay(snapshot,
      resumedContracts, resumed, 'deferred rest final 5-minute segment',
      [commit.plan]);
    assert.equal(completed.clock.whole_minutes, '130');
    assert.equal(completed.phase7_fire_rest.status, 'completed');
    assert.equal(completed.phase7_fire_rest.exact_elapsed_minutes, 30,
      'the deferred segment and its next-turn continuation retain cumulative time');
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

test('Phase 7 preserves an external pause and resumes without a second NPC decision',
  async () => {
    const state = committedState();
    const contracts = approvedContracts(state);
    const ruleRef = versioned('action_contract', 'external-pause');
    const policyRef = versioned('activity_contract', 'external-pause');
    state.temporal_boundary_candidates = [externalBoundary(
      state.party_id, ruleRef, policyRef, '127')];
    const routineNpc = addPhase7RoutineBoundary(state, 120);
    const temporalAdvanceOwner = createTemporalAdvanceOwner({
      source_registrations: [npcRoutineTemporalRegistration(), {
        rule_ref: ruleRef,
        policy_ref: policyRef,
        resolve(candidate, context) {
          return {
            disposition: 'execute', proposals: [],
            state_projection: structuredClone(context.projection),
            follow_up_candidates: [], stop_after_current_batch: true
          };
        }
      }],
      effect_registrations: [
        ...npcTemporalEffectRegistrations(),
        ...lowerDvinaTracePhase7TemporalEffectRegistrations()
      ]
    });
    let modelCalls = 0;
    const first = await commandFor({ state, contracts,
      temporalAdvanceOwner,
      model: async (request) => {
        modelCalls += 1;
        return autonomousPlan(request, 'wait');
      }
    }).consequence({
      retrievedState: state,
      playerInput: playerInput(state, 'external-pause')
    });
    assert.equal(first.duration_minutes, 27);
    assert.equal(first.phase7.schedule_temporal.rest_completed, false);
    const firstTime = timeUpdate(state, first, 27);
    const firstBody = createTracePhase7BodyEffect({ contracts,
      fallback: { apply() { throw new Error('unexpected fallback'); } }
    }).apply({ committed_state: state, consequence: first,
      time_update: firstTime });
    assert.equal(firstBody.applied, false);
    const { commit: firstCommit, snapshot: paused } = await commitReadReplay(
      state, contracts, first, 'interrupted 27-minute segment');
    const pausedExecution = rows(firstCommit.plan,
      'party_timed_activity_executions')[0].record;
    const pausedAttempt = rows(firstCommit.plan,
      'party_timed_activity_attempts')[0].record;
    assert.equal(paused.phase7_fire_rest.status, 'paused');
    assert.equal(paused.clock.whole_minutes, '127');
    assert.equal(pausedExecution.status, 'paused');
    assert.equal(pausedExecution.cumulative_elapsed_numerator, 27);
    assert.equal(pausedExecution.remaining_time_numerator, 3);
    assert.equal(pausedAttempt.result_kind, 'paused');
    const pausedNpc = paused.npcs.find(({ instance_id: id }) => id === routineNpc.instance_id);
    assert.equal(pausedNpc.machine_state.npc_schedule_history.length, 1);
    assert.equal(pausedNpc.machine_state.active_npc_actor_step.status, 'started');
    assert.equal(rows(firstCommit.plan, 'party_npc_runtime_transitions').length, 1);
    assert.equal(rows(firstCommit.plan, 'party_body_temporal_history').length,
      0);

    const resumedContracts = approvedContracts(paused);
    const second = await commandFor({ state: paused,
      contracts: resumedContracts, temporalAdvanceOwner,
      model: async () => {
        modelCalls += 1;
        throw new Error('resume must not ask the NPC model again');
      }
    }).consequence({
      retrievedState: paused,
      playerInput: playerInput(paused, 'external-resume')
    });
    assert.equal(second.duration_minutes, 3);
    assert.equal(second.phase7.resumed, true);
    assert.equal(second.phase7.schedule_temporal.rest_completed, true);
    assert.equal(modelCalls, 1);
    assert.deepEqual(phase7StateBeforeSchedule(paused, second.phase7).npcs,
      paused.npcs, 'resume preserves the committed history and active step before its current result');
    const { commit: secondCommit, snapshot: completed } = await commitReadReplay(
      paused, resumedContracts, second, 'resumed final 3-minute segment',
      [firstCommit.plan]);
    const completedExecution = rows(secondCommit.plan,
      'party_timed_activity_executions')[0].record;
    const completedAttempt = rows(secondCommit.plan,
      'party_timed_activity_attempts')[0].record;
    assert.equal(completed.phase7_fire_rest.status, 'completed');
    assert.equal(completed.clock.whole_minutes, '130');
    assert.equal(completedExecution.status, 'completed');
    assert.equal(completedExecution.cumulative_elapsed_numerator, 30);
    assert.equal(completedExecution.remaining_time_numerator, 0);
    assert.equal(completedAttempt.attempt_ordinal, 1);
    assert.equal(completedAttempt.actual_time_numerator, 3);
    const completedNpc = completed.npcs.find(({ instance_id: id }) => id === routineNpc.instance_id);
    assert.equal(completedNpc.machine_state.npc_schedule_history.length, 2);
    assert.deepEqual(completedNpc.machine_state.npc_schedule_history[0],
      pausedNpc.machine_state.npc_schedule_history[0]);
    assert.equal(rows(secondCommit.plan, 'party_npc_runtime_transitions').length, 0);
    assert.deepEqual(rows(secondCommit.plan, 'party_npcs')[0].record.machine_state,
      completedNpc.machine_state);
    assert.equal(rows(secondCommit.plan,
      'party_npc_decision_traces').length, 0);
    assert.equal(rows(secondCommit.plan,
      'party_body_temporal_history').length, 1);
    await assert.doesNotReject(() => assertPhase7NormalizedRows(
      phase7ReadPool([firstCommit.plan, secondCommit.plan], completed), completed),
    'readback of the accumulated 27 + 3 minute rest lifecycle');
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
    state.current_visible_context = {
      version: 1, schema: 'visible_context_package',
      visible_scene: 'Рыбацкий стан на песчаном берегу.',
      visible_changes: [], sensory_details: ['На кольях сохнут сети.'],
      visible_npc: [{
        entity_ref: { entity_kind: 'npc', entity_id: 'onisim-1' },
        display_label: 'раненый мужчина', recognition: 'unrecognized',
        observable_cues: { identity: { sex_category: 'male' } }
      }],
      visible_objects: [], known_context: [], uncertainties: [],
      allowed_tensions: [], do_not_imply: []
    };
    const visible = await createTracePhase7VisibleProjector({
      fallback: { async project() { throw new Error('unexpected fallback'); } }
    }).project({ consequence, body_update: bodyUpdate,
      retrieved_state: state });

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
    assert.equal(visible.visible_scene,
      'Рыбацкий стан на песчаном берегу.');
    assert.equal(visible.sensory_details.includes(
      'На кольях сохнут сети.'), true);
    assert.equal(visible.visible_npc[0].display_label, 'раненый мужчина');
    assert.equal(visible.visible_npc[0].observable_cues.identity.sex_category,
      'male');
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
    assert.deepEqual(contracts.bodyEffect.condition_outcomes.map(
      ({ condition_profile_ref: ref }) => ref),
    ['trace_ld_v1_condition_cold_shivering']);
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
