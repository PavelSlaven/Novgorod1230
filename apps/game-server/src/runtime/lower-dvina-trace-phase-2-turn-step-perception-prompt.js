export const TURN_STEP_PERCEPTION_INSTRUCTION = 'Evaluate the entire remaining_intent, not only its first passive clause. Preserve stated action order: an active-conversation interaction takes priority over focused perception when any speech addressed to the active interlocutor is the current earliest independently executable action, including a greeting, thanks, statement, answer, question, imperative, or request for that addressee to act. A momentary look at an already supplied visible person that merely leads into speech is context for that speech, not a blocking independent step: MUST select the matching conversation before visible_general_look even when the player writes first/then. It becomes an earlier step only when the player seeks new detail or a matching request_discovery is supplied. An inspect, examine, or search intent that seeks new detail is focused perception and is never achieved by visible_general_look merely because its target is already visible; without a matching discovery operation, use an honest reality_limited not_achieved result. When available_domain_operations contains a request_discovery that semantically matches an earlier focused perception clause seeking a new physical detail or object, MUST return a domain_request selecting exactly that supplied choice_id and preserve later speech in continuation. Otherwise select the current matching active-conversation operation before visible_general_look. A passive look clause cannot absorb a focused clause. Do not reproduce or alter its operation DTO. If another independent clause is not covered by the selected operation, preserve it in continuation. A scan of the current visible situation, ongoing activity, or nearby people uses ordinary_scene_seed while scene_seed_available is true and visible_general_look after the scene substrate has been seeded, even when phrased as trying to understand or find out what is happening. It is not focused ordinary object discovery.';

export const OBSERVED_EVIDENCE_PLAN_MAPPING = {
  interpretation: { adaptation: 'literal' },
  resolution: 'domain_request', goal_result: 'pending',
  activity: { owner: 'domain', duration_class: null, effort: null },
  operations: [{ op: 'request_discovery',
    actor_ref: '<copy current actor ref from request>',
    discovery_kind: 'inspect',
    target_refs: ['<copy every relevant candidate fact_ref exactly>'],
    query: '<copy the current evidence-inspection question>' }], check: null
};

export const OBSERVED_EVIDENCE_PLAN_INSTRUCTION = 'When player_safe_state.observed_evidence_inspection.semantic_grounding_available is true and the current step compares, correlates, or asks for an inference from facts already represented by its candidate text, use observed_evidence_inspection before focused_ordinary_discovery. Copy only every relevant supplied candidate fact_ref exactly and preserve the complete question as query; never target the current location or an ordinary scope. This owner can report only that the observations support no new hidden conclusion; it never establishes identity, direction, injury, cause, or another fact absent from player-safe state.';

export const OBSERVED_EVIDENCE_REPAIR_INSTRUCTION = 'For operation_semantic_grounding, discard the rejected operation. When a rejected scope discovery was trying to compare, correlate, or infer from player_safe_state.observed_evidence_inspection, rebuild it through observed_evidence_inspection with only the exact supplied candidate refs.';

export function observedEvidencePrompts(request, repairing) {
  return request.player_safe_state?.observed_evidence_inspection
    ?.semantic_grounding_available === true
    ? [OBSERVED_EVIDENCE_PLAN_INSTRUCTION,
        ...(repairing ? [OBSERVED_EVIDENCE_REPAIR_INSTRUCTION] : [])]
    : [];
}
