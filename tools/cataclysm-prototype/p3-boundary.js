import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { appendFile, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';
import { requestTurnStepPlanWithRepair, requestNpcSemanticDecision,
  createTurnStepExecutionRegistry, runTurnStepLoop } from '@rus/turn';
import { resolveLlmExecutionConfig } from '@rus/llm-runtime';
import { createLlmSettingsFileStore, createLlmSettingsOwner } from '@rus/game-server';
import { createProductionLlmRoleRunner } from '../../apps/game-server/src/infrastructure/provider/deepseek.js';
import { createLowerDvinaTraceTurnStepModel,
  createLowerDvinaTraceNpcAutonomousModel,
  createLowerDvinaTraceNpcSemanticModel } from '../../apps/game-server/src/runtime/lower-dvina-trace-phase-2-llm.js';
import { buildNpcActionDecisionRequestFromSnapshots, validateNpcActionDecisionRequest }
  from '@rus/npc-runtime';
import { buildNpcDecisionBoundary, buildNpcDecisionSignal } from '@rus/npc-runtime';
import { addElapsedTime } from '@rus/time-events-history';
import { projectConversationAudience } from '@rus/visibility-knowledge-memory';
import { applyPlayerPlan, projectPlayerStatementAudience } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-m2-conversation-statements.js';

export const P3_ATTEMPT_BUDGET = 72;
export const P3_CASE_IDS = Object.freeze(['T06', 'T07', 'T08', 'T09', 'T10']);
const P3_ROLE_LIMITS = Object.freeze({
  turn_step_planner: { envPrefix: 'TURN_STEP_PLANNER', maxTokens: 20_000 },
  turn_step_planner_repair: { envPrefix: 'TURN_STEP_PLANNER_REPAIR', maxTokens: 20_000 },
  npc_autonomous_decider: { envPrefix: 'NPC_AUTONOMOUS_DECIDER', maxTokens: 20_000 },
  npc_autonomous_decider_format_repair: { envPrefix: 'NPC_AUTONOMOUS_DECIDER_REPAIR', maxTokens: 20_000 },
  npc_conversation_responder: { envPrefix: 'NPC_CONVERSATION_RESPONDER', maxTokens: 1_000 },
  npc_conversation_responder_format_repair: { envPrefix: 'NPC_CONVERSATION_RESPONDER_REPAIR', maxTokens: 1_000 }
});

export function requireP3CaseId(caseId) {
  if (!P3_CASE_IDS.includes(caseId)) throw new Error('P3_CASE_NOT_IN_ACCEPTANCE_MATRIX');
  return caseId;
}

export function createP3AttemptBudget({ budget = P3_ATTEMPT_BUDGET,
  onAttempt = async () => {} } = {}) {
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > P3_ATTEMPT_BUDGET) {
    throw new TypeError('budget must be between 1 and 72');
  }
  let calls = 0;
  return {
    get calls() { return calls; },
    wrap(roleRunner) {
      if (typeof roleRunner?.run !== 'function') throw new TypeError('roleRunner.run required');
      return { async run(input) {
        if (calls >= budget) {
          const error = new Error('P3_GLOBAL_ATTEMPT_BUDGET_EXHAUSTED');
          error.code = 'P3_GLOBAL_ATTEMPT_BUDGET_EXHAUSTED';
          throw error;
        }
        const attempt = ++calls;
        await onAttempt({ phase: 'before', attempt, input, output: null, error: null });
        try {
          const output = await roleRunner.run(input);
          await onAttempt({ phase: 'after', attempt, input, output, error: null });
          return output;
        } catch (error) {
          await onAttempt({ phase: 'after', attempt, input, output: null, error: {
            name: error?.name ?? 'Error', message: String(error?.message ?? error),
            code: error?.code ?? null
          } });
          throw error;
        }
      }
      };
    }
  };
}

export function resolveP3EffectiveConfig({ roleId, env = process.env, settingsOwner } = {}) {
  const roleLimit = P3_ROLE_LIMITS[roleId];
  if (!roleLimit) throw new Error(`P3_ROLE_UNSUPPORTED:${roleId}`);
  const { envPrefix, maxTokens: expectedTokens } = roleLimit;
  requireP3QwenSettingsOwner(settingsOwner);
  const inputLimitTokens = 65_536 - expectedTokens;
  const p3Env = makeP3Env(env);
  const providerSnapshot = settingsOwner?.providerSnapshot();
  const runtimeProviderOverride = providerSnapshot ? { compatibility: providerSnapshot.compatibility,
    baseUrl: providerSnapshot.baseUrl, model: providerSnapshot.model, apiKey: providerSnapshot.apiKey } : null;
  const resolution = resolveLlmExecutionConfig({ scope: 'turn_runtime', roleId, env: p3Env, runtimeProviderOverride,
    overrides: { temperature: 0, topP: 1, maxTokens: expectedTokens } });
  if (!resolution.enabled) throw new Error(`P3_ROLE_CONFIG_DISABLED:${resolution.reason}`);
  const config = resolution.config;
  if (config.provider !== 'openai_compatible' || config.model !== 'qwen3.8-27b-uncensored-w4a16-tp2'
      || config.temperature !== 0 || config.topP !== 1 || config.requestTimeoutMs !== 120_000) {
    throw new Error(`P3_ROLE_CONFIG_MISMATCH:${roleId}`);
  }
  if (config.maxTokens !== expectedTokens) throw new Error(`P3_ROLE_TOKEN_LIMIT_MISMATCH:${roleId}`);
  if (config.contextBudget?.hardInputLimitTokens !== inputLimitTokens) {
    throw new Error(`P3_ROLE_INPUT_LIMIT_MISMATCH:${roleId}`);
  }
  return Object.freeze({ role_id: roleId, provider: config.provider, model: config.model,
    temperature: config.temperature, top_p: config.topP, max_tokens: config.maxTokens,
    context_window_tokens: 65_536, input_limit_tokens: inputLimitTokens,
    timeout_ms: config.requestTimeoutMs, api_key_present: typeof config.apiKey === 'string'
      && config.apiKey.length > 0 });
}

export async function requestP3TurnPlan({ request, turnStepModel, semanticPlanValidator,
  preparedChainContext = null, onValidatedPlan = async () => {} } = {}) {
  const result = await requestTurnStepPlanWithRepair({ request, turnStepModel,
    semanticPlanValidator, preparedChainContext });
  await onValidatedPlan({ request, ...result });
  return result;
}

export async function requestP3NpcDecision(input = {}, onDecision = async () => {}) {
  const result = await requestNpcSemanticDecision(input);
  await onDecision({ request: input.request, ...result });
  return result;
}

export async function runP3NpcBoundary({ nativeProjection, snapshots, decision,
  semanticModel, replay = new Map(), buildRequest = buildP3NpcRequest,
  requestDecision = requestP3NpcDecision } = {}) {
  if (!nativeProjection || typeof nativeProjection.actor_id !== 'string'
      || !nativeProjection.actor_id || typeof nativeProjection.assignment_id !== 'string'
      || !nativeProjection.assignment_id || !decision?.boundary || !snapshots
      || typeof semanticModel !== 'function') throw new Error('P3_NPC_BOUNDARY_INPUT_INVALID');
  const request = buildRequest(snapshots);
  const boundaryId = decision.boundary.boundary_id;
  const checkpointId = `${boundaryId}:${nativeProjection.assignment_id}`;
  const fingerprint = JSON.stringify({ nativeProjection, request, boundary: decision.boundary });
  const prior = replay.get(checkpointId);
  if (prior) {
    if (prior.fingerprint !== fingerprint) throw new Error('P3_NPC_REPLAY_IDENTITY_MISMATCH');
    return structuredClone(prior.result);
  }
  const result = await requestDecision({ ...decision, boundary: decision.boundary,
    request, semanticModel });
  const checkpoint = { native_actor_id: nativeProjection.actor_id,
    assignment_id: nativeProjection.assignment_id, boundary_id: boundaryId,
    native_projection: structuredClone(nativeProjection), request: structuredClone(request),
    decision: structuredClone(result) };
  replay.set(checkpointId, { fingerprint, result: checkpoint });
  return structuredClone(checkpoint);
}

