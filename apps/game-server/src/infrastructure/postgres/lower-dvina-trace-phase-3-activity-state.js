import { projectSharedSemanticConsequence } from
  './lower-dvina-trace-conversation-state.js';

export function activityHistoryEntry({ partyId, turnNumber, factual,
  inputDigest, changeSetId }) {
  const phase3Kind = routeMovement(factual) ? 'movement'
    : factual.consequence.phase3_kind;
  const sharedConsequence = projectSharedSemanticConsequence(
    factual.consequence
  );
  const time = phase3Kind === 'movement'
    ? phase3RouteTimeUpdate(factual) : factual.time_update;
  const duration = phase3Kind === 'movement'
    ? Number(time.exact_elapsed?.exact_minutes?.numerator)
    : factual.consequence.conversation?.semantic_exchange
      ?.exchange?.time_budget?.total_minutes
      ?? factual.consequence.duration_minutes;
  return {
    activity_execution_id: phase3Kind === 'movement'
      ? `route-execution:${partyId}:trace-phase3:${turnNumber}`
      : `activity:${partyId}:trace-phase3:${turnNumber}`,
    activity_snapshot: {
      activity_ref: phase3ActivityRef(factual), consequence: phase3Kind
    },
    option_id: factual.mode_resolution.option_id,
    request_id: factual.player_input.request_id,
    input_digest: inputDigest,
    change_set_id: changeSetId,
    duration_minutes: duration,
    started_at: structuredClone(time.clock_before),
    ended_at: structuredClone(time.clock_after),
    execution_result: structuredClone(phase3Kind === 'movement'
      ? factual.consequence.movement : sharedConsequence.conversation)
  };
}

export function phase3RouteTimeUpdate(factual) {
  const route = factual.time_update?.prepared_effect_ledger?.slices?.find(
    ({ effect_kind: kind, owner_ref: owner }) =>
      kind === 'domain_command'
      && ['lower_dvina_trace.follow_path_to_fishing_camp',
        'lower_dvina_trace.follow_known_route_to_zhdanko_storehouse']
        .includes(owner));
  return route?.time_update ?? factual.time_update;
}

export function phase3ActivityRef(factual) {
  return routeMovement(factual)
    ? factual.consequence.movement.activity_ref
    : factual.consequence.conversation.activity_ref;
}

export function routeMovement(factual) {
  return factual?.consequence?.phase3_kind === 'movement'
    || factual?.consequence?.phase8_kind === 'movement';
}
