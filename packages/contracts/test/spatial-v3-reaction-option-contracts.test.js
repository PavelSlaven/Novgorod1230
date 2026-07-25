import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SPATIAL_V3_NPC_REACTION_HANDLER_BINDINGS,
  computeSpatialV3CanonicalDigest,
  deriveNpcReactionCommandToken,
  deriveNpcReactionOptionSetDigest,
  deriveNpcReactionPreconditionsDigest,
  deriveNpcReactionRequestId,
  validateSpatialV3Contract
} from '../src/spatial-v3/registry.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const versioned = (entity_kind, entity_id) => ({
  entity_ref: ref(entity_kind, entity_id),
  authoring_version: '1'
});
const pin = (dependency_role, reference) => ({
  dependency_role,
  entity_ref: reference.entity_ref,
  version_pin: {
    pin_kind: 'authoring_version',
    authoring_version: reference.authoring_version
  }
});
const seal = (value) => ({
  ...value,
  canonical_digest: computeSpatialV3CanonicalDigest(value)
});
const timestamp = {
  whole_minutes: '100',
  subminute_numerator: '0',
  subminute_denominator: '1'
};

function fixture() {
  const sourceRecordRef = versioned('source_record', 'npc-reaction-policy-source');
  const policyRef = versioned('action_contract', 'npc-reaction-signal-policy');
  const ruleInputs = [
    {
      option_id: 'investigate_signal',
      command_ref: versioned('decision_command', 'npc_investigate_signal'),
      consequence_policy_ref: versioned('action_contract', 'investigate-signal-consequence'),
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
      consequence_policy_ref: versioned('action_contract', 'report-to-authority-consequence'),
      allowed_perception_results: ['recognized'],
      required_capability: 'report_to_authority',
      requires_direct_threat: false,
      requires_safe_anchor: false,
      requires_authority_recipient: true
    },
    {
      option_id: 'seek_safety',
      command_ref: versioned('decision_command', 'npc_seek_safety'),
      consequence_policy_ref: versioned('action_contract', 'seek-safety-consequence'),
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
  ];
  const rules = ruleInputs.map(seal);
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
    result: 'recognized',
    recognition_policy_ref: versioned('action_contract', 'recognition-policy'),
    visibility_policy_ref: versioned('action_contract', 'visibility-policy'),
    signal_refs: [ref('world_perception_signal', 'signal-1')],
    knowledge_update_refs: [ref('knowledge_fact', 'signal-observed')]
  });
  const expectedStateVersions = seal({
    entries: [{ entity_ref: perception.perceiver_ref, state_version: 7 }]
  });
  const context = seal({
    source_perception: perception,
    npc_ref: perception.perceiver_ref,
    reaction_scope_ref: ref('canonical_spatial_node', 'market'),
    npc_state_version: '7',
    can_investigate_signal: true,
    can_seek_safety: false,
    can_report_to_authority: false,
    threat_level: 'none',
    expected_state_versions: expectedStateVersions,
    dependency_pins: dependencyPins
  });
  const requestId = deriveNpcReactionRequestId({
    context_snapshot: context,
    policy_snapshot: policy
  });
  const option = {
    option_id: rules[0].option_id,
    command_ref: rules[0].command_ref,
    canonical_ordinal: 0,
    preconditions_digest: deriveNpcReactionPreconditionsDigest({
      context_snapshot: context,
      policy_snapshot: policy,
      rule: rules[0]
    }),
    consequence_policy_ref: rules[0].consequence_policy_ref
  };
  option.command_token = deriveNpcReactionCommandToken({
    request_id: requestId,
    npc_ref: context.npc_ref,
    option,
    decision_policy_ref: policy.policy_ref,
    state_version: context.npc_state_version,
    option_set_digest: deriveNpcReactionOptionSetDigest([option])
  });
  const request = {
    request_id: requestId,
    npc_ref: context.npc_ref,
    requested_at: timestamp,
    state_version: context.npc_state_version,
    decision_policy_ref: policy.policy_ref,
    options_digest: computeSpatialV3CanonicalDigest([option]),
    dependency_pins: dependencyPins,
    options: [option]
  };
  const proposal = seal({
    request_id: request.request_id,
    source_perception_ref: ref('perception_result', perception.perception_id),
    state_version: context.npc_state_version,
    options_digest: request.options_digest,
    context_snapshot: context,
    policy_snapshot: policy,
    decision_request: request
  });
  return { rules, policy, context, request, proposal };
}

test('reaction option contracts accept one exact source-backed applicable option', () => {
  const { rules, policy, context, proposal } = fixture();
  for (const rule of rules) {
    assert.deepEqual(validateSpatialV3Contract(
      'npc_reaction_option_rule_snapshot',
      rule
    ), []);
  }
  assert.deepEqual(validateSpatialV3Contract(
    'npc_reaction_policy_snapshot',
    policy
  ), []);
  assert.deepEqual(validateSpatialV3Contract(
    'npc_reaction_option_context_snapshot',
    context
  ), []);
  assert.deepEqual(validateSpatialV3Contract(
    'npc_reaction_option_set_proposal',
    proposal
  ), []);
});