export function applyP3NativeSpeech(ownerContext, working, validatedPlan, native, replay,
  conversationOwner = { applyPlayerPlan,
    projectPlayerStatementAudience }) {
  if (!ownerContext || !working || !validatedPlan || !(replay instanceof Map)
      || !native || typeof native.opId !== 'string' || !native.opId
      || typeof native.conversationId !== 'string' || typeof native.exchangeId !== 'string'
      || !Number.isSafeInteger(native.stateVersion)
      || typeof native.speakerId !== 'string' || typeof native.utterance !== 'string'
      || !Array.isArray(native.actualHeardListenerIds)
      || native.elapsedSeconds !== 3
      || !Number.isSafeInteger(native.beforeTime?.native_turn)
      || !Number.isSafeInteger(native.nativeTime?.native_turn)
      || !Number.isSafeInteger(native.beforeTime?.seconds_since_world_start)
      || !Number.isSafeInteger(native.nativeTime?.seconds_since_world_start)
      || native.nativeTime.seconds_since_world_start - native.beforeTime.seconds_since_world_start
        !== native.elapsedSeconds
      || native.nativeTime.native_turn - native.beforeTime.native_turn !== native.elapsedSeconds) {
    throw new Error('P3_NATIVE_SPEECH_READBACK_INVALID');
  }
  if (native.conversationId !== ownerContext.conversationId
      || native.exchangeId !== ownerContext.exchangeId
      || native.stateVersion !== ownerContext.stateVersion
      || native.speakerId !== ownerContext.nativeSpeakerActorId
      || ownerContext.playerActorRef?.entity_id !== validatedPlan.speaker_ref?.entity_id
      || native.utterance !== validatedPlan.speech?.utterance_text) {
    throw new Error('P3_NATIVE_SPEECH_IDENTITY_MISMATCH');
  }
  const heard = native.actualHeardListenerIds;
  if (heard.length === 0 || new Set(heard).size !== heard.length
      || heard.some(id => typeof id !== 'string' || !id || id === native.speakerId)) {
    throw new Error('P3_NATIVE_SPEECH_HEARD_SET_INVALID');
  }
  const listenerByNativeId = new Map(ownerContext.actualNpcActors.map(actor =>
    [actor.native_actor_id, actor]));
  if (heard.some(id => !listenerByNativeId.has(id)
      || listenerByNativeId.get(id).machine_state?.hearing_capability === 'none')) {
    throw new Error('P3_NATIVE_SPEECH_LISTENER_ID_UNRESOLVED');
  }
  const digest = JSON.stringify({ utterance: native.utterance, speakerId: native.speakerId,
    listeners: [...heard].sort(), conversationId: native.conversationId,
    exchangeId: native.exchangeId, stateVersion: native.stateVersion,
    elapsedSeconds: native.elapsedSeconds, beforeTime: native.beforeTime,
    nativeTime: native.nativeTime,
    socialDeliveryResult: native.socialDeliveryResult, statement: validatedPlan });
  const prior = replay.get(native.opId);
  if (prior) {
    if (prior.digest !== digest) throw new Error('P3_NATIVE_SPEECH_REPLAY_IDENTITY_MISMATCH');
    return structuredClone(prior.outcome);
  }
  const actualNpcActors = heard.map(id => listenerByNativeId.get(id));
  const context = { ...ownerContext, actualNpcActors,
    state: { ...ownerContext.state, clock: addElapsedTime(ownerContext.state.clock, {
      exact_minutes: { numerator: String(native.elapsedSeconds), denominator: '60' }
    }) },
    inputDigest: native.opId.slice(0, 64), socialDeliveryResult: native.socialDeliveryResult ?? null };
  const applied = conversationOwner.applyPlayerPlan(context, working, validatedPlan);
  const statement = applied.contribution_event;
  const nativeListeners = actualNpcActors.map(actor => ({
    listener_ref: { entity_kind: 'npc', entity_id: actor.instance_id },
    perception_result_ref: { entity_kind: 'perception_result',
      entity_id: `${native.opId}:${actor.native_actor_id}` },
    perception_result: 'perceived_unidentified',
    perceived_at: structuredClone(context.state.clock),
    same_time_batch_ref: { entity_kind: 'temporal_batch', entity_id: context.batchKey },
    comprehension: 'full', speaker_recognized: false
  }));
  const audience = conversationOwner.projectAudience
    ? conversationOwner.projectAudience(statement, nativeListeners)
    : projectConversationAudience({ statement, listener_results: nativeListeners });
  const projected = conversationOwner.projectPlayerStatementAudience
    ? conversationOwner.projectPlayerStatementAudience(context, applied.working_state,
      statement, validatedPlan, audience)
    : projectPlayerStatementAudience(context, applied.working_state,
      statement, validatedPlan, audience);
  const actualIds = projected.working_state.audiences.at(-1)?.actual_listener_refs
    .map(ref => ref.entity_id).sort() ?? [];
  const expectedIds = actualNpcActors.map(({ instance_id }) => instance_id).sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw new Error('P3_CONVERSATION_AUDIENCE_DISAGREES_WITH_NATIVE');
  }
  const outcome = { ...projected, contribution_event: statement,
    audience_fixture: { kind: 'synthetic_same_language_full_comprehension',
      speaker_recognized: false, native_hearing_is_only_listener_fact: true },
    native_speech: { op_id: native.opId, elapsed_seconds: native.elapsedSeconds,
      native_time: structuredClone(native.nativeTime),
      clock: structuredClone(context.state.clock), actual_heard_listener_ids: [...heard].sort() } };
  replay.set(native.opId, { digest, outcome: structuredClone(outcome) });
  return outcome;
}

export function createP3NativeSpeechOwnerFixture({ observation, readback, operation }) {
  const native = readback.native_effect;
  const speaker = observation.actors.find(actor => actor.actor_id === native.speakerId);
  const heard = native.actualHeardListenerIds.map(id => {
    const actor = observation.actors.find(candidate => candidate.actor_id === id);
    if (!actor) throw new Error('P3_NATIVE_SPEECH_LISTENER_ID_UNRESOLVED');
    return { native_actor_id: id, instance_id: id, machine_state: {}, semantic_state: {} };
  });
  if (!speaker || !heard.length) throw new Error('P3_NATIVE_SPEECH_FIXTURE_ACTOR_UNAVAILABLE');
  const text = native.utterance;
  const conversationId = `p3:${readback.operation_id}`;
  const exchangeId = `${conversationId}:exchange`;
  const playerRef = { entity_kind: 'player_character', entity_id: speaker.actor_id };
  const targetRef = { entity_kind: 'npc', entity_id: heard[0].instance_id };
  const ownerContext = { conversationId, exchangeId, stateVersion: readback.before.turn,
    nativeSpeakerActorId: speaker.actor_id, playerActorRef: playerRef,
    targetRef, phase: 'phase_3', checkResult: null,
    contracts: { check: {} }, playerInput: { raw_text: text },
    activityProfile: { profile_id: 'p3-native-speech-fixture' },
    mapping: { signal_descriptors: [] }, actualNpcActors: heard,
    conversationActorRefs: null, batchKey: `p3:${readback.operation_id}:batch`,
    evidencePresented: false, evidencePresentation: null,
    state: { actor_id: speaker.actor_id,
      clock: { whole_minutes: String(Math.floor(readback.before.clock.seconds_since_world_start / 60)),
        subminute_numerator: String(readback.before.clock.seconds_since_world_start % 60),
        subminute_denominator: '60' }, position: {}, environment: {} } };
  const validatedPlan = { schema: 'player_conversation_contribution_plan_v1',
    request_id: `p3:${readback.operation_id}`, conversation_id: conversationId,
    state_version: ownerContext.stateVersion,
    speaker_ref: playerRef, input_mode: 'freeform', contribution_kind: 'speech',
    primary_addressee_ref: targetRef, intended_addressee_refs: heard.map(actor =>
      ({ entity_kind: 'npc', entity_id: actor.instance_id })), affected_actor_refs: [],
    speech: { utterance_text: text, dominant_act: 'request', interaction_tags: ['question'],
      topic_refs: [], claims: [], response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'speak', grounded_contribution: text, adaptation: 'literal' },
    resolution: 'automatic', activity: { duration_class: 'domain_owned', effort: 'speech' },
    supporting_operations: [], check: null, handoff: null };
  const working = { active_participant_refs: [playerRef, ...ownerContext.actualNpcActors.map(actor =>
    ({ entity_kind: 'npc', entity_id: actor.instance_id }))], statements: [], audiences: [],
    new_signal_records: [], supporting_operation_perceptions: [] };
  return { ownerContext, validatedPlan, working,
    fixture: { kind: 'synthetic_same_language_full_comprehension',
      speaker_recognized: false, heard_listener_ids: [...native.actualHeardListenerIds],
      operation_id: readback.operation_id, native_seconds: native.elapsedSeconds,
      operation: structuredClone(operation) } };
}

export function buildP3NpcRequest(snapshots = {}) {
  const request = buildNpcActionDecisionRequestFromSnapshots(snapshots);
  if (!validateNpcActionDecisionRequest(request)) throw new Error('P3_NPC_SAFE_REQUEST_INVALID');
  return request;
}

