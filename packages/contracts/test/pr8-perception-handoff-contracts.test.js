import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SPATIAL_V3_CONTRACT_VERSION,
  SPATIAL_V3_SUPPORTED_CONTRACT_VERSIONS,
  computeSpatialV3CanonicalDigest,
  contractDefinitions,
  validateSpatialV3Contract
} from '../src/spatial-v3/registry.js';

const digest = (value) => value.repeat(64);
const entityRef = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const versionedRef = (entity_kind, entity_id) => ({
  entity_ref: entityRef(entity_kind, entity_id),
  authoring_version: 'v1'
});
const dependencyPin = (dependency_role, entity_kind, entity_id) => ({
  dependency_role,
  entity_ref: entityRef(entity_kind, entity_id),
  version_pin: { pin_kind: 'authoring_version', authoring_version: 'v1' }
});
const dependencyPins = {
  pins: [
    dependencyPin('profile', 'action_contract', 'perception-profile'),
    dependencyPin('condition', 'action_contract', 'visibility-policy'),
    dependencyPin('source_dependency', 'source_record', 'perception-source')
  ],
  canonical_digest: digest('a')
};
const expectedStateVersions = {
  entries: [
    {
      entity_ref: entityRef('party', 'party-1'),
      state_version: 7
    }
  ],
  canonical_digest: digest('b')
};

const perceptionRequestInput = {
  perception_id: 'perception-1',
  perceiver_ref: entityRef('npc', 'npc-1'),
  event_ref: entityRef('sound_event', 'signal-event-1'),
  perceived_at: {
    whole_minutes: '120',
    subminute_numerator: '1',
    subminute_denominator: '2'
  },
  target_scope_ref: entityRef('canonical_spatial_node', 'gatehouse'),
  factual_signal: {
    signal_ref: entityRef('sound_event', 'signal-1'),
    channel: 'acoustic',
    source_scope_ref: entityRef('canonical_spatial_node', 'market'),
    source_ref: entityRef('actor', 'actor-1'),
    emission_strength: 4,
    signal_state_version: 3,
    player_visibility_class: 'hidden_source',
    canonical_digest: digest('f')
  },
  propagation_snapshot: {
    source_scope_ref: entityRef('canonical_spatial_node', 'market'),
    target_scope_ref: entityRef('canonical_spatial_node', 'gatehouse'),
    edges: [{
      edge_ref: entityRef('acoustic_edge', 'market-gate'),
      from_ref: entityRef('canonical_spatial_node', 'market'),
      to_ref: entityRef('canonical_spatial_node', 'gatehouse'),
      permitted_channels: ['acoustic'],
      relation_kind: 'acoustic_edge',
      relation_state_version: 2,
      acoustic_base_loss: 1,
      portal_ref: entityRef('portal_access_state', 'market-gate-door'),
      portal_state: 'open',
      acoustic_portal_extra_loss: 0,
      condition_profile_ref: versionedRef('action_contract', 'market-gate-acoustic-condition'),
      resolved_condition_acoustic_loss: 0,
      canonical_digest: digest('1')
    }],
    canonical_digest: digest('2')
  },
  environment_snapshot: {
    light_state_id: 'dim',
    environment_state_ref: entityRef('environment_overlay_state', 'environment-1'),
    environment_state_version: 4,
    weather_state_ref: entityRef('weather_state', 'weather-1'),
    weather_state_version: 5,
    weather_visibility_result: 'clear',
    weather_acoustic_loss: 0,
    target_acoustic_profile_ref: entityRef('g6_acoustic_profile', 'gatehouse'),
    target_acoustic_profile_state_version: 6,
    target_ambient_noise: 1,
    transient_visibility_result: 'clear',
    transient_acoustic_loss: 0,
    transient_modifier_dependency_pins: dependencyPins,
    visibility_modifiers: [],
    canonical_digest: digest('3')
  },
  attention_snapshot: {
    attention_state_ref: entityRef('body_state', 'npc-1-attention'),
    status: 'awake',
    attended_channels: ['acoustic'],
    observer_position_ref: {
      endpoint_kind: 'scene_position',
      endpoint_id: 'gatehouse-position'
    },
    observer_position_state_version: 9,
    observer_azimuth_mdeg: 0,
    observer_vertical_direction: 'level',
    visual_capability_level: 2,
    acoustic_capability_level: 3,
    orientation_digest: digest('4'),
    canonical_digest: digest('5')
  },
  recognition_snapshot: {
    recognition_state_ref: entityRef('condition_set', 'recognition-current'),
    outcome: 'recognized',
    canonical_digest: digest('6')
  },
  perception_profile: {
    recognition_policy_ref: versionedRef('action_contract', 'recognition-policy'),
    visibility_policy_ref: versionedRef('action_contract', 'visibility-policy'),
    acoustic_policy_ref: versionedRef('action_contract', 'acoustic-policy'),
    provenance_ref: versionedRef('source_record', 'perception-source'),
    status: 'approved',
    darkness_visual_result_cap: 'perceived_partial',
    sleeping_attention_channels: ['acoustic'],
    canonical_digest: digest('7')
  },
  expected_state_versions: expectedStateVersions,
  dependency_pins: dependencyPins,
  idempotency_key: 'perception-idempotency-1',
  known_fact_refs: [],
  candidate_knowledge_fact_refs: [entityRef('knowledge_fact', 'signal-observed')]
};
const perceptionRequest = {
  ...perceptionRequestInput,
  canonical_input_digest: computeSpatialV3CanonicalDigest(perceptionRequestInput)
};

