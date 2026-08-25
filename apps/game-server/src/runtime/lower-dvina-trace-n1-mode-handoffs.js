import { buildConversationSession, npcSafeSnapshotHasEntityEvidence,
  validateConversationSession } from '@rus/npc-runtime';
import { createCombatSession } from '@rus/turn';
import { validateCombatSession } from '@rus/contracts/combat-v1';

const MODE_OPERATIONS = new Set([
  'emit_interaction', 'request_conversation', 'request_combat'
]);
const HANDOFF_SCHEMA = 'rus.lower_dvina_trace_n1_mode_handoff.v1';

export function npcSafeModeCapabilities({ modeCapabilities, npcRef,
  visibleTargetRefs }) {
  return (Array.isArray(modeCapabilities) ? modeCapabilities : []).flatMap((entry) => {
    if (!MODE_OPERATIONS.has(entry?.operation) || entry?.capability == null
        || typeof entry.execute !== 'function') return [];
    const ownerTargets = Array.isArray(entry.capability.target_actor_refs)
      ? new Set(entry.capability.target_actor_refs) : null;
    const exposedTargets = visibleTargetRefs.filter((ref) =>
      ownerTargets == null || ownerTargets.has(ref));
    if (exposedTargets.length === 0) return [];
    const visible = new Set(exposedTargets);
    const targetsAllowed = (operation) => operation?.actor_ref === npcRef
      && Array.isArray(operation.target_actor_refs)
      && operation.target_actor_refs.length > 0
      && operation.target_actor_refs.every((ref) => visible.has(ref))
      && (entry.operation !== 'request_combat'
        || operation.target_actor_refs.length === 1)
      && (entry.operation !== 'emit_interaction'
        || !Array.isArray(entry.capability.instrument_refs)
        || Array.isArray(operation.instrument_refs)
          && operation.instrument_refs.every((ref) =>
            entry.capability.instrument_refs.includes(ref)));
    return [{ ...entry, capability: { ...structuredClone(entry.capability),
      target_actor_refs: exposedTargets },
    supports: (input) => targetsAllowed(input?.operation)
      && (typeof entry.supports !== 'function' || entry.supports(input)) }];
  });
}

export function createLowerDvinaTraceN1ModeOwnerCapabilities({ npc,
  state, visibleTargetRefs = [], availableResourceRefs = [] } = {}) {
  const handoff = (operation) => (execution) => modeOwnerResult({
    execution, operation, state, npc
  });
  const conversationAvailable = !(state?.conversation_sessions ?? []).some(
    (session) => session.status !== 'ended'
      && session.active_participant_refs?.some(
        (participant) => participant.entity_id === npc?.instance_id));
  const combatAvailable = !(state?.combat_sessions ?? []).some(
    ({ status }) => status !== 'ended');
  return [{ operation: 'emit_interaction', capability: { owner: '@rus/turn',
    instrument_refs: [...availableResourceRefs] },
    execute: handoff('emit_interaction') },
  ...(conversationAvailable ? [{ operation: 'request_conversation',
    capability: { owner: '@rus/turn' },
    execute: handoff('request_conversation') }] : []),
  ...(!combatAvailable || visibleTargetRefs.length === 0 ? [] : [{
    operation: 'request_combat',
    capability: { owner: '@rus/turn' },
    execute: handoff('request_combat') }])];
}

export function npcSafeActorRefs(npc, state = null) {
  const present = npc?.perception_snapshot?.present_actors ?? [];
  return [...new Set(present.map(({ actor_ref: ref }) => ref).filter((ref) =>
    npcSafeSnapshotHasEntityEvidence({ entity_ref: ref,
      perception_snapshot: npc.perception_snapshot,
      knowledge_snapshot: npc.knowledge_snapshot })))]
    .filter((ref) => ref !== npc.instance_id
      && (state == null || ref === state.actor_id
        || state.npcs?.some(({ instance_id }) => instance_id === ref)));
}