export function buildP3NativeNpcDecisionInput(nativeProjection) {
  if (!nativeProjection || typeof nativeProjection.actor_id !== 'string'
      || !Number.isSafeInteger(nativeProjection.native_turn)
      || !Array.isArray(nativeProjection.visible_actors)
      || !Array.isArray(nativeProjection.visible_items)
      || !Array.isArray(nativeProjection.visible_targets)) {
    throw new Error('P3_NATIVE_NPC_PROJECTION_INVALID');
  }
  const assignmentId = nativeProjection.assignment_id || `p3-duty-${nativeProjection.actor_id}`;
  const npcRef = `npc-${nativeProjection.actor_id}`;
  const turn = nativeProjection.native_turn;
  const stateVersion = turn + 1;
  const divisor = (left, right) => right === 0 ? left : divisor(right, left % right);
  const remainder = turn % 60;
  const common = divisor(remainder, 60) || 60;
  const occurredAt = { whole_minutes: String(Math.floor(turn / 60)),
    subminute_numerator: String(remainder / common),
    subminute_denominator: String(60 / common) };
  const sourceEvent = { entity_kind: 'event', entity_id: `npc-duty-${assignmentId}` };
  const subject = { entity_kind: 'npc', entity_id: npcRef };
  const signal = buildNpcDecisionSignal({ occurred_at: occurredAt, category: 'objective',
    significance: 'material', source_event_ref: sourceEvent, subject_ref: subject,
    scope_refs: [], perception_required: false });
  const boundary = buildNpcDecisionBoundary({ decision_mode: 'autonomous',
    scheduled_at: occurredAt, npc_ref: subject,
    same_time_batch_ref: { entity_kind: 'temporal_batch', entity_id: `npc-turn-${turn}` },
    significance: 'material', categories: ['objective'],
    signal_refs: [{ entity_kind: 'npc_decision_signal', entity_id: signal.signal_id }],
    state_version: String(stateVersion) });
  const visibleTargets = nativeProjection.visible_targets.map(target => ({
    item_ref: target.target_ref, terrain: target.terrain
  }));
  const visibleActors = nativeProjection.visible_actors.map(actor => ({
    actor_ref: `npc-${actor.actor_id}`, position: actor.position
  }));
  const interruptionSummary = nativeProjection.assignment_status
      === 'interrupted_waiting_for_semantic_decision'
      && typeof nativeProjection.interrupt_cause === 'string'
      && nativeProjection.interrupt_cause
    ? ` Native interruption cause: ${nativeProjection.interrupt_cause}.` : '';
  const snapshots = {
    request_identity: { request_id: `npc-request-${turn}-${nativeProjection.actor_id}`,
      root_turn_id: `npc-turn-${turn}`, committed_state_version: stateVersion,
      working_revision: 0, decision_index: 1 },
    boundary,
    npc_snapshot: { instance_id: npcRef, profile_level: 'scene',
      identity_state: { canonical_name: `Native NPC ${nativeProjection.actor_id}` },
      social_role: { role_ref: 'native-duty' }, attributes: [], skills: [],
      machine_state: {}, role_ref: { id: 'native-duty' } },
    current_activity_snapshot: { activity_ref: null,
      summary: nativeProjection.activity_id || 'idle',
      status: nativeProjection.assignment_status || 'decision_required',
      can_continue_automatically: false },
    perception_snapshot: {
      perceived_changes: [{ source_event_ref: sourceEvent,
        summary: `Duty ${nativeProjection.assignment_id} requires a decision.${interruptionSummary}` }],
      visible_scene: nativeProjection.visible_targets.map(({ terrain }) => terrain).filter(Boolean),
      present_actors: visibleActors, visible_objects: nativeProjection.visible_items.map(item => ({
        object_ref: item.item_ref, summary: item.type || item.item_ref
      })), uncertainties: []
    }, resolved_signals: [signal],
    operation_contract: { request_movement: { target_refs:
      nativeProjection.visible_targets.map(({ target_ref }) => target_ref),
      movement_kinds: ['local'] } }
  };
  const snapshotsRequest = buildP3NpcRequest(snapshots);
  return { nativeProjection: { ...structuredClone(nativeProjection), assignment_id: assignmentId }, snapshots,
    decision: { boundary, orderedSignals: [signal],
      revalidateStateVersion: async () => stateVersion }, request: snapshotsRequest };
}

export async function executeP3NativeNpcBoundary({ nativeProjection, snapshots, decision,
  semanticModel, nativeAdapter, nativeObservation, replay = new Map(),
  requestDecision = requestP3NpcDecision } = {}) {
  const checkpoint = await runP3NpcBoundary({ nativeProjection, snapshots, decision,
    semanticModel, replay, requestDecision });
  if (checkpoint.native_readback) return checkpoint;
  const plan = checkpoint.decision?.plan;
  const operation = plan?.operations?.length === 1 ? plan.operations[0] : null;
  if (operation?.op !== 'request_movement'
      || operation.actor_ref !== checkpoint.request?.npc_ref) {
    throw new Error('P3_NATIVE_NPC_MOVEMENT_PLAN_REQUIRED');
  }
  const target = nativeProjection.visible_targets.find(({ target_ref }) =>
    target_ref === operation.target_ref);
  const actor = nativeObservation?.actors?.find(({ actor_id, actor_ref }) =>
    actor_id === nativeProjection.actor_id && actor_ref !== 'avatar');
  if (!target || !actor || !Array.isArray(actor.position)
      || !Array.isArray(target.position)) throw new Error('P3_NATIVE_NPC_TARGET_UNRESOLVED');
  const direction = [target.position[0] - actor.position[0], target.position[1] - actor.position[1]];
  if (Math.max(Math.abs(direction[0]), Math.abs(direction[1])) !== 1
      || target.position[2] !== actor.position[2]) throw new Error('P3_NATIVE_NPC_TARGET_NOT_ADJACENT');
  const envelope = createP3OperationEnvelope({ operationId: `${decision.boundary.boundary_id}-native`,
    observation: nativeObservation, actorRef: actor.actor_ref, primitive: 'npc_move',
    args: { direction, assignment_id: nativeProjection.assignment_id,
      intent: plan.interpretation.grounded_attempt }, registeredPrimitives: ['npc_move'] });
  const readback = typeof nativeAdapter?.execute === 'function'
    ? await nativeAdapter.execute(envelope)
    : (await nativeAdapter.writeOperationRequest(envelope),
      await nativeAdapter.readOperationReadback(envelope));
  const validated = validateP3Readback(envelope, readback);
  const result = { ...checkpoint, native_operation: envelope, native_readback: validated };
  replay.set(`${decision.boundary.boundary_id}:${nativeProjection.assignment_id}`,
    { fingerprint: JSON.stringify({ nativeProjection, request: checkpoint.request,
      boundary: decision.boundary }), result });
  return structuredClone(result);
}

export async function runP3NativeNpcFlow({ nativeAdapter, actorId, semanticModel,
  nativeObservation = null, replay = new Map(), evidence = null } = {}) {
  if (typeof actorId !== 'string' || !/^\d+$/u.test(actorId)
      || typeof semanticModel !== 'function') throw new Error('P3_NATIVE_NPC_FLOW_INPUT_INVALID');
  const observation = nativeObservation ?? await nativeAdapter.refreshObservation();
  const nativeProjection = (observation.npc_projections ?? []).find(row => row.actor_id === actorId);
  if (!nativeProjection || !['', 'decision_required', 'interrupted_waiting_for_semantic_decision']
    .includes(nativeProjection.assignment_status ?? '')) {
    throw new Error('P3_NATIVE_NPC_DECISION_BOUNDARY_UNAVAILABLE');
  }
  const input = buildP3NativeNpcDecisionInput(nativeProjection);
  const checkpoint = await executeP3NativeNpcBoundary({ ...input, semanticModel,
    nativeAdapter, nativeObservation: observation, replay });
  if (evidence?.record) await evidence.record({ event: 'native_npc_semantic_boundary',
    checkpoint: { request: checkpoint.request, decision: checkpoint.decision,
      native_operation: checkpoint.native_operation, native_readback: checkpoint.native_readback } });
  return checkpoint;
}

export function selectP3NativeNpcFixture(observation) {
  const candidates = (observation?.npc_projections ?? []).filter(row =>
    /^\d+$/u.test(row.actor_id ?? '')
      && ['', 'decision_required', 'interrupted_waiting_for_semantic_decision']
        .includes(row.assignment_status ?? '')
      && Array.isArray(row.visible_targets) && row.visible_targets.length > 0);
  candidates.sort((left, right) => BigInt(left.actor_id) < BigInt(right.actor_id) ? -1
    : BigInt(left.actor_id) > BigInt(right.actor_id) ? 1 : 0);
  return candidates[0]?.actor_id ?? null;
}

