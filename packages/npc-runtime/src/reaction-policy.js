import {
  SPATIAL_V3_NPC_REACTION_HANDLER_BINDINGS,
  computeSpatialV3CanonicalDigest,
  createSpatialV3TypedError,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';

const COLUMNS = Object.freeze([
  'record_id',
  'family_id',
  'record_kind',
  'record_version',
  'applicability',
  'status',
  'provenance_refs',
  'normalized_reference_ids',
  'source_history_refs',
  'payload'
]);
const versionedRef = (entity_kind, entity_id, authoring_version) => ({
  entity_ref: { entity_kind, entity_id },
  authoring_version: String(authoring_version)
});
const dependencyPin = (dependency_role, reference) => ({
  dependency_role,
  entity_ref: reference.entity_ref,
  version_pin: {
    pin_kind: 'authoring_version',
    authoring_version: reference.authoring_version
  }
});
const pinSortKey = (pin) => [
  pin.dependency_role,
  pin.entity_ref.entity_kind,
  pin.entity_ref.entity_id,
  pin.version_pin.authoring_version
].join('\u0000');
const seal = (value) => Object.freeze({
  ...value,
  canonical_digest: computeSpatialV3CanonicalDigest(value)
});
const failure = (row, diagnostics) => {
  const subject_ref = {
    entity_kind: 'source_record',
    entity_id: row?.record_id ?? 'unknown'
  };
  const pin = {
    dependency_role: 'source_dependency',
    entity_ref: subject_ref,
    version_pin: {
      pin_kind: 'authoring_version',
      authoring_version: String(row?.record_version ?? 'required')
    }
  };
  return Object.freeze({
    ok: false,
    error: createSpatialV3TypedError('npc_decision_policy_gap', {
      subject_ref,
      dependency_pins: {
        pins: [pin],
        canonical_digest:
          computeSpatialV3CanonicalDigest([pin]).replace('sha256:', '')
      },
      diagnostics
    })
  });
};

/**
 * Pure projection from one exact immutable Temporal authoring row to the
 * public reaction contracts. Missing commands, handlers or policies fail
 * closed; the projector performs no reads and invents no defaults.
 */
export function buildNpcReactionPolicySnapshotFromAuthoringRow(row) {
  const normalized = Object.fromEntries(
    COLUMNS.map((column) => [column, row?.[column]])
  );
  const expectedDigest =
    computeSpatialV3CanonicalDigest(normalized).replace('sha256:', '');
  const payload = row?.payload;
  const commands = payload?.command_records;
  const consequences = payload?.consequence_policies;
  const rules = payload?.option_rules;
  if (row?.family_id !== 'npc_temporal_profiles_policies'
    || row?.record_kind !== 'npc_reaction_policy'
    || row?.status !== 'approved'
    || !/^[1-9][0-9]*$/u.test(String(row?.record_version ?? ''))
    || row?.canonical_digest !== expectedDigest
    || !Array.isArray(row?.applicability)
    || row.applicability.length === 0
    || !Array.isArray(commands)
    || !Array.isArray(consequences)
    || !Array.isArray(rules)
    || commands.length === 0
    || commands.length !== consequences.length
    || commands.length !== rules.length
    || payload?.no_authored_default !== true
    || payload?.bounded_decision_when_multiple !== true
    || payload?.zero_options_outcome !== 'npc_decision_policy_gap'
    || payload?.one_option_mode !== 'code_owned_without_llm'
    || payload?.many_options_mode !== 'bounded_selection') {
    return failure(row, { reason: 'authoring_record_invalid' });
  }
  const sourceRecordRef = versionedRef(
    'source_record',
    row.record_id,
    row.record_version
  );
  const policyRef = payload.policy_ref;
  const commandById = new Map(commands.map((command) => [
    command?.command_ref?.entity_ref?.entity_id,
    command
  ]));
  const consequenceById = new Map(consequences.map((consequence) => [
    consequence?.policy_ref?.entity_ref?.entity_id,
    consequence
  ]));
  if (policyRef?.entity_ref?.entity_kind !== 'action_contract'
    || commandById.size !== commands.length
    || consequenceById.size !== consequences.length
    || new Set(rules.map(({ option_id }) => option_id)).size !== rules.length
    || new Set(rules.map(({ command_id }) => command_id)).size !== rules.length) {
    return failure(row, { reason: 'authoring_identity_set_invalid' });
  }
  const optionRules = [];
  for (const rule of [...rules].sort((left, right) =>
    left.option_id.localeCompare(right.option_id, 'en'))) {
    const command = commandById.get(rule.command_id);
    const commandId = command?.command_ref?.entity_ref?.entity_id;
    const binding = SPATIAL_V3_NPC_REACTION_HANDLER_BINDINGS[commandId];
    const consequence = consequenceById.get(
      command?.consequence_policy_ref?.entity_ref?.entity_id
    );
    if (commandId !== rule.command_id
      || command?.command_ref?.entity_ref?.entity_kind !== 'decision_command'
      || command?.status !== 'approved'
      || command?.domain !== 'npc_reaction'
      || command?.handler_id !== binding?.handler_id
      || command?.input_contract_name !== binding?.input_contract_name
      || command?.consequence_contract_name
        !== binding?.consequence_contract_name
      || consequence?.effect_kind !== binding?.effect_kind
      || consequence?.successor_command_kind
        !== binding?.successor_command_kind
      || consequence?.state_patch_allowed !== false
      || command?.consequence_policy_ref?.entity_ref?.entity_kind
        !== 'action_contract') {
      return failure(row, {
        reason: 'command_handler_or_consequence_gap',
        command_id: rule.command_id
      });
    }
    optionRules.push(seal({
      option_id: rule.option_id,
      command_ref: command.command_ref,
      consequence_policy_ref: command.consequence_policy_ref,
      allowed_perception_results: [
        ...(rule.allowed_perception_results ?? [])
      ].sort((left, right) => left.localeCompare(right, 'en')),
      required_capability: rule.required_capability,
      requires_direct_threat: rule.requires_direct_threat,
      requires_safe_anchor: rule.requires_safe_anchor,
      requires_authority_recipient: rule.requires_authority_recipient
    }));
  }
  const pins = [
    dependencyPin('profile', policyRef),
    ...optionRules.map((rule) =>
      dependencyPin('action_contract', rule.command_ref)),
    ...optionRules.map((rule) =>
      dependencyPin('consequence_rule', rule.consequence_policy_ref)),
    dependencyPin('source_dependency', sourceRecordRef)
  ].sort((left, right) =>
    pinSortKey(left).localeCompare(pinSortKey(right), 'en'));
  const dependencyPins = seal({ pins });
  const approvedCommandRecords = optionRules.map((rule) => {
    const command = commandById.get(rule.command_ref.entity_ref.entity_id);
    return seal({
      command_ref: command.command_ref,
      domain: command.domain,
      handler_id: command.handler_id,
      input_contract_name: command.input_contract_name,
      consequence_contract_name: command.consequence_contract_name,
      source_record_ref: sourceRecordRef,
      applicability: [...row.applicability].sort((left, right) =>
        left.localeCompare(right, 'en')),
      status: 'approved',
      dependency_pins: dependencyPins
    });
  });
  const snapshot = seal({
    policy_ref: policyRef,
    source_record_ref: sourceRecordRef,
    status: 'approved',
    bounded_decision_when_multiple: true,
    zero_options_outcome: 'npc_decision_policy_gap',
    one_option_mode: 'code_owned_without_llm',
    many_options_mode: 'bounded_selection',
    dependency_pins: dependencyPins,
    option_rules: optionRules,
    approved_command_records: approvedCommandRecords
  });
  const validationErrors = [
    ...optionRules.flatMap((rule) =>
      validateSpatialV3Contract('npc_reaction_option_rule_snapshot', rule)),
    ...approvedCommandRecords.flatMap((command) =>
      validateSpatialV3Contract('approved_decision_command_snapshot', command)),
    ...validateSpatialV3Contract('npc_reaction_policy_snapshot', snapshot)
  ];
  return validationErrors.length === 0
    ? Object.freeze({ ok: true, value: snapshot })
    : failure(row, {
        reason: 'formal_projection_invalid',
        validation_errors: validationErrors
      });
}
