import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';

const rational = (numerator, denominator = '1') => ({
  numerator: String(numerator), denominator: String(denominator)
});
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const versioned = (entity_kind, entity_id) => ({
  entity_ref: ref(entity_kind, entity_id), authoring_version: 'v1'
});
const seal = (payload) => ({
  ...payload,
  canonical_digest: computeSpatialV3CanonicalDigest(payload)
});
const policyRef = (id) => versioned('activity_contract', id);

export function phase5ActivitySnapshot(contracts, firstBoundary) {
  return seal({
    activity_profile_ref: seal({
      profile_ref: versioned('activity_profile', contracts.ids.activity)
    }),
    completion_model_snapshot: seal({
      kind: 'progress_target',
      progress_target_ref: versioned('activity_contract',
        'trace_ld_v1_treatment_progress_25m'),
      next_recheck_at: firstBoundary
    }),
    progress_policy_ref: policyRef('committed_treatment_stages'),
    resource_policy_ref: policyRef('reserve_then_consume_at_terminal_boundary'),
    participant_policy_ref: policyRef('required_treatment_participants'),
    continuation_policy_ref: policyRef('resume_preserved_progress'),
    interruption_policy_ref: policyRef('split_before_earliest_boundary'),
    completion_policy_ref: policyRef('check_and_body_proposal_committed'),
    same_timestamp_policy_ref: policyRef('temporal_owner_order'),
    body_intensity_profile_ref: versioned('hazard_profile',
      contracts.ids.bodyEffect),
    perception_visibility_policy_ref: versioned('visibility_modifier',
      'trace_ld_v1_treatment_visibility'),
    recheck_policy_ref: versioned('dynamic_recheck_policy',
      'trace_ld_v1_treatment_recheck'),
    dependency_pins: phase5DependencyPins(contracts)
  });
}

export function phase5Progress(current) {
  return seal({
    unit_id: 'exact_minute',
    current: rational(current),
    required: rational(25)
  });
}

export function phase5ParticipantBindings(state, contracts) {
  return [
    [state.actor_id, 'player_clerk'],
    [contracts.actors.onisim_boatman.instance_id, 'onisim_boatman'],
    [contracts.actors.eremey_fisher.instance_id, 'eremey_fisher'],
    [contracts.actors.participating_fisher.instance_id,
      contracts.actors.participating_fisher.participant_slot_ref]
  ].map(([id, role]) => ({
    participant_ref: ref(role === 'player_clerk' ? 'player_character' : 'npc',
      id),
    role_id: role,
    attendance_started_at: state.clock,
    contribution_policy_ref: policyRef('required_treatment_participant'),
    state_version: '1'
  }));
}

export function phase5ResourceBindings(state, contracts) {
  return contracts.activity.resource_bindings.map((binding) => {
    const matches = (state.items ?? []).filter(
      ({ template_id: id }) => id === binding.resource_ref
    );
    if (matches.length !== 1) {
      const error = new Error('TRACE_PHASE_5_RESOURCE_INSTANCE_MISSING');
      error.code = 'TRACE_PHASE_5_RESOURCE_INSTANCE_MISSING';
      error.details = { item_template_ref: binding.resource_ref };
      throw error;
    }
    return {
      resource_ref: ref('item', matches[0].item_id),
      unit_id: 'item_instance',
      quantity: rational(1),
      binding_kind: phase5ActivityOwnerBindingKind(binding.binding_kind),
      consumption_policy_ref: policyRef(binding.consumption_policy_ref),
      state_version: '1'
    };
  });
}

