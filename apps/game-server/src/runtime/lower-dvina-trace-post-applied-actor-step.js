import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { createSpatialV3PerceptionBoundaryParticipant } from '@rus/turn';

export function createLowerDvinaTracePostAppliedActorStepOwner({
  committedState, idempotencyKey, perceptionProfile = null
} = {}) {
  const participant = createSpatialV3PerceptionBoundaryParticipant();
  return async ({ working_projection: projection, factual_events: events,
    actor_step_plan: actorStepPlan }) => {
    if (events.length === 0) return empty(projection);
    const partyId = committedState?.party_id;
    const priorTurnNumber = Number(committedState?.party_state?.turn_number);
    if (!text(partyId) || !Number.isSafeInteger(priorTurnNumber)
        || priorTurnNumber < 0 || !text(idempotencyKey)) {
      gap('TRACE_POST_ACTION_FACTUAL_EVENT_STATE_GAP');
    }
    const turnNumber = priorTurnNumber + 1;
    const changeSetId = `change:${partyId}:turn-step:${turnNumber}`;
    const proposals = events.map((event) => eventWriteProposal({ event,
      partyId, changeSetId, idempotencyKey }));
    let workingProjection = structuredClone(projection);
    const pendingNpcDecisionRefs = [];
    const listeners = perceptionListeners(
      committedState, events, perceptionProfile
    );
    for (const { event, npc, schedule, knowledge, context } of listeners) {
      const candidate = perceptionCandidate({
        event, npc, partyId, context
      });
      const work = perceptionWork({
        event, npc, schedule, knowledge, partyId, changeSetId,
        idempotencyKey, context, actorStepPlan
      });
      workingProjection = {
        ...workingProjection,
        perception_boundary_work_items: [
          ...(workingProjection.perception_boundary_work_items ?? []),
          work
        ]
      };
      const resolved = participant.resolve(candidate, {
        clock_before: event.occurred_at,
        projection: workingProjection,
        request: { party_id: partyId }
      });
      if (resolved.disposition !== 'execute') {
        gap(resolved.code ?? 'TRACE_POST_ACTION_PERCEPTION_GAP');
      }
      proposals.push(...resolved.proposals);
      if (resolved.proposals[0]?.perception_reaction_result
        ?.perception_result?.result !== 'not_perceived') {
        pendingNpcDecisionRefs.push(npc.instance_id);
      }
      workingProjection = resolved.state_projection;
    }
    const temporal = {
      version: 1, schema: 'turn_step_factual_event_persistence_result_v1',
      clock_before: structuredClone(events[0].occurred_at),
      clock_after: structuredClone(events.at(-1).occurred_at),
      temporal_status: 'completed',
      projection: structuredClone(workingProjection),
      combined_change_set: { proposals }
    };
    temporal.canonical_digest = canonicalDigest(temporal);
    return Object.freeze({ working_projection: structuredClone(workingProjection),
      write_fragments: [], consequence_fragment: perceptionProfile == null
        ? null : { visible_seed: {
          turn_step_post_applied_perception_window: {
            kind: 'post_applied_perception_window',
            status: pendingNpcDecisionRefs.length === 0
              ? 'completed' : 'pending_npc_decision',
            observable_response_event_refs: [],
            ...(pendingNpcDecisionRefs.length === 0 ? {} : {
              pending_npc_decision_refs: [...new Set(pendingNpcDecisionRefs)]
                .sort()
            })
          }
        } },
      temporal_results: [temporal] });
  };
}

