import { allTurnStepPlanMappings } from './lower-dvina-trace-turn-step-plan-mappings.js';

export function turnStepRepairSpecificInstructions(repairContext, request) {
  const codes = new Set(repairContext?.structural_errors
    ?.map(({ code }) => code) ?? []);
  const instructions = [];
  if (repairContext?.original_output?.direct_result_kind === 'player_utterance'
      || repairContext?.structural_errors?.some(({ path }) =>
        path === '$.utterance' || path?.startsWith('$.utterance.'))) instructions.push(
    'For ownerless speech repair, use the complete player_utterance envelope: resolution direct, activity {"owner":"semantic","duration_class":"moment","effort":"none"}, direct_result_kind player_utterance, operation_family null, operation_choice null, operations [], check null, clarification null. utterance has exactly speaker_ref equal to the current actor, utterance_text containing only the intended spoken words, and input_mode verbatim for exact supplied words or intent_paraphrase for faithful unquoted speech intent. Speech creates no entity and executes no physical operation. A completed speech-only step uses goal_result achieved and continuation null. If any independent later action remains, use goal_result pending and continuation {"remaining_intent":"<exact uncovered later action text>","depends_on_refs":[]}; speaking never consumes later listening, observation, movement, or manipulation.'
  );
  if (repairContext?.structural_errors?.some(({ path }) =>
    path === '$.utterance')) instructions.push(
    'Required speech repair: retain the current actor speech step and correct only its utterance and uncovered continuation. Explicit player words require verbatim and exact intended quotation; do not copy another voice. Unquoted speech intent uses intent_paraphrase with faithful words and no added claim, promise or commitment. Never replace rejected speech with discovery, a gesture, or silent omission.'
  );
  if (codes.has('direct_result_kind')) instructions.push(
    'Required repair: only a successful write-free direct result with semantic moment/none activity uses a non-null direct_result_kind: player_safe_body_observation for the supplied actor body, player_safe_item_observation for supplied carried/worn items, player_safe_observation for other supplied player-safe facts, player_utterance for explicit ownerless speech with utterance:{speaker_ref,utterance_text,input_mode}, or no_state_gesture for a simple gesture. Verbatim copies supplied words; intent_paraphrase resolves an unquoted speech intention. Never classify speech as a gesture. A sustained semantic activity instead requires direct_result_kind null.'
  );
  if (repairContext?.structural_errors?.some(({ path, code }) =>
    path === '$.utterance' && code === 'operation_semantic_grounding')) {
    instructions.push(
      'The proposed utterance failed semantic grounding. Determine from request.remaining_intent whether the player actually intends speech or a vocal signal. If not, discard utterance and use the matching non-speech semantic mapping, preserving any explicit duration. If yes, repair player_utterance faithfully. Typed first-person action prose is not speech.'
    );
  }
  if (codes.has('operation_semantic_grounding')) instructions.push(
    'Required operation grounding repair: discovery only reveals or materializes; it never acquires, relocates, transforms, handles, or uses the discovered referent. Words copied into a discovery query do not execute a physical act. Preserve every physical act not executed by another current operation in continuation, even when those words form a textual prefix of the query.'
  );
  if (codes.has('source_semantic_grounding')) instructions.push(
    `Required source repair: discard action_production and every stale source ref. Return one domain_request request_discovery with discovery_kind inspect, current actor_ref, one current visible scope ref, and a query naming only the missing ordinary material or physically connected group. Preserve the complete original action verbatim as continuation.remaining_intent=${JSON.stringify(request.remaining_intent)} with depends_on_refs:[]. Do not select a fixed authored discovery or execute any transformation in this step.`
  );
  if (codes.has('ordinary_discovery_query_identity')) instructions.push(
    `Required ordinary discovery repair: repair the query and continuation together. If discovery is a material prerequisite for taking, using, handling, or transforming an ordinary referent, query names only that needed referent, material, or physically connected group and continuation is exactly {"remaining_intent":${JSON.stringify(request.remaining_intent)},"depends_on_refs":[]}. Do not invent refs, outcomes, or execute the later action. Otherwise preserve standalone focused discovery losslessly: query is the complete request.remaining_intent with no continuation, or its exact earliest discovery prefix while continuation.remaining_intent is the exact uncovered suffix. Never summarize, omit, or rewrite either part.`
  );
  if (repairContext?.structural_errors?.length === 1
      && repairContext.structural_errors[0].path === '$.resolution'
      && repairContext.structural_errors[0].code === 'operation_semantic_grounding') {
    const mapping = allTurnStepPlanMappings().ordinary_material_prerequisite;
    mapping.continuation.remaining_intent = request.remaining_intent;
    Object.assign(mapping, { operation_choice: null, operation_family: null,
      direct_result_kind: null, clarification: null });
    instructions.push(
    `Required literal denial repair: First check supplied items for the semantically matching actionable referent. If it already exists and the intent is transient non-transforming handling/contact, use transient_item_use with that stable item_ref; use it in place when current-visible and its placement matches current position; preserve placement and add move_entity only for explicit requested relocation. Never repeat discovery for that same known item or invent an item transformation. Otherwise, for a missing ordinary referent, MUST use ordinary_material_prerequisite with interpretation.adaptation literal, resolution domain_request, goal_result pending, activity owner domain. Emit exactly one request_discovery with discovery_kind inspect, current actor_ref and one current visible scope ref. query must be only a nominal description of the missing ordinary referent, material, or physically connected group; exclude acquisition, relocation, handling, use, transformation, purpose and every action clause. query must not equal or copy request.remaining_intent. Preserve continuation exactly as {"remaining_intent":${JSON.stringify(request.remaining_intent)},"depends_on_refs":[]}. Discovery does not execute any part of this physical intent. This resolution error invalidates the complete causal shape: replace the original operations, activity, goal_result and continuation together, even though the error path names only $.resolution. Do not preserve the rejected direct denial or its missing-operation rationale. Lack of a registered handler for the later physical act does not prevent discovery of its ordinary prerequisite. For a missing referent only, return this semantic mapping with its nominal query and current refs filled from the request: ${JSON.stringify(mapping)}`
    );
  }
  return instructions;
}
