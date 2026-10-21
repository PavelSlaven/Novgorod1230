export function npcProjection(actorId = '9', overrides = {}) {
  return {
    actor_id: actorId, position: [61, 60, 0], native_turn: 10, activity_id: '',
    activity_moves_left: 0, visible_actors: [], visible_targets: [],
    name: 'Жирко', template_id: 'zhirko', gender: 'male',
    personality: { aggression: 1, bravery: 2, collector: 3, altruism: 4 },
    faction_id: 'dvor', opinion_of_avatar: { trust: 0, fear: 0, value: 0, anger: 0 },
    conversation_memory: [], visible_items: [],
    ...overrides
  };
}

export function visibleItem(uid, overrides = {}) {
  return {
    item_ref: `item:${uid}`, item_uid: String(uid), type: 'firesteel', label: 'огниво',
    placement: 'ground', position: { x: 61, y: 61, z: 0 }, owner_faction_id: 'dvor',
    ...overrides
  };
}

export function replyFrame({ turn = 10, projections = [npcProjection()], avatarId = '7',
  extraActors = [] } = {}) {
  return {
    schema: 'p3_native_observation_v1', turn, revision: String(turn),
    actors: [
      { actor_ref: 'avatar', actor_id: avatarId, visible: true, position: [60, 60, 0] },
      ...projections.map(({ actor_id: actorId, position, name }) => ({
        actor_ref: `npc:${actorId}`, actor_id: actorId, visible: true, position, name })),
      ...extraActors
    ],
    items: [], targets: [{ target_ref: 'tile:east', position: [61, 60, 0] }],
    npc_projections: projections
  };
}

export function heardRecord(text, turn = 10, npcId = '9') {
  return { kind: 'heard', speaker_ref: 'avatar', listener_ref: `npc:${npcId}`, text, turn };
}

export function saidRecord(text, turn = 10, npcId = '9') {
  return { kind: 'said', speaker_ref: `npc:${npcId}`, listener_ref: 'avatar', text, turn };
}

export function silenceRecord(turn = 10, npcId = '9') {
  return { kind: 'silence', speaker_ref: `npc:${npcId}`, listener_ref: 'avatar', text: '', turn };
}

export function playerSpeechReadback({ operationId = 'op-1', utterance, heard = ['9'],
  turn = 10 } = {}) {
  return {
    schema: 'p3_native_operation_readback_v1', operation_id: operationId, status: 'applied',
    native_effect: { effect_status: 'confirmed', primitive: 'speak', speakerId: '7', utterance,
      actualHeardListenerIds: heard },
    before: { turn }, after: { turn }
  };
}

function contributionPlan(request, fields) {
  const player = request.allowed_references.actor_refs[1];
  return {
    schema: 'conversation_contribution_plan_v1', request_id: request.request_id,
    boundary_id: request.boundary_id, conversation_id: request.conversation_id,
    exchange_id: request.exchange_id, state_version: request.state_version,
    speaker_ref: request.npc_ref, primary_addressee_ref: player,
    intended_addressee_refs: [player], affected_actor_refs: [],
    resolution: 'automatic', activity: { duration_class: 'brief', effort: 'none' },
    supporting_operations: [], check: null, handoff: null, ...fields
  };
}

export function speechPlan(request, utterance = 'Слышу тебя.') {
  return contributionPlan(request, {
    contribution_kind: 'speech',
    speech: { utterance_text: utterance, dominant_act: 'answer', interaction_tags: [],
      topic_refs: [], claims: [], response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'ответить', grounded_contribution: 'Я слышу.', adaptation: 'literal' },
    reason: 'Ответ.'
  });
}

export function silencePlan(request, visibleBehavior = 'Молча отводит взгляд.') {
  return contributionPlan(request, {
    contribution_kind: 'silence', speech: null,
    interpretation: { intent: 'промолчать', grounded_contribution: visibleBehavior,
      adaptation: 'literal' },
    reason: 'Нечего сказать.'
  });
}
