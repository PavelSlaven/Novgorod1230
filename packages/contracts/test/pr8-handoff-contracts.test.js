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

const journeyBase = {
  command_id: 'journey-command-1',
  party_id: 'party-1',
  route_plan_id: 'route-plan-1',
  route_plan_execution_id: 'route-execution-1',
  route_plan_digest: digest('c'),
  expected_state_versions: expectedStateVersions,
  dependency_pins: dependencyPins,
  idempotency_key: 'journey-idempotency-1'
};

test('PR8 additive handoff amendment is a new current contract set and preserves the accepted 4.3 snapshot', () => {
  assert.equal(SPATIAL_V3_CONTRACT_VERSION, '4.4.0-target.1');
  assert.ok(SPATIAL_V3_SUPPORTED_CONTRACT_VERSIONS.includes('4.3.0-target.1'));

  const names = contractDefinitions.map(({ contract_name }) => contract_name);
  for (const name of [
    'journey_prepared_execution_start_command',
    'journey_execution_continue_command',
    'journey_execution_cancel_command',
    'journey_successor_plan_preparation_command',
    'perception_signal_snapshot',
    'perception_propagation_edge_snapshot',
    'perception_propagation_snapshot',
    'perception_environment_snapshot',
    'perception_attention_snapshot',
    'perception_recognition_snapshot',
    'perception_policy_snapshot',
    'npc_perception_request',
    'perception_replay_evidence',
    'prepared_scene_materialization_snapshot',
    'approved_decision_command_snapshot',
    'npc_reaction_handler_input_snapshot',
    'npc_reaction_consequence_request',
    'npc_reaction_consequence_proposal',
    'npc_reaction_effect_snapshot',
    'knowledge_memory_delta_proposal',
    'knowledge_memory_merge_result'
  ]) {
    assert.equal(names.filter((candidate) => candidate === name).length, 1, name);
  }
});

test('current reaction and prepared-scene overrides bind approved commands and deferred first-entry materialization', () => {
  const commandRef = versionedRef('decision_command', 'npc_investigate_signal');
  const option = {
    option_id: 'investigate_signal',
    command_ref: commandRef,
    command_token: 'cmd.v1:request-bound',
    canonical_ordinal: 0,
    preconditions_digest: digest('8'),
    consequence_policy_ref: versionedRef('action_contract', 'investigate-signal')
  };
  assert.deepEqual(validateSpatialV3Contract('npc_decision_option', option), []);
  assert.ok(validateSpatialV3Contract('npc_decision_option', {
    ...option,
    command_ref: versionedRef('action_contract', 'npc_investigate_signal')
  }).some(({ field }) => field === 'command_ref.entity_ref.entity_kind'));
  const { command_ref: _commandRef, ...legacyShape } = option;
  assert.ok(validateSpatialV3Contract('npc_decision_option', legacyShape).length > 0);

  const prepared = {
    g4_id: 'g4-market',
    g5_site_id: 'g5-market-generated',
    g5_origin: 'generated',
    scene_baseline_id: 'baseline-market',
    g6_instance_id: 'g6-market',
    position_id: 'position-market-entry',
    scene_template_ref: versionedRef('scene_template', 'market-entry'),
    materialization_profile_ref: versionedRef('scene_materialization_profile', 'market-entry'),
    catalog_digest: digest('9'),
    materializer_version: 'v1',
    dependency_pins: dependencyPins,
    canonical_digest: digest('0')
  };
  assert.deepEqual(
    validateSpatialV3Contract('prepared_scene_materialization_snapshot', prepared),
    []
  );
  assert.deepEqual(validateSpatialV3Contract('preparation_snapshot_member', {
    preparation_snapshot_id: 'preparation-market',
    ordinal: 0,
    member_kind: 'transfer_scene',
    source_authoring_ref: versionedRef('scene_template', 'market-entry'),
    prepared_scene_materialization: prepared,
    dependency_pins: dependencyPins,
    share_mode: 'execution_exclusive',
    member_digest: digest('1')
  }), []);
  const preparedMember = {
    preparation_snapshot_id: 'preparation-market',
    ordinal: 0,
    member_kind: 'transfer_scene',
    source_authoring_ref: versionedRef('scene_template', 'market-entry'),
    dependency_pins: dependencyPins,
    share_mode: 'execution_exclusive',
    member_digest: digest('1')
  };
  assert.ok(validateSpatialV3Contract('preparation_snapshot_member', preparedMember).length > 0);
  assert.ok(validateSpatialV3Contract('preparation_snapshot_member', {
    ...preparedMember,
    resolved_scene_baseline_id: 'baseline-market',
    resolved_g6_instance_id: 'g6-market',
    resolved_position_id: 'position-market-entry',
    prepared_scene_materialization: prepared
  }).length > 0);
  assert.ok(validateSpatialV3Contract('preparation_snapshot_member', {
    ...preparedMember,
    member_kind: 'endpoint'
  }).length > 0);
  assert.ok(validateSpatialV3Contract('preparation_snapshot_member', {
    ...preparedMember,
    member_kind: 'endpoint',
    prepared_scene_materialization: prepared
  }).length > 0);
});