test('reaction option contracts reject forbidden perception, duplicate policy and empty causal result', () => {
  const { rules, policy, context, proposal } = fixture();
  const forbiddenRuleInput = {
    ...rules[0],
    allowed_perception_results: ['not_perceived']
  };
  delete forbiddenRuleInput.canonical_digest;
  const forbiddenRule = seal(forbiddenRuleInput);
  assert.ok(validateSpatialV3Contract(
    'npc_reaction_option_rule_snapshot',
    forbiddenRule
  ).some(({ code }) => code === 'perception_policy_gap'));

  const duplicatePolicyInput = {
    ...policy,
    option_rules: [rules[0], rules[0]]
  };
  delete duplicatePolicyInput.canonical_digest;
  const duplicatePolicy = seal(duplicatePolicyInput);
  assert.ok(validateSpatialV3Contract(
    'npc_reaction_policy_snapshot',
    duplicatePolicy
  ).some(({ code }) => code === 'npc_decision_policy_gap'));

  const changedContextInput = {
    ...context,
    can_investigate_signal: false
  };
  delete changedContextInput.canonical_digest;
  const changedContext = seal(changedContextInput);
  const emptyProposalInput = {
    ...proposal,
    context_snapshot: changedContext
  };
  delete emptyProposalInput.canonical_digest;
  const emptyProposal = seal(emptyProposalInput);
  assert.ok(validateSpatialV3Contract(
    'npc_reaction_option_set_proposal',
    emptyProposal
  ).some(({ code }) => code === 'npc_decision_policy_gap'));
});

test('reaction option proposal rejects stale state and option set replay under changed input', () => {
  const { context, proposal } = fixture();
  const staleContextInput = {
    ...context,
    npc_state_version: '8'
  };
  delete staleContextInput.canonical_digest;
  const staleContext = seal(staleContextInput);
  assert.ok(validateSpatialV3Contract(
    'npc_reaction_option_context_snapshot',
    staleContext
  ).some(({ code }) => code === 'activity_precondition_stale'));

  const staleProposalInput = {
    ...proposal,
    context_snapshot: staleContext
  };
  delete staleProposalInput.canonical_digest;
  const staleProposal = seal(staleProposalInput);
  assert.ok(validateSpatialV3Contract(
    'npc_reaction_option_set_proposal',
    staleProposal
  ).some(({ code }) => code === 'npc_decision_policy_gap'));
});

test('reaction option contracts reject causal outcome, command registry and token derivation bypasses', () => {
  const { rules, policy, context, proposal } = fixture();

  const tamperedPerception = {
    ...context.source_perception,
    result: 'not_perceived'
  };
  const tamperedContextInput = {
    ...context,
    source_perception: tamperedPerception
  };
  delete tamperedContextInput.canonical_digest;
  const tamperedContext = seal(tamperedContextInput);
  const tamperedProposalInput = {
    ...proposal,
    context_snapshot: tamperedContext
  };
  delete tamperedProposalInput.canonical_digest;
  const tamperedProposal = seal(tamperedProposalInput);
  assert.ok(validateSpatialV3Contract(
    'npc_reaction_option_set_proposal',
    tamperedProposal
  ).some(({ field }) => field.includes('source_perception.canonical_digest')));

  const unknownRuleInput = {
    ...rules[0],
    command_ref: versioned('decision_command', 'npc_invented_command')
  };
  delete unknownRuleInput.canonical_digest;
  const unknownRule = seal(unknownRuleInput);
  assert.ok(validateSpatialV3Contract(
    'npc_reaction_option_rule_snapshot',
    unknownRule
  ).some(({ code }) => code === 'npc_decision_policy_gap'));

  const arbitraryRequest = {
    ...proposal.decision_request,
    options: proposal.decision_request.options.map((option) => ({
      ...option,
      command_token: 'cmd.v1:arbitrary',
      preconditions_digest: computeSpatialV3CanonicalDigest({ arbitrary: true })
    }))
  };
  arbitraryRequest.options_digest =
    computeSpatialV3CanonicalDigest(arbitraryRequest.options);
  const arbitraryProposalInput = {
    ...proposal,
    options_digest: arbitraryRequest.options_digest,
    decision_request: arbitraryRequest
  };
  delete arbitraryProposalInput.canonical_digest;
  const arbitraryProposal = seal(arbitraryProposalInput);
  assert.ok(validateSpatialV3Contract(
    'npc_reaction_option_set_proposal',
    arbitraryProposal
  ).some(({ code }) => code === 'npc_decision_policy_gap'));

  const missingRecordPolicyInput = {
    ...policy,
    approved_command_records: policy.approved_command_records.slice(1)
  };
  delete missingRecordPolicyInput.canonical_digest;
  const missingRecordPolicy = seal(missingRecordPolicyInput);
  assert.ok(validateSpatialV3Contract(
    'npc_reaction_policy_snapshot',
    missingRecordPolicy
  ).some(({ code }) => code === 'npc_decision_policy_gap'));
});
