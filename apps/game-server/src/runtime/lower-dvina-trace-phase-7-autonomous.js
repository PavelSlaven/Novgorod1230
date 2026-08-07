import { canonicalDigest } from '@rus/materialization';
import {
  buildNpcActionDecisionRequest,
  buildNpcDecisionSignal,
  evaluateNpcDecisionSignals
} from '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '@rus/turn';
import { validateTracePhase7Plan } from './lower-dvina-trace-phase-7-plan-validation.js';

export async function resolveTracePhase7AutonomousDecision({
  state,
  contracts,
  temporal,
  operationContract,
  npcAutonomousModel,
  revalidateStateVersion
}) {
  const npcRef = ref('npc', contracts.zhdanko.instance_id);
  const batchRef = ref('temporal_batch', batchKey(
    state.party_id, temporal.result.clock_after
  ));
  const signal = buildNpcDecisionSignal({
    occurred_at: structuredClone(temporal.result.clock_after),
    category: contracts.autonomous.signal_descriptor.category,
    significance: contracts.autonomous.signal_descriptor.significance,
    source_event_ref: ref('npc_activity_factual_transition',
      temporal.projection.waiting_transition.transition_id),
    subject_ref: npcRef,
    scope_refs: [],
    perception_required: false,
    source_perception_ref: null,
    causal_parent_refs: structuredClone(
      temporal.projection.waiting_transition.causal_parent_refs
    )
  });
  assertSignalIdentity(state, signal);
  const evaluation = evaluateNpcDecisionSignals({
    npc_ref: npcRef,
    active_mode: 'autonomous',
    current_intent: null,
    decision_capability: true,
    resolved_signals: [signal],
    consumed_signal_ids: [],
    same_time_batch_ref: batchRef,
    state_version: String(state.party_state.state_version)
  });
  const boundary = evaluation.boundary;
  if (!boundary) fail('TRACE_PHASE_7_AUTONOMOUS_BOUNDARY_MISSING');
  const request = buildRequest({
    state, contracts, boundary, signal, operationContract
  });
  const persistedTrace = (state.npc_semantic_decision_traces ?? []).find(
    ({ boundary_id: boundaryId }) => boundaryId === boundary.boundary_id
  ) ?? null;
  if (persistedTrace === null
      && (state.consumed_npc_decision_signal_ids ?? [])
        .includes(signal.signal_id)) {
    fail('TRACE_PHASE_7_CONSUMED_SIGNAL_TRACE_MISSING');
  }
  const proposal = await requestNpcSemanticDecision({
    boundary,
    request,
    semanticModel: npcAutonomousModel,
    persistedTrace,
    revalidateStateVersion,
    validatePlan: (plan, validatedRequest) =>
      validateTracePhase7Plan({
        plan,
        request: validatedRequest,
        contracts,
        operationContract
      })
  });
  const alreadyRecorded = (state.npc_decision_signals ?? []).some(
    (record) => record?.signal?.signal_id === signal.signal_id
  );
  return Object.freeze({
    signal,
    boundary,
    request,
    proposal,
    new_signal_records: alreadyRecorded ? [] : [{
      signal,
      same_time_batch_key: batchRef.entity_id
    }],
    consumed_signal_ids: proposal.status === 'planned'
      ? [...proposal.signal_ids_to_consume]
      : [],
    decision_records: proposal.status === 'planned' ? [{
      request,
      boundary,
      orderedSignals: [signal],
      proposal
    }] : []
  });
}

