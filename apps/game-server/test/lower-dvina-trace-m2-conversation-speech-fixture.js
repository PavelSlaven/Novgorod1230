function speech({
  utteranceText,
  dominantAct,
  interactionTags = [],
  topicRefs = [],
  claims = []
}) {
  return {
    utterance_text: utteranceText,
    dominant_act: dominantAct,
    interaction_tags: interactionTags,
    topic_refs: topicRefs,
    claims,
    response_expectation: { kind: 'none', target_refs: [] }
  };
}

export function npcSpeechPlan(request, {
  utteranceText,
  dominantAct,
  interactionTags = [],
  topicRefs = [],
  claims = [],
  supportingOperations = []
}) {
  const playerRef = request.public_conversation_history.at(-1)?.speaker_ref
    ?? null;
  return {
    schema: 'conversation_contribution_plan_v1',
    request_id: request.request_id,
    boundary_id: request.boundary_id,
    conversation_id: request.conversation_id,
    exchange_id: request.exchange_id,
    state_version: request.state_version,
    speaker_ref: request.npc_ref,
    contribution_kind: 'speech',
    primary_addressee_ref: playerRef,
    intended_addressee_refs: playerRef === null ? [] : [playerRef],
    affected_actor_refs: [],
    speech: speech({ utteranceText, dominantAct, interactionTags, topicRefs, claims }),
    interpretation: {
      intent: 'respond in the current conversation',
      grounded_contribution: 'respond in the current conversation',
      adaptation: 'literal'
    },
    resolution: 'automatic',
    activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: supportingOperations,
    check: null,
    handoff: null,
    reason: 'The response follows the NPC subjective state.'
  };
}
