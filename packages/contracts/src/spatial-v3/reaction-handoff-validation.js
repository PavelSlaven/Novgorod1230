import {
  canonicalizeSpatialV3,
  computeSpatialV3CanonicalDigest,
  contractSpecifications,
  validateSpatialV3Contract
} from './registry.js';

const issue = (code, field, message) => ({ code, field, message });
const stableId = (value) => typeof value === 'string' && value.trim().length > 0;
const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const canonicalEqual = (left, right) =>
  JSON.stringify(canonicalizeSpatialV3(left)) ===
  JSON.stringify(canonicalizeSpatialV3(right));

function validateNpcDecisionOption(value) {
  return value?.command_ref?.entity_ref?.entity_kind === 'decision_command'
    ? []
    : [issue(
        'controlled_vocabulary_gap',
        'command_ref.entity_ref.entity_kind',
        'npc_decision_option command_ref must resolve through the approved decision_command catalog.'
      )];
}

function sameVersionedRef(left, right) {
  return canonicalEqual(left, right);
}

export const SPATIAL_V3_NPC_REACTION_HANDLER_BINDINGS = Object.freeze({
  npc_investigate_signal: Object.freeze({
    handler_id: 'npc.reaction.investigate-signal.v1',
    input_contract_name: 'npc_reaction_consequence_request',
    consequence_contract_name: 'npc_reaction_effect_snapshot',
    effect_kind: 'investigate_signal',
    successor_command_kind: 'prepare_target'
  }),
  npc_report_to_authority: Object.freeze({
    handler_id: 'npc.reaction.report-to-authority.v1',
    input_contract_name: 'npc_reaction_consequence_request',
    consequence_contract_name: 'npc_reaction_effect_snapshot',
    effect_kind: 'report_to_authority',
    successor_command_kind: 'immediate_action'
  }),
  npc_seek_safety: Object.freeze({
    handler_id: 'npc.reaction.seek-safety.v1',
    input_contract_name: 'npc_reaction_consequence_request',
    consequence_contract_name: 'npc_reaction_effect_snapshot',
    effect_kind: 'seek_safety',
    successor_command_kind: 'replan'
  })
});

function hasPinnedRef(pinSet, role, reference) {
  return Array.isArray(pinSet?.pins) && pinSet.pins.some((pin) =>
    pin.dependency_role === role
    && canonicalEqual(pin.entity_ref, reference?.entity_ref)
    && pin.version_pin?.pin_kind === 'authoring_version'
    && pin.version_pin.authoring_version === reference?.authoring_version);
}

function validateApprovedDecisionCommandSnapshot(value) {
  const errors = [];
  const binding = SPATIAL_V3_NPC_REACTION_HANDLER_BINDINGS[
    value?.command_ref?.entity_ref?.entity_id
  ];
  if (value?.command_ref?.entity_ref?.entity_kind !== 'decision_command') {
    errors.push(issue('controlled_vocabulary_gap', 'command_ref.entity_ref.entity_kind', 'Approved decision command must use the decision_command entity kind.'));
  }
  if (value?.source_record_ref?.entity_ref?.entity_kind !== 'source_record') {
    errors.push(issue('generated_schema_mismatch', 'source_record_ref.entity_ref.entity_kind', 'Approved decision command must bind one source_record.'));
  }
  if (!Array.isArray(value?.applicability)
    || value.applicability.length === 0
    || new Set(value.applicability).size !== value.applicability.length
    || !canonicalEqual(value.applicability, [...value.applicability].sort((left, right) => left.localeCompare(right, 'en')))) {
    errors.push(issue('generated_schema_mismatch', 'applicability', 'Approved decision command applicability must be non-empty, unique and canonically ordered.'));
  }
  if (!hasPinnedRef(value?.dependency_pins, 'action_contract', value?.command_ref)) {
    errors.push(issue('authoring_dependency_pin_missing', 'dependency_pins', 'Approved decision command reference must be pinned as an action contract.'));
  }
  if (!hasPinnedRef(value?.dependency_pins, 'source_dependency', value?.source_record_ref)) {
    errors.push(issue('authoring_dependency_pin_missing', 'dependency_pins', 'Approved decision command source record must be pinned as a source dependency.'));
  }
  for (const field of ['input_contract_name', 'consequence_contract_name']) {
    if (stableId(value?.[field]) && !contractSpecifications.some(({ contract_name }) => contract_name === value[field])) {
      errors.push(issue('generated_schema_mismatch', field, `${field} must name a current public contract.`));
    }
  }
  if (!binding
    || value?.domain !== 'npc_reaction'
    || value?.handler_id !== binding.handler_id
    || value?.input_contract_name !== binding.input_contract_name
    || value?.consequence_contract_name !== binding.consequence_contract_name) {
    errors.push(issue('npc_decision_policy_gap', 'handler_id', 'Approved decision command must match exactly one current code-owned reaction handler binding.'));
  }
  if (value?.canonical_digest != null) {
    const { canonical_digest: _digest, ...payload } = value;
    if (value.canonical_digest !== computeSpatialV3CanonicalDigest(payload)) {
      errors.push(issue('generated_schema_mismatch', 'canonical_digest', 'Approved decision command digest must cover the complete read projection.'));
    }
  }
  return errors;
}

