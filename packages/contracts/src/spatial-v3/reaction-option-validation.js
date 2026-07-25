import {
  SPATIAL_V3_CONTRACT_VERSION,
  canonicalizeSpatialV3,
  computeSpatialV3CanonicalDigest,
  validateControlledVocabulary
} from './registry.js';
import {
  SPATIAL_V3_NPC_REACTION_HANDLER_BINDINGS
} from './reaction-handoff-validation.js';

const issue = (code, field, message) => ({ code, field, message });
const canonicalEqual = (left, right) =>
  JSON.stringify(canonicalizeSpatialV3(left)) ===
  JSON.stringify(canonicalizeSpatialV3(right));
const sameVersionedRef = canonicalEqual;
const entityRefKey = (value) =>
  `${value?.entity_kind ?? ''}\u0000${value?.entity_id ?? ''}`;
const pinKey = (pin) =>
  `${pin?.dependency_role ?? ''}\u0000${JSON.stringify(canonicalizeSpatialV3(pin?.entity_ref))}\u0000${JSON.stringify(canonicalizeSpatialV3(pin?.version_pin))}`;
const includesAllPins = (container, required) => {
  const available = new Set((container?.pins ?? []).map(pinKey));
  return Array.isArray(required?.pins) &&
    required.pins.every((pin) => available.has(pinKey(pin)));
};
const hasPinnedRef = (pinSet, role, reference) =>
  Array.isArray(pinSet?.pins) && pinSet.pins.some((pin) =>
    pin.dependency_role === role &&
    canonicalEqual(pin.entity_ref, reference?.entity_ref) &&
    pin.version_pin?.pin_kind === 'authoring_version' &&
    pin.version_pin.authoring_version === reference?.authoring_version);

const reactionCapabilityField = Object.freeze({
  investigate_signal: 'can_investigate_signal',
  seek_safety: 'can_seek_safety',
  report_to_authority: 'can_report_to_authority'
});

function versionedRefKey(value) {
  return `${entityRefKey(value?.entity_ref)}\u0000${value?.authoring_version ?? ''}`;
}

function validateCompleteDigest(value, field = 'canonical_digest') {
  if (value?.[field] == null) return [];
  const { [field]: _digest, ...payload } = value;
  return value[field] === computeSpatialV3CanonicalDigest(payload)
    ? []
    : [issue('generated_schema_mismatch', field, `${field} must cover the complete immutable snapshot.`)];
}

function validateNpcReactionOptionRuleSnapshot(value) {
  const errors = [];
  const results = value?.allowed_perception_results;
  if (!Array.isArray(results)
    || results.length === 0
    || new Set(results).size !== results.length
    || !canonicalEqual(results, [...results].sort((left, right) => left.localeCompare(right, 'en')))
    || results.includes('not_perceived')) {
    errors.push(issue('perception_policy_gap', 'allowed_perception_results', 'Reaction rule perception results must be non-empty, unique, canonically ordered and must forbid not_perceived.'));
  } else {
    for (const result of results) {
      errors.push(...validateControlledVocabulary('controlled_perception_result', result)
        .map((entry) => ({ ...entry, field: 'allowed_perception_results' })));
    }
  }
  if (value?.command_ref?.entity_ref?.entity_kind !== 'decision_command') {
    errors.push(issue('controlled_vocabulary_gap', 'command_ref.entity_ref.entity_kind', 'Reaction option rule must reference an approved decision_command.'));
  }
  if (!SPATIAL_V3_NPC_REACTION_HANDLER_BINDINGS[
    value?.command_ref?.entity_ref?.entity_id
  ]) {
    errors.push(issue('npc_decision_policy_gap', 'command_ref', 'Reaction option rule command must have exactly one registered code-owned handler.'));
  }
  errors.push(...validateCompleteDigest(value));
  return errors;
}

