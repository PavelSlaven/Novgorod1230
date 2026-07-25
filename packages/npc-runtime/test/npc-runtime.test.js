import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import {
  decideBoundedNpcAction,
  orderNpcDecisionRequests,
  proposeNpcPerception,
  proposeNpcScheduleTransition
} from '../src/index.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const vr = (entity_kind, entity_id, authoring_version = '1') => ({
  entity_ref: ref(entity_kind, entity_id),
  authoring_version
});
const at = (whole_minutes, subminute_numerator = '0', subminute_denominator = '1') => ({
  whole_minutes,
  subminute_numerator,
  subminute_denominator
});
const digest = (value) => computeSpatialV3CanonicalDigest(value);
const seal = (payload) => ({ ...payload, canonical_digest: digest(payload) });
const dependencyPin = (dependency_role, value) => ({
  dependency_role,
  entity_ref: value.entity_ref,
  version_pin: { pin_kind: 'authoring_version', authoring_version: value.authoring_version }
});
const pinSet = (...pins) => seal({ pins });

const dueAt = at('10');
const nextAt = at('20');
const npcRef = ref('npc', 'n1');
const placementRef = ref('entity_placement', 'npc-n1-market');
const bodyStateRef = ref('body_state', 'npc-n1-body');
const attentionStateRef = ref('condition_set', 'npc-n1-attention');
const knowledgeStateRef = ref('knowledge_fact', 'npc-n1-knowledge');
const relationshipStateRef = ref('condition_set', 'npc-n1-relations');
const activityExecutionRef = ref('party_timed_activity_execution', 'watch-exec');
const scheduleProfileRef = vr('activity_profile', 'guard-schedule');
const currentActivityProfileRef = vr('activity_profile', 'watch');
const nextActivityProfileRef = vr('activity_profile', 'patrol');
const scheduleProvenanceRef = vr('source_record', 'guard-schedule-source');
const scheduleBoundaryPolicyRef = vr('condition_set', 'npc-schedule-boundary');
const scheduleVisibilityPolicyRef = vr('condition_set', 'npc-schedule-visible');

const schedulePins = () => pinSet(
  dependencyPin('profile', scheduleProfileRef),
  dependencyPin('profile', currentActivityProfileRef),
  dependencyPin('profile', nextActivityProfileRef),
  dependencyPin('source_dependency', scheduleProvenanceRef),
  dependencyPin('condition_rule', scheduleBoundaryPolicyRef),
  dependencyPin('condition', scheduleVisibilityPolicyRef)
);
const npcState = (overrides = {}) => seal({
  npc_ref: npcRef,
  state_version: '7',
  schedule_profile_ref: scheduleProfileRef,
  schedule_state_id: 'watch',
  current_activity_execution_ref: activityExecutionRef,
  placement_ref: placementRef,
  attention_state_ref: attentionStateRef,
  body_state_ref: bodyStateRef,
  knowledge_state_ref: knowledgeStateRef,
  relationship_state_ref: relationshipStateRef,
  next_transition_at: dueAt,
  runtime_status: 'available',
  ...overrides
});
const scheduleProfile = (overrides = {}) => seal({
  profile_ref: scheduleProfileRef,
  status: 'approved',
  provenance_ref: scheduleProvenanceRef,
  applicability: { npc_refs: [npcRef], placement_refs: [placementRef] },
  boundary_policy_ref: scheduleBoundaryPolicyRef,
  visibility_policy_ref: scheduleVisibilityPolicyRef,
  interrupt_effect: 'notice',
  transitions: [{
    transition_id: 'change',
    from_schedule_state_id: 'watch',
    to_schedule_state_id: 'patrol',
    at: dueAt,
    activity_profile_ref: nextActivityProfileRef,
    next_boundary_at: nextAt,
    runtime_status: 'available'
  }],
  ...overrides
});
const recheckSnapshot = (overrides = {}) => seal({
  observed_state_version: '7',
  placement_ref: placementRef,
  access_ok: true,
  orders_ok: true,
  danger_ok: true,
  body_ok: true,
  activity_ok: true,
  ...overrides
});
const scheduleInput = (overrides = {}) => ({
  npc_state: npcState(),
  schedule_profile: scheduleProfile(),
  scheduled_at: dueAt,
  dependency_pins: schedulePins(),
  recheck_snapshot: recheckSnapshot(),
  ...overrides
});