export function phase5BoundaryResolution({ candidate, contracts, outcome,
  progressAfter, nextBoundaryAt, final, state }) {
  const resources = phase5ResourceBindings(state, contracts);
  const progressBefore = Number(
    state.phase5_treatment?.activity_execution?.progress?.current?.numerator ?? 0
  );
  const progressAfterMinutes = Number(progressAfter.current.numerator);
  const waterId = itemId(state, contracts.ids.water);
  const terminalIds = new Set([
    itemId(state, contracts.ids.bandage),
    itemId(state, contracts.ids.net),
    itemId(state, contracts.ids.poles)
  ]);
  const waterCrossed = progressBefore < 5 && progressAfterMinutes >= 5;
  const base = {
    boundary_id: candidate.boundary_id,
    scheduled_at: candidate.scheduled_at,
    preconditions_digest: candidate.preconditions_digest,
    outcome,
    reason_code: final ? 'treatment_completed'
      : outcome === 'paused' ? 'external_temporal_boundary'
        : 'treatment_stage_completed',
    dependency_pins: phase5DependencyPins(contracts),
    progress_after: progressAfter,
    participant_attendance: phase5ParticipantBindings(state, contracts),
    resource_reservations: final ? [] : resources.filter(
      ({ resource_ref: value }) => value.entity_id !== waterId
        || progressAfterMinutes < 5
    ),
    resource_consumptions: resources.filter(({ resource_ref: value }) =>
      (waterCrossed && value.entity_id === waterId)
        || (final && terminalIds.has(value.entity_id))
    ),
    body_effect_refs: final
      ? [ref('body_effect', contracts.ids.bodyEffect)] : []
  };
  if (nextBoundaryAt) base.next_boundary_at = nextBoundaryAt;
  return seal(base);
}

export function phase5ActivityOwnerBindingKind(bindingKind) {
  if (bindingKind === 'consumable_input'
      || bindingKind === 'single_use_support') {
    return 'consumable_input';
  }
  if (bindingKind === 'reusable_support') return 'reserved_input';
  const error = new Error('TRACE_PHASE_5_RESOURCE_BINDING_KIND_INVALID');
  error.code = 'TRACE_PHASE_5_RESOURCE_BINDING_KIND_INVALID';
  throw error;
}

function itemId(state, templateId) {
  const matches = (state.items ?? []).filter(
    ({ template_id: id }) => id === templateId
  );
  if (matches.length !== 1) {
    throw Object.assign(new Error('TRACE_PHASE_5_RESOURCE_INSTANCE_MISSING'), {
      code: 'TRACE_PHASE_5_RESOURCE_INSTANCE_MISSING',
      details: { item_template_ref: templateId }
    });
  }
  return matches[0].item_id;
}

export function phase5ActivityBoundary({ execution, scheduledAt, ordinal,
  partyId, externalCandidates = [] }) {
  return {
    boundary_id: `${execution.id}:boundary:${ordinal}`,
    boundary_kind: 'activity',
    scheduled_at: scheduledAt,
    source_ref: ref('party_timed_activity_execution', execution.id),
    primary_subject_ref: ref('party_timed_activity_execution', execution.id),
    scope_ref: ref('party', partyId),
    rule_ref: policyRef('treatment-stage-boundary'),
    policy_ref: policyRef('split-before-earliest-boundary'),
    preconditions_digest: execution.preconditions_digest,
    resolution_class: 'execution_outcome',
    interrupt_effect: 'background',
    visibility_policy_ref: versioned('visibility_modifier',
      'trace_ld_v1_treatment_visibility'),
    idempotency_key: `${execution.id}:boundary:${ordinal}`,
    subject_refs: [],
    causal_parent_refs: externalCandidates.map(({ boundary_id: id }) => ({
      entity_kind: 'temporal_boundary_candidate', entity_id: id
    }))
  };
}

export function phase5InterruptionOutcome({ execution, candidate, contracts,
  elapsed }) {
  return {
    interruption_level: 'background',
    outcome_kind: 'pause',
    execution_ref: ref('party_timed_activity_execution', execution.id),
    boundary_ref: ref('temporal_boundary_candidate', candidate.boundary_id),
    elapsed: { exact_minutes: rational(elapsed) },
    reason_code: 'external_temporal_boundary',
    progress_preservation_policy_ref: policyRef('preserve-progress'),
    resource_preservation_policy_ref: policyRef('preserve-resources'),
    player_decision_required: false,
    dependency_pins: phase5DependencyPins(contracts)
  };
}

export function phase5DependencyPins(contracts) {
  return seal({
    pins: contracts.activityPins.map((pin) => ({
      dependency_role: 'activity_contract',
      entity_ref: ref(pin.entity_kind, pin.id),
      version_pin: {
        pin_kind: 'authoring_version',
        authoring_version: `v${pin.version ?? 1}`
      }
    }))
  });
}