test('public perception handoff seals every causal input and excludes direct knowledge mutation', () => {
  assert.deepEqual(validateSpatialV3Contract('npc_perception_request', perceptionRequest), []);
  assert.ok(validateSpatialV3Contract('npc_perception_request', {
    ...perceptionRequest,
    knowledge_update_refs: [entityRef('knowledge_fact', 'forbidden-direct-update')]
  }).length > 0);

  const changedPosition = structuredClone(perceptionRequest);
  changedPosition.attention_snapshot.observer_position_state_version = 10;
  assert.ok(validateSpatialV3Contract('npc_perception_request', changedPosition)
    .some(({ field }) => field === 'canonical_input_digest'));
  const { canonical_input_digest: _staleDigest, ...changedPositionInput } = changedPosition;
  changedPosition.canonical_input_digest = computeSpatialV3CanonicalDigest(changedPositionInput);
  assert.deepEqual(validateSpatialV3Contract('npc_perception_request', changedPosition), []);

  const disconnectedPath = structuredClone(perceptionRequest);
  disconnectedPath.propagation_snapshot.edges[0].from_ref = entityRef('canonical_spatial_node', 'elsewhere');
  const { canonical_input_digest: _oldDigest, ...disconnectedInput } = disconnectedPath;
  disconnectedPath.canonical_input_digest = computeSpatialV3CanonicalDigest(disconnectedInput);
  assert.ok(validateSpatialV3Contract('npc_perception_request', disconnectedPath)
    .some(({ field }) => field === 'propagation_snapshot.edges'));
});

test('perception propagation exposes the closed Spatial visibility branch', () => {
  const visualEdge = {
    edge_ref: entityRef('visibility_link', 'gatehouse-yard'),
    from_ref: entityRef('canonical_spatial_node', 'gatehouse'),
    to_ref: entityRef('canonical_spatial_node', 'yard'),
    permitted_channels: ['visual'],
    relation_kind: 'visibility_link',
    relation_state_version: 4,
    visibility_quality: 'partial',
    distance_band: 'short',
    portal_ref: entityRef('portal_access_state', 'gatehouse-door'),
    portal_state: 'open',
    visibility_portal_result: 'clear',
    condition_profile_ref: versionedRef('action_contract', 'gatehouse-visibility-condition'),
    resolved_condition_visibility: 'partial',
    canonical_digest: digest('c')
  };

  assert.deepEqual(validateSpatialV3Contract('perception_propagation_edge_snapshot', visualEdge), []);
  const { distance_band: _missingDistance, ...incompleteVisualEdge } = visualEdge;
  assert.ok(validateSpatialV3Contract('perception_propagation_edge_snapshot', incompleteVisualEdge)
    .some(({ field }) => field === 'permitted_channels'));
});

test('perception propagation rejects cycles and incomplete acoustic portal or condition state', () => {
  const acousticEdge = perceptionRequest.propagation_snapshot.edges[0];
  const { portal_state: _missingPortalState, ...incompletePortal } = acousticEdge;
  assert.ok(validateSpatialV3Contract('perception_propagation_edge_snapshot', incompletePortal)
    .some(({ field }) => field === 'portal_ref'));

  const { condition_profile_ref: _missingConditionProfile, ...incompleteCondition } = acousticEdge;
  assert.ok(validateSpatialV3Contract('perception_propagation_edge_snapshot', incompleteCondition)
    .some(({ field }) => field === 'condition_profile_ref'));

  const cyclicPath = {
    source_scope_ref: acousticEdge.from_ref,
    target_scope_ref: acousticEdge.from_ref,
    edges: [
      acousticEdge,
      {
        ...acousticEdge,
        edge_ref: entityRef('acoustic_edge', 'gate-market'),
        from_ref: acousticEdge.to_ref,
        to_ref: acousticEdge.from_ref,
        canonical_digest: digest('d')
      }
    ],
    canonical_digest: digest('e')
  };
  assert.ok(validateSpatialV3Contract('perception_propagation_snapshot', cyclicPath)
    .some(({ field }) => field === 'edges'));
});

test('perception replay evidence binds full input, pins, versions, policy and idempotency identity', () => {
  const evidence = {
    perception_id: 'perception-1',
    canonical_input_digest: perceptionRequest.canonical_input_digest,
    perception_digest: digest('a'),
    expected_state_versions_digest: expectedStateVersions.canonical_digest,
    dependency_pins_digest: dependencyPins.canonical_digest,
    policy_versions_digest: perceptionRequest.perception_profile.canonical_digest,
    idempotency_key: perceptionRequest.idempotency_key,
    canonical_digest: digest('b')
  };
  assert.deepEqual(validateSpatialV3Contract('perception_replay_evidence', evidence), []);
  assert.ok(validateSpatialV3Contract('perception_replay_evidence', {
    ...evidence,
    causal_parent_ref: entityRef('sound_event', 'invented-causal-parent')
  }).length > 0);
});