test('NPC schedule emits one formal exact boundary and a sealed normalized state proposal', () => {
  const result = proposeNpcScheduleTransition(scheduleInput());
  assert.equal(result.ok, true);
  assert.deepEqual(validateSpatialV3Contract('temporal_boundary_candidate', result.proposal.boundary_candidate), []);
  assert.equal(result.proposal.expected_state_version, '7');
  assert.equal(result.proposal.next_state_version, '8');
  assert.equal(result.proposal.next_schedule_state_id, 'patrol');
  assert.deepEqual(result.proposal.next_activity_profile_ref, nextActivityProfileRef);
  assert.deepEqual(result.proposal.next_boundary_at, nextAt);
  assert.equal(result.proposal.canonical_digest, digest(Object.fromEntries(
    Object.entries(result.proposal).filter(([key]) => key !== 'canonical_digest')
  )));
  assert.equal(Object.isFrozen(result.proposal), true);
  assert.throws(() => { result.proposal.next_boundary_at.whole_minutes = '99'; }, TypeError);
});

test('NPC schedule binds profile, policies, applicability, recheck and pins and replays persisted evidence once', () => {
  const first = proposeNpcScheduleTransition(scheduleInput());
  assert.equal(first.ok, true);
  const replay = proposeNpcScheduleTransition(scheduleInput({ persisted_transition: first.transition_evidence }));
  assert.equal(replay.ok, true);
  assert.equal(replay.replay_status, 'already_committed');
  assert.deepEqual(replay.proposal, first.proposal);

  const changedProfile = scheduleProfile({ interrupt_effect: 'hard_interrupt' });
  assert.equal(proposeNpcScheduleTransition(scheduleInput({
    schedule_profile: changedProfile,
    persisted_transition: first.transition_evidence
  })).error.code, 'idempotency_conflict');
  assert.equal(proposeNpcScheduleTransition(scheduleInput({
    dependency_pins: pinSet(dependencyPin('profile', scheduleProfileRef))
  })).error.code, 'npc_schedule_gap');
  assert.equal(proposeNpcScheduleTransition(scheduleInput({
    recheck_snapshot: recheckSnapshot({ access_ok: false })
  })).error.code, 'activity_precondition_stale');
  assert.equal(proposeNpcScheduleTransition(scheduleInput({ scheduled_at: nextAt })).error.code, 'temporal_candidate_stale');
});

