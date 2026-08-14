const REFS = Object.freeze({
  wreck: 'trace_ld_v1_loc_wreck_shore',
  fishingCamp: 'trace_ld_v1_loc_fishing_camp',
  dryingShed: 'trace_ld_v1_loc_old_drying_shed',
  evidence: 'trace_ld_v1_evidence_blue_wool'
});

export function createLowerDvinaTraceTurnStepTestModel({
  onCall = () => {}
} = {}) {
  if (typeof onCall !== 'function') {
    fail('Lower Dvina test turn step onCall must be a function.');
  }
  return (request) => {
    onCall(request);
    if (generalLook(request)) return directPlan(request);
    return domainPlan(request, operationFor(request));
  };
}

function generalLook(request) {
  const text = String(request?.root_player_action ?? '')
    .trim().toLowerCase().replace(/[.!?]+$/u, '');
  return new Set(['осмотреться', 'осматриваюсь вокруг']).has(text);
}

function operationFor(request) {
  const text = String(request?.root_player_action ?? '').trim().toLowerCase();
  const actorRef = requiredActorRef(request);
  if (text.includes('онисим')
      && contains(text, ['достав', 'носил', 'отнести'])) {
    return {
      op: 'request_activity',
      actor_ref: actorRef,
      activity_kind: 'carry',
      target_refs: [npcRef(request, 'onisim_boatman')],
      description: 'перенести Онисима в рыбацкий стан'
    };
  }
  if (text.includes('онисим')
      && contains(text, ['помощ', 'лечени'])) {
    return {
      op: 'request_activity',
      actor_ref: actorRef,
      activity_kind: 'recover',
      target_refs: [npcRef(request, 'onisim_boatman')],
      description: 'оказать помощь раненой ноге Онисима'
    };
  }
  if (contains(text, ['сушиль'])) {
    return {
      op: 'request_movement',
      actor_ref: actorRef,
      movement_kind: 'route',
      target_ref: REFS.dryingShed
    };
  }
  if (contains(text, ['ратш', 'сдач', 'условн'])) {
    return {
      op: 'emit_interaction',
      actor_ref: actorRef,
      interaction_kind: 'offer',
      target_actor_refs: [npcRef(request, 'ratsha_storehouse_helper')],
      instrument_refs: [],
      content: 'условная защита в обмен на сдачу'
    };
  }
  if (contains(text, ['показ', 'улик', 'шерст'])) {
    return {
      op: 'emit_interaction',
      actor_ref: actorRef,
      interaction_kind: 'offer',
      target_actor_refs: [npcRef(request, 'eremey_fisher')],
      instrument_refs: [REFS.evidence],
      content: 'показать синюю шерсть и попросить содействия'
    };
  }
  if (contains(text, ['поговор', 'спрос', 'расспрос'])) {
    return {
      op: 'emit_interaction',
      actor_ref: actorRef,
      interaction_kind: 'request',
      target_actor_refs: [npcRef(request, 'eremey_fisher')],
      instrument_refs: [],
      content: 'расспросить Еремея о крушении'
    };
  }
  if (contains(text, ['стан', 'рыбак'])) {
    return {
      op: 'request_movement',
      actor_ref: actorRef,
      movement_kind: 'route',
      target_ref: REFS.fishingCamp
    };
  }
  if (contains(text, ['осмотр', 'изуч', 'поврежден'])) {
    return {
      op: 'request_discovery',
      actor_ref: actorRef,
      discovery_kind: 'inspect',
      target_refs: [REFS.wreck],
      query: 'осмотреть видимые следы крушения'
    };
  }
  fail(`Unsupported Lower Dvina test intent: ${text || '<empty>'}`);
}

function domainPlan(request, operation) {
  return {
    schema: 'turn_step_plan_v1',
    request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    step_index: request.step_index,
    interpretation: {
      player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent,
      adaptation: 'literal'
    },
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [operation],
    check: null,
    continuation: null,
    clarification: null,
    reason_code: 'delegate_existing_lower_dvina_owner',
    reason: 'Действие передаётся существующему владельцу механики.'
  };
}

function directPlan(request) {
  return {
    schema: 'turn_step_plan_v1',
    request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    step_index: request.step_index,
    interpretation: {
      player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent,
      adaptation: 'literal'
    },
    resolution: 'direct',
    goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations: [],
    check: null,
    continuation: null,
    clarification: null,
    reason_code: 'review_visible_surroundings',
    reason: 'Общий обзор использует уже видимую сцену.'
  };
}

function requiredActorRef(request) {
  const actorRef = request?.actor?.actor_id;
  if (typeof actorRef !== 'string' || actorRef.length === 0) {
    fail('Lower Dvina test turn step requires actor.actor_id.');
  }
  return actorRef;
}

function npcRef(request, participantSlotRef) {
  const npc = request?.player_safe_state?.npcs?.find(
    ({ participant_slot_ref: slot }) => slot === participantSlotRef
  );
  if (typeof npc?.instance_id !== 'string' || npc.instance_id.length === 0) {
    fail(`Visible NPC is missing: ${participantSlotRef}`);
  }
  return npc.instance_id;
}

function contains(text, fragments) {
  return fragments.some((fragment) => text.includes(fragment));
}

function fail(message) {
  const error = new TypeError(message);
  error.code = 'LOWER_DVINA_TRACE_TURN_STEP_TEST_FIXTURE_INVALID';
  throw error;
}
