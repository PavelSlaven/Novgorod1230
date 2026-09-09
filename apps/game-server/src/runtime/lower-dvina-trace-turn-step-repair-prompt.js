export function turnStepRepairSpecificInstructions(repairContext, request) {
  const codes = new Set(repairContext?.structural_errors
    ?.map(({ code }) => code) ?? []);
  const instructions = [];
  if (codes.has('direct_result_kind')) instructions.push(
    'Required repair: classify the successful write-free direct result with direct_result_kind player_safe_item_observation when it reviews supplied carried/worn items, player_safe_observation for other supplied player-safe facts, otherwise no_state_gesture. Do not leave direct_result_kind null.'
  );
  if (codes.has('source_semantic_grounding')) instructions.push(
    `Required source repair: discard action_production and every stale source ref. Return one domain_request request_discovery with discovery_kind inspect, current actor_ref, one current visible scope ref, and a query naming only the missing ordinary material or physically connected group. Preserve the complete original action verbatim as continuation.remaining_intent=${JSON.stringify(request.remaining_intent)} with depends_on_refs:[]. Do not select a fixed authored discovery or execute any transformation in this step.`
  );
  return instructions;
}