const sourceScopeRef = ref('canonical_spatial_node', 'market-square');
const targetScopeRef = ref('canonical_spatial_node', 'gatehouse');
const recognitionPolicyRef = vr('action_contract', 'recognition-standard');
const perceptionVisibilityPolicyRef = vr('action_contract', 'perception-visible');
const perceptionProvenanceRef = vr('source_record', 'perception-policy-source');
const perceptionPins = () => pinSet(
  dependencyPin('profile', recognitionPolicyRef),
  dependencyPin('condition', perceptionVisibilityPolicyRef),
  dependencyPin('source_dependency', perceptionProvenanceRef)
);
const perceptionProfile = (overrides = {}) => seal({
  recognition_policy_ref: recognitionPolicyRef,
  visibility_policy_ref: perceptionVisibilityPolicyRef,
  acoustic_policy_ref: null,
  provenance_ref: perceptionProvenanceRef,
  status: 'approved',
  darkness_visual_result_cap: 'perceived_partial',
  sleeping_attention_channels: ['acoustic'],
  ...overrides
});
const pathEdge = (overrides = {}) => seal({
  edge_ref: ref('acoustic_edge', 'market-gate-edge'),
  from_ref: sourceScopeRef,
  to_ref: targetScopeRef,
  permitted_channels: ['visual'],
  relation_kind: 'visibility_link',
  relation_state_version: 3,
  visibility_quality: 'clear',
  distance_band: 'short',
  ...overrides
});
const environmentSnapshot = (overrides = {}) => seal({
  light_state_id: 'bright',
  environment_state_ref: ref('environment_overlay_state', 'environment-1'),
  environment_state_version: 5,
  weather_state_ref: ref('weather_state', 'weather-1'),
  weather_state_version: 6,
  weather_visibility_result: 'clear',
  weather_acoustic_loss: '0',
  target_acoustic_profile_ref: ref('g6_acoustic_profile', 'acoustic-gatehouse'),
  target_acoustic_profile_state_version: 2,
  target_ambient_noise: '0',
  transient_visibility_result: 'clear',
  transient_acoustic_loss: '0',
  transient_modifier_dependency_pins: perceptionPins(),
  visibility_modifiers: [],
  ...overrides
});
const attentionSnapshot = (overrides = {}) => seal({
  attention_state_ref: attentionStateRef,
  status: 'awake',
  attended_channels: ['visual', 'acoustic'],
  observer_position_ref: {
    endpoint_kind: 'scene_position',
    endpoint_id: 'npc-position'
  },
  observer_position_state_version: 8,
  observer_azimuth_mdeg: 0,
  observer_vertical_direction: 'level',
  visual_capability_level: 3,
  acoustic_capability_level: 3,
  orientation_digest: digest({ azimuth: 0, vertical: 'level' }),
  ...overrides
});
const perceptionInput = (overrides = {}) => {
  const {
    persisted_perception,
    persisted_replay_evidence,
    ...requestOverrides
  } = overrides;
  const expectedStateVersions = seal({
    entries: [
      { entity_ref: attentionStateRef, state_version: 7 },
      { entity_ref: npcRef, state_version: 4 }
    ]
  });
  const payload = {
    perception_id: 'p1',
    perceiver_ref: npcRef,
    event_ref: ref('action_contract', 'event-1'),
    perceived_at: dueAt,
    target_scope_ref: targetScopeRef,
    factual_signal: seal({
      signal_ref: ref('sound_event', 'signal-1'),
      channel: 'visual',
      source_scope_ref: sourceScopeRef,
      source_ref: ref('actor', 'actor-1'),
      emission_strength: 3,
      signal_state_version: 4,
      player_visibility_class: 'visible_if_perceived'
    }),
    propagation_snapshot: seal({
      source_scope_ref: sourceScopeRef,
      target_scope_ref: targetScopeRef,
      edges: [pathEdge()]
    }),
    environment_snapshot: environmentSnapshot(),
    attention_snapshot: attentionSnapshot(),
    recognition_snapshot: seal({
      recognition_state_ref: ref('condition_set', 'recognition-current'),
      outcome: 'recognized'
    }),
    perception_profile: perceptionProfile(),
    expected_state_versions: expectedStateVersions,
    idempotency_key: 'perception-p1-v1',
    known_fact_refs: [],
    candidate_knowledge_fact_refs: [ref('knowledge_fact', 'event-1-observed')],
    dependency_pins: perceptionPins(),
    ...requestOverrides
  };
  return {
    request: {
      ...payload,
      canonical_input_digest: digest(payload)
    },
    ...(persisted_perception === undefined ? {} : { persisted_perception }),
    ...(persisted_replay_evidence === undefined ? {} : { persisted_replay_evidence })
  };
};

