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
    if (generalLook(request)) {
      return spatialLook(request) ?? ordinarySceneSeed(request)
        ?? directPlan(request);
    }
    return domainPlan(request, operationFor(request));
  };
}

function ordinarySceneSeed(request) {
  if (request?.player_safe_state?.ordinary_resolution
      ?.scene_seed_available !== true) return null;
  return domainPlan(request, {
    op: 'request_discovery', actor_ref: requiredActorRef(request),
    discovery_kind: 'look',
    target_refs: [request.player_safe_state.position.location_ref],
    query: 'общий вид ближайшего окружения'
  });
}

function spatialLook(request) {
  const marker = request?.player_safe_state?.spatial_semantic;
  if (marker?.semantic_grounding_available !== true
      || typeof marker.position_ref !== 'string' || marker.position_ref.length === 0) {
    return null;
  }
  return domainPlan(request, {
    op: 'request_discovery', actor_ref: requiredActorRef(request),
    discovery_kind: 'look', target_refs: [marker.position_ref], query: 'осмотреться'
  });
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
      description: 'перенести Онисима в рыбацкий стан'
    };
  }
  if (text.includes('онисим')
      && contains(text, ['помощ', 'лечени'])) {
    return {
      op: 'request_activity',
      actor_ref: actorRef,
      activity_kind: 'recover',
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
      target_actor_refs: [requiredVisibleNpcRef(request, 'мужчина рядом')],
      interaction_kind: 'offer',
      instrument_refs: [],
      content: 'условная защита в обмен на сдачу'
    };
  }
  if (contains(text, ['показ', 'улик', 'шерст'])) {
    return {
      op: 'emit_interaction',
      actor_ref: actorRef,
      target_actor_refs: [requiredVisibleNpcRef(request, 'Еремей')],
      interaction_kind: 'offer',
      instrument_refs: [REFS.evidence],
      content: 'показать синюю шерсть и попросить содействия'
    };
  }
  if (contains(text, ['поговор', 'спрос', 'расспрос'])) {
    return {
      op: 'emit_interaction',
      actor_ref: actorRef,
      target_actor_refs: [requiredVisibleNpcRef(request, 'Еремей')],
      interaction_kind: 'request',
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
  operation = exactAvailableOperation(request, operation) ?? operation;
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

function exactAvailableOperation(request, intended) {
  const candidates = (request.available_domain_operations ?? []).filter(
    (candidate) => candidate.op === intended.op
      && sameScalar(candidate, intended, 'discovery_kind')
      && sameScalar(candidate, intended, 'movement_kind')
      && sameScalar(candidate, intended, 'activity_kind')
      && sameScalar(candidate, intended, 'interaction_kind'));
  const matches = candidates.filter((candidate) =>
      sameScalar(candidate, intended, 'target_ref')
      && sameRefs(candidate.target_refs, intended.target_refs)
      && sameRefs(candidate.target_actor_refs, intended.target_actor_refs)
      && sameRefs(candidate.instrument_refs, intended.instrument_refs));
  return matches.length === 1 ? matches[0]
    : candidates.length === 1 ? candidates[0] : null;
}

function sameScalar(left, right, key) {
  return right[key] == null || left[key] === right[key];
}

function sameRefs(left, right) {
  return right == null || Array.isArray(left)
    && left.length === right.length
    && right.every((ref) => left.includes(ref));
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

function requiredVisibleNpcRef(request, displayLabel) {
  const matches = (request?.player_safe_state?.current_visible_context
    ?.visible_npc ?? []).filter(({ display_label: label }) => label === displayLabel);
  const npcRef = matches[0]?.entity_ref?.entity_id;
  if (matches.length !== 1 || typeof npcRef !== 'string' || npcRef.length === 0) {
    fail(`Lower Dvina test turn step requires visible NPC ${displayLabel}.`);
  }
  return npcRef;
}

function contains(text, fragments) {
  return fragments.some((fragment) => text.includes(fragment));
}

function fail(message) {
  const error = new TypeError(message);
  error.code = 'LOWER_DVINA_TRACE_TURN_STEP_TEST_FIXTURE_INVALID';
  throw error;
}
