export function requiredNpcConversationCandidate(request) {
  const scope = request?.decision_scope;
  const operation = scope?.required_supporting_operation;
  const addressee = operation?.target_ref
    ?? request?.allowed_references?.actor_refs?.find(
      ({ entity_kind: kind }) => kind === 'player_character');
  const contract = scope?.operation_contract?.[operation?.op];
  if (routeDisclosureCandidateIsValid(request, operation)) {
    return routeDisclosureCandidate(request, operation);
  }
  const requiredCheck = scope?.required_resolution === 'check_required'
    ? scope.required_check
    : contract?.required_resolution === 'check_required'
      ? contract.required_check : null;
  if (requiredCheck !== null) {
    return requiredCheckOperationCandidate(
      request, operation, addressee, requiredCheck, contract
    );
  }
  const automatic = automaticRequiredOperationCandidate(request, operation);
  if (automatic !== null) return automatic;
  return null;
}

function requiredCheckOperationCandidate(
  request, operation, addressee, check, contract = null
) {
  const scope = request?.decision_scope;
  if (!check || !['attribute_ref', 'skill_ref', 'difficulty_band'].every(
    (key) => typeof check[key] === 'string' && check[key].trim())
      || !operation || Array.isArray(operation)
      || typeof operation.op !== 'string' || !operation.op.trim()
      || !scope?.allowed_duration_classes?.length
      || !request?.allowed_references?.actor_refs?.some((reference) =>
        reference?.entity_kind === addressee?.entity_kind
        && reference?.entity_id === addressee?.entity_id)
  ) return null;
  return {
    schema: 'conversation_contribution_plan_v1', request_id: request.request_id,
    boundary_id: request.boundary_id, conversation_id: request.conversation_id,
    exchange_id: request.exchange_id, state_version: request.state_version,
    speaker_ref: request.npc_ref, contribution_kind: 'speech',
    primary_addressee_ref: structuredClone(addressee),
    intended_addressee_refs: [structuredClone(addressee)],
    affected_actor_refs: [],
    speech: { utterance_text: '<semantic NPC speech>',
      dominant_act: contract?.required_dominant_acts?.[0]
        ?? '<one allowed dominant_act>',
      interaction_tags: typeof contract?.required_interaction_tag === 'string'
        ? [contract.required_interaction_tag] : [],
      topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: '<semantic intent>',
      grounded_contribution: '<semantic grounded contribution>',
      adaptation: 'literal' },
    resolution: 'check_required',
    activity: { duration_class: scope.allowed_duration_classes[0],
      effort: 'none' },
    supporting_operations: [structuredClone(operation)],
    check: { purpose: '<semantic check purpose>', ...check, outcomes: {
      clean_success: { delivery_quality: 'compelling', observable_effects: [] },
      success: { delivery_quality: 'credible', observable_effects: [] },
      success_with_cost: { delivery_quality: 'credible_with_visible_cost', observable_effects: [] },
      failure_with_consequence: { delivery_quality: 'unconvincing', observable_effects: [] },
      severe_failure: { delivery_quality: 'transparently_manipulative', observable_effects: [] }
    } }, handoff: null, reason: '<semantic NPC reason>'
  };
}