test('perception topology blocks visual signal at a wall and preserves acoustic signal along the same path', () => {
  const wallInput = perceptionInput({
    propagation_snapshot: seal({
      source_scope_ref: sourceScopeRef,
      target_scope_ref: targetScopeRef,
      edges: [pathEdge({
        permitted_channels: ['visual'],
        visibility_portal_result: 'blocked',
        portal_ref: ref('portal_entity', 'gate-door'),
        portal_state: 'closed'
      })]
    })
  });
  assert.deepEqual(validateSpatialV3Contract('npc_perception_request', wallInput.request), []);
  const wall = proposeNpcPerception(wallInput);
  assert.equal(wall.ok, true, JSON.stringify(wall));
  assert.equal(wall.perception.result, 'not_perceived');
  assert.deepEqual(wall.knowledge_proposal.fact_refs, []);
  assert.deepEqual(
    validateSpatialV3Contract('knowledge_memory_delta_proposal', wall.knowledge_proposal),
    []
  );
  assert.deepEqual(wall.knowledge_proposal.source_perception, wall.perception);

  const acoustic = proposeNpcPerception(perceptionInput({
    factual_signal: seal({
      signal_ref: ref('sound_event', 'signal-1'),
      channel: 'acoustic',
      source_scope_ref: sourceScopeRef,
      source_ref: ref('actor', 'actor-1'),
      emission_strength: 4,
      signal_state_version: 4,
      player_visibility_class: 'hidden_source'
    }),
    propagation_snapshot: seal({
      source_scope_ref: sourceScopeRef,
      target_scope_ref: targetScopeRef,
      edges: [pathEdge({
        permitted_channels: ['acoustic'],
        relation_kind: 'acoustic_edge',
        visibility_quality: undefined,
        distance_band: undefined,
        acoustic_base_loss: '0'
      })]
    }),
    attention_snapshot: attentionSnapshot({
      status: 'sleeping',
      attended_channels: ['acoustic']
    })
  }));
  assert.equal(acoustic.ok, true);
  assert.equal(acoustic.perception.result, 'recognized');
  assert.deepEqual(validateSpatialV3Contract('perception_result', acoustic.perception), []);
});

test('darkness caps visual recognition, sleeping attention blocks visual memory, and replay is append-only', () => {
  const dark = proposeNpcPerception(perceptionInput({
    environment_snapshot: environmentSnapshot({ light_state_id: 'dark' })
  }));
  assert.equal(dark.perception.result, 'perceived_partial');
  assert.deepEqual(dark.perception.knowledge_update_refs, [ref('knowledge_fact', 'event-1-observed')]);

  const sleeping = proposeNpcPerception(perceptionInput({
    attention_snapshot: attentionSnapshot({
      status: 'sleeping',
      attended_channels: ['visual', 'acoustic']
    })
  }));
  assert.equal(sleeping.perception.result, 'not_perceived');
  assert.deepEqual(sleeping.perception.knowledge_update_refs, []);

  const replay = proposeNpcPerception(perceptionInput({
    environment_snapshot: environmentSnapshot({ light_state_id: 'dark' }),
    persisted_perception: dark.perception,
    persisted_replay_evidence: dark.perception_evidence
  }));
  assert.deepEqual(replay.perception, dark.perception);
  assert.equal(replay.replay_status, 'already_committed');
  const conflict = proposeNpcPerception(perceptionInput({
    persisted_perception: dark.perception,
    persisted_replay_evidence: dark.perception_evidence,
    environment_snapshot: environmentSnapshot({ light_state_id: 'bright' })
  }));
  assert.equal(conflict.error.code, 'idempotency_conflict');
});

test('perception replay identity covers position and state version, not only perceiver/event', () => {
  const originalInput = perceptionInput();
  const original = proposeNpcPerception(originalInput);
  assert.equal(original.ok, true);

  const changedExpectedStateVersions = seal({
    entries: [
      { entity_ref: attentionStateRef, state_version: 8 },
      { entity_ref: npcRef, state_version: 5 }
    ]
  });
  const changedInput = perceptionInput({
    perception_id: 'p2',
    idempotency_key: 'perception-p2-v2',
    attention_snapshot: attentionSnapshot({
      observer_position_ref: {
        endpoint_kind: 'scene_position',
        endpoint_id: 'npc-position-2'
      },
      observer_position_state_version: 9
    }),
    expected_state_versions: changedExpectedStateVersions
  });
  const changed = proposeNpcPerception(changedInput);
  assert.equal(changed.ok, true, JSON.stringify(changed));
  assert.equal(changed.replay_status, 'new');
  assert.equal(changed.perception.event_ref.entity_id, original.perception.event_ref.entity_id);
  assert.equal(changed.perception.perceiver_ref.entity_id, original.perception.perceiver_ref.entity_id);
  assert.notEqual(
    changed.perception_evidence.canonical_input_digest,
    original.perception_evidence.canonical_input_digest
  );

  const invalidReplay = proposeNpcPerception({
    ...changedInput,
    persisted_perception: original.perception,
    persisted_replay_evidence: original.perception_evidence
  });
  assert.equal(invalidReplay.error.code, 'idempotency_conflict');
});

