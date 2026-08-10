import { deepFreeze } from '@rus/kernel';
import { validateCombatSession } from '@rus/combat-health';
import { requestNpcSemanticDecision } from './npc-semantic-decision.js';
import { combatIntentFromPlan, installCombatIntent } from './combat-intent.js';

export function activateCombatSessionForPlayerIntent(session, intent) {
  if (!validateCombatSession(session) || session.status !== 'paused_for_player'
      || session.player_response_required !== true) {
    throw combatError('TURN_COMBAT_PLAYER_RESPONSE_NOT_ADMITTED');
  }
  const next = structuredClone(installCombatIntent(session, intent));
  next.status = 'active';
  next.player_response_required = false;
  if (!validateCombatSession(next)) {
    throw combatError('TURN_COMBAT_SESSION_INVALID');
  }
  return deepFreeze(next);
}

export function createCombatSession({ combat_id, state_version = '1', started_at,
  scope_ref, participant_refs } = {}) {
  const session = {
    schema: 'combat_session_v1', combat_id, state_version: String(state_version),
    status: 'paused_for_decisions', started_at: structuredClone(started_at),
    scope_ref: structuredClone(scope_ref), participant_refs: structuredClone(participant_refs),
    participant_states: Array.isArray(participant_refs) ? participant_refs.map((actor_ref) => ({
      actor_ref: structuredClone(actor_ref), combat_status: 'active',
      current_intent: null, next_action_boundary_ref: null
    })) : [], exchange_ordinal: 0, last_exchange_ref: null,
    player_response_required: false, last_change_set_ref: null
  };
  if (!validateCombatSession(session)) throw combatError('TURN_COMBAT_SESSION_INVALID');
  return deepFreeze(session);
}

export async function initializeCombatSession({
  session,
  decision_contexts,
  semantic_model = null,
  revalidate_state_version = null
} = {}) {
  if (!validateCombatSession(session) || session.status !== 'paused_for_decisions'
      || !Array.isArray(decision_contexts)) {
    throw combatError('TURN_COMBAT_INITIALIZATION_INPUT_INVALID');
  }

  const ordered = [...decision_contexts].sort((left, right) =>
    left.boundary.boundary_id.localeCompare(right.boundary.boundary_id, 'en'));
  const decisionResults = [];

  for (const context of ordered) {
    const result = await requestNpcSemanticDecision({
      boundary: context.boundary,
      request: context.request,
      orderedSignals: context.ordered_signals ?? [],
      persistedTrace: context.persisted_trace ?? null,
      persistedInput: context.persisted_input ?? null,
      semanticModel: context.semantic_model ?? semantic_model,
      revalidateStateVersion: context.revalidate_state_version
        ?? revalidate_state_version,
      rebuildDecisionContext: context.rebuild_decision_context ?? null,
      validatePlan: context.validate_plan ?? null
    });
    if (result.status === 'stale_discarded') {
      throw combatError('TURN_COMBAT_STATE_STALE');
    }
    if (!['planned', 'replayed'].includes(result.status)) {
      throw combatError('TURN_COMBAT_PLAN_NOT_APPLICABLE');
    }
    decisionResults.push(result);
  }

  let next = structuredClone(session);
  for (const result of decisionResults) {
    if (result.status !== 'planned' && result.status !== 'replayed') continue;
    const intent = combatIntentFromPlan(result.plan, {
      intent_id: `combat-intent:${result.plan.request_id}`,
      created_from_boundary_ref: {
        entity_kind: 'npc_decision_boundary',
        entity_id: result.plan.boundary_id
      },
      state_version: next.state_version
    });
    next = installCombatIntent(next, intent);
  }
  next = structuredClone(next);
  next.status = 'paused_for_player';
  next.player_response_required = true;
  return deepFreeze({ session: deepFreeze(next), decision_results: decisionResults });
}

function combatError(code) {
  return Object.assign(new Error(code), { code });
}