test('approved reaction command, code-owned consequence and knowledge merge handoffs are closed and digest-bound', () => {
  const perceivedAt = {
    whole_minutes: '120',
    subminute_numerator: '1',
    subminute_denominator: '2'
  };
  const commandRef = versionedRef('decision_command', 'npc_investigate_signal');
  const sourceRecordRef = versionedRef('source_record', 'npc-temporal-policy');
  const commandPins = {
    pins: [
      dependencyPin('action_contract', 'decision_command', 'npc_investigate_signal'),
      dependencyPin('consequence_rule', 'action_contract', 'investigate-policy'),
      dependencyPin('source_dependency', 'source_record', 'npc-temporal-policy')
    ],
    canonical_digest: digest('d')
  };
  const commandRecordInput = {
    command_ref: commandRef,
    domain: 'npc_reaction',
    handler_id: 'npc.reaction.investigate-signal.v1',
    input_contract_name: 'npc_reaction_consequence_request',
    consequence_contract_name: 'npc_reaction_effect_snapshot',
    source_record_ref: sourceRecordRef,
    applicability: ['novgorod'],
    status: 'approved',
    dependency_pins: commandPins
  };
  const commandRecord = {
    ...commandRecordInput,
    canonical_digest: computeSpatialV3CanonicalDigest(commandRecordInput)
  };
  assert.deepEqual(validateSpatialV3Contract('approved_decision_command_snapshot', commandRecord), []);
  assert.ok(validateSpatialV3Contract('approved_decision_command_snapshot', {
    ...commandRecord,
    dependency_pins: dependencyPins
  }).some(({ field }) => field === 'dependency_pins'));
  assert.ok(validateSpatialV3Contract('approved_decision_command_snapshot', {
    ...commandRecord,
    handler_id: 'unregistered.handler'
  }).some(({ field }) => field === 'handler_id'));
  assert.ok(validateSpatialV3Contract('approved_decision_command_snapshot', {
    ...commandRecord,
    canonical_digest: digest('unbound-command-record')
  }).some(({ field }) => field === 'canonical_digest'));

  const selectedOption = {
    option_id: 'investigate_signal',
    command_ref: commandRef,
    command_token: 'cmd.v1:investigate-request',
    canonical_ordinal: 0,
    preconditions_digest: digest('f'),
    consequence_policy_ref: versionedRef('action_contract', 'investigate-policy')
  };
  const decisionTraceInput = {
    request_id: 'reaction-request-1',
    state_version: '7',
    option_id: selectedOption.option_id,
    command_token: selectedOption.command_token,
    options_digest: digest('1'),
    validated_at: perceivedAt,
    status: 'validated',
    idempotency_key: 'reaction-selection-1'
  };
  const decisionTrace = {
    ...decisionTraceInput,
    trace_digest: computeSpatialV3CanonicalDigest(decisionTraceInput)
  };
  const sourcePerceptionInput = {
    perception_id: 'perception-1',
    perceiver_ref: entityRef('npc', 'npc-1'),
    event_ref: entityRef('sound_event', 'signal-1'),
    perceived_at: perceivedAt,
    result: 'recognized',
    recognition_policy_ref: versionedRef('action_contract', 'recognition-policy'),
    visibility_policy_ref: versionedRef('action_contract', 'visibility-policy'),
    signal_refs: [entityRef('sound_event', 'signal-1')],
    knowledge_update_refs: [entityRef('knowledge_fact', 'observed-signal')]
  };
  const sourcePerception = {
    ...sourcePerceptionInput,
    canonical_digest: computeSpatialV3CanonicalDigest(sourcePerceptionInput)
  };
  const handlerInputValue = {
    source_perception: sourcePerception,
    reaction_scope_ref: entityRef('canonical_spatial_node', 'market'),
    observed_preconditions_digest: selectedOption.preconditions_digest,
    dependency_pins: commandPins
  };
  const handlerInput = {
    ...handlerInputValue,
    canonical_digest: computeSpatialV3CanonicalDigest(handlerInputValue)
  };
  const reactionRequestInput = {
    request_id: 'reaction-request-1',
    npc_ref: entityRef('npc', 'npc-1'),
    selected_option: selectedOption,
    decision_trace: decisionTrace,
    command_record: commandRecord,
    consequence_input_snapshot: handlerInput,
    current_state_version: '7',
    executed_at: perceivedAt,
    dependency_pins: commandPins,
    idempotency_key: `npc-reaction:reaction-request-1:7:${decisionTrace.trace_digest}:${commandRecord.canonical_digest}`
  };
  const reactionRequest = {
    ...reactionRequestInput,
    canonical_input_digest: computeSpatialV3CanonicalDigest(reactionRequestInput)
  };
  assert.deepEqual(validateSpatialV3Contract('npc_reaction_consequence_request', reactionRequest), []);
  assert.ok(validateSpatialV3Contract('npc_reaction_consequence_request', {
    ...reactionRequest,
    current_state_version: '8'
  }).some(({ field }) => field === 'decision_trace'));
  const unpinnedReactionInput = {
    ...reactionRequestInput,
    dependency_pins: dependencyPins
  };
  assert.ok(validateSpatialV3Contract('npc_reaction_consequence_request', {
    ...unpinnedReactionInput,
    canonical_input_digest: computeSpatialV3CanonicalDigest(unpinnedReactionInput)
  }).some(({ field }) => field === 'dependency_pins'));
  const unrelatedReactionIdempotencyInput = {
    ...reactionRequestInput,
    idempotency_key: 'unrelated-handler-retry'
  };
  assert.ok(validateSpatialV3Contract('npc_reaction_consequence_request', {
    ...unrelatedReactionIdempotencyInput,
    canonical_input_digest: computeSpatialV3CanonicalDigest(unrelatedReactionIdempotencyInput)
  }).some(({ field }) => field === 'idempotency_key'));
  const tamperedTraceInput = {
    ...reactionRequestInput,
    decision_trace: {
      ...decisionTrace,
      idempotency_key: 'different-selection-retry'
    }
  };
  assert.ok(validateSpatialV3Contract('npc_reaction_consequence_request', {
    ...tamperedTraceInput,
    canonical_input_digest: computeSpatialV3CanonicalDigest(tamperedTraceInput)
  }).some(({ field }) => field === 'decision_trace.trace_digest'));
  const unsafeHandlerInput = {
    ...reactionRequestInput,
    consequence_input_snapshot: {
      ...reactionRequestInput.consequence_input_snapshot,
      state_patch: { clock: '999' },
      sql: 'UPDATE party_clocks'
    }
  };
  assert.ok(validateSpatialV3Contract('npc_reaction_consequence_request', {
    ...unsafeHandlerInput,
    canonical_input_digest: computeSpatialV3CanonicalDigest(unsafeHandlerInput)
  }).some(({ field }) => field.startsWith('consequence_input_snapshot.')));

  const effectInput = {
    effect_kind: 'investigate_signal',
    source_perception_ref: entityRef('perception_result', 'perception-1'),
    successor_command_kind: 'prepare_target',
    successor_command_payload: {
      target_ref: entityRef('canonical_spatial_node', 'market')
    },
    effective_at: perceivedAt
  };
  const effect = {
    ...effectInput,
    canonical_digest: computeSpatialV3CanonicalDigest(effectInput)
  };
  const proposalInput = {
    request_id: reactionRequest.request_id,
    npc_ref: reactionRequest.npc_ref,
    option_id: selectedOption.option_id,
    command_ref: commandRef,
    handler_id: commandRecord.handler_id,
    consequence_contract_name: commandRecord.consequence_contract_name,
    consequence_payload: effect,
    state_version: reactionRequest.current_state_version,
    proposed_at: reactionRequest.executed_at,
    dependency_pins: commandPins,
    canonical_input_digest: reactionRequest.canonical_input_digest,
    request_snapshot: reactionRequest
  };
  const proposal = {
    ...proposalInput,
    canonical_digest: computeSpatialV3CanonicalDigest(proposalInput)
  };
  assert.deepEqual(validateSpatialV3Contract('npc_reaction_consequence_proposal', proposal), []);
  assert.ok(validateSpatialV3Contract('npc_reaction_consequence_proposal', {
    ...proposal,
    consequence_payload: {
      ...effect,
      successor_command_kind: 'replan'
    }
  }).some(({ field }) => field.includes('successor_command_kind')));
  const unrelatedHandlerProposalInput = {
    ...proposalInput,
    handler_id: 'unregistered.handler'
  };
  assert.ok(validateSpatialV3Contract('npc_reaction_consequence_proposal', {
    ...unrelatedHandlerProposalInput,
    canonical_digest: computeSpatialV3CanonicalDigest(unrelatedHandlerProposalInput)
  }).some(({ field }) => field === 'handler_id'));
  for (const changed of [
    { command_ref: versionedRef('decision_command', 'npc_seek_safety') },
    { state_version: '8' },
    { dependency_pins: dependencyPins }
  ]) {
    const mismatchedProposalInput = { ...proposalInput, ...changed };
    assert.ok(validateSpatialV3Contract('npc_reaction_consequence_proposal', {
      ...mismatchedProposalInput,
      canonical_digest: computeSpatialV3CanonicalDigest(mismatchedProposalInput)
    }).some(({ field }) => field === 'handler_id'));
  }

  const knowledgeExpectedStateVersions = {
    entries: [{
      entity_ref: reactionRequest.npc_ref,
      state_version: 4
    }],
    canonical_digest: digest('6')
  };
  const deltaInput = {
    proposal_id: 'knowledge-delta-1',
    owner_ref: reactionRequest.npc_ref,
    source_kind: 'perception',
    source_ref: effect.source_perception_ref,
    source_perception: sourcePerception,
    expected_state_versions: knowledgeExpectedStateVersions,
    dependency_pins: commandPins,
    fact_refs: [entityRef('knowledge_fact', 'observed-signal')],
    hypothesis_refs: []
  };
  const delta = {
    ...deltaInput,
    canonical_digest: computeSpatialV3CanonicalDigest(deltaInput)
  };
  assert.deepEqual(validateSpatialV3Contract('knowledge_memory_delta_proposal', delta), []);
  assert.ok(validateSpatialV3Contract('knowledge_memory_delta_proposal', {
    ...delta,
    hypothesis_refs: delta.fact_refs
  }).some(({ field }) => field === 'fact_refs'));
  const uncommittedMessageDeltaInput = {
    ...deltaInput,
    source_kind: 'received_message',
    source_ref: entityRef('npc', 'npc-2')
  };
  assert.ok(validateSpatialV3Contract('knowledge_memory_delta_proposal', {
    ...uncommittedMessageDeltaInput,
    canonical_digest: computeSpatialV3CanonicalDigest(uncommittedMessageDeltaInput)
  }).some(({ field }) => field === 'source_ref'));
  const notPerceivedInput = {
    ...sourcePerceptionInput,
    result: 'not_perceived'
  };
  const notPerceived = {
    ...notPerceivedInput,
    canonical_digest: computeSpatialV3CanonicalDigest(notPerceivedInput)
  };
  const impossibleFactDeltaInput = {
    ...deltaInput,
    source_perception: notPerceived
  };
  assert.ok(validateSpatialV3Contract('knowledge_memory_delta_proposal', {
    ...impossibleFactDeltaInput,
    canonical_digest: computeSpatialV3CanonicalDigest(impossibleFactDeltaInput)
  }).some(({ field }) => field === 'fact_refs'));
  const misinterpretedPerceptionInput = {
    ...sourcePerceptionInput,
    result: 'misinterpreted'
  };
  const forgedRecognizedPerception = {
    ...misinterpretedPerceptionInput,
    result: 'recognized',
    canonical_digest: computeSpatialV3CanonicalDigest(misinterpretedPerceptionInput)
  };
  const forgedCausalDeltaInput = {
    ...deltaInput,
    source_perception: forgedRecognizedPerception
  };
  assert.ok(validateSpatialV3Contract('knowledge_memory_delta_proposal', {
    ...forgedCausalDeltaInput,
    canonical_digest: computeSpatialV3CanonicalDigest(forgedCausalDeltaInput)
  }).some(({ field }) => field === 'source_perception.canonical_digest'));

  const mergeInput = {
    proposal_id: delta.proposal_id,
    owner_ref: delta.owner_ref,
    source_ref: delta.source_ref,
    state_version_before: 4,
    state_version_after: 5,
    state_changed: true,
    dependency_pins: commandPins,
    proposal: delta,
    state_before_fact_refs: [entityRef('knowledge_fact', 'previous-signal')],
    state_before_hypothesis_refs: [],
    accepted_fact_refs: [
      ...delta.fact_refs,
      entityRef('knowledge_fact', 'previous-signal')
    ].sort((left, right) => left.entity_id.localeCompare(right.entity_id, 'en')),
    accepted_hypothesis_refs: []
  };
  const mergeResult = {
    ...mergeInput,
    result_digest: computeSpatialV3CanonicalDigest(mergeInput)
  };
  assert.deepEqual(validateSpatialV3Contract('knowledge_memory_merge_result', mergeResult), []);
  assert.ok(validateSpatialV3Contract('knowledge_memory_merge_result', {
    ...mergeResult,
    state_version_after: 4
  }).some(({ field }) => field === 'state_version_after'));
  const inventedMergeInput = {
    ...mergeInput,
    accepted_fact_refs: [
      ...mergeInput.accepted_fact_refs,
      entityRef('knowledge_fact', 'invented-by-merge')
    ].sort((left, right) => left.entity_id.localeCompare(right.entity_id, 'en'))
  };
  assert.ok(validateSpatialV3Contract('knowledge_memory_merge_result', {
    ...inventedMergeInput,
    result_digest: computeSpatialV3CanonicalDigest(inventedMergeInput)
  }).some(({ field }) => field === 'accepted_fact_refs'));
});