test('perception rejects a stale canonical input digest and keeps misinterpretation factual-state free', () => {
  const stale = perceptionInput();
  stale.request.attention_snapshot = attentionSnapshot({
    observer_position_ref: {
      endpoint_kind: 'scene_position',
      endpoint_id: 'forged-position'
    },
    observer_position_state_version: 10
  });
  assert.equal(proposeNpcPerception(stale).error.code, 'perception_policy_gap');

  const misinterpreted = proposeNpcPerception(perceptionInput({
    perception_id: 'p-misinterpreted',
    idempotency_key: 'perception-misinterpreted-v1',
    recognition_snapshot: seal({
      recognition_state_ref: ref('condition_set', 'recognition-current'),
      outcome: 'misinterpreted'
    })
  }));
  assert.equal(misinterpreted.ok, true, JSON.stringify(misinterpreted));
  assert.equal(misinterpreted.perception.result, 'misinterpreted');
  assert.deepEqual(misinterpreted.knowledge_proposal.fact_refs, []);
  assert.deepEqual(
    misinterpreted.knowledge_proposal.hypothesis_refs,
    [ref('knowledge_fact', 'event-1-observed')]
  );
  assert.deepEqual(
    validateSpatialV3Contract(
      'knowledge_memory_delta_proposal',
      misinterpreted.knowledge_proposal
    ),
    []
  );
  assert.equal(misinterpreted.knowledge_proposal.source_perception.result, 'misinterpreted');
});

test('perception rejects unsealed topology/policies, broken paths and resource exhaustion', () => {
  const unsealed = perceptionInput();
  unsealed.request.propagation_snapshot = {
    source_scope_ref: sourceScopeRef,
    target_scope_ref: targetScopeRef,
    edges: [pathEdge()]
  };
  assert.equal(proposeNpcPerception(unsealed).error.code, 'perception_policy_gap');
  assert.equal(proposeNpcPerception(perceptionInput({
    propagation_snapshot: seal({
      source_scope_ref: sourceScopeRef,
      target_scope_ref: targetScopeRef,
      edges: [pathEdge({
        from_ref: ref('canonical_spatial_node', 'wrong-start')
      })]
    })
  })).error.code, 'perception_policy_gap');
  assert.equal(proposeNpcPerception(perceptionInput({
    known_fact_refs: Array.from({ length: 513 }, (_, index) => ref('knowledge_fact', `fact-${index}`))
  })).error.code, 'temporal_execution_unbounded');
});

const decisionPolicyRef = vr('action_contract', 'guard-decision');
const waitPolicyRef = vr('action_contract', 'wait');
const alarmPolicyRef = vr('action_contract', 'alarm');
const decisionPins = () => pinSet(
  dependencyPin('profile', decisionPolicyRef),
  dependencyPin('action_contract', vr('decision_command', 'wait')),
  dependencyPin('action_contract', vr('decision_command', 'alarm')),
  dependencyPin('consequence_rule', waitPolicyRef),
  dependencyPin('consequence_rule', alarmPolicyRef)
);
const option = (option_id, canonical_ordinal, consequence_policy_ref = vr('action_contract', option_id)) => ({
  option_id,
  command_ref: vr('decision_command', option_id),
  command_token: `cmd-${option_id}`,
  canonical_ordinal,
  preconditions_digest: digest({ option_id, state_version: '7' }),
  consequence_policy_ref
});
const request = ({
  request_id = 'decision-1',
  npc_ref = npcRef,
  requested_at = dueAt,
  state_version = '7',
  options = [option('wait', 0, waitPolicyRef), option('alarm', 1, alarmPolicyRef)]
} = {}) => {
  const sorted = [...options].sort((left, right) => left.canonical_ordinal - right.canonical_ordinal
    || left.option_id.localeCompare(right.option_id, 'en'));
  return {
    request_id,
    npc_ref,
    requested_at,
    state_version,
    decision_policy_ref: decisionPolicyRef,
    options_digest: digest(sorted),
    dependency_pins: decisionPins(),
    options
  };
};

