import {
  computeSpatialV3CanonicalDigest,
  createSpatialV3TypedError,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import {
  decideBoundedNpcAction,
  proposeNpcPerception,
  proposeNpcReactionOptions
} from '@rus/npc-runtime';
import { mergeFormalKnowledgeMemory } from '@rus/visibility-knowledge-memory';
import { resolveSpatialV3NpcReaction } from './spatial-v3-reaction-handlers.js';

const clone = (value) => structuredClone(value);
const seal = (value, field = 'canonical_digest') => ({
  ...value,
  [field]: computeSpatialV3CanonicalDigest(value)
});

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function fail(code, message, subjectRef, dependencyPins, diagnostics = {}) {
  const fallbackPin = {
    dependency_role: 'planning_context_dependency',
    entity_ref: subjectRef ?? {
      entity_kind: 'party_change_set',
      entity_id: 'perception-reaction-cycle'
    },
    version_pin: {
      pin_kind: 'party_state_version',
      state_version: 1
    }
  };
  const pins = dependencyPins?.pins ? dependencyPins : {
    pins: [fallbackPin],
    canonical_digest:
      computeSpatialV3CanonicalDigest([fallbackPin]).replace('sha256:', '')
  };
  return freeze({
    ok: false,
    error: createSpatialV3TypedError(code, {
      subject_ref: subjectRef ?? fallbackPin.entity_ref,
      dependency_pins: pins,
      diagnostics: { message, ...diagnostics }
    })
  });
}

function findSelectedOption(request, trace) {
  return request.options.find((option) =>
    option.option_id === trace.option_id
    && option.command_token === trace.command_token);
}

function findCommandRecord(policy, option) {
  return policy.approved_command_records.find((record) =>
    record.command_ref.entity_ref.entity_kind
      === option.command_ref.entity_ref.entity_kind
    && record.command_ref.entity_ref.entity_id
      === option.command_ref.entity_ref.entity_id
    && record.command_ref.authoring_version
      === option.command_ref.authoring_version);
}

function buildReactionRequest({
  option,
  trace,
  commandRecord,
  context,
  decisionRequest
}) {
  const handlerInput = seal({
    source_perception: context.source_perception,
    reaction_scope_ref: context.reaction_scope_ref,
    observed_preconditions_digest: option.preconditions_digest,
    dependency_pins: decisionRequest.dependency_pins
  });
  const payload = {
    request_id: decisionRequest.request_id,
    npc_ref: decisionRequest.npc_ref,
    selected_option: option,
    decision_trace: trace,
    command_record: commandRecord,
    consequence_input_snapshot: handlerInput,
    current_state_version: decisionRequest.state_version,
    executed_at: context.source_perception.perceived_at,
    dependency_pins: decisionRequest.dependency_pins,
    idempotency_key: [
      'npc-reaction',
      decisionRequest.request_id,
      decisionRequest.state_version,
      trace.trace_digest,
      commandRecord.canonical_digest
    ].join(':')
  };
  return seal(payload, 'canonical_input_digest');
}

function resolvePreparedCycle({
  perception_request,
  reaction_policy_snapshot,
  knowledge_state_before,
  reaction_context_snapshot,
  bounded_selection = null,
  persisted_perception = null,
  persisted_perception_replay_evidence = null,
  persisted_reaction_option_proposal = null,
  persisted_decision_trace = null,
  persisted_reaction_proposal = null
} = {}) {
  const perceived = proposeNpcPerception({
    request: perception_request,
    persisted_perception,
    persisted_replay_evidence: persisted_perception_replay_evidence
  });
  if (!perceived.ok) return perceived;

  const knowledge = mergeFormalKnowledgeMemory({
    proposal: perceived.knowledge_proposal,
    state_before_fact_refs: knowledge_state_before?.fact_refs,
    state_before_hypothesis_refs: knowledge_state_before?.hypothesis_refs,
    state_version_before: knowledge_state_before?.state_version
  });
  if (!knowledge.ok) {
    return fail(
      knowledge.error_code,
      knowledge.errors[0],
      perceived.perception.perceiver_ref,
      perception_request.dependency_pins
    );
  }

  const context = reaction_context_snapshot;
  const contextErrors = validateSpatialV3Contract(
    'npc_reaction_option_context_snapshot',
    context
  );
  if (contextErrors.length > 0
    || context.source_perception.canonical_digest
      !== perceived.perception.canonical_digest) {
    return fail(
      contextErrors[0]?.code ?? 'perception_policy_gap',
      contextErrors[0]?.message
        ?? 'Reaction context is detached from the causal perception.',
      perceived.perception.perceiver_ref,
      perception_request.dependency_pins
    );
  }

  const options = proposeNpcReactionOptions({
    context_snapshot: context,
    policy_snapshot: reaction_policy_snapshot,
    persisted_proposal: persisted_reaction_option_proposal
  });
  if (!options.ok) return options;

  if (options.decision_mode === 'bounded_selection'
    && persisted_decision_trace === null
    && bounded_selection === null) {
    return freeze({
      ok: true,
      status: 'awaiting_bounded_decision',
      decision_mode: options.decision_mode,
      perception_result: perceived.perception,
      perception_replay_evidence: perceived.perception_evidence,
      knowledge_proposal: perceived.knowledge_proposal,
      knowledge_merge_result: knowledge.result,
      reaction_context_snapshot: context,
      reaction_option_proposal: options.proposal,
      decision_request: options.decision_request,
      decision_trace: null,
      reaction_proposal: null
    });
  }

  const observedOption = persisted_decision_trace === null
    ? options.decision_request.options.find((option) =>
        options.decision_mode === 'code_owned_without_llm'
          || (option.option_id === bounded_selection?.option_id
            && option.command_token === bounded_selection?.command_token))
    : findSelectedOption(options.decision_request, persisted_decision_trace);
  const decision = decideBoundedNpcAction({
    request: options.decision_request,
    selection: bounded_selection,
    current_state_version: context.npc_state_version,
    observed_preconditions_digest: observedOption?.preconditions_digest ?? null,
    validated_at: perceived.perception.perceived_at,
    persisted_trace: persisted_decision_trace
  });
  if (!decision.ok) return decision;

  const selectedOption = findSelectedOption(
    options.decision_request,
    decision.trace
  );
  const commandRecord = findCommandRecord(
    reaction_policy_snapshot,
    selectedOption
  );
  if (!selectedOption || !commandRecord) {
    return fail(
      'npc_decision_policy_gap',
      'Validated selection has no exact approved command record.',
      perceived.perception.perceiver_ref,
      options.decision_request.dependency_pins
    );
  }
  const reactionRequest = buildReactionRequest({
    option: selectedOption,
    trace: decision.trace,
    commandRecord,
    context,
    decisionRequest: options.decision_request
  });
  const reactionRequestErrors = validateSpatialV3Contract(
    'npc_reaction_consequence_request',
    reactionRequest
  );
  if (reactionRequestErrors.length > 0) {
    return fail(
      reactionRequestErrors[0].code,
      reactionRequestErrors[0].message,
      perceived.perception.perceiver_ref,
      options.decision_request.dependency_pins
    );
  }
  const reaction = resolveSpatialV3NpcReaction({
    request: reactionRequest,
    persisted_proposal: persisted_reaction_proposal
  });
  if (!reaction.ok) return reaction;

  return freeze({
    ok: true,
    status: 'completed',
    decision_mode: options.decision_mode,
    perception_result: perceived.perception,
    perception_replay_evidence: perceived.perception_evidence,
    knowledge_proposal: perceived.knowledge_proposal,
    knowledge_merge_result: knowledge.result,
    reaction_context_snapshot: context,
    reaction_option_proposal: options.proposal,
    decision_request: options.decision_request,
    decision_trace: decision.trace,
    reaction_request: reactionRequest,
    reaction_proposal: reaction.proposal
  });
}

/**
 * Synchronous pure participant for a temporal boundary. All state needed to
 * derive the reaction context is already sealed by turn orchestration.
 */
export function resolveSpatialV3PerceptionReactionBoundary(input = {}) {
  return resolvePreparedCycle(input);
}

/**
 * Turn-owned orchestration of existing domain owners. The function performs no
 * reads or writes: external context/decision ports return formal inputs, and
 * every result remains a proposal until game-server commits one write plan.
 */
export async function resolveSpatialV3PerceptionReactionCycle({
  perception_request,
  reaction_policy_snapshot,
  knowledge_state_before,
  build_reaction_context,
  select_bounded_option = null,
  persisted_perception = null,
  persisted_perception_replay_evidence = null,
  persisted_reaction_option_proposal = null,
  persisted_decision_trace = null,
  persisted_reaction_proposal = null
} = {}) {
  if (typeof build_reaction_context !== 'function') {
    return fail(
      'perception_policy_gap',
      'A code-owned reaction context builder is required.',
      perception_request?.perceiver_ref,
      perception_request?.dependency_pins
    );
  }
  const perceived = proposeNpcPerception({
    request: perception_request,
    persisted_perception,
    persisted_replay_evidence: persisted_perception_replay_evidence
  });
  if (!perceived.ok) return perceived;
  let context;
  try {
    context = await build_reaction_context(freeze({
      perception_result: clone(perceived.perception),
      perception_request: clone(perception_request),
      dependency_pins: clone(perception_request.dependency_pins)
    }));
  } catch (cause) {
    return fail(
      'npc_decision_policy_gap',
      'Reaction context builder rejected the formal perception.',
      perceived.perception.perceiver_ref,
      perception_request.dependency_pins,
      { cause: cause?.message ?? 'unknown' }
    );
  }
  const prepared = {
    perception_request,
    reaction_policy_snapshot,
    knowledge_state_before,
    reaction_context_snapshot: context,
    persisted_perception,
    persisted_perception_replay_evidence,
    persisted_reaction_option_proposal,
    persisted_decision_trace,
    persisted_reaction_proposal
  };
  const first = resolvePreparedCycle(prepared);
  if (!first.ok
    || first.status !== 'awaiting_bounded_decision'
    || typeof select_bounded_option !== 'function') {
    return first;
  }
  let selection;
  try {
    selection = await select_bounded_option(freeze(clone(first.decision_request)));
  } catch (cause) {
    return fail(
      'npc_decision_policy_gap',
      'Bounded decision service failed before returning a closed selection.',
      perceived.perception.perceiver_ref,
      first.decision_request.dependency_pins,
      { cause: cause?.message ?? 'unknown' }
    );
  }
  return resolvePreparedCycle({
    ...prepared,
    bounded_selection: selection
  });
}
