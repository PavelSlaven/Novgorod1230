export async function correctTemporalQualifierContinuation({ plan, input, roleRunner }) {
  if (plan?.resolution !== 'direct' || plan.activity?.owner !== 'semantic'
      || !Number.isInteger(plan.activity.requested_duration_minutes)
      || plan.activity.requested_duration_minutes < 1
      || plan.operations?.length !== 0 || plan.check != null
      || plan.clarification != null || plan.continuation == null) return plan;
  const response = await roleRunner.run({
    scope: 'turn_runtime', role_id: 'turn_step_grounding_auditor',
    request_identity: input.request_id,
    messages: [{ role: 'system', content: [
      'Return only JSON with exactly mode.',
      'mode is same_activity or independent_action.',
      'Choose same_activity only when continuation merely restates or bounds the supplied duration of the same sustained activity, such as an equivalent end-clock phrase.',
      'Choose independent_action for any later action, speech, result request, movement, condition, or non-equivalent time instruction.',
      'Never infer that two conflicting times are equivalent.'
    ].join(' ') }, { role: 'user', content: JSON.stringify({
      root_player_action: input.root_player_action,
      grounded_attempt: plan.interpretation?.grounded_attempt ?? null,
      requested_duration_minutes: plan.activity.requested_duration_minutes,
      continuation: plan.continuation.remaining_intent
    }) }], overrides: { temperature: 0 }
  });
  if (response?.output?.constructor !== Object
      || Object.keys(response.output).length !== 1
      || response.output.mode !== 'same_activity') return plan;
  return { ...plan, goal_result: 'achieved', continuation: null,
    reason_code: 'temporal_qualifier_covered',
    reason: 'The end-time phrase is part of the same requested duration.' };
}

export async function correctVisibleNpcStatusObservation({ plan, input, roleRunner }) {
  const operation = plan?.resolution === 'domain_request'
    && plan.operations?.length === 1
    && plan.operations[0]?.op === 'request_discovery'
    ? plan.operations[0] : null;
  const visible = (input.player_safe_state?.current_visible_context
    ?.visible_npc ?? []).filter(({ entity_ref: ref, visible_status: status }) =>
    ref?.entity_kind === 'npc' && typeof ref.entity_id === 'string'
      && typeof status === 'string' && status.trim());
  const targets = new Set([...(operation?.target_refs ?? []),
    ...(plan?.continuation?.pending_discovery?.remaining_target_refs ?? [])]);
  if (operation == null || targets.size === 0
      || [...targets].some((ref) => !visible.some(({ entity_ref }) =>
        entity_ref.entity_id === ref))) return plan;
  const response = await roleRunner.run({
    scope: 'turn_runtime', role_id: 'turn_step_grounding_auditor',
    request_identity: input.request_id,
    messages: [{ role: 'system', content: [
      'Return only JSON with exactly mode and entity_refs.',
      'mode is observation, partial_observation, or discovery. entity_refs is an array.',
      'Choose observation only when the supplied current visible_status values fully answer every requested fact about what the visible NPCs are doing now.',
      'Choose partial_observation when those statuses directly answer some requested visible facts but honestly leave finer requested detail unknown.',
      'A look followed by a colon or question naming what that same look observes is one observation, not a later action.',
      'Choose discovery only when the supplied statuses answer none of the requested facts. If they answer any requested visible physical fact but omit finer detail, choose partial_observation.',
      'For observation copy exactly every relevant supplied entity_ref; for discovery return an empty array. Never infer beyond the supplied statuses.'
    ].join(' ') }, { role: 'user', content: JSON.stringify({
      remaining_intent: input.remaining_intent,
      proposed_discovery: { discovery_kind: operation.discovery_kind,
        query: operation.query, target_refs: [...targets] },
      visible_npc: visible.map(({ entity_ref, display_label, visible_status }) =>
        ({ entity_ref: entity_ref.entity_id, display_label, visible_status }))
    }) }], overrides: { temperature: 0 }
  });
  const choice = response?.output;
  const allowed = new Set(visible.map(({ entity_ref }) => entity_ref.entity_id));
  if (choice?.constructor !== Object || Object.keys(choice).length !== 2
      || !['observation', 'partial_observation'].includes(choice.mode)
      || !Array.isArray(choice.entity_refs) || choice.entity_refs.length === 0
      || new Set(choice.entity_refs).size !== choice.entity_refs.length
      || choice.entity_refs.some((ref) => !allowed.has(ref))) return plan;
  return { ...plan, resolution: 'direct', goal_result:
      choice.mode === 'observation' ? 'achieved' : 'partially_achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations: [], check: null, continuation: null, clarification: null,
    direct_result_kind: 'player_safe_observation',
    reason_code: 'visible_npc_status_observation',
    reason: 'Supplied current NPC statuses already answer the observation.' };
}

export async function correctSupportedAssessment({ plan, input, roleRunner }) {
  const operation = plan?.resolution === 'domain_request'
    && plan.operations?.length === 1
    && plan.operations[0]?.op === 'request_discovery'
    ? plan.operations[0] : null;
  const claims = ['hard_constraints', 'facts'].flatMap((field) =>
    input?.world_knowledge?.[field] ?? []).filter((claim) =>
      typeof claim?.claim_ref === 'string'
      && typeof claim.runtime_text === 'string' && claim.runtime_text.trim());
  if (operation == null || claims.length === 0) return plan;
  const response = await roleRunner.run({
    scope: 'turn_runtime', role_id: 'turn_step_grounding_auditor',
    request_identity: input.request_id,
    messages: [{ role: 'system', content: [
      'Return only JSON with exactly mode and support_refs.',
      'mode is assessment or discovery. support_refs is an array.',
      'Choose assessment only when the whole remaining_intent is one qualitative judgment or comparison of facts already present in supplied_sensory_facts. It must request no new inspection, search, handling, movement, speech, or later independent action.',
      'For assessment, copy one or more claim_ref values whose runtime_text establishes a useful relationship or an explicit limit on the conclusion. For discovery, return an empty array.',
      'Prefer claims about the requested function, assembly, or material relation over generic care, inspection, storage, or unrelated historical use when both are available.',
      'Never use model memory or treat the proposed discovery as proof that new detail is needed.'
    ].join(' ') }, { role: 'user', content: JSON.stringify({
      remaining_intent: input.remaining_intent,
      supplied_sensory_facts:
        input.player_safe_state?.current_visible_context?.sensory_details ?? [],
      proposed_discovery: { discovery_kind: operation.discovery_kind,
        query: operation.query },
      world_knowledge: claims.map(({ claim_ref, runtime_text }) =>
        ({ claim_ref, runtime_text }))
    }) }], overrides: { temperature: 0 }
  });
  const choice = response?.output;
  const allowed = new Map(claims.map((claim) => [claim.claim_ref, claim]));
  if (choice?.constructor !== Object || Object.keys(choice).length !== 2
      || choice.mode !== 'assessment'
      || !Array.isArray(choice.support_refs) || choice.support_refs.length === 0
      || new Set(choice.support_refs).size !== choice.support_refs.length
      || choice.support_refs.some((ref) => !allowed.has(ref))) return plan;
  const selected = choice.support_refs.map((ref) => allowed.get(ref));
  return { ...plan, resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations: [], check: null, continuation: null, clarification: null,
    direct_result_kind: 'player_safe_observation',
    assessment: { text: selected.map(({ runtime_text: text }) => text).join(' '),
      support_refs: [...choice.support_refs] },
    reason_code: 'supported_assessment',
    reason: 'Supplied sensory facts were assessed only through cited World Knowledge.' };
}