export function createP3RoleRuntime({ env = process.env, budget = createP3AttemptBudget(),
  execute, settingsOwner } = {}) {
  requireP3QwenSettingsOwner(settingsOwner);
  const p3Env = makeP3Env(env);
  validateP3RoleConfigs(p3Env, settingsOwner);
  const provider = createProductionLlmRoleRunner({ env: p3Env, settings: settingsOwner,
    ...(execute ? { execute } : {}) });
  const roleRunner = budget.wrap({ async run(call) {
    const roleId = call.role_id ?? '';
    const configRole = ({ turn_step_planner: 'turn_step_planner',
      turn_step_planner_repair: 'turn_step_planner_repair',
      npc_autonomous_decider: 'npc_autonomous_decider',
      npc_autonomous_decider_format_repair: 'npc_autonomous_decider_format_repair',
      npc_conversation_responder: 'npc_conversation_responder',
      npc_conversation_responder_format_repair: 'npc_conversation_responder_format_repair' })[roleId];
    if (!configRole) throw new Error(`P3_ROLE_UNSUPPORTED:${roleId}`);
    const effective = resolveP3EffectiveConfig({ roleId: configRole, env, settingsOwner });
    return provider.run({ ...call, overrides: { ...(call.overrides ?? {}),
      temperature: effective.temperature, topP: effective.top_p,
      maxTokens: effective.max_tokens, requestTimeoutMs: effective.timeout_ms } });
  } });
  return Object.freeze({ roleRunner,
    turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner }),
    npcAutonomousModel: createLowerDvinaTraceNpcAutonomousModel({ roleRunner }),
    npcConversationModel: createLowerDvinaTraceNpcSemanticModel({ roleRunner }),
    budget });
}

function makeP3Env(env) {
  return Object.freeze(Object.fromEntries([
    ...Object.entries(env),
    ...Object.values(P3_ROLE_LIMITS).map(({ envPrefix, maxTokens }) =>
      [`${envPrefix}_HARD_INPUT_LIMIT_TOKENS`, String(65_536 - maxTokens)])
  ]));
}

export function buildP3TurnOperations(observation) {
  const actor = observation.actors.find(({ actor_ref: ref }) => ref === 'avatar');
  if (!actor) throw new Error('P3_AVATAR_OBSERVATION_MISSING');
  const [x, y, z] = actor.position;
  const adjacentTargets = observation.targets.filter(({ position }) =>
    position[2] === z && Math.max(Math.abs(position[0] - x), Math.abs(position[1] - y)) === 1);
  return [
    ...adjacentTargets.map(target => ({ op: 'request_movement', actor_ref: 'avatar',
      target_ref: target.target_ref, movement_kind: 'local' })),
    ...observation.items.filter(({ holder, use_methods }) => holder === String(actor.actor_id)
      && Array.isArray(use_methods) && use_methods.length === 1
      && typeof use_methods[0] === 'string' && use_methods[0])
      .flatMap(item => [{ op: 'request_item_use', actor_ref: 'avatar',
        item_ref: item.item_ref, use_kind: 'operate', target_refs: [] },
      ...adjacentTargets.map(target => ({ op: 'request_item_use', actor_ref: 'avatar',
        item_ref: item.item_ref, use_kind: 'operate', target_refs: [target.target_ref] }))]),
    ...adjacentTargets.filter(target => target.openable === true)
      .map(target => ({ op: 'request_container_access', actor_ref: 'avatar',
        container_ref: target.target_ref, access_kind: 'open' })),
    { op: 'request_activity', actor_ref: 'avatar', activity_kind: 'wait',
      target_refs: [], description: 'Wait for the next period' }
  ];
}

export function mapP3TurnOperationToNative(operation, observation) {
  const actor = observation.actors.find(({ actor_ref: ref }) => ref === 'avatar');
  if (!actor || (operation?.op !== 'move_entity' && operation?.actor_ref !== 'avatar')) {
    throw new Error('P3_TYPED_ACTOR_UNRESOLVED');
  }
  if (operation.op === 'move_entity') {
    const { entity_ref: uid, placement } = operation;
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(uid ?? '')
        || placement?.relation !== 'held_by' || placement.target_ref !== 'avatar') {
      throw new Error('P3_PICKUP_INTENT_UNSUPPORTED');
    }
    const matches = observation.items.filter(({ item_uid }) => item_uid === uid);
    const item = matches[0];
    if (!item || typeof item.item_ref !== 'string' || !item.item_ref
        || matches.length !== 1
        || observation.items.filter(({ item_ref }) => item_ref === item.item_ref).length !== 1
        || (item.holder != null && item.holder !== '')
        || !Array.isArray(item.position) || item.position.length !== 3
        || item.position[2] !== actor.position[2]
        || Math.max(Math.abs(item.position[0] - actor.position[0]),
          Math.abs(item.position[1] - actor.position[1])) > 1) {
      throw new Error('P3_TYPED_GROUND_ITEM_UNRESOLVED');
    }
    return { actorRef: 'avatar', primitive: 'pickup', args: {},
      references: { items: item.item_ref } };
  }
  if (operation.op === 'request_movement') {
    const target = observation.targets.find(({ target_ref: ref }) => ref === operation.target_ref);
    if (!target) throw new Error('P3_TYPED_TARGET_UNRESOLVED');
    const direction = [target.position[0] - actor.position[0], target.position[1] - actor.position[1]];
    if (Math.max(Math.abs(direction[0]), Math.abs(direction[1])) !== 1
        || target.position[2] !== actor.position[2]) throw new Error('P3_NATIVE_MOVE_TARGET_NOT_ADJACENT');
    return { actorRef: 'avatar', primitive: 'move', args: { direction }, references: {} };
  }
  if (operation.op === 'request_item_use') {
    if (operation.use_kind !== 'operate') throw new Error('P3_ITEM_USE_UNSUPPORTED');
    const actorId = String(actor.actor_id);
    const item = observation.items.find(({ item_ref: ref, holder }) =>
      ref === operation.item_ref && String(holder) === actorId);
    if (!item) throw new Error('P3_TYPED_ITEM_UNRESOLVED');
    if (!Array.isArray(item.use_methods) || item.use_methods.length !== 1
        || typeof item.use_methods[0] !== 'string' || !item.use_methods[0]) {
      throw new Error('P3_ITEM_USE_METHOD_AMBIGUOUS');
    }
    const args = { method: item.use_methods[0] };
    const references = { items: item.item_ref };
    if (!Array.isArray(operation.target_refs) || operation.target_refs.length > 1) {
      throw new Error('P3_ITEM_TARGET_REFS_INVALID');
    }
    if (operation.target_refs.length === 1) {
      const targetRef = operation.target_refs[0];
      const target = observation.targets.find(({ target_ref: ref }) => ref === targetRef);
      if (!target) throw new Error('P3_TYPED_TARGET_UNRESOLVED');
      const direction = [target.position[0] - actor.position[0], target.position[1] - actor.position[1]];
      if (Math.max(Math.abs(direction[0]), Math.abs(direction[1])) !== 1
          || target.position[2] !== actor.position[2]) throw new Error('P3_NATIVE_MOVE_TARGET_NOT_ADJACENT');
      args.target_direction = direction;
      references.targets = targetRef;
    }
    return { actorRef: 'avatar', primitive: 'use_item', args, references };
  }
  if (operation.op === 'request_container_access') {
    if (operation.access_kind !== 'open') throw new Error('P3_CONTAINER_ACCESS_UNSUPPORTED');
    const target = observation.targets.find(({ target_ref: ref, openable }) =>
      ref === operation.container_ref && openable === true);
    if (!target) throw new Error('P3_TYPED_OPENABLE_TARGET_UNRESOLVED');
    const direction = [target.position[0] - actor.position[0], target.position[1] - actor.position[1]];
    if (Math.max(Math.abs(direction[0]), Math.abs(direction[1])) !== 1
        || target.position[2] !== actor.position[2]) throw new Error('P3_NATIVE_MOVE_TARGET_NOT_ADJACENT');
    return { actorRef: 'avatar', primitive: 'open', args: { direction },
      references: { targets: target.target_ref } };
  }
  if (operation.op === 'request_activity') {
    if (operation.activity_kind !== 'wait' || operation.target_refs?.length) {
      throw new Error('P3_ACTIVITY_UNSUPPORTED');
    }
    return { actorRef: 'avatar', primitive: 'wait', args: {}, references: {} };
  }
  if (operation.op === 'emit_interaction') {
    if (operation.interaction_kind !== 'speech' || typeof operation.content !== 'string') {
      throw new Error('P3_INTERACTION_UNSUPPORTED');
    }
    const refs = operation.target_actor_refs;
    if (!Array.isArray(refs) || refs.length < 1 || new Set(refs).size !== refs.length
        || refs.some(ref => !observation.actors.some(actorRow => actorRow.actor_ref === ref
          && actorRow.visible === true))) throw new Error('P3_TYPED_VISIBLE_LISTENER_UNRESOLVED');
    return { actorRef: 'avatar', primitive: 'speak', args: { utterance: operation.content },
      references: { actors: refs } };
  }
  throw new Error('P3_TYPED_OPERATION_UNSUPPORTED');
}