export function projectLowerDvinaTraceN1ModeHandoff({ state,
  consequenceFragment, semanticOperation, changeSetId }) {
  const change = lowerDvinaTraceN1ModeHandoffChange(consequenceFragment);
  if (change == null) return structuredClone(state);
  const handoff = change.mode_handoff;
  if (!validModeHandoffChange(change, semanticOperation, changeSetId)) {
    fail('TRACE_N1_MODE_HANDOFF_INVALID');
  }
  const next = structuredClone(state);
  if (handoff.mode === 'interaction') {
    next.interactions = appendById(next.interactions, handoff.result,
      'interaction_id');
  } else if (handoff.mode === 'conversation') {
    next.conversation_sessions = appendById(next.conversation_sessions,
      handoff.result, 'conversation_id');
    if (targetIds(handoff.operation).includes(next.actor_id)) {
      next.player_response_boundary = { kind: 'conversation',
        conversation_id: handoff.result.conversation_id };
    }
  } else {
    next.combat_sessions = appendById(next.combat_sessions, handoff.result,
      'combat_id');
    if (targetIds(handoff.operation).includes(next.actor_id)) {
      next.player_response_boundary = { kind: 'combat',
        combat_id: handoff.result.combat_id };
    }
  }
  return next;
}

export function lowerDvinaTraceN1ModeHandoffChange(consequenceFragment) {
  const matches = (consequenceFragment?.state_changes ?? []).filter(
    (change) => change?.mode_handoff?.schema === HANDOFF_SCHEMA);
  if (matches.length > 1) fail('TRACE_N1_MODE_HANDOFF_INVALID');
  return matches[0] ?? null;
}

function modeOwnerResult({ execution, operation, state, npc }) {
  const semanticOperation = execution.operation;
  if (semanticOperation?.op !== operation
      || semanticOperation.actor_ref !== npc?.instance_id) {
    fail('TRACE_N1_MODE_HANDOFF_INVALID');
  }
  const result = operation === 'emit_interaction'
    ? interactionResult(semanticOperation, execution.request, state)
    : operation === 'request_conversation'
      ? conversationResult(semanticOperation, execution.request, state)
      : combatResult(semanticOperation, execution.request, state);
  const change = {
    operation_kind: operation,
    actor_ref: semanticOperation.actor_ref,
    root_turn_id: execution.request.root_turn_id,
    step_index: execution.request.decision_index,
    mode_handoff: { schema: HANDOFF_SCHEMA,
      mode: operation === 'emit_interaction' ? 'interaction'
        : operation === 'request_conversation' ? 'conversation' : 'combat',
      operation: structuredClone(semanticOperation), result }
  };
  if (!validModeHandoffChange(change, semanticOperation,
      execution.request.change_set_id)) fail('TRACE_N1_MODE_HANDOFF_INVALID');
  return Object.freeze({
    working_projection: projectLowerDvinaTraceN1ModeHandoff({
      state: execution.working_projection, consequenceFragment: {
        state_changes: [change] }, semanticOperation,
      changeSetId: execution.request.change_set_id }),
    summary: `${operation}:handoff_registered`, duration_minutes: 0,
    consequence_fragment: { state_changes: [change] }
  });
}

function interactionResult(operation, request, state) {
  return {
    interaction_id: `interaction:n1:${request.request_id}`,
    interaction_kind: operation.interaction_kind,
    speaker_actor_id: operation.actor_ref,
    target_actor_ids: structuredClone(operation.target_actor_refs),
    content: operation.content,
    occurred_at: structuredClone(request.occurred_at),
    visible: operation.target_actor_refs.includes(state?.actor_id)
  };
}

function conversationResult(operation, request, state) {
  const session = buildConversationSession({
    schema: 'conversation_session_v1',
    conversation_id: `conversation:n1:${request.request_id}`,
    state_version: 1,
    status: 'active',
    started_at: structuredClone(request.occurred_at),
    location_ref: ref('location', actorLocation(state, operation.actor_ref)),
    initiator_ref: ref('npc', operation.actor_ref),
    active_participant_refs: participantRefs(state, operation),
    last_contribution_ref: null,
    topic_refs: [],
    status_reason: null
  });
  return structuredClone(session);
}

