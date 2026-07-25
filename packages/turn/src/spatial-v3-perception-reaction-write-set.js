import {
  computeSpatialV3CanonicalDigest,
  createSpatialV3TypedError,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';

const stable = (value) => typeof value === 'string' && value.trim().length > 0;
const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const same = (left, right) =>
  computeSpatialV3CanonicalDigest(left) === computeSpatialV3CanonicalDigest(right);
const partyPin = (partyId) => ({
  dependency_role: 'planning_context_dependency',
  entity_ref: { entity_kind: 'party_change_set', entity_id: partyId || 'unknown' },
  version_pin: { pin_kind: 'party_state_version', state_version: 1 }
});
function fail(code, partyId, reason) {
  const pin = partyPin(partyId);
  return freeze({
    ok: false,
    error: createSpatialV3TypedError(code, {
      subject_ref: {
        entity_kind: 'party_change_set',
        entity_id: partyId || 'unknown'
      },
      dependency_pins: {
        pins: [pin],
        canonical_digest: computeSpatialV3CanonicalDigest([pin]).replace('sha256:', '')
      },
      diagnostics: { reason }
    })
  });
}
const timeColumns = (prefix, timestamp) => ({
  [`${prefix}_whole_minutes`]: timestamp.whole_minutes,
  [`${prefix}_subminute_numerator`]: timestamp.subminute_numerator,
  [`${prefix}_subminute_denominator`]: timestamp.subminute_denominator
});
const write = (target_table, id, record) => ({
  target_schema: 'party_runtime',
  target_table,
  id,
  record
});
const refKey = (ref) => `${ref.entity_kind}\u0000${ref.entity_id}`;

/**
 * Maps already validated domain results to the existing target persistence
 * tables. It performs no reads and does not create facts, decisions or time.
 */
export function buildSpatialV3PerceptionReactionWriteSet(input = {}) {
  const {
    party_id,
    change_set_id,
    idempotency_record_id,
    perception_result,
    perception_replay_evidence,
    knowledge_merge_result,
    reaction_option_proposal = null,
    reaction_proposal = null
  } = input;
  if (![party_id, change_set_id, idempotency_record_id].every(stable)) {
    return fail('generated_schema_mismatch', party_id, 'party, change set and idempotency identities are required');
  }
  for (const [contractName, value] of [
    ['perception_result', perception_result],
    ['perception_replay_evidence', perception_replay_evidence],
    ['knowledge_memory_merge_result', knowledge_merge_result]
  ]) {
    const errors = validateSpatialV3Contract(contractName, value);
    if (errors.length) return fail(errors[0].code, party_id, `${contractName}: ${errors[0].message}`);
  }
  if (reaction_proposal !== null) {
    const errors = validateSpatialV3Contract(
      'npc_reaction_consequence_proposal',
      reaction_proposal
    );
    if (errors.length) return fail(errors[0].code, party_id, `reaction proposal: ${errors[0].message}`);
  }
  if (reaction_option_proposal !== null) {
    const errors = validateSpatialV3Contract(
      'npc_reaction_option_set_proposal',
      reaction_option_proposal
    );
    if (errors.length) {
      return fail(
        errors[0].code,
        party_id,
        `reaction option proposal: ${errors[0].message}`
      );
    }
  }
  const proposal = knowledge_merge_result.proposal;
  const npcRef = knowledge_merge_result.owner_ref;
  if (npcRef?.entity_kind !== 'npc'
    || !same(proposal.source_perception, perception_result)
    || perception_replay_evidence.perception_id !== perception_result.perception_id
    || perception_replay_evidence.perception_digest !== perception_result.canonical_digest
    || knowledge_merge_result.source_ref?.entity_id !== perception_result.perception_id) {
    return fail('perception_policy_gap', party_id, 'perception replay and knowledge merge must share one complete causal result');
  }
  if (reaction_proposal !== null
    && (!same(
      reaction_proposal.request_snapshot.consequence_input_snapshot.source_perception,
      perception_result
    ) || reaction_proposal.npc_ref?.entity_kind !== 'npc'
      || reaction_proposal.npc_ref.entity_id !== npcRef.entity_id)) {
    return fail('npc_decision_policy_gap', party_id, 'reaction must share the exact perception and NPC knowledge owner');
  }
  if (reaction_option_proposal !== null
    && (reaction_option_proposal.source_perception_ref?.entity_id
      !== perception_result.perception_id
      || reaction_option_proposal.context_snapshot?.source_perception
        ?.canonical_digest !== perception_result.canonical_digest
      || reaction_option_proposal.decision_request?.npc_ref?.entity_kind
        !== 'npc'
      || reaction_option_proposal.decision_request.npc_ref.entity_id
        !== npcRef.entity_id
      || (reaction_proposal !== null
        && reaction_proposal.request_id !== reaction_option_proposal.request_id))) {
    return fail(
      'npc_decision_policy_gap',
      party_id,
      'reaction option proposal must share the exact perception, NPC and consequence request'
    );
  }

  const appends = [];
  const inserts = [];
  const updates = [];
  const expected_state_versions = [];
  const physical_keys = [];
  const add = (mode, row) => {
    ({ appends, inserts, updates })[mode].push(row);
    physical_keys.push(`party_runtime.${row.target_table}:${row.id}`);
  };

  add('appends', write('party_perception_records', perception_result.perception_id, {
    perception_id: perception_result.perception_id,
    party_id,
    event_id: perception_result.event_ref.entity_id,
    perceiver_kind: perception_result.perceiver_ref.entity_kind,
    perceiver_id: perception_result.perceiver_ref.entity_id,
    result_kind: perception_result.result,
    ...timeColumns('perceived_at', perception_result.perceived_at),
    recognition_policy_ref: perception_result.recognition_policy_ref,
    visibility_policy_ref: perception_result.visibility_policy_ref,
    canonical_digest: perception_result.canonical_digest,
    signal_refs: perception_result.signal_refs,
    knowledge_update_refs: perception_result.knowledge_update_refs,
    change_set_id,
    idempotency_record_id
  }));
  add('appends', write(
    'party_perception_replay_evidence',
    perception_replay_evidence.perception_id,
    {
      ...perception_replay_evidence,
      party_id,
      change_set_id
    }
  ));

  if (reaction_option_proposal !== null) {
    const request = reaction_option_proposal.decision_request;
    add('appends', write(
      'party_npc_reaction_option_proposals',
      reaction_option_proposal.request_id,
      {
        request_id: reaction_option_proposal.request_id,
        party_id,
        npc_id: request.npc_ref.entity_id,
        source_perception_id: perception_result.perception_id,
        state_version: request.state_version,
        options_digest: request.options_digest,
        proposal: reaction_option_proposal,
        dependency_pins: request.dependency_pins,
        canonical_digest: reaction_option_proposal.canonical_digest,
        idempotency_key:
          `reaction-options:${reaction_option_proposal.request_id}:${reaction_option_proposal.canonical_digest}`,
        change_set_id
      }
    ));
  }

  if (reaction_proposal !== null) {
    const request = reaction_proposal.request_snapshot;
    const trace = request.decision_trace;
    const traceErrors = validateSpatialV3Contract('npc_decision_trace', trace);
    if (traceErrors.length) {
      return fail(traceErrors[0].code, party_id, `decision trace: ${traceErrors[0].message}`);
    }
    add('appends', write('party_npc_decision_traces', trace.request_id, {
      request_id: trace.request_id,
      party_id,
      npc_id: request.npc_ref.entity_id,
      state_version: trace.state_version,
      option_id: trace.option_id,
      command_token: trace.command_token,
      options_digest: trace.options_digest,
      status: trace.status,
      ...timeColumns('validated_at', trace.validated_at),
      idempotency_key: trace.idempotency_key,
      change_set_id,
      trace_digest: trace.trace_digest
    }));
    add('appends', write('party_npc_reaction_consequences', reaction_proposal.request_id, {
      request_id: reaction_proposal.request_id,
      party_id,
      npc_id: reaction_proposal.npc_ref.entity_id,
      perception_id: perception_result.perception_id,
      option_id: reaction_proposal.option_id,
      command_ref: reaction_proposal.command_ref,
      handler_id: reaction_proposal.handler_id,
      consequence_contract_name: reaction_proposal.consequence_contract_name,
      consequence_payload: reaction_proposal.consequence_payload,
      state_version: reaction_proposal.state_version,
      ...timeColumns('proposed_at', reaction_proposal.proposed_at),
      dependency_pins: reaction_proposal.dependency_pins,
      canonical_input_digest: reaction_proposal.canonical_input_digest,
      canonical_digest: reaction_proposal.canonical_digest,
      change_set_id,
      idempotency_key: request.idempotency_key
    }));
  }

  add('appends', write(
    'party_npc_knowledge_merge_results',
    knowledge_merge_result.proposal_id,
    {
      proposal_id: knowledge_merge_result.proposal_id,
      party_id,
      npc_id: npcRef.entity_id,
      source_perception_id: perception_result.perception_id,
      state_version_before: knowledge_merge_result.state_version_before,
      state_version_after: knowledge_merge_result.state_version_after,
      state_changed: knowledge_merge_result.state_changed,
      proposal,
      state_before_fact_refs: knowledge_merge_result.state_before_fact_refs,
      state_before_hypothesis_refs: knowledge_merge_result.state_before_hypothesis_refs,
      accepted_fact_refs: knowledge_merge_result.accepted_fact_refs,
      accepted_hypothesis_refs: knowledge_merge_result.accepted_hypothesis_refs,
      dependency_pins: knowledge_merge_result.dependency_pins,
      result_digest: knowledge_merge_result.result_digest,
      change_set_id,
      idempotency_key: `knowledge-merge:${knowledge_merge_result.proposal_id}:${knowledge_merge_result.result_digest}`
    }
  ));

  const before = new Set([
    ...knowledge_merge_result.state_before_fact_refs,
    ...knowledge_merge_result.state_before_hypothesis_refs
  ].map(refKey));
  for (const [classification, refs] of [
    ['fact', knowledge_merge_result.accepted_fact_refs],
    ['hypothesis', knowledge_merge_result.accepted_hypothesis_refs]
  ]) {
    for (const ref of refs) {
      if (before.has(refKey(ref))) continue;
      const id = `${npcRef.entity_id}:${ref.entity_kind}:${ref.entity_id}`;
      add('inserts', write('party_npc_knowledge', id, {
        party_id,
        npc_id: npcRef.entity_id,
        fact_id: ref.entity_id,
        knowledge_state: classification,
        target_contract_version: '4.4.0-target.1',
        knowledge_ref_kind: ref.entity_kind,
        knowledge_classification: classification,
        source_perception_id: perception_result.perception_id,
        proposal_id: knowledge_merge_result.proposal_id,
        merge_state_version: knowledge_merge_result.state_version_after,
        result_digest: knowledge_merge_result.result_digest,
        dependency_pins: knowledge_merge_result.dependency_pins,
        updated_change_set_id: change_set_id
      }));
    }
  }
  if (knowledge_merge_result.state_changed) {
    const id = `${party_id}:${npcRef.entity_id}`;
    add('updates', write('party_npc_knowledge_merge_states', id, {
      party_id,
      npc_id: npcRef.entity_id,
      state_version: knowledge_merge_result.state_version_before,
      last_proposal_id: knowledge_merge_result.proposal_id,
      last_result_digest: knowledge_merge_result.result_digest,
      updated_change_set_id: change_set_id
    }));
    expected_state_versions.push({
      target_table: 'party_npc_knowledge_merge_states',
      id,
      state_version: knowledge_merge_result.state_version_before
    });
  }

  return freeze({
    ok: true,
    write_set: { appends, inserts, updates },
    expected_state_versions,
    physical_keys
  });
}

/**
 * Persists only the terminal half of a previously committed multi-option
 * reaction. Perception, knowledge and the option set are immutable inputs and
 * are deliberately not appended again.
 */
export function buildSpatialV3ReactionDecisionCompletionWriteSet(input = {}) {
  const {
    party_id,
    change_set_id,
    persisted_perception_result,
    persisted_reaction_option_proposal,
    reaction_proposal
  } = input;
  if (![party_id, change_set_id].every(stable)) {
    return fail(
      'generated_schema_mismatch',
      party_id,
      'party and completion change-set identities are required'
    );
  }
  for (const [contractName, value] of [
    ['perception_result', persisted_perception_result],
    ['npc_reaction_option_set_proposal', persisted_reaction_option_proposal],
    ['npc_reaction_consequence_proposal', reaction_proposal]
  ]) {
    const errors = validateSpatialV3Contract(contractName, value);
    if (errors.length) {
      return fail(errors[0].code, party_id, `${contractName}: ${errors[0].message}`);
    }
  }
  const request = reaction_proposal.request_snapshot;
  const trace = request.decision_trace;
  const optionRequest = persisted_reaction_option_proposal.decision_request;
  const traceErrors = validateSpatialV3Contract('npc_decision_trace', trace);
  if (traceErrors.length) {
    return fail(
      traceErrors[0].code,
      party_id,
      `npc_decision_trace: ${traceErrors[0].message}`
    );
  }
  const selected = optionRequest.options.find((option) =>
    option.option_id === trace.option_id
    && option.command_token === trace.command_token);
  if (!same(
    persisted_reaction_option_proposal.context_snapshot.source_perception,
    persisted_perception_result
  )
    || persisted_reaction_option_proposal.source_perception_ref.entity_id
      !== persisted_perception_result.perception_id
    || reaction_proposal.request_id !== persisted_reaction_option_proposal.request_id
    || request.request_id !== persisted_reaction_option_proposal.request_id
    || request.npc_ref.entity_kind !== 'npc'
    || request.npc_ref.entity_id !== optionRequest.npc_ref.entity_id
    || trace.request_id !== optionRequest.request_id
    || trace.state_version !== optionRequest.state_version
    || trace.options_digest !== optionRequest.options_digest
    || reaction_proposal.state_version !== optionRequest.state_version
    || !selected
    || !same(
      request.consequence_input_snapshot.source_perception,
      persisted_perception_result
    )) {
    return fail(
      'npc_decision_policy_gap',
      party_id,
      'completion must bind the exact persisted option set, perception, NPC, state and selection'
    );
  }
  const appends = [
    write('party_npc_decision_traces', trace.request_id, {
      request_id: trace.request_id,
      party_id,
      npc_id: request.npc_ref.entity_id,
      state_version: trace.state_version,
      option_id: trace.option_id,
      command_token: trace.command_token,
      options_digest: trace.options_digest,
      status: trace.status,
      ...timeColumns('validated_at', trace.validated_at),
      idempotency_key: trace.idempotency_key,
      change_set_id,
      trace_digest: trace.trace_digest
    }),
    write('party_npc_reaction_consequences', reaction_proposal.request_id, {
      request_id: reaction_proposal.request_id,
      party_id,
      npc_id: reaction_proposal.npc_ref.entity_id,
      perception_id: persisted_perception_result.perception_id,
      option_id: reaction_proposal.option_id,
      command_ref: reaction_proposal.command_ref,
      handler_id: reaction_proposal.handler_id,
      consequence_contract_name: reaction_proposal.consequence_contract_name,
      consequence_payload: reaction_proposal.consequence_payload,
      state_version: reaction_proposal.state_version,
      ...timeColumns('proposed_at', reaction_proposal.proposed_at),
      dependency_pins: reaction_proposal.dependency_pins,
      canonical_input_digest: reaction_proposal.canonical_input_digest,
      canonical_digest: reaction_proposal.canonical_digest,
      change_set_id,
      idempotency_key: request.idempotency_key
    })
  ];
  return freeze({
    ok: true,
    write_set: { appends, inserts: [], updates: [] },
    expected_state_versions: [],
    physical_keys: appends.map((row) =>
      `party_runtime.${row.target_table}:${row.id}`)
  });
}