function perceptionListeners(state, events, profile) {
  if (profile == null) return [];
  if (!validProfile(profile)) gap('TRACE_POST_ACTION_PERCEPTION_PROFILE_GAP');
  const schedules = state?.npc_schedule_runtime ?? [];
  const knowledgeStates = state?.post_action_knowledge_states ?? [];
  const sources = state?.post_action_perception_sources ?? [];
  return events.flatMap((event) => (state?.npcs ?? []).flatMap((npc) => {
    if (!profile.channels.includes(event.perceptible_signal.channel)) return [];
    const schedule = schedules.find(({ npc_id: id }) => id === npc.instance_id);
    const knowledge = knowledgeStates.find(
      ({ npc_id: id }) => id === npc.instance_id
    );
    const source = sources.find(({ npc_id: id }) => id === npc.instance_id);
    if (schedule?.status !== profile.required_schedule_status
        || source?.current_position_node_id == null
        || source.current_position_node_id !== event.source_scope_ref.entity_id) {
      return [];
    }
    const runtimeStatus = npc.machine_state?.runtime_status;
    if (profile.runtime_attention.unavailable_statuses
      .includes(runtimeStatus)) return [];
    const context = perceptionContext({ state, npc, source, profile });
    if (knowledge == null) gap('TRACE_POST_ACTION_KNOWLEDGE_STATE_GAP');
    return [{ event, npc, schedule, knowledge, context }];
  }));
}

function perceptionContext({ state, npc, source, profile }) {
  const runtimeStatus = npc.machine_state?.runtime_status;
  const sleeping = profile.runtime_attention.sleeping_statuses
    .includes(runtimeStatus);
  if (!sleeping && !profile.runtime_attention.awake_statuses
    .includes(runtimeStatus)) gap('TRACE_POST_ACTION_PERCEPTION_CONTEXT_GAP');
  if (!text(source.g6_instance_id)
      || !Number.isSafeInteger(source.position_state_version)
      || !Number.isSafeInteger(source.acoustic_state_version)
      || ![0, 1, 2].includes(source.ambient_noise)
      || !text(state.environment_snapshot?.environment_profile_id)
      || !source.attention_state_ref || !source.knowledge_state_ref) {
    gap('TRACE_POST_ACTION_PERCEPTION_CONTEXT_GAP');
  }
  const policy = profile.perception_policy;
  const pins = seal({ pins: [
    authoringPin('profile', policy.recognition_policy_ref),
    authoringPin('condition', policy.visibility_policy_ref),
    authoringPin('condition', policy.acoustic_policy_ref),
    authoringPin('source_dependency', policy.provenance_ref)
  ] });
  const scope = { entity_kind: 'canonical_spatial_node',
    entity_id: source.current_position_node_id };
  const version = Number(state.party_state.state_version);
  return {
    channel: 'acoustic', dependency_pins: pins,
    propagation_snapshot: seal({ source_scope_ref: scope,
      target_scope_ref: scope, edges: [] }),
    environment_snapshot: seal({
      light_state_id: profile.environment.light_state_id,
      environment_state_ref: { entity_kind: 'environment_overlay_state',
        entity_id: state.environment_snapshot?.environment_profile_id },
      environment_state_version: version,
      weather_state_ref: { entity_kind: 'weather_state',
        entity_id: `${profile.profile_id}:weather` },
      weather_state_version: profile.revision,
      weather_visibility_result:
        profile.environment.weather_visibility_result,
      weather_acoustic_loss: profile.environment.weather_acoustic_loss,
      target_acoustic_profile_ref: { entity_kind: 'g6_acoustic_profile',
        entity_id: source.g6_instance_id },
      target_acoustic_profile_state_version: source.acoustic_state_version,
      target_ambient_noise: String(source.ambient_noise),
      transient_visibility_result:
        profile.environment.transient_visibility_result,
      transient_acoustic_loss:
        profile.environment.transient_acoustic_loss,
      transient_modifier_dependency_pins: pins,
      visibility_modifiers: []
    }),
    attention_snapshot: seal({
      attention_state_ref: structuredClone(source.attention_state_ref),
      status: sleeping ? 'sleeping' : 'awake',
      attended_channels: structuredClone(sleeping
        ? profile.attention.sleeping_channels
        : profile.attention.awake_channels),
      observer_position_ref: { endpoint_kind: 'scene_position',
        endpoint_id: source.current_position_node_id },
      observer_position_state_version: source.position_state_version,
      observer_azimuth_mdeg: profile.attention.observer_azimuth_mdeg,
      observer_vertical_direction:
        profile.attention.observer_vertical_direction,
      visual_capability_level: profile.attention.visual_capability_level,
      acoustic_capability_level: profile.attention.acoustic_capability_level,
      orientation_digest: computeSpatialV3CanonicalDigest({
        azimuth: profile.attention.observer_azimuth_mdeg,
        vertical: profile.attention.observer_vertical_direction
      })
    }),
    recognition_snapshot: seal({
      recognition_state_ref: structuredClone(source.knowledge_state_ref),
      outcome: profile.recognition_outcome
    }),
    perception_profile: seal(structuredClone(policy))
  };
}