function combatResult(operation, request, state) {
  const session = createCombatSession({
    combat_id: `combat:n1:${request.request_id}`,
    started_at: request.occurred_at,
    scope_ref: ref('location', actorLocation(state, operation.actor_ref)),
    participant_refs: participantRefs(state, operation)
  });
  return { ...structuredClone(session), last_change_set_ref: {
    entity_kind: 'party_change_set', entity_id: request.change_set_id } };
}

function validModeHandoffChange(change, operation, changeSetId) {
  if (!exact(change, ['operation_kind', 'actor_ref', 'root_turn_id',
    'step_index', 'mode_handoff']) || !same(change.mode_handoff.operation,
    operation) || change.operation_kind !== operation?.op
      || change.actor_ref !== operation.actor_ref) return false;
  const { mode, result } = change.mode_handoff;
  if (!exact(change.mode_handoff, ['schema', 'mode', 'operation', 'result'])
      || change.mode_handoff.schema !== HANDOFF_SCHEMA) return false;
  const ids = targetIds(operation);
  if (mode === 'interaction') {
    return operation.op === 'emit_interaction'
      && exact(result, ['interaction_id', 'interaction_kind',
        'speaker_actor_id', 'target_actor_ids', 'content', 'occurred_at',
        'visible'])
      && result.speaker_actor_id === operation.actor_ref
      && same(result.target_actor_ids, ids)
      && result.interaction_kind === operation.interaction_kind
      && result.content === operation.content
      && typeof result.visible === 'boolean';
  }
  const participants = result?.active_participant_refs
    ?? result?.participant_refs;
  if (!same(participants?.map(({ entity_id }) => entity_id),
    [operation.actor_ref, ...ids])) return false;
  if (mode === 'conversation') {
    return operation.op === 'request_conversation'
      && validateConversationSession(result)
      && result.state_version === 1 && result.status === 'active'
      && result.initiator_ref.entity_kind === 'npc'
      && result.initiator_ref.entity_id === operation.actor_ref
      && result.last_contribution_ref === null;
  }
  return mode === 'combat' && operation.op === 'request_combat'
    && validateCombatSession(result)
    && result.state_version === '1' && result.status === 'paused_for_decisions'
    && result.exchange_ordinal === 0 && result.last_exchange_ref === null
    && result.player_response_required === false
    && result.participant_states.every(({ current_intent }) =>
      current_intent === null)
    && result.last_change_set_ref?.entity_id === changeSetId;
}

function participantRefs(state, operation) {
  return [ref('npc', operation.actor_ref), ...targetIds(operation).map(
    (id) => actorRef(state, id))];
}

function actorRef(state, id) {
  if (id === state?.actor_id) return ref('player_character', id);
  if (state?.npcs?.some(({ instance_id }) => instance_id === id)) {
    return ref('npc', id);
  }
  fail('TRACE_N1_MODE_TARGET_DATA_GAP');
}

function actorLocation(state, actorId) {
  const actor = state?.npcs?.find(({ instance_id }) => instance_id === actorId);
  const location = actor?.machine_state?.location_ref
    ?? actor?.location_profile_ref;
  if (!text(location)) fail('TRACE_N1_MODE_LOCATION_DATA_GAP');
  return location;
}

function appendById(values = [], addition, key) {
  const existing = values.find((entry) => entry?.[key] === addition[key]);
  if (existing != null && !same(existing, addition)) {
    fail('TRACE_N1_MODE_HANDOFF_CONFLICT');
  }
  return existing == null ? [...structuredClone(values),
    structuredClone(addition)] : structuredClone(values);
}

function targetIds(operation) {
  return operation?.target_actor_refs ?? [];
}

function ref(entity_kind, entity_id) {
  return { entity_kind, entity_id };
}

function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function text(value) {
  return typeof value === 'string' && value.length > 0;
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
