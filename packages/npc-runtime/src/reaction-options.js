import {
  deriveNpcReactionCommandToken,
  deriveNpcReactionOptionSetDigest,
  deriveNpcReactionPreconditionsDigest,
  deriveNpcReactionRequestId
} from '@rus/contracts/spatial-v3/registry';
import {
  blocked,
  digest,
  formal,
  freeze,
  success
} from './internal.js';

const capabilityField = Object.freeze({
  investigate_signal: 'can_investigate_signal',
  seek_safety: 'can_seek_safety',
  report_to_authority: 'can_report_to_authority'
});

function applicable(rule, context) {
  return rule.allowed_perception_results.includes(context.source_perception.result)
    && context[capabilityField[rule.required_capability]] === true
    && (!rule.requires_direct_threat || context.threat_level === 'direct')
    && (!rule.requires_safe_anchor || context.safe_anchor_ref !== undefined)
    && (!rule.requires_authority_recipient
      || context.authority_recipient_ref !== undefined);
}

function pinKey(pin) {
  return [
    pin.dependency_role,
    pin.entity_ref.entity_kind,
    pin.entity_ref.entity_id,
    pin.version_pin.pin_kind,
    pin.version_pin.authoring_version ?? pin.version_pin.state_version
  ].join('\u0000');
}

function mergePins(...pinSets) {
  const byKey = new Map();
  for (const pinSet of pinSets) {
    for (const pin of pinSet.pins) byKey.set(pinKey(pin), pin);
  }
  const pins = [...byKey.values()].sort((left, right) =>
    pinKey(left).localeCompare(pinKey(right), 'en'));
  return freeze({ pins, canonical_digest: digest({ pins }) });
}

function sameProposal(left, right) {
  return left?.canonical_digest === right?.canonical_digest
    && left?.request_id === right?.request_id
    && left?.state_version === right?.state_version
    && left?.options_digest === right?.options_digest;
}

export function proposeNpcReactionOptions({
  context_snapshot,
  policy_snapshot,
  persisted_proposal = null
} = {}, { maxDecisionOptions }) {
  if (!formal('npc_reaction_option_context_snapshot', context_snapshot)
    || !formal('npc_reaction_policy_snapshot', policy_snapshot)) {
    return blocked(
      'npc_decision_policy_gap',
      'Reaction option production requires one formal sealed context and approved policy',
      context_snapshot?.npc_ref,
      context_snapshot?.dependency_pins
    );
  }

  const rules = policy_snapshot.option_rules.filter((rule) =>
    applicable(rule, context_snapshot));
  if (rules.length === 0) {
    return blocked(
      'npc_decision_policy_gap',
      'No approved reaction option is applicable to the sealed context',
      context_snapshot.npc_ref,
      context_snapshot.dependency_pins
    );
  }
  if (rules.length > maxDecisionOptions) {
    return blocked(
      'temporal_execution_unbounded',
      'Applicable reaction option set exceeds the formal resource cap',
      context_snapshot.npc_ref,
      context_snapshot.dependency_pins
    );
  }

  const requestId = deriveNpcReactionRequestId({
    context_snapshot,
    policy_snapshot
  });
  const optionDescriptors = rules.map((rule, canonical_ordinal) => ({
    option_id: rule.option_id,
    command_ref: rule.command_ref,
    canonical_ordinal,
    preconditions_digest: deriveNpcReactionPreconditionsDigest({
      context_snapshot,
      policy_snapshot,
      rule
    }),
    consequence_policy_ref: rule.consequence_policy_ref
  }));
  const optionSetDigest = deriveNpcReactionOptionSetDigest(optionDescriptors);
  const options = optionDescriptors.map((option) => ({
    ...option,
    command_token: deriveNpcReactionCommandToken({
      request_id: requestId,
      npc_ref: context_snapshot.npc_ref,
      option,
      decision_policy_ref: policy_snapshot.policy_ref,
      state_version: context_snapshot.npc_state_version,
      option_set_digest: optionSetDigest
    })
  }));
  const dependencyPins = mergePins(
    context_snapshot.dependency_pins,
    policy_snapshot.dependency_pins
  );
  const decisionRequest = freeze({
    request_id: requestId,
    npc_ref: context_snapshot.npc_ref,
    requested_at: context_snapshot.source_perception.perceived_at,
    state_version: context_snapshot.npc_state_version,
    decision_policy_ref: policy_snapshot.policy_ref,
    options_digest: digest(options),
    dependency_pins: dependencyPins,
    options
  });
  const proposalPayload = {
    request_id: requestId,
    source_perception_ref: {
      entity_kind: 'perception_result',
      entity_id: context_snapshot.source_perception.perception_id
    },
    state_version: context_snapshot.npc_state_version,
    options_digest: decisionRequest.options_digest,
    context_snapshot,
    policy_snapshot,
    decision_request: decisionRequest
  };
  const proposal = freeze({
    ...proposalPayload,
    canonical_digest: digest(proposalPayload)
  });
  if (!formal('npc_reaction_option_set_proposal', proposal)) {
    return blocked(
      'generated_schema_mismatch',
      'NPC reaction owner produced a non-formal option-set proposal',
      context_snapshot.npc_ref,
      dependencyPins
    );
  }

  if (persisted_proposal !== null) {
    if (!formal('npc_reaction_option_set_proposal', persisted_proposal)
      || !sameProposal(persisted_proposal, proposal)) {
      return blocked(
        'idempotency_conflict',
        'Persisted reaction option proposal conflicts with the sealed causal input',
        context_snapshot.npc_ref,
        dependencyPins
      );
    }
    return success({
      proposal: persisted_proposal,
      decision_request: persisted_proposal.decision_request,
      decision_mode: options.length === 1
        ? policy_snapshot.one_option_mode
        : policy_snapshot.many_options_mode,
      replay_status: 'already_proposed'
    });
  }

  return success({
    proposal,
    decision_request: decisionRequest,
    decision_mode: options.length === 1
      ? policy_snapshot.one_option_mode
      : policy_snapshot.many_options_mode,
    replay_status: 'new'
  });
}