export async function runP3TurnStep({ intent, observation, nativeAdapter,
  turnStepModel, operationId = randomUUID(), conversationOwnerForSpeech = null } = {}) {
  if (typeof intent !== 'string' || !intent.trim()) throw new TypeError('intent required');
  if (typeof turnStepModel !== 'function') throw new TypeError('turnStepModel required');
  requireP3NativeSeam(nativeAdapter);
  const initial = { actor_ref: 'avatar', native_observation: structuredClone(observation) };
  const applyNativeOperation = async ({ operation, working_projection: projection }) => {
        const current = projection.native_observation;
        const mapped = mapP3TurnOperationToNative(operation, current);
        const envelope = createP3OperationEnvelope({ operationId,
          observation: current, ...mapped,
          registeredPrimitives: ['move', 'use_item', 'open', 'wait', 'speak', 'pickup'] });
        const rawReadback = typeof nativeAdapter.execute === 'function'
          ? await nativeAdapter.execute(envelope)
          : (await nativeAdapter.writeOperationRequest(envelope),
            await nativeAdapter.readOperationReadback(envelope));
        const readback = validateP3Readback(envelope, rawReadback);
        if (mapped.primitive === 'speak' && readback.status === 'applied'
            && (readback.native_effect?.utterance !== mapped.args.utterance
              || readback.native_effect?.speakerId !== String(current.actors.find(({ actor_ref }) =>
                actor_ref === 'avatar').actor_id))) {
          throw new Error('P3_NATIVE_SPEECH_READBACK_MISMATCH');
        }
        let conversationOutcome = null;
        if (mapped.primitive === 'speak' && readback.status === 'applied'
            && readback.native_effect?.actualHeardListenerIds?.length
            && typeof conversationOwnerForSpeech === 'function') {
          const owner = await conversationOwnerForSpeech({ operation: structuredClone(operation),
            envelope: structuredClone(envelope), readback: structuredClone(readback) });
          conversationOutcome = applyP3NativeSpeech(owner.ownerContext, owner.working,
            owner.validatedPlan, { opId: envelope.operation_id,
              conversationId: owner.ownerContext.conversationId,
              exchangeId: owner.ownerContext.exchangeId,
              stateVersion: owner.ownerContext.stateVersion,
              speakerId: readback.native_effect?.speakerId,
              utterance: readback.native_effect?.utterance,
              actualHeardListenerIds: readback.native_effect?.actualHeardListenerIds,
              elapsedSeconds: readback.native_effect?.elapsedSeconds,
              beforeTime: readback.before?.clock,
              nativeTime: readback.after?.clock,
              socialDeliveryResult: readback.native_effect?.socialDeliveryResult }, owner.replay);
        }
        const nativeResult = projectP3NativeReadback(readback, mapped.primitive);
        const nativeGoalResult = nativeResult.goal_result;
        return { working_projection: { ...projection, native_readback: structuredClone(readback),
          ...(conversationOutcome ? { conversation_outcome: structuredClone(conversationOutcome) } : {}),
          native_goal_result: nativeGoalResult },
          summary: `Native ${mapped.primitive}: ${readback.status}`,
          goal_result: nativeGoalResult,
          continuation: null, boundary: true };
  };
  const executionRegistry = createTurnStepExecutionRegistry({
    direct: { move_entity: applyNativeOperation },
    domain: Object.fromEntries(['request_movement', 'request_item_use',
      'request_container_access', 'request_activity', 'emit_interaction'].map(op => [op,
      applyNativeOperation])),
    operationContract: { move_entity: { owner: 'p3_native', intent_only: true,
      supported_placement: { relation: 'held_by', target_ref: 'avatar' } } },
    applySemanticActivity: async ({ plan, request, working_projection: projection }) => {
      if (plan.direct_result_kind !== 'player_utterance') return {
        working_projection: projection, summary: 'semantic request dispatched'
      };
      const delivery = plan.utterance?.delivery;
      if (delivery?.loudness !== 2 || delivery?.duration_class !== 'brief') {
        throw new Error('P3_PLAYER_UTTERANCE_DELIVERY_UNSUPPORTED');
      }
      if (plan.utterance.speaker_ref !== (request.actor.actor_id ?? request.actor.actor_ref)) {
        throw new Error('P3_PLAYER_UTTERANCE_SPEAKER_MISMATCH');
      }
      if (typeof conversationOwnerForSpeech !== 'function') {
        throw new Error('P3_NATIVE_SPEECH_OWNER_REQUIRED');
      }
      const operation = { op: 'emit_interaction', actor_ref: 'avatar',
        target_actor_refs: projection.native_observation.actors
          .filter(({ actor_ref, visible }) => actor_ref !== 'avatar' && visible === true)
          .map(({ actor_ref }) => actor_ref),
        interaction_kind: 'speech', content: plan.utterance.utterance_text,
        instrument_refs: [] };
      return applyNativeOperation({ operation, working_projection: projection });
    }
  });
  return runTurnStepLoop({ requestId: operationId, rootTurnId: operationId,
    committedStateVersion: 0, rootPlayerAction: intent,
    actor: { actor_ref: 'avatar' }, initialWorkingProjection: initial }, {
    executionRegistry, turnStepModel,
    projectPlayerSafeState: async ({ working_projection: projection }) => {
      const current = projection.native_observation;
      return { player_safe_state: { actor_ref: 'avatar', current_position:
        current.actors.find(({ actor_ref: ref }) => ref === 'avatar').position,
        visible_entities: [...current.items.map(item => ({ ...item,
          ...(typeof item.item_uid === 'string' ? { entity_ref: item.item_uid } : {}) })), ...current.targets,
          ...current.actors.filter(({ actor_ref, visible }) => actor_ref !== 'avatar' && visible === true)] },
      available_domain_operations: buildP3TurnOperations(current) };
    },
    revalidateCommittedState: async () => ({ state_version: 0 })
  });
}

export function validateP3RoleConfigs(env = process.env, settingsOwner) {
  const roles = ['turn_step_planner', 'turn_step_planner_repair',
    'npc_autonomous_decider', 'npc_autonomous_decider_format_repair',
    'npc_conversation_responder', 'npc_conversation_responder_format_repair'];
  requireP3QwenSettingsOwner(settingsOwner);
  return Object.freeze(roles.map(roleId => resolveP3EffectiveConfig({ roleId, env, settingsOwner })));
}

export async function loadP3QwenSettingsOwner({ env = process.env } = {}) {
  const filePath = typeof env.RUS_LLM_SETTINGS_PATH === 'string' ? env.RUS_LLM_SETTINGS_PATH.trim() : '';
  if (!filePath) throw new Error('P3_LLM_SETTINGS_PATH_REQUIRED');
  const initialRecord = await createLlmSettingsFileStore({ filePath }).load();
  if (!initialRecord) throw new Error('P3_LLM_SETTINGS_REQUIRED');
  const settingsOwner = createLlmSettingsOwner({ initialRecord });
  requireP3QwenSettingsOwner(settingsOwner, { requirePrivateEndpoint: true });
  return settingsOwner;
}

function requireP3QwenSettingsOwner(settingsOwner, { requirePrivateEndpoint = false } = {}) {
  if (typeof settingsOwner?.providerSnapshot !== 'function') throw new Error('P3_LLM_SETTINGS_OWNER_REQUIRED');
  const snapshot = settingsOwner.providerSnapshot();
  let url;
  try { url = new URL(snapshot.baseUrl); } catch { throw new Error('P3_QWEN_SETTINGS_REQUIRED'); }
  if (snapshot.mode !== 'custom' || snapshot.compatibility !== 'openai_compatible'
      || snapshot.model !== 'qwen3.8-27b-uncensored-w4a16-tp2' || !snapshot.apiKey
      || (requirePrivateEndpoint && (url.protocol !== 'http:' || !isPrivateLanHost(url.hostname)))) {
    throw new Error('P3_QWEN_SETTINGS_REQUIRED');
  }
  return snapshot;
}

function isPrivateLanHost(hostname) {
  const match = /^(?:10\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})|172\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})|192\.168\.(\d{1,3})\.(\d{1,3}))$/u.exec(hostname);
  if (!match) return false;
  const octets = hostname.split('.').map(Number);
  if (octets.some(value => value > 255)) return false;
  return !hostname.startsWith('172.') || (octets[1] >= 16 && octets[1] <= 31);
}

function sanitizeP3RoleConfigs(configs) {
  const fields = ['role_id', 'provider', 'model', 'temperature', 'top_p',
    'max_tokens', 'context_window_tokens', 'input_limit_tokens', 'timeout_ms', 'api_key_present'];
  if (!Array.isArray(configs) || configs.length !== 6) {
    throw new Error('P3_SEALED_ROLE_CONFIG_REQUIRED');
  }
  return configs.map(config => {
    jsonObject(config, 'role config');
    if (typeof config.role_id !== 'string' || typeof config.provider !== 'string'
        || typeof config.model !== 'string' || typeof config.api_key_present !== 'boolean'
        || !Number.isFinite(config.temperature) || !Number.isFinite(config.top_p)
        || !Number.isSafeInteger(config.max_tokens) || !Number.isSafeInteger(config.timeout_ms)
        || config.context_window_tokens !== 65_536
        || config.input_limit_tokens !== config.context_window_tokens - config.max_tokens) {
      throw new Error('P3_SEALED_ROLE_CONFIG_INVALID');
    }
    return Object.fromEntries(fields.map(key => [key, config[key]]));
  });
}

function jsonObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function freezeTree(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeTree);
    Object.freeze(value);
  }
  return value;
}

