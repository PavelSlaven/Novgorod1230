import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import {
  createTemporalAdvanceOwner,
  npcTemporalEffectRegistrations
} from '@rus/turn/temporal-advance';
import { requestNpcSemanticDecision } from '@rus/turn';
import { assertLowerDvinaTraceSemanticConversationRows } from
  '../src/infrastructure/postgres/lower-dvina-trace-semantic-conversation-read.js';
import { hydrateSemanticDecisionReplay } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-3-read.js';
import { semanticReadPool } from
  './lower-dvina-trace-semantic-persistence-read-pool.js';
import { lowerDvinaTracePhase7TemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-7-temporal-effect-owner.js';
import {
  approvedPhase7Contracts as approvedContracts,
  phase7AutonomousPlan as autonomousPlan
} from './lower-dvina-trace-phase-7-contract-fixture.js';
import {
  phase7Command as commandFor,
  phase7CommittedState as committedState,
  phase7PlayerInput as playerInput,
  persistPhase7Consequence
} from './lower-dvina-trace-phase-7-runtime-fixture.js';

test('Phase 7 aggregates every new NPC signal into one decision', async () => {
  const state = committedState();
  const contracts = approvedContracts(state);
  const ruleRef = versioned('action_contract', 'body-signal');
  const policyRef = versioned('activity_contract', 'body-signal');
  state.temporal_boundary_candidates = [{
    boundary_id: 'zhdanko-self-signal',
    boundary_kind: 'exact_timer',
    scheduled_at: at('125'),
    source_ref: ref('party_route_plan_execution_event',
      'zhdanko-fatigue-changed'),
    primary_subject_ref: ref('npc', 'zhdanko-1'),
    subject_refs: [],
    scope_ref: ref('party', state.party_id),
    rule_ref: ruleRef,
    policy_ref: policyRef,
    preconditions_digest: 'b'.repeat(64),
    resolution_class: 'perception_knowledge',
    interrupt_effect: 'background',
    visibility_policy_ref: versioned('visibility_modifier', 'hidden'),
    idempotency_key: 'zhdanko-self-signal',
    causal_parent_refs: []
  }];
  const temporalAdvanceOwner = signalBatchOwner(ruleRef, policyRef);
  let modelCalls = 0;
  const consequence = await commandFor({
    state,
    contracts,
    temporalAdvanceOwner,
    model: async (request) => {
      modelCalls += 1;
      assert.deepEqual(request.decision_reasons.categories,
        ['self', 'objective']);
      assert.equal(request.decision_reasons.signal_refs.length, 3);
      assert.deepEqual(request.decision_reasons.perceived_changes, [
        'Ратша не вернулся к условленному сроку.',
        'Жданко устал сильнее, пока ждал.',
        'На дороге по-прежнему нет Ратши.'
      ]);
      return autonomousPlan(request, 'wait');
    }
  }).consequence({
    retrievedState: state,
    playerInput: playerInput(state, 'aggregate-signals')
  });
  const autonomous = consequence.phase7.autonomous;
  assert.equal(modelCalls, 1);
  assert.equal(autonomous.decision_records.length, 1);
  assert.equal(autonomous.decision_records[0].orderedSignals.length, 3);
  assert.equal(autonomous.signal.source_event_ref.entity_kind,
    'npc_activity_factual_transition');
  assert.deepEqual(autonomous.consumed_signal_ids,
    autonomous.boundary.signal_refs.map(({ entity_id: id }) => id));

  const persisted = await persistPhase7Consequence({
    state, contracts, consequence
  });
  persisted.snapshot.materialization_trace = {
    seed_context: { scenario_definition_revision: 15 }
  };
  const replayInputs = [];
  const traces = await assertLowerDvinaTraceSemanticConversationRows(
    semanticReadPool(persisted.plan), persisted.snapshot, { replayInputs }
  );
  hydrateSemanticDecisionReplay(persisted.snapshot, traces, replayInputs);
  const hydratedInput = persisted.snapshot.npc_semantic_decision_inputs[0];
  let replayModelCalls = 0;
  const replayed = await requestNpcSemanticDecision({
    boundary: hydratedInput.boundary_snapshot,
    request: hydratedInput.request_snapshot,
    persistedTrace: persisted.snapshot.npc_semantic_decision_traces[0],
    persistedInput: hydratedInput,
    orderedSignals: hydratedInput.signal_records,
    semanticModel: async () => {
      replayModelCalls += 1;
      throw new Error('persisted multi-signal decision must replay');
    },
    revalidateStateVersion: async () =>
      hydratedInput.request_snapshot.committed_state_version
  });
  assert.equal(replayModelCalls, 0);
  assert.equal(replayed.status, 'replayed');

  for (const [label, mutate] of [
    ['foreign-subject', (signal) => {
      signal.subject_ref = ref('npc', 'foreign-npc');
    }],
    ['wrong-timestamp', (signal) => {
      signal.occurred_at = at('126');
    }]
  ]) {
    const tamperedPlan = structuredClone(persisted.plan);
    const tamperedSnapshot = structuredClone(persisted.snapshot);
    delete tamperedSnapshot.npc_semantic_decision_inputs;
    delete tamperedSnapshot.npc_semantic_decision_traces;
    const row = decisionRow(tamperedPlan);
    const tamperedSignal = row.signal_records.at(-1);
    mutate(tamperedSignal);
    const signalId = tamperedSignal.signal_id;
    mutate(tamperedSnapshot.npc_decision_signals.find(
      ({ signal }) => signal.signal_id === signalId).signal);
    resealDecisionRow(row, replayInputs[0].trace);
    await assert.rejects(
      () => assertLowerDvinaTraceSemanticConversationRows(
        semanticReadPool(tamperedPlan), tamperedSnapshot
      ),
      ({ code }) => code === 'TRACE_PHASE_2_SESSION_READ_INVALID',
      label
    );
  }
});

function decisionRow(plan) {
  return [...plan.inserts, ...plan.updates, ...plan.appends].find(
    ({ target_table: table }) => table === 'party_npc_decision_traces'
  ).record;
}

function resealDecisionRow(row, trace) {
  row.canonical_input_digest = canonicalDigest({
    schema: 'npc_semantic_decision_input_v1',
    request: row.semantic_request,
    boundary: row.boundary_snapshot,
    signal_records: row.signal_records
  });
  row.trace_digest = canonicalDigest({
    trace,
    request_snapshot: row.semantic_request,
    boundary_snapshot: row.boundary_snapshot,
    signal_records: row.signal_records,
    canonical_input_digest: row.canonical_input_digest
  });
}

const at = (wholeMinutes) => ({
  whole_minutes: wholeMinutes,
  subminute_numerator: '0',
  subminute_denominator: '1'
});
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const versioned = (entityKind, entityId) => ({
  entity_ref: ref(entityKind, entityId),
  authoring_version: '1'
});

function signalBatchOwner(ruleRef, policyRef) {
  return createTemporalAdvanceOwner({
    source_registrations: [{
      rule_ref: ruleRef,
      policy_ref: policyRef,
      resolve(candidate, context) {
        const descriptors = [{
          occurred_at: structuredClone(candidate.scheduled_at),
          category: 'self',
          significance: 'material',
          source_event_ref: structuredClone(candidate.source_ref),
          subject_ref: structuredClone(candidate.primary_subject_ref),
          scope_refs: [],
          perception_required: false,
          source_perception_ref: null,
          causal_parent_refs: [],
          perceived_change_summary: 'Жданко устал сильнее, пока ждал.'
        }, {
          occurred_at: structuredClone(candidate.scheduled_at),
          category: 'objective',
          significance: 'material',
          source_event_ref: ref('world_event', 'other-objective'),
          subject_ref: structuredClone(candidate.primary_subject_ref),
          scope_refs: [],
          perception_required: false,
          source_perception_ref: null,
          causal_parent_refs: [],
          perceived_change_summary: 'На дороге по-прежнему нет Ратши.'
        }];
        return {
          disposition: 'execute',
          proposals: [],
          state_projection: {
            ...context.projection,
            npc_decision_signal_descriptors: [
              ...(context.projection.npc_decision_signal_descriptors ?? []),
              ...descriptors
            ]
          },
          follow_up_candidates: []
        };
      }
    }],
    effect_registrations: [
      ...npcTemporalEffectRegistrations(),
      ...lowerDvinaTracePhase7TemporalEffectRegistrations()
    ]
  });
}

test('Phase 7 projects persisted NPC-safe state without invented defaults',
  async () => {
    const state = committedState();
    const contracts = approvedContracts(state);
    state.npcs[1].perception_snapshot = {
      visible_objects: [{
        resource_ref: 'perceived-access-resource',
        source_event_ref: {
          entity_kind: 'perception_event',
          entity_id: 'zhdanko-saw-access-resource'
        },
        summary: 'Жданко видит доступный свёрток рядом.'
      }]
    };
    state.containers.push({
      container_id: 'new-held-resource',
      template_id: 'new-runtime-template',
      holder_npc_id: 'zhdanko-1',
      state: {
        location_ref: 'trace_ld_v1_loc_storehouse',
        zone_ref: 'storehouse_inside'
      }
    }, {
      container_id: 'perceived-access-resource',
      template_id: 'new-access-template',
      holder_npc_id: 'other-npc',
      state: {
        location_ref: 'trace_ld_v1_loc_storehouse',
        zone_ref: 'storehouse_inside',
        access_state: 'available',
        visibility_state: 'visible'
      }
    }, {
      container_id: 'unknown-access-resource',
      template_id: 'unknown-access-template',
      holder_npc_id: 'other-npc',
      state: {
        location_ref: 'trace_ld_v1_loc_storehouse',
        zone_ref: 'storehouse_inside',
        access_state: 'available',
        visibility_state: 'visible'
      }
    }, {
      container_id: 'hidden-foreign-resource',
      template_id: 'hidden-runtime-template',
      holder_npc_id: 'other-npc',
      state: {
        location_ref: 'trace_ld_v1_loc_storehouse',
        zone_ref: 'storehouse_inside',
        access_state: 'available',
        visibility_state: 'hidden'
      }
    });
    state.items.push({
      item_id: 'accessible-axe-1',
      template_id: 'trace_ld_v1_item_zhdanko_axe',
      holder_npc_id: 'zhdanko-1',
      state: {
        location_ref: 'trace_ld_v1_loc_storehouse',
        zone_ref: 'storehouse_inside',
        controller_npc_id: 'zhdanko-1'
      }
    }, {
      item_id: 'remote-sealed-packet',
      template_id: 'trace_ld_v1_item_sealed_packet',
      holder_npc_id: 'other-npc',
      state: {
        location_ref: 'trace_ld_v1_loc_fishing_camp',
        zone_ref: 'working_camp',
        access_state: 'available',
        visibility_state: 'visible'
      }
    });
    await commandFor({
      state,
      contracts,
      model: async (request) => {
        assert.equal(request.npc.profile_level, 'key');
        assert.equal(request.npc.social_role.role_ref,
          'nov_role_merchant_clerk');
        assert.equal(Object.hasOwn(request.npc, 'profile_ref'), false);
        assert.equal(Object.hasOwn(request.npc, 'current_location'), false);
        assert.deepEqual(request.npc.body_state, {
          summary: 'устал после работы',
          conditions: [{ condition_ref: 'tired' }]
        });
        assert.deepEqual(request.npc.mood,
          { state: 'сосредоточен', intensity: 'moderate' });
        assert.equal(request.npc.relationships[0].actor_ref, 'ratsha-1');
        assert.equal(request.npc.available_resources[0].resource_ref,
          'road-bag-1');
        assert.equal(request.npc.available_resources.some(
          ({ resource_ref: resourceRef }) =>
            resourceRef === 'new-held-resource'), true);
        assert.equal(request.npc.available_resources.some(
          ({ resource_ref: resourceRef }) =>
            resourceRef === 'perceived-access-resource'), true);
        assert.equal(request.npc.available_resources.some(
          ({ resource_ref: resourceRef }) =>
            resourceRef === 'unknown-access-resource'), false);
        assert.equal(request.npc.available_resources.some(
          ({ resource_ref: resourceRef }) =>
            resourceRef === 'hidden-foreign-resource'), false);
        assert.equal(request.npc.available_resources.some(
          ({ resource_ref: resourceRef }) =>
            resourceRef === 'accessible-axe-1'), true);
        assert.equal(request.npc.available_resources.some(
          ({ resource_ref: resourceRef }) =>
            resourceRef === 'remote-sealed-packet'), false);
        return autonomousPlan(request, 'wait');
      }
    }).consequence({
      retrievedState: state,
      playerInput: playerInput(state, 'persisted-projection')
    });

    const missing = committedState();
    delete missing.npcs[1].mood;
    delete missing.npcs[1].relationships;
    await commandFor({
      state: missing,
      contracts: approvedContracts(missing),
      model: async (request) => {
        assert.equal(request.npc.mood, null);
        assert.deepEqual(request.npc.relationships, []);
        assert.equal(JSON.stringify(request).includes('"tense"'), false);
        assert.equal(JSON.stringify(request).includes('"strong"'), false);
        return autonomousPlan(request, 'wait');
      }
    }).consequence({
      retrievedState: missing,
      playerInput: playerInput(missing, 'missing-subjective-state')
    });
  });
