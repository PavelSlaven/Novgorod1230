import { npcSafeSnapshotHasEntityEvidence } from '@rus/npc-runtime';
import { initializeTraceCombatHandoff } from
  './lower-dvina-trace-phase-4-combat-initialization.js';
import { traceCombatBindingForActor } from
  './lower-dvina-trace-combat-bindings.js';
import { validateCombatSession } from '@rus/contracts/combat-v1';
import { startNpcActorStep } from '@rus/turn/temporal-advance';
const MODE_OPERATIONS = new Set([
  'emit_interaction', 'request_conversation', 'request_combat'
]);
const HANDOFF_SCHEMA = 'rus.lower_dvina_trace_npc_actor_step_mode_handoff.v1';
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
export function createLowerDvinaTraceNpcActorStepModeOwnerCapabilities({ npc,
  state, visibleTargetRefs = [], availableResourceRefs = [],
  runNpcConversationExchange = null, bundle = null, npcCombatModel = null,
  revalidateStateVersion = null, parentTemporal = null,
  conversationActivity = null } = {}) {
  const combatContext = { state, bundle,
    bindings: bundle?.combat_semantic_bindings ?? {} };
  const combatBinding = traceCombatBindingForActor(npc?.instance_id, combatContext);
  const combatTargets = visibleTargetRefs.filter((targetId) =>
    targetId === state?.actor_id || traceCombatBindingForActor(targetId,
      combatContext) === combatBinding);
  const handoff = (operation) => (execution) => modeOwnerResult({
    execution, operation, state, npc, runNpcConversationExchange, combatBinding,
    npcCombatModel, revalidateStateVersion, parentTemporal, conversationActivity
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
  ...(!combatAvailable || combatBinding == null || combatTargets.length === 0 ? [] : [{
    operation: 'request_combat',
    capability: { owner: '@rus/turn', target_actor_refs: combatTargets },
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
export function projectLowerDvinaTraceNpcActorStepModeHandoff({ state,
  consequenceFragment, semanticOperation, changeSetId }) {
  const change = lowerDvinaTraceNpcActorStepModeHandoffChange(consequenceFragment);
  if (change == null) return structuredClone(state);
  const handoff = change.mode_handoff;
  if (!validModeHandoffChange(change, semanticOperation, changeSetId)) {
    fail('TRACE_NPC_ACTOR_STEP_MODE_HANDOFF_INVALID');
  }
  const next = structuredClone(state);
  if (handoff.mode === 'interaction') {
    next.interactions = appendById(next.interactions, handoff.result,
      'interaction_id');
  } else if (handoff.mode === 'conversation') {
    // Conversation snapshot owns session and player boundary projection.
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
export function lowerDvinaTraceNpcActorStepModeHandoffChange(consequenceFragment) {
  const matches = (consequenceFragment?.state_changes ?? []).filter(
    (change) => change?.mode_handoff?.schema === HANDOFF_SCHEMA);
  if (matches.length > 1) fail('TRACE_NPC_ACTOR_STEP_MODE_HANDOFF_INVALID');
  return matches[0] ?? null;
}
async function modeOwnerResult({ execution, operation, state, npc,
  runNpcConversationExchange, combatBinding, npcCombatModel,
  revalidateStateVersion, parentTemporal, conversationActivity }) {
  const semanticOperation = execution.operation;
  if (semanticOperation?.op !== operation
      || semanticOperation.actor_ref !== npc?.instance_id) {
    fail('TRACE_NPC_ACTOR_STEP_MODE_HANDOFF_INVALID');
  }
  const conversation = operation === 'request_conversation'
    ? await conversationResult({ semanticOperation, execution, state,
      npc, runNpcConversationExchange, parentTemporal, conversationActivity }) : null;
  const result = operation === 'emit_interaction'
    ? interactionResult(semanticOperation, execution.request, state)
    : operation === 'request_conversation' ? conversation.result
      : await combatResult({ operation: semanticOperation, request: execution.request,
        state, npc, binding: combatBinding, npcCombatModel, revalidateStateVersion });
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
      execution.request.change_set_id)) fail('TRACE_NPC_ACTOR_STEP_MODE_HANDOFF_INVALID');
  return Object.freeze({
    working_projection: projectLowerDvinaTraceNpcActorStepModeHandoff({
      state: conversation?.working_projection ?? execution.working_projection, consequenceFragment: {
        state_changes: [change] }, semanticOperation,
      changeSetId: execution.request.change_set_id }),
    summary: `${operation}:handoff_registered`, duration_minutes:
      parentTemporal == null ? 0 : conversation?.result.exact_elapsed_minutes ?? 0,
    ...(conversation?.actor_step_start == null ? {} : {
      actor_step_start: conversation.actor_step_start }),
    consequence_fragment: { state_changes: [change] }
  });
}

function interactionResult(operation, request, state) {
  return {
    interaction_id: `interaction:npc_actor_step:${request.request_id}`,
    interaction_kind: operation.interaction_kind,
    speaker_actor_id: operation.actor_ref,
    target_actor_ids: structuredClone(operation.target_actor_refs),
    content: operation.content,
    occurred_at: structuredClone(request.occurred_at),
    visible: operation.target_actor_refs.includes(state?.actor_id)
  };
}

async function conversationResult({ semanticOperation, execution, state, npc,
  runNpcConversationExchange, parentTemporal, conversationActivity }) {
  if (typeof runNpcConversationExchange !== 'function') {
    fail('TRACE_NPC_ACTOR_STEP_CONVERSATION_DEPENDENCY_MISSING');
  }
  const actorStepStart = parentTemporal == null ? null : startNpcActorStep({
    execution, started_at: execution.request.occurred_at,
    actor_ref: semanticOperation.actor_ref,
    duration_minutes: conversationActivity?.duration_minutes,
    execution_binding_ref: null, schedule_option_id: null,
    activity_profile_ref: null, movement_proposal: null, property_proposal: null
  });
  const active = actorStepStart == null ? null : exactStartedActorStep(
    actorStepStart.working_projection, semanticOperation.actor_ref,
    execution.request.request_id);
  const parentState = actorStepStart == null ? state : { ...structuredClone(state),
    clock: structuredClone(execution.request.occurred_at),
    clock_weather_light: { ...structuredClone(state.clock_weather_light ?? {}),
      clock: structuredClone(execution.request.occurred_at) },
    active_npc_actor_steps: structuredClone(
      actorStepStart.working_projection.active_npc_actor_steps) };
  const semanticExchange = await runNpcConversationExchange({
    state: parentState, npc: structuredClone(npc),
    operation: structuredClone(semanticOperation),
    actor_step_request: structuredClone(execution.request),
    working_projection: structuredClone(execution.working_projection),
    parent_temporal: actorStepStart == null ? null : { ...structuredClone(parentTemporal),
      active_actor_step: active }
  });
  if (semanticExchange?.exchange?.schema !== 'conversation_exchange_result_v1'
      || semanticExchange.exchange.contributions?.length < 1) {
    fail('TRACE_NPC_ACTOR_STEP_CONVERSATION_RESULT_INVALID');
  }
  const temporal = semanticExchange.temporal_advance_results?.at(-1);
  const projection = actorStepStart?.working_projection ?? execution.working_projection;
  return { result: structuredClone(semanticExchange), actor_step_start: actorStepStart,
    working_projection: temporal?.temporal_status == null ? structuredClone(projection) : {
    ...structuredClone(projection),
    ...structuredClone(semanticExchange.exchange.working_state.world_state)
  } };
}

function exactStartedActorStep(projection, npcRef, requestId) {
  const matches = (projection.active_npc_actor_steps ?? []).filter((step) =>
    step?.status === 'started' && step.npc_ref === npcRef
      && step.decision_trace_ref?.entity_kind === 'npc_decision_trace'
      && step.decision_trace_ref.entity_id === requestId);
  if (matches.length !== 1) fail('TRACE_NPC_ACTOR_STEP_CONVERSATION_RESULT_INVALID');
  return structuredClone(matches[0]);
}

async function combatResult({ operation, request, state, npc, binding,
  npcCombatModel, revalidateStateVersion }) {
  if (binding == null || typeof npcCombatModel !== 'function'
      || typeof revalidateStateVersion !== 'function') {
    fail('TRACE_NPC_ACTOR_STEP_COMBAT_DEPENDENCY_MISSING');
  }
  const initialized = await initializeTraceCombatHandoff({ state, binding,
    actor: npc, semanticExchange: { response_kind: 'combat_handoff',
      combat_handoff: { kind: 'combat' }, clock_after: request.occurred_at },
    playerInput: request, npcCombatModel, revalidateStateVersion,
    combatLabel: operation.actor_ref, movementBindings: null,
    perceivedChangeSummary: 'NPC начинает непосредственное столкновение.' });
  return { ...structuredClone(initialized?.session), last_change_set_ref: {
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
  if (mode === 'conversation') {
    return operation.op === 'request_conversation'
      && result?.exchange?.schema === 'conversation_exchange_result_v1'
      && Array.isArray(result.exchange.contributions)
      && result.exchange.contributions.length > 0
      && result.decision_request?.npc_ref?.entity_kind === 'npc'
      && result.decision_request.npc_ref.entity_id === operation.actor_ref;
  }
  if (!same(participants?.map(({ entity_id }) => entity_id),
    [...ids, operation.actor_ref])) return false;
  return mode === 'combat' && operation.op === 'request_combat'
    && validateCombatSession(result)
    && result.state_version === '1' && result.status === 'paused_for_player'
    && result.exchange_ordinal === 0 && result.last_exchange_ref === null
    && result.player_response_required === true
    && result.participant_states.some(({ actor_ref: actor, current_intent }) =>
      actor.entity_id === operation.actor_ref && current_intent != null)
    && result.last_change_set_ref?.entity_id === changeSetId;
}

function appendById(values = [], addition, key) {
  const existing = values.find((entry) => entry?.[key] === addition[key]);
  if (existing != null && !same(existing, addition)) {
    fail('TRACE_NPC_ACTOR_STEP_MODE_HANDOFF_CONFLICT');
  }
  return existing == null ? [...structuredClone(values),
    structuredClone(addition)] : structuredClone(values);
}

function targetIds(operation) {
  return operation?.target_actor_refs ?? [];
}

function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