test('journey intent contracts are tagged, digest-bound and never accept an authoritative client clock', () => {
  const start = {
    ...journeyBase,
    intent_kind: 'start_prepared_execution'
  };
  const continuation = {
    ...journeyBase,
    command_id: 'journey-command-2',
    intent_kind: 'continue_execution',
    idempotency_key: 'journey-idempotency-2'
  };
  const cancel = {
    ...journeyBase,
    command_id: 'journey-command-3',
    intent_kind: 'cancel_execution',
    control_reason_code: 'player_cancelled',
    idempotency_key: 'journey-idempotency-3'
  };

  assert.deepEqual(validateSpatialV3Contract('journey_prepared_execution_start_command', start), []);
  assert.deepEqual(validateSpatialV3Contract('journey_execution_continue_command', continuation), []);
  assert.deepEqual(validateSpatialV3Contract('journey_execution_cancel_command', cancel), []);
  assert.ok(validateSpatialV3Contract('journey_prepared_execution_start_command', {
    ...start,
    clock_before: { whole_minutes: '10', subminute_numerator: '0', subminute_denominator: '1' }
  }).length > 0);
  assert.ok(validateSpatialV3Contract('journey_execution_cancel_command', {
    ...cancel,
    scheduled_at: { whole_minutes: '11', subminute_numerator: '0', subminute_denominator: '1' }
  }).length > 0);
});