function automaticRequiredOperationCandidate(request, operation) {
  const scope = request?.decision_scope;
  const contract = scope?.operation_contract?.[operation?.op];
  const player = request?.allowed_references?.actor_refs?.find(
    ({ entity_kind: kind }) => kind === 'player_character');
  const dominantAct = contract?.required_dominant_acts?.[0];
  const tag = contract?.required_interaction_tag;
  if ((scope?.required_resolution !== undefined
        && scope.required_resolution !== 'automatic')
      || scope?.required_check !== undefined
      || contract?.required_resolution === 'check_required'
      || contract?.required_check !== undefined
      || operation == null || Array.isArray(operation)
      || typeof operation.op !== 'string' || !operation.op.trim()
      || contract == null || typeof contract !== 'object'
      || typeof dominantAct !== 'string' || !dominantAct.trim()
      || typeof tag !== 'string' || !tag.trim()
      || player == null
      || !scope?.allowed_duration_classes?.includes('domain_owned')
      || (scope.allowed_contribution_kinds != null
        && !scope.allowed_contribution_kinds.includes('speech'))) return null;
  return {
    schema: 'conversation_contribution_plan_v1', request_id: request.request_id,
    boundary_id: request.boundary_id, conversation_id: request.conversation_id,
    exchange_id: request.exchange_id, state_version: request.state_version,
    speaker_ref: request.npc_ref, contribution_kind: 'speech',
    primary_addressee_ref: structuredClone(player),
    intended_addressee_refs: [structuredClone(player)],
    affected_actor_refs: [],
    speech: { utterance_text: '<semantic NPC speech>',
      dominant_act: dominantAct, interaction_tags: [tag], topic_refs: [],
      claims: [], response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: '<semantic intent>',
      grounded_contribution: '<semantic grounded contribution>',
      adaptation: 'literal' },
    resolution: scope.required_resolution ?? 'automatic',
    activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: [structuredClone(operation)],
    check: null, handoff: null, reason: '<semantic NPC reason>'
  };
}

export function routeDisclosureCandidateIsValid(request, operation) {
  const scope = request?.decision_scope;
  const player = request?.allowed_references?.actor_refs?.find((reference) =>
    reference?.entity_kind === 'player_character');
  return operation?.op === 'disclose_known_route'
    && Object.keys(operation).length === 3
    && typeof operation.route_ref === 'string' && operation.route_ref.trim()
    && typeof operation.source_knowledge_scope_ref === 'string'
    && operation.source_knowledge_scope_ref.trim()
    && (scope?.required_resolution === undefined
      || scope.required_resolution === 'automatic')
    && player
    && request.allowed_references.entity_refs.some((reference) =>
      reference?.entity_kind === 'route'
      && reference?.entity_id === operation.route_ref)
    && request.allowed_references.knowledge_refs.some((reference) =>
      reference?.entity_kind === 'knowledge_scope'
      && reference?.entity_id === operation.source_knowledge_scope_ref);
}

export function routeDisclosureCandidate(request, operation) {
  const player = request.allowed_references.actor_refs.find((reference) =>
    reference?.entity_kind === 'player_character');
  const scope = request.decision_scope;
  return {
    schema: 'conversation_contribution_plan_v1', request_id: request.request_id,
    boundary_id: request.boundary_id, conversation_id: request.conversation_id,
    exchange_id: request.exchange_id, state_version: request.state_version,
    speaker_ref: request.npc_ref, contribution_kind: 'speech',
    primary_addressee_ref: structuredClone(player),
    intended_addressee_refs: [structuredClone(player)], affected_actor_refs: [],
    speech: { utterance_text: '<semantic NPC route disclosure>',
      dominant_act: 'inform', interaction_tags: ['route_disclosure'],
      topic_refs: [operation.route_ref],
      claims: [{ claim_id: 'required-route-disclosure',
        content_summary: '<semantic route disclosure>', form: 'assertion',
        speaker_posture: 'believed_true', source_knowledge_refs: [{
          entity_kind: 'knowledge_scope',
          entity_id: operation.source_knowledge_scope_ref
        }], mentioned_entity_refs: [{ entity_kind: 'route',
          entity_id: operation.route_ref }] }],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: '<semantic route disclosure>',
      grounded_contribution: '<semantic route disclosure>',
      adaptation: 'literal' }, resolution: 'automatic',
    activity: { duration_class: scope.allowed_duration_classes[0],
      effort: 'none' }, supporting_operations: [structuredClone(operation)],
    check: null, handoff: null, reason: '<semantic NPC reason>'
  };
}
