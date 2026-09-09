export const TURN_STEP_PERCEPTION_INSTRUCTION = 'Evaluate the entire remaining_intent and preserve action order. Speech to the active interlocutor precedes a momentary look at that already supplied person; seeking new detail remains an earlier focused perception. Reviewing or qualitatively assessing facts already explicit in player-safe state—including supplied carried/worn items and sensory conditions—is direct achieved or partially achieved observation with direct_result_kind player_safe_observation; preserve uncertainty. Inspect/search for a new physical detail is focused perception: use matching available_domain_operations first, otherwise focused_ordinary_discovery when ordinary_resolution.discovery_available is true, and only without either use reality_limited not_achieved. Select a matching supplied discovery choice_id exactly and preserve later independent speech in continuation. A passive look cannot absorb a focused clause. General scanning of the current situation, activity, or nearby people uses ordinary_scene_seed while scene_seed_available is true and visible_general_look afterward, even when phrased as trying to understand what is happening.';

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

export const OBSERVED_EVIDENCE_PLAN_INSTRUCTION = 'When player_safe_state.observed_evidence_inspection.semantic_grounding_available is true and every physical fact or object being inspected or compared is represented by its candidate text, use observed_evidence_inspection before focused_ordinary_discovery. Copy only every relevant supplied candidate fact_ref exactly and preserve the complete question as query; never target the current location or an ordinary scope. If any comparison counterpart or requested detail is not supplied, first use focused_ordinary_discovery on one current visible scope with a query naming only that missing referent and preserve the complete comparison in continuation; never use an evidence candidate for only one side. The evidence owner can report only that the observations support no new hidden conclusion; it never establishes identity, direction, injury, cause, or another fact absent from player-safe state.';

export const OBSERVED_EVIDENCE_REPAIR_INSTRUCTION = 'For operation_semantic_grounding, discard the rejected operation. If every compared referent is represented by player_safe_state.observed_evidence_inspection, rebuild through it with only the exact supplied candidate refs. If a comparison counterpart or requested detail is missing, use focused_ordinary_discovery for only that missing referent and preserve the complete comparison in continuation.';

export function observedEvidencePrompts(request, repairing) {
  return request.player_safe_state?.observed_evidence_inspection
    ?.semantic_grounding_available === true
    ? [OBSERVED_EVIDENCE_PLAN_INSTRUCTION,
        ...(repairing ? [OBSERVED_EVIDENCE_REPAIR_INSTRUCTION] : [])]
    : [];
}