function buildRequest({ state, contracts, boundary, signal,
  operationContract }) {
  const policy = contracts.npcPolicy;
  const resourceRefs = contracts.autonomous.available_resource_refs;
  const routeRefs = contracts.autonomous.known_route_refs;
  const previousDecisions = (state.npc_semantic_decision_refs ?? [])
    .filter(({ npc_ref: npc }) => npc?.entity_id === contracts.zhdanko.instance_id)
    .map(({ request_id: requestId, boundary_id: boundaryId }) => ({
      request_ref: requestId,
      boundary_ref: boundaryId
    }));
  return buildNpcActionDecisionRequest({
    schema: 'npc_action_decision_request_v1',
    request_id: `npc-action-request:${boundary.boundary_id}`,
    root_turn_id:
      `turn:${state.party_id}:phase7:${state.party_state.turn_number + 1}`,
    boundary_id: boundary.boundary_id,
    committed_state_version: state.party_state.state_version,
    working_revision: state.party_state.turn_number + 1,
    decision_index: 1,
    occurred_at: structuredClone(boundary.scheduled_at),
    npc_ref: contracts.zhdanko.instance_id,
    decision_reasons: {
      significance: boundary.significance,
      categories: structuredClone(boundary.categories),
      signal_refs: structuredClone(boundary.signal_refs),
      perceived_changes: [
        'Ожидаемое возвращение Ратши не произошло к установленной границе.'
      ]
    },
    historical_context: {
      year: 1230,
      season: 'late_summer',
      region: 'Нижняя Двина, Новгородская земля',
      applicable_norms: [],
      known_local_customs: []
    },
    npc: {
      profile_level: 'key',
      identity: {
        name_or_label: 'Жданко, управляющий клетью',
        age_range: 'adult',
        origin: null
      },
      social_role: {
        role_ref: 'storehouse_controller',
        status: 'управляющий артельным имуществом',
        authority: [],
        dependencies: []
      },
      attributes: [],
      skills: [],
      body_state: {
        summary: bodySummary(contracts.zhdanko),
        conditions: structuredClone(
          contracts.zhdanko.machine_state?.body_conditions ?? []
        )
      },
      mood: { state: 'tense', intensity: 'strong' },
      temperament: [],
      values: [],
      goals: structuredClone(policy.goals),
      fears: structuredClone(policy.fears),
      obligations: structuredClone(policy.relations_and_obligations),
      relationships: [],
      current_activity: {
        activity_ref: contracts.waitActivity.profile_id,
        summary: 'Ожидание Ратши достигло границы пересмотра.',
        status: 'decision_required',
        can_continue_automatically: false
      },
      available_resources: resourceRefs.map((resourceRef) => ({
        resource_ref: resourceRef,
        access: 'known_and_subject_to_code_owned_admission'
      }))
    },
    perception: {
      visible_scene: [],
      perceived_changes: [{
        source_event_ref: signal.source_event_ref.entity_id,
        fact: 'Ожидаемое возвращение Ратши не произошло.'
      }],
      heard: [],
      felt: [],
      present_actors: [],
      visible_objects: resourceRefs.map((resourceRef) => ({ resource_ref:
        resourceRef })),
      known_routes_and_exits: routeRefs.map((routeRef) => ({
        route_ref: routeRef,
        location_ref: contracts.localTransition.location_ref,
        source_zone_refs: structuredClone(
          contracts.localTransition.source_zone_candidates
        ),
        destination_zone_ref:
          contracts.localTransition.destination_zone_ref
      })),
      uncertainties: [{ fact: 'Причина задержки Ратши неизвестна.' }]
    },
    knowledge: {
      known_facts: [{
        fact_ref: 'ratsha_expected_return_not_observed',
        source_event_ref: signal.source_event_ref.entity_id
      }],
      beliefs: [],
      hypotheses: []
    },
    memory: {
      recent_events: [],
      relevant_long_term_events: [],
      previous_decisions: previousDecisions
    },
    decision_scope: {
      mode: 'autonomous_action',
      allowed_attribute_refs: [],
      allowed_skill_refs: [],
      operation_contract: structuredClone(operationContract)
    }
  });
}

function assertSignalIdentity(state, signal) {
  const existing = (state.npc_decision_signals ?? []).find(
    (record) => record?.signal?.signal_id === signal.signal_id
  )?.signal;
  if (existing && canonicalDigest(existing) !== canonicalDigest(signal)) {
    fail('TRACE_PHASE_7_SIGNAL_IDENTITY_CONFLICT');
  }
}

function bodySummary(zhdanko) {
  const status = zhdanko.machine_state?.status;
  return typeof status === 'string' && status
    ? `Текущее состояние: ${status}.`
    : 'Способен к самостоятельному действию.';
}

function batchKey(partyId, timestamp) {
  return `temporal-batch:${partyId}:${timestamp.whole_minutes}:${
    timestamp.subminute_numerator}/${timestamp.subminute_denominator}`;
}

function ref(entityKind, entityId) {
  return { entity_kind: entityKind, entity_id: entityId };
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
