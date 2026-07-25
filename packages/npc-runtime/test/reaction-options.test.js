import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SPATIAL_V3_NPC_REACTION_HANDLER_BINDINGS,
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import {
  decideBoundedNpcAction,
  proposeNpcReactionOptions
} from '../src/index.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const versioned = (entity_kind, entity_id) => ({
  entity_ref: ref(entity_kind, entity_id),
  authoring_version: '1'
});
const digest = (value) => computeSpatialV3CanonicalDigest(value);
const seal = (value) => ({ ...value, canonical_digest: digest(value) });
const pin = (dependency_role, reference) => ({
  dependency_role,
  entity_ref: reference.entity_ref,
  version_pin: {
    pin_kind: 'authoring_version',
    authoring_version: reference.authoring_version
  }
});
const timestamp = {
  whole_minutes: '100',
  subminute_numerator: '0',
  subminute_denominator: '1'
};

function input({
  canInvestigate = true,
  canSeekSafety = false,
  canReport = false,
  threatLevel = 'none',
  safeAnchor = false,
  authorityRecipient = false,
  perceptionResult = 'recognized'
} = {}) {
  const sourceRecordRef = versioned('source_record', 'npc-reaction-source');
  const policyRef = versioned('action_contract', 'npc-reaction-policy');
  const rules = [
    {
      option_id: 'investigate_signal',
      command_ref: versioned('decision_command', 'npc_investigate_signal'),
      consequence_policy_ref: versioned('action_contract', 'investigate-consequence'),
      allowed_perception_results: [
        'misinterpreted',
        'perceived_partial',
        'perceived_unidentified',
        'recognized'
      ],
      required_capability: 'investigate_signal',
      requires_direct_threat: false,
      requires_safe_anchor: false,
      requires_authority_recipient: false
    },
    {
      option_id: 'report_to_authority',
      command_ref: versioned('decision_command', 'npc_report_to_authority'),
      consequence_policy_ref: versioned('action_contract', 'report-consequence'),
      allowed_perception_results: ['recognized'],
      required_capability: 'report_to_authority',
      requires_direct_threat: false,
      requires_safe_anchor: false,
      requires_authority_recipient: true
    },
    {
      option_id: 'seek_safety',
      command_ref: versioned('decision_command', 'npc_seek_safety'),
      consequence_policy_ref: versioned('action_contract', 'seek-consequence'),
      allowed_perception_results: [
        'misinterpreted',
        'perceived_partial',
        'perceived_unidentified',
        'recognized'
      ],
      required_capability: 'seek_safety',
      requires_direct_threat: true,
      requires_safe_anchor: true,
      requires_authority_recipient: false
    }
  ].map(seal);
  const pins = [
    pin('profile', policyRef),
    ...rules.map((rule) => pin('action_contract', rule.command_ref)),
    ...rules.map((rule) => pin('consequence_rule', rule.consequence_policy_ref)),
    pin('source_dependency', sourceRecordRef)
  ].sort((left, right) => {
    const key = (value) => [
      value.dependency_role,
      value.entity_ref.entity_kind,
      value.entity_ref.entity_id
    ].join('\u0000');
    return key(left).localeCompare(key(right), 'en');
  });
  const dependencyPins = seal({ pins });
  const approvedCommandRecords = rules.map((rule) => {
    const binding = SPATIAL_V3_NPC_REACTION_HANDLER_BINDINGS[
      rule.command_ref.entity_ref.entity_id
    ];
    return seal({
      command_ref: rule.command_ref,
      domain: 'npc_reaction',
      handler_id: binding.handler_id,
      input_contract_name: binding.input_contract_name,
      consequence_contract_name: binding.consequence_contract_name,
      source_record_ref: sourceRecordRef,
      applicability: ['novgorod'],
      status: 'approved',
      dependency_pins: dependencyPins
    });
  });
  const policy = seal({
    policy_ref: policyRef,
    source_record_ref: sourceRecordRef,
    status: 'approved',
    bounded_decision_when_multiple: true,
    zero_options_outcome: 'npc_decision_policy_gap',
    one_option_mode: 'code_owned_without_llm',
    many_options_mode: 'bounded_selection',
    dependency_pins: dependencyPins,
    option_rules: rules,
    approved_command_records: approvedCommandRecords
  });
  const perception = seal({
    perception_id: 'perception-1',
    perceiver_ref: ref('npc', 'npc-1'),
    event_ref: ref('world_perception_signal', 'signal-1'),
    perceived_at: timestamp,
    result: perceptionResult,
    recognition_policy_ref: versioned('action_contract', 'recognition-policy'),
    visibility_policy_ref: versioned('action_contract', 'visibility-policy'),
    signal_refs: [ref('world_perception_signal', 'signal-1')],
    knowledge_update_refs: [ref('knowledge_fact', 'signal-observed')]
  });
  const expectedStateVersions = seal({
    entries: [{ entity_ref: perception.perceiver_ref, state_version: 7 }]
  });
  const contextPayload = {
    source_perception: perception,
    npc_ref: perception.perceiver_ref,
    reaction_scope_ref: ref('canonical_spatial_node', 'market'),
    npc_state_version: '7',
    can_investigate_signal: canInvestigate,
    can_seek_safety: canSeekSafety,
    can_report_to_authority: canReport,
    threat_level: threatLevel,
    expected_state_versions: expectedStateVersions,
    dependency_pins: dependencyPins
  };
  if (safeAnchor) {
    contextPayload.safe_anchor_ref = {
      endpoint_kind: 'route_anchor_scene',
      endpoint_id: 'safe-anchor'
    };
  }
  if (authorityRecipient) {
    contextPayload.authority_recipient_ref = ref('npc', 'authority-1');
  }
  return {
    context_snapshot: seal(contextPayload),
    policy_snapshot: policy
  };
}