function assertSafeNativeArgs(value) {
  if (Array.isArray(value)) return value.forEach(assertSafeNativeArgs);
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (/^(?:command|shell|test_filter|native_binary|executable|script)$/i.test(key)) {
        throw new Error('P3_UNTRUSTED_NATIVE_CONTROL_FIELD');
      }
      assertSafeNativeArgs(item);
    }
  }
}

export function createP3OperationEnvelope({ operationId = randomUUID(), observation,
  actorRef, primitive, args, references = {}, registeredPrimitives = [] } = {}) {
  jsonObject(observation, 'observation');
  jsonObject(args, 'args');
  jsonObject(references, 'references');
  assertSafeNativeArgs(args);
  if (typeof operationId !== 'string' || !operationId.trim()) throw new TypeError('operationId required');
  if (typeof observation.revision !== 'string' && !Number.isSafeInteger(observation.revision)) {
    throw new TypeError('observation revision required');
  }
  if (!Number.isSafeInteger(observation.turn) || observation.turn !== Number(observation.revision)) {
    throw new Error('P3_NATIVE_OBSERVATION_TURN_REVISION_MISMATCH');
  }
  if (typeof primitive !== 'string' || !primitive.trim()
      || !Array.isArray(registeredPrimitives) || !registeredPrimitives.includes(primitive)) {
    throw new Error('P3_NATIVE_PRIMITIVE_NOT_REGISTERED');
  }
  const actors = Array.isArray(observation.actors) ? observation.actors : [];
  const actor = actors.find(item => item.actor_ref === actorRef);
  if (!actor || typeof actor.actor_id !== 'string' || !actor.actor_id) throw new Error('P3_ACTOR_REFERENCE_UNRESOLVED');
  const refFields = { items: ['item_ref', 'item_uid'], targets: ['target_ref', 'target_ref'],
    actors: ['actor_ref', 'actor_id'] };
  const resolve = (kind, ref) => {
    const rows = Array.isArray(observation[kind]) ? observation[kind] : [];
    const [refField, idField] = refFields[kind] ?? [];
    if (!refField) throw new TypeError(`unsupported native reference kind: ${kind}`);
    const row = rows.find(item => item[refField] === ref);
    if (!row) throw new Error(`P3_${kind.toUpperCase()}_REFERENCE_UNRESOLVED`);
    return row[idField];
  };
  const resolvedReferences = {};
  for (const [kind, ref] of Object.entries(references)) {
    if (kind === 'actors') {
      if (!Array.isArray(ref) || !ref.length) throw new TypeError('reference actors must be nonempty');
      resolvedReferences[kind] = ref.map(actorRef => {
        if (typeof actorRef !== 'string' || !actorRef) throw new TypeError('actor reference must be nonempty');
        const id = resolve(kind, actorRef);
        if (typeof id !== 'string' || !id) throw new Error('P3_ACTORS_NATIVE_ID_MISSING');
        return { ref: actorRef, id };
      });
      continue;
    }
    if (typeof ref !== 'string' || !ref) throw new TypeError(`reference ${kind} must be a nonempty string`);
    const id = resolve(kind, ref);
    if (typeof id !== 'string' || !id) throw new Error(`P3_${kind.toUpperCase()}_NATIVE_ID_MISSING`);
    resolvedReferences[kind] = { ref, id };
  }
  return freezeTree({ schema: 'p3_native_operation_request_v1', operation_id: operationId,
    expected_native_observation: { turn: observation.turn, revision: structuredClone(observation.revision),
      actor_id: actor.actor_id, references: structuredClone(resolvedReferences) },
    actor_id: actor.actor_id, primitive, args: structuredClone(args), references: resolvedReferences });
}

export async function writeP3OperationRequest(userDir, envelope) {
  const request = jsonObject(envelope, 'envelope');
  if (request.schema !== 'p3_native_operation_request_v1' || !request.operation_id) {
    throw new TypeError('validated P3 operation envelope required');
  }
  const file = path.join(userDir, 'novgorod-p3-operation.json');
  await mkdir(userDir, { recursive: true });
  await writeFile(file, `${JSON.stringify(request, null, 2)}\n`, { flag: 'wx' });
  return file;
}

export function validateP3Readback(request, readback) {
  jsonObject(request, 'request');
  jsonObject(readback, 'readback');
  if (readback.schema !== 'p3_native_operation_readback_v1'
      || readback.operation_id !== request.operation_id) {
    throw new Error('P3_NATIVE_READBACK_IDENTITY_MISMATCH');
  }
  if (!readback.before || !readback.after) throw new Error('P3_NATIVE_ACTUAL_BEFORE_AFTER_REQUIRED');
  const nativeEffectStatus = readback.native_effect?.effect_status;
  const legacyEffectStatus = readback.effect_status;
  if (!(nativeEffectStatus == null
      ? ['achieved', 'partially_achieved', 'not_achieved', 'unknown'].includes(legacyEffectStatus)
      : ['confirmed', 'progressing', 'none', 'refused'].includes(nativeEffectStatus))
      || (readback.goal_result != null
        && !['achieved', 'in_progress', 'not_achieved', 'refused'].includes(readback.goal_result))) {
    throw new Error('P3_NATIVE_EFFECT_STATUS_INVALID');
  }
  const refusalEffect = nativeEffectStatus ?? legacyEffectStatus;
  if (readback.status === 'refused') {
    if (typeof readback.refusal?.code !== 'string' || !readback.refusal.code) {
      throw new Error('P3_NATIVE_REFUSAL_REASON_MISSING');
    }
    if (refusalEffect !== 'not_achieved' && refusalEffect !== 'refused') {
      throw new Error('P3_NATIVE_REFUSAL_EFFECT_MISMATCH');
    }
    return freezeTree(structuredClone(readback));
  }
  if (readback.status !== 'applied') throw new Error('P3_NATIVE_READBACK_STATUS_INVALID');
  return freezeTree(structuredClone(readback));
}

function projectP3NativeReadback(readback, primitive = null) {
  const nativeEffectStatus = readback.native_effect?.effect_status;
  const effectStatus = nativeEffectStatus ?? readback.effect_status ?? 'unknown';
  let goalResult;
  if (readback.status === 'refused' || readback.goal_result === 'refused'
      || readback.goal_result === 'not_achieved') goalResult = 'not_achieved';
  else if (readback.goal_result === 'achieved') goalResult = 'achieved';
  else if (readback.goal_result === 'in_progress') goalResult = 'partially_achieved';
  else if (readback.effect_status != null) {
    goalResult = readback.effect_status === 'not_achieved' ? 'not_achieved'
      : primitive === 'wait' || readback.effect_status === 'partially_achieved'
        ? 'partially_achieved'
        : readback.effect_status === 'achieved' ? 'achieved' : 'not_achieved';
  } else throw new Error('P3_NATIVE_GOAL_RESULT_MISSING');
  return { effect_status: effectStatus, goal_result: goalResult };
}

export function requireP3NativeSeam(nativeAdapter) {
  if (typeof nativeAdapter?.writeOperationRequest !== 'function'
      || typeof nativeAdapter?.readOperationReadback !== 'function') {
    const error = new Error('P3_NATIVE_SEAM_UNAVAILABLE');
    error.code = 'P3_NATIVE_SEAM_UNAVAILABLE';
    throw error;
  }
  return nativeAdapter;
}

export async function applyP3CoordinatorSpeech({ nativeAdapter, request } = {}) {
  requireP3NativeSeam(nativeAdapter);
  jsonObject(request, 'coordinator request');
  if (request.schema !== 'p3_p4_semantic_request_v1'
      || !request.native_operation || request.native_operation.operation_id !== request.operation_id
      || request.native_operation.schema !== 'p3_native_operation_request_v1'
      || request.native_operation.primitive !== 'speak'
      || request.native_operation.expected_native_observation?.revision !== request.observation_revision) {
    throw new Error('P3_COORDINATOR_REQUEST_INVALID');
  }
  const semantic = jsonObject(request.validated_semantic_input, 'validated semantic input');
  const ownerContext = jsonObject(semantic.owner_context, 'validated conversation owner context');
  const validatedPlan = jsonObject(semantic.validated_plan, 'validated conversation plan');
  if (validatedPlan.conversation_id !== ownerContext.conversationId
      || validatedPlan.state_version !== ownerContext.stateVersion) {
    throw new Error('P3_COORDINATOR_SEMANTIC_IDENTITY_MISMATCH');
  }
  const beforeObservation = await nativeAdapter.refreshObservation();
  if (beforeObservation.revision !== request.observation_revision) {
    throw new Error('P3_COORDINATOR_OBSERVATION_REVISION_MISMATCH');
  }
  const readback = await nativeAdapter.execute(request.native_operation);
  const afterObservation = await nativeAdapter.refreshObservation();
  if (!beforeObservation.native_snapshot || !afterObservation.native_snapshot
      || !readback.before || !readback.after
      || !isDeepStrictEqual(beforeObservation.native_snapshot, readback.before)
      || !isDeepStrictEqual(afterObservation.native_snapshot, readback.after)) {
    throw new Error('P3_NATIVE_OBSERVATION_SNAPSHOT_MISMATCH');
  }
  const effect = readback.native_effect ?? {};
  const conversationOutcome = applyP3NativeSpeech(ownerContext, semantic.working_state,
    validatedPlan, { opId: readback.operation_id,
      conversationId: ownerContext.conversationId, exchangeId: ownerContext.exchangeId,
      stateVersion: ownerContext.stateVersion, speakerId: effect.speakerId, utterance: effect.utterance,
      actualHeardListenerIds: effect.actualHeardListenerIds,
      elapsedSeconds: effect.elapsedSeconds ?? effect.elapsed_seconds,
      beforeTime: readback.before?.clock, nativeTime: readback.after?.clock,
      socialDeliveryResult: effect.socialDeliveryResult }, new Map());
  return { before_observation: beforeObservation, after_observation: afterObservation,
    native_readback: readback, conversation_outcome: conversationOutcome };
}