function pinKey(pin) {
  return `${pin?.dependency_role ?? ''}\u0000${JSON.stringify(canonicalizeSpatialV3(pin?.entity_ref))}\u0000${JSON.stringify(canonicalizeSpatialV3(pin?.version_pin))}`;
}

function includesAllPins(container, required) {
  const available = new Set((container?.pins ?? []).map(pinKey));
  return Array.isArray(required?.pins) && required.pins.every((pin) => available.has(pinKey(pin)));
}

function expectedReactionIdempotencyKey(value) {
  return `npc-reaction:${value?.request_id}:${value?.current_state_version}:${value?.decision_trace?.trace_digest}:${value?.command_record?.canonical_digest}`;
}

function validateNpcDecisionTrace(value) {
  if (value?.trace_digest == null) return [];
  const { trace_digest: _digest, ...payload } = value;
  return value.trace_digest === computeSpatialV3CanonicalDigest(payload)
    ? []
    : [issue('generated_schema_mismatch', 'trace_digest', 'NPC decision trace digest must cover the complete validated selection.')];
}

function validateNpcReactionHandlerInputSnapshot(value) {
  const errors = [];
  const perception = value?.source_perception;
  if (perception?.canonical_digest != null) {
    const { canonical_digest: _perceptionDigest, ...perceptionPayload } = perception;
    if (perception.canonical_digest !== computeSpatialV3CanonicalDigest(perceptionPayload)) {
      errors.push(issue('generated_schema_mismatch', 'source_perception.canonical_digest', 'Causal perception digest must cover the complete formal result.'));
    }
  }
  if (value?.canonical_digest != null) {
    const { canonical_digest: _digest, ...payload } = value;
    if (value.canonical_digest !== computeSpatialV3CanonicalDigest(payload)) {
      errors.push(issue('generated_schema_mismatch', 'canonical_digest', 'Reaction handler input digest must cover the complete closed snapshot.'));
    }
  }
  return errors;
}

function validateNpcReactionConsequenceRequest(value) {
  const errors = [];
  const option = value?.selected_option;
  const trace = value?.decision_trace;
  const command = value?.command_record;
  if (trace?.request_id !== value?.request_id
    || trace?.state_version !== value?.current_state_version
    || trace?.option_id !== option?.option_id
    || trace?.command_token !== option?.command_token) {
    errors.push(issue('npc_decision_policy_gap', 'decision_trace', 'Decision trace must select the exact option for the current request and state version.'));
  }
  if (!sameVersionedRef(option?.command_ref, command?.command_ref)) {
    errors.push(issue('npc_decision_policy_gap', 'command_record.command_ref', 'Selected option and approved command record must bind the same command.'));
  }
  if (!includesAllPins(value?.dependency_pins, command?.dependency_pins)
    || !hasPinnedRef(value?.dependency_pins, 'consequence_rule', option?.consequence_policy_ref)
    || !canonicalEqual(value?.consequence_input_snapshot?.dependency_pins, value?.dependency_pins)) {
    errors.push(issue('authoring_dependency_pin_missing', 'dependency_pins', 'Reaction request must include the exact approved command/source/policy pins and bind them to the handler input.'));
  }
  if (value?.consequence_input_snapshot?.source_perception?.perceiver_ref
      && !canonicalEqual(value.consequence_input_snapshot.source_perception.perceiver_ref, value?.npc_ref)) {
    errors.push(issue('perception_policy_gap', 'consequence_input_snapshot.source_perception.perceiver_ref', 'Reaction perception must belong to the selected NPC.'));
  }
  if (value?.consequence_input_snapshot?.observed_preconditions_digest !== option?.preconditions_digest) {
    errors.push(issue('activity_precondition_stale', 'consequence_input_snapshot.observed_preconditions_digest', 'Reaction handler input must bind the selected option preconditions.'));
  }
  if (value?.idempotency_key !== expectedReactionIdempotencyKey(value)) {
    errors.push(issue('idempotency_conflict', 'idempotency_key', 'Reaction idempotency identity must be derived from request, state, decision trace and approved command.'));
  }
  if (value?.canonical_input_digest != null) {
    const { canonical_input_digest: _digest, ...payload } = value;
    if (value.canonical_input_digest !== computeSpatialV3CanonicalDigest(payload)) {
      errors.push(issue('generated_schema_mismatch', 'canonical_input_digest', 'Reaction request digest must cover the complete sealed input.'));
    }
  }
  return errors;
}