test('bounded NPC decision validates formal selection, rechecks state/preconditions and reuses persisted selection', () => {
  const input = request();
  assert.deepEqual(validateSpatialV3Contract('npc_decision_request', input), []);
  const selected = input.options[1];
  const first = decideBoundedNpcAction({
    request: input,
    selection: {
      request_id: input.request_id,
      state_version: input.state_version,
      option_id: selected.option_id,
      command_token: selected.command_token
    },
    current_state_version: '7',
    observed_preconditions_digest: selected.preconditions_digest,
    validated_at: dueAt
  });
  assert.equal(first.ok, true);
  assert.deepEqual(validateSpatialV3Contract('npc_decision_trace', first.trace), []);

  const retry = decideBoundedNpcAction({
    request: input,
    current_state_version: '7',
    observed_preconditions_digest: selected.preconditions_digest,
    persisted_trace: first.trace,
    validated_at: dueAt
  });
  assert.deepEqual(retry.trace, first.trace);
  assert.equal(retry.replay_status, 'already_validated');
  assert.equal(decideBoundedNpcAction({
    request: input,
    current_state_version: '8',
    observed_preconditions_digest: selected.preconditions_digest,
    persisted_trace: first.trace,
    validated_at: dueAt
  }).error.code, 'activity_precondition_stale');
  assert.equal(decideBoundedNpcAction({
    request: input,
    current_state_version: '7',
    observed_preconditions_digest: digest({ stale: true }),
    persisted_trace: first.trace,
    validated_at: dueAt
  }).error.code, 'activity_precondition_stale');
});

test('one option bypasses selection service; zero, invention, invalid token and unavailable service fail closed', () => {
  const only = option('wait', 0, waitPolicyRef);
  const one = request({ options: [only] });
  const automatic = decideBoundedNpcAction({
    request: one,
    current_state_version: '7',
    observed_preconditions_digest: only.preconditions_digest,
    validated_at: dueAt
  });
  assert.equal(automatic.ok, true);
  assert.equal(automatic.trace.option_id, 'wait');

  assert.equal(decideBoundedNpcAction({
    request: request({ options: [] }),
    current_state_version: '7',
    validated_at: dueAt
  }).error.code, 'npc_decision_policy_gap');
  assert.equal(decideBoundedNpcAction({
    request: request(),
    current_state_version: '7',
    observed_preconditions_digest: option('alarm', 1, alarmPolicyRef).preconditions_digest,
    validated_at: dueAt
  }).error.code, 'npc_decision_policy_gap');
  assert.equal(decideBoundedNpcAction({
    request: request(),
    selection: { request_id: 'wrong', state_version: '7', option_id: 'alarm', command_token: 'cmd-alarm' },
    current_state_version: '7',
    observed_preconditions_digest: option('alarm', 1, alarmPolicyRef).preconditions_digest,
    validated_at: dueAt
  }).error.code, 'npc_decision_policy_gap');
});

test('same-time NPC decisions use deterministic temporal order', () => {
  const ordered = orderNpcDecisionRequests([
    request({ request_id: 'b', npc_ref: ref('npc', 'n2') }),
    request({ request_id: 'c', npc_ref: ref('npc', 'n1') }),
    request({ request_id: 'a', npc_ref: ref('npc', 'n1') })
  ]);
  assert.deepEqual(ordered.map(({ request_id }) => request_id), ['a', 'c', 'b']);
  assert.equal(Object.isFrozen(ordered), true);
});