export async function readP3NativeObservation(userDir) {
  const file = path.join(userDir, 'novgorod-p3-observation.json');
  const observation = JSON.parse(await readFile(file, 'utf8'));
  jsonObject(observation, 'native observation');
  if (observation.schema !== 'p3_native_observation_v1'
      || !(typeof observation.revision === 'string' || Number.isSafeInteger(observation.revision))
      || !Number.isSafeInteger(observation.turn) || observation.turn !== Number(observation.revision)
      || !Array.isArray(observation.actors) || !Array.isArray(observation.items)
      || !Array.isArray(observation.targets)) {
    throw new Error('P3_NATIVE_OBSERVATION_INVALID');
  }
  for (const actor of observation.actors) {
    if (!actor || typeof actor.actor_ref !== 'string' || typeof actor.actor_id !== 'string'
        || !Array.isArray(actor.position)) throw new Error('P3_NATIVE_OBSERVATION_INVALID');
  }
  for (const [kind, rows, refField, idField] of [
    ['item', observation.items, 'item_ref', 'item_uid'],
    ['target', observation.targets, 'target_ref', 'target_ref']
  ]) {
    for (const row of rows) {
      if (!row || typeof row[refField] !== 'string' || typeof row[idField] !== 'string') {
        throw new Error(`P3_NATIVE_${kind.toUpperCase()}_OBSERVATION_INVALID`);
      }
    }
  }
  return freezeTree(observation);
}

export function createP3NativeFileAdapter({ userDir, pollIntervalMs = 100,
  timeoutMs = 30_000 } = {}) {
  if (typeof userDir !== 'string' || !userDir) throw new TypeError('userDir required');
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < pollIntervalMs) {
    throw new TypeError('invalid native readback timing');
  }
  return Object.freeze({
    readObservation: () => readP3NativeObservation(userDir),
    writeOperationRequest: envelope => writeP3OperationRequest(userDir, envelope),
    async readOperationReadback(request) {
      const file = path.join(userDir, 'novgorod-p3-operation-readback.json');
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          const result = validateP3Readback(request, JSON.parse(await readFile(file, 'utf8')));
          return result;
        } catch (error) {
          if (error?.code !== 'ENOENT' && error?.name !== 'SyntaxError') throw error;
        }
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
      const error = new Error('P3_NATIVE_READBACK_TIMEOUT');
      error.code = 'P3_NATIVE_READBACK_TIMEOUT';
      throw error;
    }
  });
}

const execFileAsync = promisify(execFile);