function perceptionCandidate({ event, npc, partyId, context }) {
  const versioned = context?.perception_profile?.visibility_policy_ref;
  if (!versioned?.entity_ref || !text(versioned.authoring_version)) {
    gap('TRACE_POST_ACTION_PERCEPTION_POLICY_GAP');
  }
  return {
    boundary_id: `perception:${event.event_ref.entity_id}:${npc.instance_id}`,
    boundary_kind: 'perception_follow_up',
    scheduled_at: structuredClone(event.occurred_at),
    source_ref: { entity_kind: 'source_record',
      entity_id: event.event_ref.entity_id },
    primary_subject_ref: { entity_kind: 'npc', entity_id: npc.instance_id },
    subject_refs: [], scope_ref: { entity_kind: 'party', entity_id: partyId },
    rule_ref: structuredClone(versioned),
    policy_ref: structuredClone(versioned),
    preconditions_digest: canonicalDigest(event),
    resolution_class: 'propagation_background', interrupt_effect: 'background',
    visibility_policy_ref: structuredClone(versioned),
    idempotency_key: `perception:${event.event_ref.entity_id}:${npc.instance_id}`,
    causal_parent_refs: []
  };
}

function perceptionWork({ event, npc, schedule, knowledge, partyId,
  changeSetId, idempotencyKey, context, actorStepPlan }) {
  const npcRef = { entity_kind: 'npc', entity_id: npc.instance_id };
  const targetScopeRef = structuredClone(
    context.propagation_snapshot.target_scope_ref
  );
  const dependencyPins = structuredClone(context.dependency_pins);
  const version = knowledge.exists ? knowledge.state_version : 1;
  const expected = seal({ entries: [{ entity_ref: npcRef,
    state_version: version }] });
  const channel = event.perceptible_signal.channel;
  const requestPayload = {
    perception_id: `perception:${event.event_ref.entity_id}:${npc.instance_id}`,
    perceiver_ref: npcRef,
    event_ref: { entity_kind: 'source_record',
      entity_id: event.event_ref.entity_id },
    perceived_at: structuredClone(event.occurred_at),
    target_scope_ref: targetScopeRef,
    factual_signal: seal({
      signal_ref: structuredClone(event.event_ref), channel,
      source_scope_ref: structuredClone(event.source_scope_ref),
      source_ref: structuredClone(event.source_ref),
      emission_strength: event.perceptible_signal.emission_strength,
      signal_state_version: version,
      player_visibility_class: 'visible_if_perceived'
    }),
    propagation_snapshot: structuredClone(context.propagation_snapshot),
    environment_snapshot: structuredClone(context.environment_snapshot),
    attention_snapshot: structuredClone(context.attention_snapshot),
    recognition_snapshot: structuredClone(context.recognition_snapshot),
    perception_profile: structuredClone(context.perception_profile),
    expected_state_versions: expected,
    idempotency_key:
      `${idempotencyKey}:perception:${event.event_ref.entity_id}:${npc.instance_id}`,
    known_fact_refs: structuredClone(knowledge.fact_refs),
    candidate_knowledge_fact_refs: [structuredClone(event.event_ref)],
    dependency_pins: dependencyPins
  };
  return {
    kind: 'perception_only',
    boundary_id: requestPayload.perception_id,
    cycle_input: {
      perception_request: {
        ...requestPayload,
        canonical_input_digest:
          computeSpatialV3CanonicalDigest(requestPayload)
      },
      knowledge_state_before: {
        fact_refs: structuredClone(knowledge.fact_refs),
        hypothesis_refs: structuredClone(knowledge.hypothesis_refs),
        state_version: version
      }
    },
    write_context: { party_id: partyId, change_set_id: changeSetId,
      idempotency_record_id: requestPayload.idempotency_key,
      knowledge_state_before_exists: knowledge.exists },
    decision_signal_descriptor: {
      category: channel === 'acoustic' ? 'communication' : 'environment',
      significance: 'material', scope_refs: [targetScopeRef],
      perceived_change_summary: perceivedSummary(event, actorStepPlan)
    }
  };
}