function validateNpcReactionPolicySnapshot(value) {
  const errors = [];
  const rules = value?.option_rules;
  const commandRecords = value?.approved_command_records;
  if (!Array.isArray(rules)
    || rules.length === 0
    || new Set(rules.map(({ option_id }) => option_id)).size !== rules.length
    || new Set(rules.map(({ command_ref }) => versionedRefKey(command_ref))).size !== rules.length
    || !canonicalEqual(rules, [...rules].sort((left, right) => left.option_id.localeCompare(right.option_id, 'en')))) {
    errors.push(issue('npc_decision_policy_gap', 'option_rules', 'Reaction policy rules must be non-empty, unique by option and command, and canonically ordered.'));
  }
  if (value?.source_record_ref?.entity_ref?.entity_kind !== 'source_record'
    || !hasPinnedRef(value?.dependency_pins, 'source_dependency', value?.source_record_ref)) {
    errors.push(issue('authoring_dependency_pin_missing', 'source_record_ref', 'Reaction policy must bind and pin one approved source record.'));
  }
  if (!hasPinnedRef(value?.dependency_pins, 'profile', value?.policy_ref)) {
    errors.push(issue('authoring_dependency_pin_missing', 'policy_ref', 'Reaction policy reference must be pinned as the selected profile.'));
  }
  for (const rule of rules ?? []) {
    if (!hasPinnedRef(value?.dependency_pins, 'action_contract', rule.command_ref)
      || !hasPinnedRef(value?.dependency_pins, 'consequence_rule', rule.consequence_policy_ref)) {
      errors.push(issue('authoring_dependency_pin_missing', 'dependency_pins', `Reaction rule ${rule.option_id ?? '<unknown>'} must pin its command and consequence policy.`));
    }
  }
  if (!Array.isArray(commandRecords)
    || commandRecords.length !== (rules?.length ?? 0)
    || new Set(commandRecords.map(({ command_ref }) => versionedRefKey(command_ref))).size !== commandRecords.length
    || commandRecords.some((record) =>
      !sameVersionedRef(record.source_record_ref, value?.source_record_ref)
      || !includesAllPins(value?.dependency_pins, record.dependency_pins))
    || (rules ?? []).some((rule) =>
      commandRecords.filter((record) =>
        sameVersionedRef(record.command_ref, rule.command_ref)).length !== 1)) {
    errors.push(issue('npc_decision_policy_gap', 'approved_command_records', 'Reaction policy must contain exactly one validated source-bound approved command record for every rule.'));
  }
  if (value?.bounded_decision_when_multiple !== true
    || value?.zero_options_outcome !== 'npc_decision_policy_gap'
    || value?.one_option_mode !== 'code_owned_without_llm'
    || value?.many_options_mode !== 'bounded_selection') {
    errors.push(issue('npc_decision_policy_gap', 'bounded_decision_when_multiple', 'Reaction policy must preserve the exact fail-closed zero/one/many semantics.'));
  }
  errors.push(...validateCompleteDigest(value));
  return errors;
}

function validateNpcReactionOptionContextSnapshot(value) {
  const errors = [];
  const perception = value?.source_perception;
  if (!canonicalEqual(value?.npc_ref, perception?.perceiver_ref)) {
    errors.push(issue('perception_policy_gap', 'npc_ref', 'Reaction option context NPC must equal the causal perception perceiver.'));
  }
  errors.push(...validateCompleteDigest(perception)
    .map((entry) => ({ ...entry, field: `source_perception.${entry.field}` })));
  const expected = value?.expected_state_versions?.entries?.find(({ entity_ref }) =>
    canonicalEqual(entity_ref, value?.npc_ref));
  if (String(expected?.state_version ?? '') !== value?.npc_state_version) {
    errors.push(issue('activity_precondition_stale', 'expected_state_versions', 'Reaction option context must bind the NPC current state version.'));
  }
  errors.push(...validateCompleteDigest(value));
  return errors;
}

function applicableReactionRules(context, policy) {
  return (policy?.option_rules ?? []).filter((rule) =>
    rule.allowed_perception_results?.includes(context?.source_perception?.result)
    && context?.[reactionCapabilityField[rule.required_capability]] === true
    && (!rule.requires_direct_threat || context?.threat_level === 'direct')
    && (!rule.requires_safe_anchor || context?.safe_anchor_ref != null)
    && (!rule.requires_authority_recipient || context?.authority_recipient_ref != null));
}

function digestHex(value) {
  return computeSpatialV3CanonicalDigest(value).slice('sha256:'.length);
}

export function deriveNpcReactionRequestId({ context_snapshot, policy_snapshot }) {
  return `npc-reaction:${digestHex({
    source_perception_digest: context_snapshot?.source_perception?.canonical_digest,
    npc_ref: context_snapshot?.npc_ref,
    state_version: context_snapshot?.npc_state_version,
    policy_digest: policy_snapshot?.canonical_digest,
    context_digest: context_snapshot?.canonical_digest
  })}`;
}

export function deriveNpcReactionPreconditionsDigest({
  context_snapshot,
  policy_snapshot,
  rule
}) {
  return computeSpatialV3CanonicalDigest({
    context_digest: context_snapshot?.canonical_digest,
    policy_digest: policy_snapshot?.canonical_digest,
    rule_digest: rule?.canonical_digest
  });
}

