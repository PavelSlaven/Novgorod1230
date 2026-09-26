import { startedHistoricalEventIds } from '@rus/time-events-history';

/**
 * Server port: committed party state → historical_events (A-02 / F1).
 * No side channel: callers pass events explicitly in authoritative.
 */
export function partyHistoricalEventsOf(committedState) {
  return Array.isArray(committedState?.historical_events)
    ? committedState.historical_events : [];
}

/**
 * Inject party historical_events into a semantic model call context (F1/F2).
 * stateOf: committed/working party state object or () => state.
 */
export function withPartyHistoricalEvents(model, stateOf) {
  if (typeof model !== 'function') return model;
  const wrapped = async (request, callContext = {}) => {
    const state = typeof stateOf === 'function' ? stateOf() : stateOf;
    const historicalEvents = Array.isArray(callContext?.historical_events)
      ? callContext.historical_events
      : partyHistoricalEventsOf(state);
    return model(request, { ...callContext, historical_events: historicalEvents });
  };
  if (typeof model.validateFreshPlan === 'function') {
    wrapped.validateFreshPlan = (...args) => model.validateFreshPlan(...args);
  }
  return wrapped;
}

export function actorFacetsOf(request, authoritative) {
  const exactNpc = request?.schema === 'npc_action_decision_request_v1';
  const conversationNpc = request?.schema === 'npc_conversation_response_request_v1';
  if (exactNpc || conversationNpc) {
    const roleRef = request.npc?.social_role?.role_ref;
    return typeof roleRef === 'string' && roleRef
      ? { role_ref: roleRef } : {};
  }
  const source = request.npc_safe_state ?? request.player_safe_state
    ?? request.player_safe_context ?? {};
  const result = {};
  for (const key of ['occupation_ref', 'role_ref', 'specialist_domain',
    'social_status', 'sex_category', 'age_category']) {
    const value = source[key] ?? source.identity?.[key];
    if (typeof value === 'string' && value) result[key] = value;
  }
  // D16/D20: dossier social_role_id is the runtime role_ref for actor-visible WK.
  if (result.role_ref == null) {
    const socialRoleId = source.social_role_id
      ?? source.social_status?.social_role_id
      ?? source.social_role?.social_role_id
      ?? source.social_role?.role_ref
      ?? source.identity?.social_role_id;
    if (typeof socialRoleId === 'string' && socialRoleId) {
      result.role_ref = socialRoleId;
    }
  }
  if (result.occupation_ref == null) {
    const occupationId = source.occupation_id
      ?? source.social_status?.occupation_id
      ?? source.identity?.occupation_id;
    if (typeof occupationId === 'string' && occupationId) {
      result.occupation_ref = occupationId;
    }
  }
  for (const key of ['occupation_ref', 'role_ref', 'specialist_domain',
    'social_status', 'sex_category', 'age_category']) {
    const value = authoritative?.actor_facets?.[key];
    if (typeof value === 'string' && value) result[key] = value;
  }
  return result;
}

/** Player dossier on committed party state → actor_facets for WK (D16/D20). */
export function playerActorFacetsFromState(committedState) {
  const dossier = committedState?.player_profile
    ?? committedState?.player?.dossier ?? null;
  return actorFacetsOf({
    player_safe_state: {
      social_role_id: dossier?.social_status?.social_role_id
        ?? dossier?.selected_candidate_refs?.social_role_id ?? null,
      occupation_id: dossier?.social_status?.occupation_id
        ?? dossier?.selected_candidate_refs?.occupation_id ?? null
    }
  }, null);
}

/** Single authoritative source for narration WK (F7): post-commit party state. */
export function playerWorldKnowledgeAuthoritativeFromState(committedState) {
  return {
    clock: committedState?.clock ?? null,
    historical_events: partyHistoricalEventsOf(committedState),
    actor_facets: playerActorFacetsFromState(committedState)
  };
}

/**
 * Inject party events + player role facets into a model-call context (D16).
 * Committed state always wins over callContext (F9).
 * stateOf: committed/working party state object or () => state.
 */
export function withPlayerWorldKnowledgeAuthoritative(model, stateOf) {
  if (typeof model !== 'function') return model;
  const wrapped = async (request, callContext = {}) => {
    const state = typeof stateOf === 'function' ? stateOf() : stateOf;
    return model(request, {
      ...callContext,
      historical_events: partyHistoricalEventsOf(state),
      actor_facets: playerActorFacetsFromState(state),
      clock: state?.clock ?? null
    });
  };
  return wrapped;
}

/**
 * One factory for party date gates on every WK purpose (A-02 / F1).
 * Always builds started_historical_events from events + clock (never accepts a
 * ready id list). Events only from authoritative.historical_events (explicit
 * adapter port); never from request body or a request_id side channel.
 */
export function partyWorldKnowledgeAuthoritative(request, authoritative = null) {
  const base = authoritative != null && typeof authoritative === 'object'
    && !Array.isArray(authoritative) ? { ...authoritative } : {};
  delete base.started_historical_events;
  const clock = base.clock
    ?? request?.player_safe_state?.clock
    ?? request?.npc_safe_state?.clock
    ?? request?.requested_at
    ?? request?.occurred_at
    ?? null;
  if (clock != null) base.clock = clock;
  const events = Array.isArray(base.historical_events)
    ? base.historical_events : [];
  base.historical_events = events;
  base.started_historical_events = clock != null
    ? [...startedHistoricalEventIds(clock, events)]
    : [];
  return base;
}