function validateNpcReactionConsequenceProposal(value) {
  const errors = [];
  const request = value?.request_snapshot;
  if (value?.command_ref?.entity_ref?.entity_kind !== 'decision_command') {
    errors.push(issue('controlled_vocabulary_gap', 'command_ref.entity_ref.entity_kind', 'Reaction proposal must bind an approved decision_command.'));
  }
  const consequenceName = value?.consequence_contract_name;
  if (stableId(consequenceName)) {
    if (!contractSpecifications.some(({ contract_name }) =>
      contract_name === consequenceName)
      || consequenceName === 'npc_reaction_consequence_proposal') {
      errors.push(issue('generated_schema_mismatch', 'consequence_contract_name', 'Reaction consequence must name a non-recursive current public contract.'));
    } else {
      errors.push(...validateSpatialV3Contract(consequenceName, value.consequence_payload)
        .map((entry) => ({ ...entry, field: `consequence_payload.${entry.field}` })));
    }
  }
  if (request) {
    const command = request.command_record;
    if (value?.request_id !== request.request_id
      || !canonicalEqual(value?.npc_ref, request.npc_ref)
      || value?.option_id !== request.selected_option?.option_id
      || !sameVersionedRef(value?.command_ref, command?.command_ref)
      || value?.handler_id !== command?.handler_id
      || value?.consequence_contract_name !== command?.consequence_contract_name
      || value?.state_version !== request.current_state_version
      || !canonicalEqual(value?.proposed_at, request.executed_at)
      || !canonicalEqual(value?.dependency_pins, request.dependency_pins)
      || value?.canonical_input_digest !== request.canonical_input_digest) {
      errors.push(issue('npc_decision_policy_gap', 'handler_id', 'Reaction proposal must match the complete sealed request and approved command record.'));
    }
    const effect = value?.consequence_payload;
    const binding = SPATIAL_V3_NPC_REACTION_HANDLER_BINDINGS[
      command?.command_ref?.entity_ref?.entity_id
    ];
    if (!binding
      || effect?.effect_kind !== binding.effect_kind
      || effect?.successor_command_kind !== binding.successor_command_kind
      || effect?.source_perception_ref?.entity_id
        !== request.consequence_input_snapshot?.source_perception?.perception_id
      || !canonicalEqual(effect?.effective_at, request.executed_at)) {
      errors.push(issue('npc_decision_policy_gap', 'consequence_payload', 'Reaction effect must match the registered handler and causal request input.'));
    }
  }
  if (value?.canonical_digest != null) {
    const { canonical_digest: _digest, ...payload } = value;
    if (value.canonical_digest !== computeSpatialV3CanonicalDigest(payload)) {
      errors.push(issue('generated_schema_mismatch', 'canonical_digest', 'Reaction proposal digest must cover the complete code-owned proposal.'));
    }
  }
  return errors;
}