function reactionOptionDescriptor(option) {
  return {
    option_id: option.option_id,
    command_ref: option.command_ref,
    canonical_ordinal: option.canonical_ordinal,
    preconditions_digest: option.preconditions_digest,
    consequence_policy_ref: option.consequence_policy_ref
  };
}

export function deriveNpcReactionOptionSetDigest(options) {
  return computeSpatialV3CanonicalDigest(options.map(reactionOptionDescriptor));
}

export function deriveNpcReactionCommandToken({
  request_id,
  npc_ref,
  option,
  decision_policy_ref,
  state_version,
  option_set_digest
}) {
  return `cmd.v1:${digestHex({
    contract_version: SPATIAL_V3_CONTRACT_VERSION,
    request_id,
    npc_ref,
    option_id: option?.option_id,
    command_ref: option?.command_ref,
    decision_policy_ref,
    state_version,
    preconditions_digest: option?.preconditions_digest,
    option_set_digest
  })}`;
}

function validateNpcReactionOptionSetProposal(value) {
  const errors = [];
  const context = value?.context_snapshot;
  const policy = value?.policy_snapshot;
  const request = value?.decision_request;
  const perception = context?.source_perception;
  const applicable = applicableReactionRules(context, policy);
  const options = request?.options ?? [];
  const expectedRequestId = deriveNpcReactionRequestId({
    context_snapshot: context,
    policy_snapshot: policy
  });
  if (applicable.length === 0) {
    errors.push(issue('npc_decision_policy_gap', 'decision_request.options', 'A reaction option-set proposal cannot represent an empty applicable option set.'));
  }
  if (value?.request_id !== expectedRequestId
    || value?.source_perception_ref?.entity_kind !== 'perception_result'
    || value?.source_perception_ref?.entity_id !== perception?.perception_id
    || value?.request_id !== request?.request_id
    || value?.state_version !== context?.npc_state_version
    || value?.state_version !== request?.state_version
    || !canonicalEqual(request?.npc_ref, context?.npc_ref)
    || !canonicalEqual(request?.requested_at, perception?.perceived_at)
    || !sameVersionedRef(request?.decision_policy_ref, policy?.policy_ref)
    || !includesAllPins(request?.dependency_pins, context?.dependency_pins)
    || !includesAllPins(request?.dependency_pins, policy?.dependency_pins)) {
    errors.push(issue('npc_decision_policy_gap', 'decision_request', 'Decision request must bind the same perception, NPC, timestamp, state, policy and complete dependency pins.'));
  }
  const optionShapeMatches = applicable.length === options.length
    && options.every((option, index) => {
      const rule = applicable[index];
      return option.option_id === rule?.option_id
        && option.canonical_ordinal === index
        && sameVersionedRef(option.command_ref, rule?.command_ref)
        && sameVersionedRef(option.consequence_policy_ref, rule?.consequence_policy_ref)
        && option.preconditions_digest === deriveNpcReactionPreconditionsDigest({
          context_snapshot: context,
          policy_snapshot: policy,
          rule
        });
    });
  const optionSetDigest = deriveNpcReactionOptionSetDigest(options);
  const tokensMatch = options.every((option) =>
    option.command_token === deriveNpcReactionCommandToken({
      request_id: request?.request_id,
      npc_ref: request?.npc_ref,
      option,
      decision_policy_ref: request?.decision_policy_ref,
      state_version: request?.state_version,
      option_set_digest: optionSetDigest
    }));
  if (!optionShapeMatches
    || !tokensMatch
    || request?.options_digest !== computeSpatialV3CanonicalDigest(options)
    || value?.options_digest !== request?.options_digest
    || (options.length > 1 && policy?.bounded_decision_when_multiple !== true)) {
    errors.push(issue('npc_decision_policy_gap', 'decision_request.options', 'Decision options must be the exact canonical applicable rule projection with a matching digest.'));
  }
  errors.push(...validateCompleteDigest(value));
  return errors;
}

export function validateReactionOptionContract(contractName, value) {
  const validators = {
    npc_reaction_option_rule_snapshot: validateNpcReactionOptionRuleSnapshot,
    npc_reaction_policy_snapshot: validateNpcReactionPolicySnapshot,
    npc_reaction_option_context_snapshot: validateNpcReactionOptionContextSnapshot,
    npc_reaction_option_set_proposal: validateNpcReactionOptionSetProposal
  };
  return validators[contractName]?.(value) ?? [];
}
