export function turnStepRepairSpecificInstructions(repairContext, request) {
  const codes = new Set(repairContext?.structural_errors
    ?.map(({ code }) => code) ?? []);
  const instructions = [];
  if (repairContext?.structural_errors?.some(({ path }) =>
    path === '$.utterance')) instructions.push(
    'Required speech repair: retain the current actor speech step and correct only its utterance and uncovered continuation. Explicit player words require verbatim and exact intended quotation; do not copy another voice. Unquoted speech intent uses intent_paraphrase with faithful words and no added claim, promise or commitment. Never replace rejected speech with discovery, a gesture, or silent omission.'
  );
  if (codes.has('direct_result_kind')) instructions.push(
    'Required repair: classify the successful write-free direct result with direct_result_kind player_safe_body_observation for the supplied actor body, player_safe_item_observation for supplied carried/worn items, player_safe_observation for other supplied player-safe facts, player_utterance for explicit ownerless speech with utterance:{speaker_ref,utterance_text,input_mode}; verbatim copies supplied words, intent_paraphrase resolves an unquoted speech intention; otherwise no_state_gesture for a simple gesture only. Never classify speech as a gesture. Do not leave direct_result_kind null.'
  );
  if (codes.has('operation_semantic_grounding')) instructions.push(
    'Required operation grounding repair: discovery only reveals or materializes; it never acquires, relocates, transforms, handles, or uses the discovered referent. Words copied into a discovery query do not execute a physical act. Preserve every physical act not executed by another current operation in continuation, even when those words form a textual prefix of the query.'
  );
  if (codes.has('source_semantic_grounding')) instructions.push(
    `Required source repair: discard action_production and every stale source ref. Return one domain_request request_discovery with discovery_kind inspect, current actor_ref, one current visible scope ref, and a query naming only the missing ordinary material or physically connected group. Preserve the complete original action verbatim as continuation.remaining_intent=${JSON.stringify(request.remaining_intent)} with depends_on_refs:[]. Do not select a fixed authored discovery or execute any transformation in this step.`
  );
  if (codes.has('ordinary_discovery_query_identity')) instructions.push(
    `Required ordinary discovery repair: repair the query and continuation together. If discovery is a material prerequisite for taking, using, handling, or transforming an ordinary referent, query names only that needed referent, material, or physically connected group and continuation is exactly {"remaining_intent":${JSON.stringify(request.remaining_intent)},"depends_on_refs":[]}. Do not invent refs, outcomes, or execute the later action. Otherwise preserve standalone focused discovery losslessly: query is the complete request.remaining_intent with no continuation, or its exact earliest discovery prefix while continuation.remaining_intent is the exact uncovered suffix. Never summarize, omit, or rewrite either part.`
  );
  return instructions;
}