function validateNpcReactionEffectSnapshot(value) {
  const expectedCommand = {
    investigate_signal: 'prepare_target',
    seek_safety: 'replan',
    report_to_authority: 'immediate_action'
  }[value?.effect_kind];
  const errors = expectedCommand === value?.successor_command_kind
    ? []
    : [issue('npc_decision_policy_gap', 'successor_command_kind', 'Reaction effect must use the command kind fixed by its approved effect kind.')];
  if (value?.source_perception_ref?.entity_kind !== 'perception_result') {
    errors.push(issue('perception_policy_gap', 'source_perception_ref', 'Reaction effect must bind the causal perception result.'));
  }
  const forbidden = [];
  const scan = (candidate, path = 'successor_command_payload') => {
    if (!isObject(candidate) && !Array.isArray(candidate)) return;
    if (Array.isArray(candidate)) {
      candidate.forEach((entry, index) => scan(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(candidate)) {
      if (['state_patch', 'clock', 'clock_before', 'clock_after', 'sql', 'database', 'filesystem', 'network', 'llm'].includes(key.toLowerCase())) {
        forbidden.push(`${path}.${key}`);
      }
      scan(child, `${path}.${key}`);
    }
  };
  scan(value?.successor_command_payload);
  if (forbidden.length > 0) {
    errors.push(issue('npc_decision_policy_gap', 'successor_command_payload', 'Reaction effect cannot contain a state patch, clock mutation, SQL or hidden IO instruction.'));
  }
  if (value?.canonical_digest != null) {
    const { canonical_digest: _digest, ...payload } = value;
    if (value.canonical_digest !== computeSpatialV3CanonicalDigest(payload)) {
      errors.push(issue('generated_schema_mismatch', 'canonical_digest', 'Reaction effect digest must cover the complete handler-created snapshot.'));
    }
  }
  return errors;
}

const entityRefKey = (value) => `${value?.entity_kind ?? ''}\u0000${value?.entity_id ?? ''}`;
function uniqueCanonicalRefs(values) {
  return Array.isArray(values)
    && new Set(values.map(entityRefKey)).size === values.length
    && canonicalEqual(values, [...values].sort((left, right) => entityRefKey(left).localeCompare(entityRefKey(right), 'en')));
}

function validateKnowledgeMemoryDeltaProposal(value) {
  const facts = value?.fact_refs ?? [];
  const hypotheses = value?.hypothesis_refs ?? [];
  const errors = [];
  if (!uniqueCanonicalRefs(facts) || !uniqueCanonicalRefs(hypotheses)
    || facts.some((fact) => hypotheses.some((hypothesis) => canonicalEqual(fact, hypothesis)))) {
    errors.push(issue('generated_schema_mismatch', 'fact_refs', 'Knowledge facts and hypotheses must be unique, ordered and disjoint.'));
  }
  if (value?.source_kind === 'perception' && value?.source_ref?.entity_kind !== 'perception_result') {
    errors.push(issue('perception_policy_gap', 'source_ref', 'Perception knowledge delta must reference one perception_result.'));
  }
  const perception = value?.source_perception;
  if (perception?.canonical_digest != null) {
    const { canonical_digest: _perceptionDigest, ...perceptionPayload } = perception;
    if (perception.canonical_digest !== computeSpatialV3CanonicalDigest(perceptionPayload)) {
      errors.push(issue('generated_schema_mismatch', 'source_perception.canonical_digest', 'Knowledge delta causal perception digest must cover the complete formal result.'));
    }
  }
  if (value?.source_kind !== 'perception'
    || perception?.perception_id !== value?.source_ref?.entity_id
    || !canonicalEqual(perception?.perceiver_ref, value?.owner_ref)) {
    errors.push(issue('perception_policy_gap', 'source_ref', 'Knowledge delta must include the complete matching perception result for its owner.'));
  }
  const proposedRefs = [...facts, ...hypotheses].sort((left, right) =>
    entityRefKey(left).localeCompare(entityRefKey(right), 'en'));
  const perceivedRefs = [...(perception?.knowledge_update_refs ?? [])].sort((left, right) =>
    entityRefKey(left).localeCompare(entityRefKey(right), 'en'));
  if (!canonicalEqual(proposedRefs, perceivedRefs)
    || (perception?.result === 'not_perceived' && proposedRefs.length > 0)
    || (perception?.result === 'misinterpreted' && facts.length > 0)) {
    errors.push(issue('perception_policy_gap', 'fact_refs', 'Knowledge delta must preserve the causal perception outcome and exact knowledge reference set.'));
  }
  if (value?.canonical_digest != null) {
    const { canonical_digest: _digest, ...payload } = value;
    if (value.canonical_digest !== computeSpatialV3CanonicalDigest(payload)) {
      errors.push(issue('generated_schema_mismatch', 'canonical_digest', 'Knowledge delta digest must cover the complete proposal.'));
    }
  }
  return errors;
}

function validateKnowledgeMemoryMergeResult(value) {
  const facts = value?.accepted_fact_refs ?? [];
  const hypotheses = value?.accepted_hypothesis_refs ?? [];
  const errors = [];
  if (!uniqueCanonicalRefs(facts) || !uniqueCanonicalRefs(hypotheses)
    || facts.some((fact) => hypotheses.some((hypothesis) => canonicalEqual(fact, hypothesis)))) {
    errors.push(issue('generated_schema_mismatch', 'accepted_fact_refs', 'Merged knowledge facts and hypotheses must be unique, ordered and disjoint.'));
  }
  if (Number.isInteger(value?.state_version_before)
    && Number.isInteger(value?.state_version_after)
    && value.state_version_after !== value.state_version_before + (value.state_changed ? 1 : 0)) {
    errors.push(issue('temporal_change_set_conflict', 'state_version_after', 'Knowledge merge state version must advance exactly once only when state changed.'));
  }
  const proposal = value?.proposal;
  if (proposal) {
    const expectedVersion = proposal.expected_state_versions?.entries?.find((entry) =>
      canonicalEqual(entry.entity_ref, value?.owner_ref))?.state_version;
    const union = (left, right) => {
      const byKey = new Map([...left, ...right].map((entry) => [entityRefKey(entry), entry]));
      return [...byKey.values()].sort((a, b) => entityRefKey(a).localeCompare(entityRefKey(b), 'en'));
    };
    const expectedFacts = union(value?.state_before_fact_refs ?? [], proposal.fact_refs ?? []);
    const expectedHypotheses = union(value?.state_before_hypothesis_refs ?? [], proposal.hypothesis_refs ?? []);
    const changed = !canonicalEqual(expectedFacts, value?.state_before_fact_refs ?? [])
      || !canonicalEqual(expectedHypotheses, value?.state_before_hypothesis_refs ?? []);
    if (value?.proposal_id !== proposal.proposal_id
      || !canonicalEqual(value?.owner_ref, proposal.owner_ref)
      || !canonicalEqual(value?.source_ref, proposal.source_ref)
      || !canonicalEqual(value?.dependency_pins, proposal.dependency_pins)
      || expectedVersion !== value?.state_version_before
      || !canonicalEqual(value?.accepted_fact_refs, expectedFacts)
      || !canonicalEqual(value?.accepted_hypothesis_refs, expectedHypotheses)
      || value?.state_changed !== changed) {
      errors.push(issue('temporal_change_set_conflict', 'accepted_fact_refs', 'Knowledge merge result must be the exact deterministic union of its sealed proposal and state-before snapshot.'));
    }
  }
  if (value?.result_digest != null) {
    const { result_digest: _digest, ...payload } = value;
    if (value.result_digest !== computeSpatialV3CanonicalDigest(payload)) {
      errors.push(issue('generated_schema_mismatch', 'result_digest', 'Knowledge merge result digest must cover the complete result.'));
    }
  }
  return errors;
}

export function validateReactionHandoffContract(contractName, value) {
  const validators = {
    npc_decision_option: validateNpcDecisionOption,
    npc_decision_trace: validateNpcDecisionTrace,
    approved_decision_command_snapshot: validateApprovedDecisionCommandSnapshot,
    npc_reaction_handler_input_snapshot: validateNpcReactionHandlerInputSnapshot,
    npc_reaction_consequence_request: validateNpcReactionConsequenceRequest,
    npc_reaction_consequence_proposal: validateNpcReactionConsequenceProposal,
    npc_reaction_effect_snapshot: validateNpcReactionEffectSnapshot,
    knowledge_memory_delta_proposal: validateKnowledgeMemoryDeltaProposal,
    knowledge_memory_merge_result: validateKnowledgeMemoryMergeResult
  };
  return validators[contractName]?.(value) ?? [];
}
