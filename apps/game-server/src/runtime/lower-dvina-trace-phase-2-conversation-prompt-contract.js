export const PLAYER_CONVERSATION_PLAN_SHAPE = JSON.stringify({
  schema: 'player_conversation_contribution_plan_v1',
  request_id: '<copy request_id>', conversation_id: '<copy conversation_id>',
  state_version: '<copy state_version>',
  speaker_ref: { entity_kind: '<copy entity_kind>', entity_id: '<copy entity_id>' },
  input_mode: '<verbatim or intent_paraphrase>', contribution_kind: 'speech',
  primary_addressee_ref: { entity_kind: '<copy entity_kind>', entity_id: '<copy entity_id>' },
  intended_addressee_refs: [{ entity_kind: '<copy entity_kind>', entity_id: '<copy entity_id>' }],
  affected_actor_refs: [],
  speech: { utterance_text: '<player speech>', dominant_act: '<one allowed act>',
    interaction_tags: [], topic_refs: [], claims: [],
    response_expectation: { kind: 'none', target_refs: [] } },
  interpretation: { intent: '<intent>', grounded_contribution: '<grounded contribution>',
    adaptation: 'literal' }, resolution: 'automatic',
  activity: { duration_class: '<copy allowed duration class>', effort: 'none' },
  supporting_operations: [], check: null, handoff: null
});
export const FACTUAL_ASSERTION_RULE = [
  'A factual assertion states something about the world, a place, a person, an object, an earlier event, or the speaker own name, origin, craft, or possessions.',
  'Greetings, questions, invitations, offers, requests, refusals, genuine uncertainty, genuine not knowing, and the speaker present feelings or opinions are not factual assertions by themselves.',
  'A factual premise inside any of them still needs its claim; a false denial of known information needs a knowingly_false claim.'
].join(' ');
export const CLAIM_KINDS_RULE = [
  'Ground each claim by its meaning.',
  'Knowledge: speaker_posture believed_true; source_knowledge_refs cite the exact known fact, memory event, current observation, npc_identity, or perceived_message ref that supports the assertion.',
  'A cited message proves only what was said, not its truth.',
  'Belief: speaker_posture believed_true; source_knowledge_refs cite the exact knowledge.beliefs ref, which supports the speaker\'s belief, not objective truth.',
  'Do not automatically disclose speaker_posture in utterance_text.',
  'Genuine uncertainty: speaker_posture uncertain applies only when no known fact, belief, memory event, observation, or perceived message in the request answers what the speaker says they do not know or remember, however phrased; uncertainty itself needs no ref.',
  'Withholding: speaker_posture withheld conceals a known fact, including a secret, without a false assertion; source_knowledge_refs cite the exact known fact concealed.',
  'Deliberate lie: speaker_posture knowingly_false; source_knowledge_refs cite the exact known fact contradicted or hidden, including by a false denial of knowledge; the lie remains speech, never world truth.',
  'For speaker_posture mixed, check the factual parts separately.',
  'Unsupported assertions presented as knowledge are inventions.'
].join(' ');

export const NPC_CONVERSATION_PLAN_SHAPE = JSON.stringify({
  schema: 'conversation_contribution_plan_v1', request_id: '<copy request_id>',
  boundary_id: '<copy boundary_id>', conversation_id: '<copy conversation_id>',
  exchange_id: '<copy exchange_id>', state_version: '<copy state_version>',
  speaker_ref: { entity_kind: '<copy npc entity_kind>', entity_id: '<copy npc entity_id>' },
  contribution_kind: 'speech',
  primary_addressee_ref: { entity_kind: '<copy entity_kind>', entity_id: '<copy entity_id>' },
  intended_addressee_refs: [{ entity_kind: '<copy entity_kind>', entity_id: '<copy entity_id>' }],
  affected_actor_refs: [],
  speech: { utterance_text: '<NPC speech>', dominant_act: '<one allowed act>',
    interaction_tags: [], topic_refs: [], claims: [{
      claim_id: '<new short id>', content_summary: '<the asserted fact in Russian>',
      form: 'assertion',
      speaker_posture: '<believed_true, knowingly_false, mixed, uncertain, or withheld>',
      source_knowledge_refs: [{ entity_kind: '<copy entity_kind>', entity_id: '<copy entity_id>' }],
      mentioned_entity_refs: [{ entity_kind: '<copy entity_kind>', entity_id: '<copy entity_id>' }]
    }],
    response_expectation: { kind: 'none', target_refs: [] } },
  interpretation: { intent: '<intent>', grounded_contribution: '<grounded contribution>',
    adaptation: 'literal' }, resolution: 'automatic',
  activity: { duration_class: '<copy allowed duration class>', effort: 'none' },
  supporting_operations: [], check: null, handoff: null,
  reason: '<subjective reason>'
});

export const CONVERSATION_PLAN_MAPPINGS = JSON.stringify({
  player_verbatim_speech: {
    input_mode: 'verbatim', contribution_kind: 'speech',
    interpretation: { adaptation: 'literal' }
  },
  player_intent_paraphrase_speech: {
    input_mode: 'intent_paraphrase', contribution_kind: 'speech',
    interpretation: { adaptation: 'literal' }
  },
  ordinary_speech: {
    contribution_kind: 'speech', interpretation: { adaptation: 'literal' },
    resolution: 'automatic', supporting_operations: [], check: null,
    handoff: null
  },
  silence: {
    contribution_kind: 'silence', speech: null, resolution: 'automatic',
    supporting_operations: [], check: null, handoff: null
  },
  leave_conversation: {
    contribution_kind: 'leave_conversation', speech: null,
    resolution: 'automatic', supporting_operations: [], check: null,
    handoff: null
  },
  action_handoff: {
    contribution_kind: 'action_handoff', speech: null,
    resolution: 'automatic', supporting_operations: [], check: null,
    handoff: { kind: 'actor_step', intent: '<grounded handoff intent>' }
  },
  combat_handoff: {
    contribution_kind: 'combat_handoff', speech: null,
    resolution: 'automatic', supporting_operations: [], check: null,
    handoff: { kind: 'combat', intent: '<grounded handoff intent>',
      target_actor_refs: ['<copy only permitted combat target refs from request>'] }
  },
  social_check: {
    resolution: 'check_required',
    check: { purpose: '<brief purpose>',
      attribute_ref: '<copy required_check.attribute_ref from request>',
      skill_ref: '<copy required_check.skill_ref from request>',
      difficulty_band: '<copy required_check.difficulty_band from request>',
      outcomes: {
        clean_success: { delivery_quality: 'compelling', observable_effects: [] },
        success: { delivery_quality: 'credible', observable_effects: [] },
        success_with_cost: { delivery_quality: 'credible_with_visible_cost', observable_effects: [] },
        failure_with_consequence: { delivery_quality: 'unconvincing', observable_effects: [] },
        severe_failure: { delivery_quality: 'transparently_manipulative', observable_effects: [] }
      }
    }
  },
  supporting_interaction: {
    contribution_kind: 'speech',
    supporting_operations: ['<copy required_supporting_operation exactly once>']
  }
});
