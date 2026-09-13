import { TURN_STEP_PLAN_EXAMPLE } from './lower-dvina-trace-phase-2-llm-prompts.js';

export function semanticTurnStepExample() {
  const { schema, request_id, committed_state_version, working_revision,
    step_index, ...semantic } = JSON.parse(TURN_STEP_PLAN_EXAMPLE);
  return JSON.stringify({ ...semantic, operation_choice: null });
}

export function activeConversationChoiceExample(request, choices) {
  const interlocutorId = request.player_safe_state?.active_interlocutor
    ?.entity_ref?.entity_id;
  const interactions = choices.filter(({ operation }) => operation?.op === 'emit_interaction'
    && Array.isArray(operation.target_actor_refs)
    && operation.target_actor_refs.length === 1
    && operation.target_actor_refs[0] === interlocutorId
    && ['speech', 'request'].includes(operation.interaction_kind)
    && Array.isArray(operation.instrument_refs)
    && operation.instrument_refs.length === 0);
  const interaction = interactions.find(({ operation }) =>
    operation.interaction_kind === 'request') ?? interactions[0];
  if (interaction == null) return null;
  return `Active conversation contrast: ${JSON.stringify({ resolution: 'domain_request', operation_choice: interaction.choice_id })} is the required choice when the current earliest owned boundary is speech or a request addressed to the active interlocutor. This includes asking that person to permit, oppose, or help with a physical intervention for which no physical domain operation is supplied; the interaction owner decides the response and does not confirm the intervention. The addressed speech or request itself is completed by this interaction: the desired answer or reaction is its owner result, never continuation. With no later independent player action use goal_result achieved and continuation null; use pending only with that later action in continuation. A question remains conversation even when it asks where or how to find a place, object, or fact; that answer topic does not make it request_discovery. Conversely, an independent player intent to personally inspect, search, listen, remember, or dig for detail uses a matching supplied request_discovery.`;
}

export function visibleConversationChoiceExamples(request, choices) {
  const visible = request.player_safe_state?.current_visible_context
    ?.visible_npc ?? [];
  return visible.flatMap(({ entity_ref: ref, display_label: label }) => {
    if (ref?.entity_kind !== 'npc' || typeof ref.entity_id !== 'string'
        || typeof label !== 'string' || !label.trim()) return [];
    const matches = choices.filter(({ operation }) =>
      operation?.op === 'emit_interaction'
      && Array.isArray(operation.target_actor_refs)
      && operation.target_actor_refs.length === 1
      && operation.target_actor_refs[0] === ref.entity_id
      && Array.isArray(operation.instrument_refs)
      && operation.instrument_refs.length === 0);
    if (matches.length === 0) return [];
    return [`Visible conversation routing for ${JSON.stringify(label)}: choose exactly one matching supplied choice from ${JSON.stringify(matches.map(({ choice_id: operation_choice, operation }) => ({ interaction_kind: operation.interaction_kind, operation_choice })))}. Each choice's player_safe_grounding places this label and its observable cues beside the opaque target ref; use those cues to resolve natural descriptions of the addressee. Use speech for a statement, request when asking the person to answer, act, permit, oppose, or help, and offer for a proposed exchange. The supplied operation content is a capability label, not the utterance and not a phrase restriction; the raw player text remains the utterance and semantic input. A momentary look at that already visible person leading into speech is contextual and MUST select this conversation before visible_general_look, including first/then wording; a genuine earlier search, manipulation, movement, or other action with its own supplied owner still executes first. An unsupported physical intervention does not become a direct failure merely because no physical operation is supplied when the text also reaches a visible person whose response is the next owned boundary. A proposal to perform that intervention followed by a direct address, imperative, or request for this person to help is one interaction boundary, not an earlier completed physical attempt plus optional speech. Never reason that the addressed request is not a separate action: select the matching interaction and let its owner decide the response. A player-safe role or name established by current visible context or committed conversation history can identify this actor even when the words differ from display_label; that grounded address overrides another active interlocutor. When visible_scene introduces one unnamed person by position or relation and the player repeats that description, bind it to the corresponding generic visible label, never to a separately named person who also happens to be present. Do not use these choices for another NPC or invent a completed physical result.`];
  });
}

export function preparedFollowupPrompt(candidates) {
  return [
    'prepared_followup_candidates is a closed code-owned mapping:',
    JSON.stringify(candidates),
    'Select a candidate only if the plan current operation matches its precursor_operation and its operation semantically covers all continuation.remaining_intent, including every later clause or sentence; if any intent remains uncovered, prepared_followup_ref is null.',
    'When selected, copy its prepared_followup_ref exactly alongside remaining_intent and depends_on_refs in the complete continuation object:',
    JSON.stringify(candidates.map(({ prepared_followup_ref }) => ({
      remaining_intent: '<copy next uncovered intent>',
      depends_on_refs: ['<copy only required player-safe refs>'],
      prepared_followup_ref
    }))),
    'This marker preserves only this exact candidate for a later current-state admission; it neither reserves nor executes it. Never invent a marker.'
  ].join(' ');
}