test('reaction option producer creates one code-owned option and existing decision owner accepts it without selection service', () => {
  const result = proposeNpcReactionOptions(input());
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.decision_mode, 'code_owned_without_llm');
  assert.equal(result.decision_request.options.length, 1);
  assert.equal(result.decision_request.options[0].option_id, 'investigate_signal');
  assert.deepEqual(validateSpatialV3Contract(
    'npc_reaction_option_set_proposal',
    result.proposal
  ), []);
  const decision = decideBoundedNpcAction({
    request: result.decision_request,
    current_state_version: '7',
    observed_preconditions_digest:
      result.decision_request.options[0].preconditions_digest,
    validated_at: timestamp
  });
  assert.equal(decision.ok, true, JSON.stringify(decision));
  assert.equal(decision.trace.option_id, 'investigate_signal');
});

test('reaction option producer exposes bounded selection only for multiple applicable approved rules', () => {
  const result = proposeNpcReactionOptions(input({
    canSeekSafety: true,
    canReport: true,
    threatLevel: 'direct',
    safeAnchor: true,
    authorityRecipient: true
  }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.decision_mode, 'bounded_selection');
  assert.deepEqual(
    result.decision_request.options.map(({ option_id }) => option_id),
    ['investigate_signal', 'report_to_authority', 'seek_safety']
  );
  const selected = result.decision_request.options[2];
  const decision = decideBoundedNpcAction({
    request: result.decision_request,
    selection: {
      request_id: result.decision_request.request_id,
      state_version: result.decision_request.state_version,
      option_id: selected.option_id,
      command_token: selected.command_token
    },
    current_state_version: '7',
    observed_preconditions_digest: selected.preconditions_digest,
    validated_at: timestamp
  });
  assert.equal(decision.ok, true, JSON.stringify(decision));
  assert.equal(decision.trace.option_id, 'seek_safety');
});

test('reaction option producer fails closed for zero options and not_perceived', () => {
  const noCapability = proposeNpcReactionOptions(input({
    canInvestigate: false
  }));
  assert.equal(noCapability.ok, false);
  assert.equal(noCapability.error.code, 'npc_decision_policy_gap');

  const notPerceived = proposeNpcReactionOptions(input({
    perceptionResult: 'not_perceived'
  }));
  assert.equal(notPerceived.ok, false);
  assert.equal(notPerceived.error.code, 'npc_decision_policy_gap');
});

test('reaction option replay requires the complete unchanged causal identity', () => {
  const firstInput = input();
  const first = proposeNpcReactionOptions(firstInput);
  assert.equal(first.ok, true);
  const replay = proposeNpcReactionOptions({
    ...firstInput,
    persisted_proposal: first.proposal
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.replay_status, 'already_proposed');
  assert.deepEqual(replay.proposal, first.proposal);

  const changedInput = input({
    canSeekSafety: true,
    threatLevel: 'direct',
    safeAnchor: true
  });
  const changed = proposeNpcReactionOptions({
    ...changedInput,
    persisted_proposal: first.proposal
  });
  assert.equal(changed.ok, false);
  assert.equal(changed.error.code, 'idempotency_conflict');
  const fresh = proposeNpcReactionOptions(changedInput);
  assert.equal(fresh.ok, true);
  assert.notEqual(fresh.proposal.request_id, first.proposal.request_id);
});

test('reaction option producer never mutates sealed inputs and rejects an invalid policy projection', () => {
  const source = input();
  const before = structuredClone(source);
  const result = proposeNpcReactionOptions(source);
  assert.equal(result.ok, true);
  assert.deepEqual(source, before);
  assert.equal(Object.isFrozen(result.proposal), true);

  const invalidPolicy = {
    ...source.policy_snapshot,
    approved_command_records: []
  };
  delete invalidPolicy.canonical_digest;
  const invalid = proposeNpcReactionOptions({
    context_snapshot: source.context_snapshot,
    policy_snapshot: seal(invalidPolicy)
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'npc_decision_policy_gap');
});