test('successor preparation binds a new path query and predecessor handoff without mutating the active plan', () => {
  const successor = {
    command_id: 'journey-command-4',
    intent_kind: 'prepare_successor_plan',
    party_id: 'party-1',
    predecessor_route_plan_id: 'route-plan-1',
    predecessor_execution_id: 'route-execution-1',
    predecessor_handoff_endpoint_ref: {
      endpoint_kind: 'route_anchor_scene',
      endpoint_id: 'anchor-1'
    },
    predecessor_handoff_snapshot_digest: digest('d'),
    successor_path_query: {
      request_id: 'path-query-2',
      party_id: 'party-1',
      request_kind: 'ordinary',
      journey_owner_ref: entityRef('actor', 'actor-1'),
      journey_scope: 'world_travel',
      start_endpoint_ref: {
        endpoint_kind: 'route_anchor_scene',
        endpoint_id: 'anchor-1'
      },
      target_request: {
        target_kind: 'factual_spatial',
        factual_target_ref: {
          spatial_kind: 'canonical_g5',
          spatial_id: 'g5-target'
        }
      },
      knowledge_scope: 'factual',
      cost_mode: 'segmented',
      capability_context: {
        allowed_movement_methods: ['movement_method.walk'],
        available_transport_pins: [],
        equipment_state_pins: [],
        legal_access_fact_pins: [],
        allowed_pace_modes: ['pace.normal']
      },
      expected_state_versions: expectedStateVersions,
      planning_state_version: 7,
      canonical_digest: digest('e')
    },
    expected_state_versions: expectedStateVersions,
    dependency_pins: dependencyPins,
    idempotency_key: 'journey-idempotency-4'
  };

  assert.deepEqual(validateSpatialV3Contract('journey_successor_plan_preparation_command', successor), []);
  assert.ok(validateSpatialV3Contract('journey_successor_plan_preparation_command', {
    ...successor,
    active_route_plan_replacement: true
  }).length > 0);
  assert.ok(validateSpatialV3Contract('journey_successor_plan_preparation_command', {
    ...successor,
    successor_path_query: {
      ...successor.successor_path_query,
      start_endpoint_ref: {
        endpoint_kind: 'route_anchor_scene',
        endpoint_id: 'different-anchor'
      }
    }
  }).some(({ field }) => field === 'successor_path_query.start_endpoint_ref'));
  assert.ok(validateSpatialV3Contract('journey_successor_plan_preparation_command', {
    ...successor,
    successor_path_query: {
      ...successor.successor_path_query,
      party_id: 'different-party'
    }
  }).some(({ field }) => field === 'successor_path_query.party_id'));
});
