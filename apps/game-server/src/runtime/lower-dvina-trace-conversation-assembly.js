import { npcConversationCandidates, requiredNpcConversationCandidate,
  requiredPlayerConversationCandidate } from
  './lower-dvina-trace-phase-2-llm-prompts.js';

const INVALID_OPERATION_CHOICE = Symbol('invalid operation choice');

export function assemblePlayerConversationPlan(choice, request) {
  let assembled = assembleConversationPlan(choice,
    requiredPlayerConversationCandidate(request), {
      schema: 'player_conversation_contribution_plan_v1',
      request_id: request.request_id,
      conversation_id: request.conversation_id,
      state_version: request.state_version,
      speaker_ref: structuredClone(request.speaker_ref)
    });
  if (assembled.contribution_kind !== 'speech') return assembled;
  if (assembled.input_mode === 'verbatim'
    && typeof request.player_safe_context?.verbatim_utterance_text === 'string') {
    assembled = { ...assembled, speech: { ...assembled.speech,
      utterance_text: request.player_safe_context.verbatim_utterance_text } };
  }
  const required = request.player_safe_context?.required_intended_addressee_refs;
  const target = request.player_safe_context?.target_npc_ref;
  const intended = Array.isArray(required) && required.length > 0
    ? structuredClone(required)
    : target?.entity_kind === 'npc' && typeof target.entity_id === 'string'
      ? [structuredClone(target)] : null;
  if (intended === null) return assembled;
  const primary = intended.some((reference) => sameRef(
    reference, assembled.primary_addressee_ref))
    ? assembled.primary_addressee_ref : intended[0];
  return { ...assembled, primary_addressee_ref: structuredClone(primary),
    intended_addressee_refs: intended };
}

export function assembleNpcConversationPlan(choice, request) {
  const requiredCandidate = requiredNpcConversationCandidate(request);
  const admittedCandidate = requiredCandidate
    ?? matchingNpcConversationCandidate(choice, request);
  return assembleConversationPlan(choice, admittedCandidate, {
    schema: 'conversation_contribution_plan_v1',
    request_id: request.request_id,
    boundary_id: request.boundary_id,
    conversation_id: request.conversation_id,
    exchange_id: request.exchange_id,
    state_version: request.state_version,
    speaker_ref: structuredClone(request.npc_ref)
  }, requiredCandidate == null && admittedCandidate != null);
}

function assembleConversationPlan(choice, candidate, envelope,
  preserveNpcSemantics = false) {
  const semantic = structuredClone(choice);
  let bound = candidate == null
    ? semantic : bindKnownConversationValues(candidate, semantic);
  if (preserveNpcSemantics) bound = preserveNpcConversationSemantics(
    bound, semantic);
  return { ...bound, ...envelope };
}

function matchingNpcConversationCandidate(choice, request) {
  const operation = operationChoice(choice?.supporting_operations);
  if (operation === INVALID_OPERATION_CHOICE) return null;
  const matches = npcConversationCandidates(request).filter((candidate) =>
    candidate.contribution_kind === choice?.contribution_kind
    && singleOperation(candidate) === operation);
  return matches.length === 1 ? matches[0] : null;
}

function operationChoice(operations) {
  if (!Array.isArray(operations) || operations.length > 1) {
    return INVALID_OPERATION_CHOICE;
  }
  if (operations.length === 0) return null;
  return typeof operations[0]?.op === 'string' && operations[0].op.trim()
    ? operations[0].op : INVALID_OPERATION_CHOICE;
}

function singleOperation(candidate) {
  return candidate.supporting_operations.length === 1
    ? candidate.supporting_operations[0].op : null;
}

function sameRef(left, right) {
  return left?.entity_kind === right?.entity_kind
    && left?.entity_id === right?.entity_id;
}

function preserveNpcConversationSemantics(bound, semantic) {
  return {
    ...bound,
    ...(semantic?.speech === null || typeof semantic?.speech !== 'object'
      ? {} : { speech: structuredClone(semantic.speech) }),
    ...(semantic?.interpretation === null
      || typeof semantic?.interpretation !== 'object'
      ? {} : { interpretation: structuredClone(semantic.interpretation) }),
    ...(typeof semantic?.reason === 'string'
      ? { reason: semantic.reason } : {}),
    ...(bound?.handoff === null || typeof semantic?.handoff?.intent !== 'string'
      ? {} : { handoff: { ...bound.handoff, intent: semantic.handoff.intent } })
  };
}

function bindKnownConversationValues(template, semantic) {
  if (typeof template === 'string' && template.startsWith('<')) return semantic;
  if (Array.isArray(template)) {
    if (template.length === 0) return [];
    return template.map((value, index) =>
      bindKnownConversationValues(value, semantic?.[index]));
  }
  if (template !== null && typeof template === 'object') {
    return Object.fromEntries(Object.entries(template).map(([key, value]) => [
      key, bindKnownConversationValues(value, semantic?.[key])
    ]));
  }
  return structuredClone(template);
}