export function createP3NativeProcessAdapter({ binary, nativeRoot, nativeUserDir,
  hostUserDir, world, wslExecutable = 'wsl.exe', wslDistribution = null,
  timeoutMs = 120_000, execFileImpl = execFileAsync } = {}) {
  for (const [name, value] of Object.entries({ binary, nativeRoot, nativeUserDir, hostUserDir, world })) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} required`);
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1
      || typeof execFileImpl !== 'function') throw new TypeError('invalid native process config');
  const run = async mode => {
    if (!['create', 'read', 'apply'].includes(mode)) throw new Error('P3_NATIVE_MODE_INVALID');
    const nativeArgs = ['--rng-seed', '17', `--user-dir=${nativeUserDir}`, '[novgorod_semantic]'];
    const windows = process.platform === 'win32';
    const executable = windows ? wslExecutable : binary;
    const args = windows
      ? [...(wslDistribution ? ['--distribution', wslDistribution] : []), '--cd', nativeRoot,
        '--exec', '/usr/bin/env', `NOVGOROD_P4_MODE=${mode}`, `NOVGOROD_P4_WORLD=${world}`, binary, ...nativeArgs]
      : nativeArgs;
    const options = { cwd: windows ? undefined : nativeRoot, timeout: timeoutMs,
      windowsHide: true, maxBuffer: 4 * 1024 * 1024, shell: false,
      ...(windows ? {} : { env: { ...process.env, NOVGOROD_P4_MODE: mode,
        NOVGOROD_P4_WORLD: world } }) };
    try {
      return await execFileImpl(executable, args, options);
    } catch (error) {
      const detail = String(error?.stderr ?? error?.message ?? 'native process failed').slice(0, 1000);
      const failure = new Error(`P3_NATIVE_PROCESS_FAILED:${detail}`);
      failure.code = 'P3_NATIVE_PROCESS_FAILED';
      throw failure;
    }
  };
  const files = createP3NativeFileAdapter({ userDir: hostUserDir, timeoutMs: timeoutMs });
  return Object.freeze({ ...files, runNative: run,
    async preflight() {
      await mkdir(hostUserDir, { recursive: true });
      await run('create');
      return this.refreshObservation();
    },
    async execute(request) {
      for (const name of ['novgorod-p3-operation.json', 'novgorod-p3-operation-readback.json']) {
        try { await unlink(path.join(hostUserDir, name)); }
        catch (error) { if (error?.code !== 'ENOENT') throw error; }
      }
      await files.writeOperationRequest(request);
      await run('apply');
      return files.readOperationReadback(request);
    },
    async refreshObservation() {
      try { await unlink(path.join(hostUserDir, 'novgorod-p3-observation.json')); }
      catch (error) { if (error?.code !== 'ENOENT') throw error; }
      await run('read');
      return files.readObservation();
    }
  });
}

const SECRET_KEY = /^(?:token|authorization|headers?|api[-_]?key|secret|credential|password|access[-_]?token|refresh[-_]?token|auth[-_]?token|bearer[-_]?token)$|(?:^|[_-])(?:authorization|headers?|api[-_]?key|secret|credential|password)(?:$|[_-])/i;
const SECRET_TEXT = /(?:Bearer\s+[^\s,}"']+|sk-[A-Za-z0-9_-]{8,}|["']?(?:api[_-]?key|authorization|password)["']?\s*[:=]\s*(?:Bearer\s+)?)\S*/gi;
export function sanitizeP3Evidence(value) {
  if (Array.isArray(value)) return value.map(sanitizeP3Evidence);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, SECRET_KEY.test(key) ? '[REDACTED]' : sanitizeP3Evidence(item)]));
  }
  return typeof value === 'string' ? value.replace(SECRET_TEXT, '[REDACTED]') : value;
}

export async function createP3EvidenceRun(directory, { operationId, metadata } = {}) {
  if (typeof operationId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(operationId)
      || operationId.includes('..')) throw new TypeError('safe operationId required');
  await mkdir(directory, { recursive: true });
  const runDirectory = path.join(directory, operationId);
  await mkdir(runDirectory, { recursive: false });
  const write = async (name, value) => appendFile(path.join(runDirectory, name),
    `${JSON.stringify(sanitizeP3Evidence(value))}\n`, { flag: 'a' });
  await write('run.jsonl', { event: 'created', operation_id: operationId, metadata });
  return Object.freeze({ directory: runDirectory,
    record: (value) => write('run.jsonl', value) });
}

export function validateP3SealedCasePack(pack) {
  jsonObject(pack, 'sealed case pack');
  const keysAre = (value, keys) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');
  if (pack.schema !== 'p3_sealed_case_pack_v1'
      || typeof pack.package_id !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(pack.package_id)
      || pack.package_id.includes('..') || !Array.isArray(pack.cases)
      || pack.cases.length < P3_CASE_IDS.length
      || !keysAre(pack, ['schema', 'package_id', 'cases'])) {
    throw new Error('P3_SEALED_CASE_PACK_INVALID');
  }
  const seenCases = new Set();
  const seenVariants = new Set();
  for (const item of pack.cases) {
    jsonObject(item, 'sealed case');
    requireP3CaseId(item.case_id);
    if (typeof item.variant_id !== 'string'
        || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(item.variant_id)
        || item.variant_id.includes('..') || seenVariants.has(item.variant_id)
        || typeof item.intent !== 'string' || !item.intent.trim()
        || item.reset_count !== 3
        || !keysAre(item, ['case_id', 'variant_id', 'intent', 'reset_count'])) {
      throw new Error('P3_SEALED_CASE_RESET_SET_INVALID');
    }
    seenCases.add(item.case_id);
    seenVariants.add(item.variant_id);
  }
  if (P3_CASE_IDS.some(caseId => !seenCases.has(caseId))) {
    throw new Error('P3_SEALED_CASE_SET_INVALID');
  }
  return pack;
}

export async function runP3SealedPackage({ casePack, nativeConfig, roleConfigs,
  createRuntime = ({ budget }) => createP3RoleRuntime({ budget }),
  nativeAdapterFactory = createP3NativeProcessAdapter,
  conversationOwnerFactory = null } = {}) {
  validateP3SealedCasePack(casePack);
  jsonObject(nativeConfig, 'native config');
  if (typeof nativeConfig.evidence_root !== 'string' || !nativeConfig.evidence_root.trim()
      || typeof nativeConfig.nativeUserDir !== 'string' || !nativeConfig.nativeUserDir.trim()
      || typeof nativeConfig.hostUserDir !== 'string' || !nativeConfig.hostUserDir.trim()
      || typeof nativeConfig.world !== 'string' || !nativeConfig.world.trim()) {
    throw new Error('P3_SEALED_NATIVE_CONFIG_INVALID');
  }
  if (typeof createRuntime !== 'function' || typeof nativeAdapterFactory !== 'function') {
    throw new TypeError('sealed package factories required');
  }
  const safeRoleConfigs = sanitizeP3RoleConfigs(roleConfigs);

  // Creating the evidence root exclusively makes a restart of this package fail closed.
  await mkdir(nativeConfig.evidence_root, { recursive: false });
  await writeFile(path.join(nativeConfig.evidence_root, 'case-pack.json'),
    `${JSON.stringify(casePack, null, 2)}\n`, { flag: 'wx' });
  await writeFile(path.join(nativeConfig.evidence_root, 'role-config.json'),
    `${JSON.stringify(safeRoleConfigs, null, 2)}\n`, { flag: 'wx' });
  const evidence = await createP3EvidenceRun(path.join(nativeConfig.evidence_root, 'events'), {
    operationId: casePack.package_id,
    metadata: { schema: casePack.schema, package_id: casePack.package_id,
      cases: casePack.cases.map(({ case_id, variant_id, reset_count }) =>
        ({ case_id, variant_id, reset_ids: Array.from({ length: reset_count }, (_, i) => i + 1) })),
      native_seed: 17, provider_attempt_budget: P3_ATTEMPT_BUDGET,
      native_binary: nativeConfig.binary, native_root: nativeConfig.nativeRoot }
  });
  const budget = createP3AttemptBudget({
    onAttempt: event => evidence.record({ event: 'provider_attempt', ...event })
  });
  const runtime = await createRuntime({ budget });
  if (typeof runtime?.turnStepModel !== 'function') throw new Error('P3_SEALED_TURN_MODEL_REQUIRED');
  const resetResults = [];
  try {
    for (const { case_id, variant_id, intent, reset_count } of casePack.cases) {
      for (let reset_id = 1; reset_id <= reset_count; reset_id++) {
        const nativeConfigForReset = { ...nativeConfig,
          nativeUserDir: path.posix.join(nativeConfig.nativeUserDir, case_id, variant_id, String(reset_id)),
          hostUserDir: path.join(nativeConfig.hostUserDir, case_id, variant_id, String(reset_id)),
          world: `${nativeConfig.world}-${case_id}-${variant_id}-${reset_id}` };
        const native = nativeAdapterFactory(nativeConfigForReset);
        if (typeof native?.preflight !== 'function') throw new Error('P3_SEALED_PREFLIGHT_REQUIRED');
        const operationId = `${case_id}-${variant_id}-r${reset_id}`;
        await evidence.record({ event: 'sealed_reset_start', case_id, variant_id, reset_id, intent });
        const observation = await native.preflight();
        await evidence.record({ event: 'native_preflight', case_id, variant_id, reset_id, observation });
        const speechReplay = new Map();
        const conversationOwnerForSpeech = case_id === 'T10'
          ? async args => {
            const owner = typeof conversationOwnerFactory === 'function'
              ? await conversationOwnerFactory({ case_id, variant_id, reset_id, native,
                observation, ...args })
              : createP3NativeSpeechOwnerFixture({ observation,
                readback: args.readback, operation: args.operation });
            return { ...owner, replay: owner.replay ?? speechReplay };
          }
          : typeof conversationOwnerFactory === 'function'
            ? args => conversationOwnerFactory({ case_id, variant_id, reset_id, native,
              observation, ...args }) : null;
        const isT09 = case_id === 'T09';
        const result = isT09 ? null : await runP3TurnStep({ intent, observation,
          nativeAdapter: native, turnStepModel: runtime.turnStepModel, operationId,
          conversationOwnerForSpeech });
        const readback = result?.working_projection?.native_readback ?? null;
        let npcBoundary = null;
        let npcReplay = null;
        let npcSemanticDecisionCount = 0;
        let npcReplayDecisionCount = 0;
        let npcSemanticProviderCalls = 0;
        let npcNativeOperationCount = 0;
        let npcReplayNativeOperationCount = 0;
        if (isT09) {
          if (typeof runtime.npcAutonomousModel !== 'function') {
            throw new Error('P3_SEALED_NPC_MODEL_REQUIRED');
          }
          const npcObservation = await native.refreshObservation();
          const actorId = selectP3NativeNpcFixture(npcObservation);
          if (!actorId) throw new Error('P3_NATIVE_NPC_FIXTURE_ACTOR_UNAVAILABLE');
          const replay = new Map();
          let decisions = 0;
          let operations = 0;
          const measuredModel = input => {
            decisions++;
            return runtime.npcAutonomousModel(input);
          };
          const measuredNative = { ...native,
            ...(typeof native.execute === 'function' ? { async execute(...args) {
              operations++;
              return native.execute(...args);
            } } : { async writeOperationRequest(...args) {
              operations++;
              return native.writeOperationRequest(...args);
            } }) };
          const callsBeforeNpc = budget.calls;
          const decisionsBeforeNpc = decisions;
          const operationsBeforeNpc = operations;
          npcBoundary = await runP3NativeNpcFlow({ nativeAdapter: measuredNative, actorId,
            nativeObservation: npcObservation, semanticModel: measuredModel,
            replay, evidence });
          npcSemanticDecisionCount = decisions - decisionsBeforeNpc;
          npcNativeOperationCount = operations - operationsBeforeNpc;
          const replayDecisionsBefore = decisions;
          const replayOperationsBefore = operations;
          npcReplay = await runP3NativeNpcFlow({ nativeAdapter: measuredNative, actorId,
            nativeObservation: npcObservation, semanticModel: measuredModel,
            replay, evidence });
          npcReplayDecisionCount = decisions - replayDecisionsBefore;
          npcReplayNativeOperationCount = operations - replayOperationsBefore;
          npcSemanticProviderCalls = budget.calls - callsBeforeNpc;
          await evidence.record({ event: 'native_npc_boundary_replay', case_id,
            variant_id, reset_id, checkpoint: npcReplay });
        }
        if (result) await evidence.record({ event: 'native_turn_result', case_id,
          variant_id, reset_id, result });
        resetResults.push({ case_id, variant_id, reset_id,
          status: npcBoundary?.native_readback?.status ?? readback?.status ?? 'no_native_readback',
          effect_status: npcBoundary?.native_readback
            ? projectP3NativeReadback(npcBoundary.native_readback).effect_status
            : readback ? projectP3NativeReadback(readback).effect_status : 'unknown',
          native_goal_result: isT09 ? npcBoundary?.native_readback?.goal_result ?? 'unknown'
            : result.working_projection?.native_goal_result ?? 'unknown',
          ...(case_id === 'T09' ? { npc_boundary: npcBoundary,
            npc_replay: npcReplay, npc_semantic_decision_count: npcSemanticDecisionCount,
            npc_replay_decision_count: npcReplayDecisionCount, npc_semantic_provider_calls: npcSemanticProviderCalls,
            npc_native_operation_count: npcNativeOperationCount,
            npc_replay_native_operation_count: npcReplayNativeOperationCount } : {}),
          ...(case_id === 'T10' ? { social_statement: result.working_projection?.conversation_outcome
            ? 'owner_applied' : 'not_evaluated_context_unavailable' } : {}) });
      }
    }
  } catch (error) {
    await evidence.record({ event: 'sealed_package_failed', provider_calls: budget.calls,
      error: { name: error?.name ?? 'Error', code: error?.code ?? null,
        message: String(error?.message ?? error) } });
    throw error;
  }
  const summary = { schema: 'p3_sealed_package_result_v1', package_id: casePack.package_id,
    acceptance: 'not_evaluated',
    evidence_directory: evidence.directory, provider_calls: budget.calls,
    reset_results: resetResults };
  await evidence.record({ event: 'sealed_package_complete', summary });
  return summary;
}