function perceivedSummary(event, plan) {
  const utterance = plan?.direct_result_kind === 'player_utterance'
    ? plan.utterance : null;
  if (event.perceptible_signal.channel === 'acoustic'
      && utterance?.speaker_ref === event.source_ref.entity_id
      && text(utterance.utterance_text)) {
    return `Игрок произнёс: ${utterance.utterance_text}`;
  }
  return event.perceptible_signal.channel === 'visual'
    ? 'Наблюдатель заметил физическое событие.'
    : 'Наблюдатель услышал акустическое событие.';
}

function seal(value) {
  return { ...value,
    canonical_digest: computeSpatialV3CanonicalDigest(value) };
}

function authoringPin(dependency_role, reference) {
  return { dependency_role,
    entity_ref: structuredClone(reference.entity_ref),
    version_pin: { pin_kind: 'authoring_version',
      authoring_version: reference.authoring_version } };
}

function validProfile(value) {
  return value?.schema
      === 'rus.lower_dvina_trace_post_action_perception_profile.v1'
    && value.profile_id === 'lower_dvina_trace_post_action_perception_v1'
    && value.revision === 1
    && value.scenario_id === 'lower_dvina_trace_v1'
    && value.scenario_definition_revision === 34
    && value.status === 'approved' && value.owner === '@rus/turn'
    && value.fallback_policy === 'forbidden'
    && value.listener_scope_relation === 'same_scene_position'
    && Array.isArray(value.channels)
    && Array.isArray(value.runtime_attention?.awake_statuses)
    && Array.isArray(value.runtime_attention?.sleeping_statuses)
    && Array.isArray(value.runtime_attention?.unavailable_statuses)
    && Array.isArray(value.attention?.awake_channels)
    && Array.isArray(value.attention?.sleeping_channels)
    && value.perception_policy?.status === 'approved';
}

function eventWriteProposal({ event, partyId, changeSetId, idempotencyKey }) {
  const id = event.event_ref.entity_id, at = event.occurred_at;
  const row = { target_schema: 'party_runtime',
    target_table: 'party_temporal_events', id, record: {
      event_id: id, party_id: partyId, event_kind: 'actor_factual_event',
      status: 'resolved', scheduled_at_whole_minutes: at.whole_minutes,
      scheduled_at_subminute_numerator: at.subminute_numerator,
      scheduled_at_subminute_denominator: at.subminute_denominator,
      rule_ref: structuredClone(event.rule_ref),
      policy_ref: structuredClone(event.policy_ref),
      preconditions_digest: canonicalDigest(event),
      idempotency_key: `${idempotencyKey}:event:${id}`,
      change_set_id: changeSetId, terminal_change_set_id: changeSetId,
      state_version: 2 } };
  return { write_set: { appends: [], inserts: [row], updates: [] },
    expected_state_versions: [],
    physical_keys: [`party_runtime.party_temporal_events:${id}`] };
}

function gap(code, details = null) {
  throw Object.assign(new Error(code), { code, details });
}
function text(value) { return typeof value === 'string' && value.length > 0; }
function empty(projection) { return Object.freeze({
  working_projection: structuredClone(projection), write_fragments: [],
  consequence_fragment: null, temporal_results: [] }); }
