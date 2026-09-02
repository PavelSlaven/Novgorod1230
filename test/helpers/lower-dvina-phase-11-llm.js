import { phase7AutonomousPlan } from
  '../../apps/game-server/test/lower-dvina-trace-phase-7-contract-fixture.js';
import {
  createM2ConversationModels,
  npcSpeechPlan,
  playerPlan
} from '../../apps/game-server/test/lower-dvina-trace-m2-conversation-fixture.js';
import { createLowerDvinaTraceTurnStepTestModel } from
  '../../apps/game-server/test/lower-dvina-trace-turn-step-model-fixture.js';

const ROUTE_TEXT =
  'Идти к Жданко всем вместе. Ратшу держать между нами. Не входить тайком.';
const ONISIM_TESTIMONY = 'Голос Жданко я узнал ещё до столкновения. Потом '
  + 'был удар шестом, кто-то рванул сумку, а Ратша уже после крушения '
  + 'вытащил меня, связал и унёс к сушильне.';

export const PHASE11_CANONICAL_TURNS = Object.freeze([
  ['inspect', 'Осмотреть место крушения подробно.'],
  ['camp', 'Дойти до рыбацкого стана.'],
  ['clue', 'Показать Еремею синюю шерсть.'],
  ['route', 'Пройти известной тропой к старой сушильне.'],
  ['surrender', 'Предложить Ратше условную защиту и потребовать сдачи.'],
  ['treatment', 'Оказать Онисиму первую помощь.'],
  ['carry', 'Сделать носилки и отнести Онисима в стан.'],
  ['rest', 'Отдохнуть у огня полчаса и подсушить одежду. '
    + 'Попросить Еремея и рыбака пойти со мной к Жданко.'],
  ['phase8-route', ROUTE_TEXT],
  ['accuse', 'Обвинить Жданко и потребовать вернуть дорожную сумку.'],
  ['combat', 'Помочь Еремею обезоружить Жданко, не убивая его.'],
  ['bag', 'Забрать дорожную сумку у Жданко.'],
  ['open', 'Открыть возвращённую дорожную сумку.'],
  ['packet', 'Извлечь свёрток и осмотреть печать, не вскрывая документ.'],
  ['return', 'Вернуться всей группой к Онисиму.'],
  ['testimony', 'Попросить Онисима рассказать, что он знает о Жданко '
    + 'и свёртке.'],
  ['evidence', 'Сопоставить все подтверждённые доказательства.'],
  ['disposition', 'Зафиксировать временное решение по людям, имуществу '
    + 'и обещанию.']
]);

export function createCanonicalPhase11LlmResponder({
  ratshaResponseKind = 'surrender',
  zhdankoCombatChoice = 'engage',
  zhdankoCombatTarget = 'player',
  companionCombatChoice = 'control',
  phase7Choice = 'move_bag',
  eremeyRouteResponse = 'route_disclosure',
  eremeyCompanionResponse = 'accept',
  onisimResponse = 'speech'
} = {}) {
  const conversation = createM2ConversationModels({ ratshaResponseKind });
  const generalLookModel = createLowerDvinaTraceTurnStepTestModel();
  const combatConversation = createM2ConversationModels({
    ratshaResponseKind: 'combat_handoff'
  });
  let turn10Actors = null;
  return async ({ model, input }) => {
    if (model === 'fixture-intent-router') return resolveIntent(input);
    if (model === 'fixture-spatial-semantic-descriptor') {
      return {
        schema: 'rus.s1_spatial_semantic_proposal.v1',
        request_id: input.request_id,
        name: 'Низкая плетёная загородка',
        description: 'Сырая плетёная загородка у берега, без особого значения.',
        semantic_requirements:
          input.approved_envelope.required_semantic_requirements ?? []
      };
    }
    if (['fixture-turn-step-planner', 'fixture-turn-step-planner-repair']
      .includes(model)) {
      const request = input.request ?? input;
      if (['осмотреться', 'осматриваюсь вокруг'].includes(
        String(request.root_player_action).trim().toLowerCase()
          .replace(/[.!?]+$/u, '')
      )) {
        return generalLookModel(request);
      }
      if (turn10Actors == null
          && request.root_player_action?.startsWith('Отдохнуть у огня')) {
        const targets = request.prepared_followup_candidates?.[0]?.operation
          ?.target_actor_refs ?? [];
        turn10Actors = {
          ...actorIds(request),
          eremey: targets[0], fisher: targets[1], otherFisher: targets[2]
        };
      }
      if (request.root_player_action?.startsWith('Попросить Онисима')) {
        const onisim = request.available_domain_operations?.find(
          ({ op, interaction_kind: kind, content }) =>
            op === 'emit_interaction' && kind === 'request'
              && /Онисим/iu.test(content ?? '')
        )?.target_actor_refs?.[0]
          ?? actorIds(request).onisim ?? turn10Actors?.onisim;
        turn10Actors = { ...turn10Actors, onisim };
      }
      const plan = planTurnStep(request, turn10Actors, generalLookModel);
      return plan;
    }
    if (model === 'fixture-turn-step-grounding-auditor') {
      return { pass: true, concerns: [] };
    }
    if (['fixture-player-conversation-interpreter',
      'fixture-player-conversation-interpreter-repair'].includes(model)) {
      const request = input.request ?? input;
      const turn10Addressees = request.player_safe_context.phase === 'turn_10'
        ? [turn10Actors?.eremey, turn10Actors?.fisher,
          turn10Actors?.otherFisher]
          .filter(Boolean)
          .map((entity_id) => ({ entity_kind: 'npc', entity_id }))
        : null;
      const plan = playerPlan(request, {
        checkRequired: Boolean(
          request.player_safe_context.required_supporting_operation
          || request.player_safe_context.offer_policy_ref
        ),
        offer: Boolean(request.player_safe_context.offer_policy_ref),
        primaryAddresseeRef: turn10Addressees?.[0]
          ?? request.player_safe_context.target_npc_ref,
        intendedAddresseeRefs: turn10Addressees
          ?? [request.player_safe_context.target_npc_ref]
      });
      return plan;
    }
    if (['fixture-npc-conversation-responder',
      'fixture-npc-conversation-responder-repair'].includes(model)) {
      return npcConversationPlan(input.request ?? input, {
        conversation,
        combatConversation,
        ratshaResponseKind,
        eremeyRouteResponse,
        eremeyCompanionResponse,
        onisimResponse,
        turn10Actors
      });
    }
    if (model === 'fixture-npc-conversation-grounding-auditor') {
      return { pass: true, concerns: [] };
    }
    if (['fixture-npc-autonomous-decider',
      'fixture-npc-autonomous-decider-repair'].includes(model)) {
      const request = input.request ?? input;
      turn10Actors = { ...turn10Actors, zhdanko: request.npc_ref };
      const plan = phase7AutonomousPlan(request, phase7Choice);
      const bagRef = request.npc?.available_resources?.[0]?.resource_ref;
      const bagMove = request.decision_scope?.operation_contract?.move_entity
        ?.allowed?.find(({ placement, entity_refs: refs }) =>
          placement?.relation === 'held_by'
            && placement.target_ref === request.npc_ref
            && refs?.includes(bagRef));
      return {
        interpretation: plan.interpretation,
        resolution: plan.resolution,
        operation_choice: phase7Choice === 'move_bag'
          ? null : 'request_activity:0',
        operations: phase7Choice === 'move_bag' && bagMove != null
          ? [{ op: 'move_entity', entity_ref: bagRef,
            placement: bagMove.placement },
          { operation_choice: 'request_activity:0' }]
          : [],
        check: plan.check,
        reason_code: plan.reason_code,
        reason: plan.reason
      };
    }
    if (['fixture-npc-combat-decider',
      'fixture-npc-combat-decider-repair'].includes(model)) {
      return combatPlan(input, { ...actorIds(input), ...turn10Actors }, {
        zhdanko: zhdankoCombatChoice,
        zhdankoTarget: zhdankoCombatTarget,
        companions: companionCombatChoice
      });
    }
    if (['fixture-gameplay-narrator', 'fixture-gameplay-narrator-repair']
      .includes(model)) {
      return narrationOutput(input);
    }
    if (model === 'fixture-gameplay-narrator-auditor') return narrationAudit();
    throw new Error(`Unexpected production LLM model: ${model}`);
  };
}

function resolveIntent(request) {
  const raw = String(request.raw_text ?? '').toLowerCase();
  const option = (request.options ?? request.action_options ?? [])
    .find(({ option_id: id, label, title, description }) => {
      const haystack = [id, label, title, description]
        .filter(Boolean).join(' ').toLowerCase();
      return raw.split(/\s+/u).filter((word) => word.length > 5)
        .some((word) => haystack.includes(word));
    }) ?? (request.options ?? request.action_options ?? [])[0];
  return option ? { option_id: option.option_id } : {
    status: 'unknown', reason_code: 'unknown_intent'
  };
}

function planTurnStep(request, knownActors, generalLookModel) {
  const ids = { ...actorIds(request), ...knownActors };
  if (request.root_player_action === PHASE11_CANONICAL_TURNS[3][1]) {
    const route = request.available_domain_operations?.find((operation) =>
      operation.op === 'request_movement'
        && operation.movement_kind === 'route');
    if (route != null) return suppliedChoicePlan(request, route,
      'supplied_known_route');
  }
  if (PHASE11_CANONICAL_TURNS.slice(4, 7).some(([, text]) =>
    request.root_player_action === text)) {
    const plan = generalLookModel(request);
    const operation = plan.operations?.[0];
    if (operation != null) return suppliedChoicePlan(request, operation,
      plan.reason_code);
  }
  if (request.root_player_action?.startsWith('Отдохнуть у огня')) {
    return turn10Plan(request, ids);
  }
  if (request.player_safe_state.combat_sessions?.length > 0
      || request.root_player_action === ROUTE_TEXT
      || request.root_player_action?.includes('Обвинить Жданко')) {
    return phase8Plan(request, ids);
  }
  const actor = request.actor.actor_id;
  const text = request.remaining_intent;
  const bag = entityByTemplate(
    request.player_safe_state.containers,
    'trace_ld_v1_container_road_bag',
    'container_id'
  ) ?? entityByTemplate(
    request.player_safe_state.items,
    'trace_ld_v1_container_road_bag',
    'item_id'
  );
  const packet = entityByTemplate(
    request.player_safe_state.items,
    'trace_ld_v1_item_sealed_packet',
    'item_id'
  );
  let operation;
  if (text.includes('Забрать дорожную')) {
    operation =
    request.available_domain_operations?.find((candidate) =>
      (candidate.op === 'request_item_use' && candidate.item_ref === bag
        && candidate.use_kind === 'operate')
        || (candidate.op === 'move_entity' && candidate.entity_ref === bag
          && candidate.placement?.relation === 'held_by'
          && candidate.placement.target_ref === actor)) ?? {
      op: 'request_item_use', actor_ref: actor, use_kind: 'operate',
      item_ref: bag, target_refs: []
    };
  } else if (text.includes('Открыть возвращённую')) operation = {
    op: 'request_container_access', actor_ref: actor, access_kind: 'open',
    container_ref: bag
  };
  else if (text.includes('Извлечь свёрток')) operation = {
    op: 'request_item_use', actor_ref: actor, use_kind: 'operate',
    item_ref: packet, target_refs: []
  };
  else if (text.includes('Вернуться всей')) operation = {
    op: 'request_movement', actor_ref: actor, movement_kind: 'route',
    target_ref: 'trace_ld_v1_loc_fishing_camp'
  };
  else if (text.includes('Попросить Онисима')) operation = {
    op: 'emit_interaction', actor_ref: actor, interaction_kind: 'request',
    target_actor_refs: [ids.onisim], content: text, instrument_refs: []
  };
  else if (text.includes('Сопоставить')) {
    operation = activity(actor, ['trace_ld_v1_clue_evidence_graph_set']);
  } else {
    operation = activity(actor, dispositionSelection(request));
  }
  const supplied = request.available_domain_operations?.find((candidate) =>
    candidate.op === operation.op
      && (operation.entity_ref == null
        || candidate.entity_ref === operation.entity_ref)
      && (operation.placement == null
        || candidate.placement?.relation === operation.placement.relation
          && candidate.placement?.target_ref === operation.placement.target_ref)
      && (operation.item_ref == null || candidate.item_ref === operation.item_ref)
      && (operation.container_ref == null
        || candidate.container_ref === operation.container_ref)
      && (operation.use_kind == null || candidate.use_kind === operation.use_kind)
      && (operation.access_kind == null
        || candidate.access_kind === operation.access_kind)
      && (operation.movement_kind == null
        || candidate.movement_kind === operation.movement_kind)
      && (operation.interaction_kind == null
        || candidate.interaction_kind === operation.interaction_kind)
      && (operation.target_actor_refs == null
        || sameStringSet(candidate.target_actor_refs,
          operation.target_actor_refs))
      && (operation.target_refs == null
        || sameStringSet(candidate.target_refs, operation.target_refs))
      && (operation.activity_kind == null
        || candidate.activity_kind === operation.activity_kind)
      && (operation.target_ref == null
        || candidate.target_ref === operation.target_ref));
  if (supplied != null) return suppliedChoicePlan(request, supplied,
    'phase9_step');
  return turnStepPlan(request, operation, null, 'phase9_step');
}

function turn10Plan(request, ids) {
  const first = request.step_index === 1;
  const operation = first ? {
    op: 'request_activity',
    actor_ref: request.actor.actor_id,
    activity_kind: 'recover',
    target_refs: [request.player_safe_state.position.location_ref],
    description: 'отдохнуть у огня полчаса и подсушить одежду'
  } : {
    op: 'emit_interaction',
    actor_ref: request.actor.actor_id,
    interaction_kind: 'request',
    target_actor_refs: [ids.eremey, ids.fisher, ids.otherFisher],
    instrument_refs: [],
    content: 'попросить Еремея и рыбака пойти к Жданко'
  };
  const continuation = first ? {
    remaining_intent:
      'Попросить Еремея и рыбака пойти со мной к Жданко.',
    depends_on_refs: [
      request.player_safe_state.position.location_ref,
      ids.eremey,
      ids.fisher,
      ids.otherFisher
    ],
    ...(request.prepared_followup_candidates?.[0] == null ? {} : {
      prepared_followup_ref:
        request.prepared_followup_candidates[0].prepared_followup_ref
    })
  } : null;
  return turnStepPlan(request, operation, continuation,
    first ? 'rest_then_request_companions' : 'request_companions');
}

function turnStepPlan(request, operation, continuation, reasonCode) {
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
    continuation,
    clarification: null,
    reason_code: reasonCode,
    reason: 'Передать действие утверждённому владельцу домена.'
  };
}

function turnStepChoicePlan(request, operationChoice, operationFamily,
  reasonCode) {
  const plan = turnStepPlan(request, null, null, reasonCode);
  delete plan.operations;
  plan.operation_choice = operationChoice;
  plan.operation_family = operationFamily;
  return plan;
}

function suppliedChoicePlan(request, operation, reasonCode) {
  const operations = [...(request.available_domain_operations ?? []),
    ...(request.player_safe_state?.local_world_process?.allowed ?? [])]
    .filter((candidate, index, all) => all.findIndex((entry) =>
      JSON.stringify(entry) === JSON.stringify(candidate)) === index);
  const index = operations.findIndex((candidate) =>
    JSON.stringify(candidate) === JSON.stringify(operation));
  if (index < 0) return turnStepPlan(request, operation, null, reasonCode);
  const qualifier = operation.process_action ?? operation.discovery_kind
    ?? operation.access_kind ?? operation.movement_kind ?? operation.use_kind
    ?? operation.activity_kind ?? operation.interaction_kind;
  const collision = operations.filter((candidate) => candidate.op === operation.op
    && (candidate.process_action ?? candidate.discovery_kind
      ?? candidate.access_kind ?? candidate.movement_kind ?? candidate.use_kind
      ?? candidate.activity_kind ?? candidate.interaction_kind) === qualifier)
    .length > 1;
  const label = collision ? String(operation.description ?? '').normalize('NFKC')
    .toLocaleLowerCase('ru-RU').replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/gu, '') || 'variant' : null;
  const choice = ['domain_operation', index + 1, operation.op, qualifier, label]
    .filter((part) => part != null).join('_');
  return turnStepChoicePlan(request, choice, operation.op, reasonCode);
}

function phase8Plan(request, ids) {
  const activeSession = request.player_safe_state.combat_sessions?.find(
    ({ status }) => status !== 'ended');
  const combat = activeSession != null;
  const route = request.root_player_action === ROUTE_TEXT;
  const ratshaInCombat = activeSession?.scope_ref?.entity_id
    === 'trace_ld_v1_loc_old_drying_shed';
  const combatTarget = ratshaInCombat ? ids.ratsha : ids.zhdanko;
  const hold = combat && request.root_player_action?.startsWith(
    'Не преследовать Жданко');
  const operation = route ? {
    op: 'request_movement', actor_ref: request.actor.actor_id,
    movement_kind: 'route',
    target_ref: 'trace_ld_v1_loc_zhdanko_storehouse'
  } : combat ? {
    op: 'request_combat', actor_ref: request.actor.actor_id,
    intent_kind: hold ? 'hold' : 'control',
    target_refs: hold ? [] : [combatTarget], protected_refs: [],
    scope_ref: hold ? 'trace_ld_v1_loc_zhdanko_storehouse' : null,
    destination_ref: null,
    force_limit: hold ? 'avoid_harm' : 'nonlethal_if_possible',
    risk_posture: 'ordinary'
  } : {
    op: 'emit_interaction', actor_ref: request.actor.actor_id,
    target_actor_refs: [ids.zhdanko], interaction_kind: 'request',
    content: 'предъявить обвинение и потребовать вернуть дорожную сумку',
    instrument_refs: []
  };
  const supplied = request.available_domain_operations?.find((candidate) =>
    candidate.op === operation.op
      && (operation.movement_kind == null
        || candidate.movement_kind === operation.movement_kind)
      && (operation.interaction_kind == null
        || candidate.interaction_kind === operation.interaction_kind)
      && (operation.intent_kind == null
        || candidate.intent_kind === operation.intent_kind)
      && (operation.target_ref == null
        || candidate.target_ref === operation.target_ref)
      && (operation.target_refs == null
        || operation.target_refs.every((ref) => ref == null
          ||
          candidate.target_refs?.includes(ref))));
  if (supplied != null) return suppliedChoicePlan(request, supplied,
    route ? 'route_to_storehouse' : combat ? 'combat_response' : 'accusation');
  return turnStepPlan(request, operation, null,
    route ? 'route_to_storehouse' : combat ? 'combat_response' : 'accusation');
}

function combatPlan(request, ids, choices = {}) {
  const perceived = request.decision_reasons?.perceived_changes ?? [];
  const postDisarm = perceived.some((summary) => summary.includes('оруж'));
  const postReach = perceived.some((summary) =>
    summary.includes('достиг выбранного'));
  let intentKind = 'hold';
  let targetRefs = [];
  let scopeRef = {
    entity_kind: 'location',
    entity_id: 'trace_ld_v1_loc_zhdanko_storehouse'
  };
  let forceLimit = 'avoid_harm';
  const playerTarget = ids.player
    ?? request.operation_contract.engageable_actor_refs?.find(
      ({ entity_kind: kind }) => kind === 'player_character')?.entity_id;
  const ratshaCombat = request.operation_contract.holdable_scope_refs?.some(
    ({ entity_id: entityId }) =>
      entityId === 'trace_ld_v1_loc_old_drying_shed');
  if (!ratshaCombat && request.npc_ref.entity_id === ids.zhdanko) {
    intentKind = postDisarm ? 'surrender' : choices.zhdanko ?? 'engage';
    const zhdankoTarget = choices.zhdankoTarget === 'eremey'
      ? ids.eremey : playerTarget;
    targetRefs = ['surrender', 'cease_hostility', 'hold', 'break_contact']
      .includes(intentKind)
      ? [] : [{
      entity_kind: choices.zhdankoTarget === 'eremey' ? 'npc'
        : 'player_character', entity_id: zhdankoTarget
      }];
    scopeRef = null;
    forceLimit = 'ordinary';
  } else if ([ids.eremey, ids.fisher]
    .includes(request.npc_ref.entity_id)) {
    intentKind = choices.companions ?? 'control';
    if (intentKind === 'control') {
      targetRefs = [{ entity_kind: 'npc', entity_id: ids.zhdanko }];
      scopeRef = null;
      forceLimit = 'nonlethal_if_possible';
    }
  } else if (ratshaCombat && choices.ratsha === 'reach' && !postReach) {
    intentKind = 'reach';
    scopeRef = null;
  } else if (ratshaCombat) {
    intentKind = 'engage';
    targetRefs = [{
      entity_kind: 'player_character', entity_id: playerTarget
    }];
    scopeRef = null;
    forceLimit = 'ordinary';
  }
  const destinationRef = intentKind === 'reach'
    ? request.operation_contract.reachable_destination_refs[0]
    : intentKind === 'break_contact'
      ? request.operation_contract.break_contact_destination_refs[0]
      : null;
  const selectedRef = targetRefs[0] ?? scopeRef ?? destinationRef ?? null;
  return {
    decision: {
      intent_summary: 'Выбрать ближайшее действие в столкновении.',
      grounded_goal: 'Сохранить контроль над текущим положением.',
      adaptation: 'literal'
    },
    operation_choice: combatOperationChoiceId(
      request.operation_contract, intentKind, selectedRef),
    force_choice: choiceId(request.operation_contract.allowed_force_limits,
      forceLimit, 'force'),
    risk_choice: choiceId(request.operation_contract.allowed_risk_postures,
      'ordinary', 'risk'),
    combat_statement: null,
    reason: postDisarm
      ? 'Сопротивление более невозможно.'
      : 'Участник выбирает ближайшее допустимое действие.'
  };
}

function combatOperationChoiceId(contract, selectedIntent, selectedRef) {
  const refsByIntent = {
    engage: contract.engageable_actor_refs,
    control: contract.controllable_actor_refs,
    protect: contract.protectable_refs,
    hold: contract.holdable_scope_refs,
    reach: contract.reachable_destination_refs,
    break_contact: contract.break_contact_destination_refs
  };
  let index = 0;
  for (const intentKind of contract.allowed_intent_kinds ?? []) {
    if ((intentKind === 'surrender' && contract.surrender_available !== true)
        || (intentKind === 'cease_hostility'
          && contract.cease_hostility_available !== true)) continue;
    const refs = ['surrender', 'cease_hostility'].includes(intentKind)
      || (intentKind === 'break_contact'
        && (refsByIntent[intentKind] ?? []).length === 0)
      ? [null] : refsByIntent[intentKind] ?? [];
    for (const reference of refs) {
      index += 1;
      if (intentKind === selectedIntent
          && (reference === null ? selectedRef === null
            : sameRef(reference, selectedRef))) return `operation_${index}`;
    }
  }
  throw new Error('Missing operation fixture choice.');
}

function choiceId(values, selected, prefix, equals = Object.is) {
  const index = (values ?? []).findIndex((value) => equals(value, selected));
  if (index < 0) throw new Error(`Missing ${prefix} fixture choice.`);
  return `${prefix}_${index + 1}`;
}

function sameRef(left, right) {
  return left?.entity_kind === right?.entity_kind
    && left?.entity_id === right?.entity_id;
}

function sameStringSet(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && right.every((value) => left.includes(value));
}

function npcConversationPlan(request, {
  conversation,
  combatConversation,
  ratshaResponseKind,
  eremeyRouteResponse,
  eremeyCompanionResponse,
  onisimResponse,
  turn10Actors
}) {
  if (turn10Actors == null
      && request.decision_scope?.operation_contract?.commit_surrender) {
    if (ratshaResponseKind === 'combat_handoff') {
      return combatConversation.npcSemanticModel(request);
    }
    return npcSpeechPlan(request, {
      utteranceText: 'Сдаюсь. Сумку велел забрать Жданко; нож отдаю.',
      dominantAct: 'confess', interactionTags: ['surrender'],
      claims: [{
        claim_id: 'trace_ld_v1_assertion_ratsha_confession',
        content_summary: 'Ратша признаёт собственные действия и полученное '
          + 'от Жданко указание забрать сумку.',
        form: 'assertion', speaker_posture: 'believed_true',
        source_knowledge_refs: [], mentioned_entity_refs: []
      }], supportingOperations: [{ op: 'commit_surrender' }]
    });
  }
  if (turn10Actors != null
      && request.decision_scope?.operation_contract?.commit_surrender
      && request.npc_ref.entity_id !== turn10Actors?.ratsha) {
    turn10Actors.zhdanko = request.npc_ref.entity_id;
    return combatConversation.npcSemanticModel(request);
  }
  if (request.npc_ref?.entity_id === turn10Actors?.onisim) {
    return onisimResponse === 'speech'
      ? npcSpeechPlan(request, {
          utteranceText: ONISIM_TESTIMONY,
          dominantAct: 'inform',
          claims: [testimonyClaim()],
          supportingOperations: []
        })
      : nonSpeechPlan(request, onisimResponse);
  }
  const routeOperation = request.decision_scope?.operation_contract
    ?.disclose_known_route;
  if (routeOperation && eremeyRouteResponse === 'route_disclosure') {
    return requiredNpcSpeechPlan(request, {
      utteranceText: 'От лагеря иди к старой сушильне по тропе.',
      dominantAct: 'inform',
      interactionTags: ['route_disclosure'],
      claims: [{
        claim_id: 'eremey-route-disclosure',
        content_summary: 'К старой сушильне ведёт тропа.',
        form: 'assertion', speaker_posture: 'believed_true',
        source_knowledge_refs: [{ entity_kind: 'knowledge_scope',
          entity_id: routeOperation.source_knowledge_scope_ref }],
        mentioned_entity_refs: [{ entity_kind: 'route',
          entity_id: routeOperation.route_ref }]
      }],
      supportingOperations: [{
        op: 'disclose_known_route',
        route_ref: routeOperation.route_ref,
        source_knowledge_scope_ref: routeOperation.source_knowledge_scope_ref
      }]
    });
  }
  if (routeOperation) {
    return npcSpeechPlan(request, {
      utteranceText: 'Не стану сейчас указывать дорогу.',
      dominantAct: 'refuse',
      interactionTags: ['withhold'],
      claims: [],
      supportingOperations: []
    });
  }
  if (request.decision_scope?.operation_contract
    ?.commit_route_participation) {
    if (request.npc_ref.entity_id === turn10Actors?.eremey
        && eremeyCompanionResponse === 'evasive_accept') {
      return companionPlan(request, turn10Actors,
        'Пойду к клети, но больше сейчас ничего объяснять не стану.');
    }
    return companionPlan(request, turn10Actors);
  }
  return conversation.npcSemanticModel(request);
}

function requiredNpcSpeechPlan(request, options) {
  const plan = npcSpeechPlan(request, options);
  const scope = request.decision_scope;
  if (scope?.required_resolution !== 'check_required') return plan;
  return {
    ...plan,
    resolution: scope.required_resolution,
    supporting_operations: [structuredClone(scope.required_supporting_operation)],
    check: {
      purpose: 'resolve social delivery',
      ...structuredClone(scope.required_check),
      outcomes: {
        clean_success: { delivery_quality: 'compelling', observable_effects: [] },
        success: { delivery_quality: 'credible', observable_effects: [] },
        success_with_cost: {
          delivery_quality: 'credible_with_visible_cost', observable_effects: []
        },
        failure_with_consequence: {
          delivery_quality: 'unconvincing', observable_effects: []
        },
        severe_failure: {
          delivery_quality: 'transparently_manipulative', observable_effects: []
        }
      }
    }
  };
}

function companionPlan(request, actors, utteranceText = 'Согласен.') {
  const contract = request.decision_scope.operation_contract
    .commit_route_participation;
  const preferred = request.npc_ref.entity_id === actors?.fisher
    ? 'stay_with_onisim'
    : request.npc_ref.entity_id === actors?.otherFisher
      ? 'escort'
      : null;
  const bound = contract.allowed_bindings.find(({ role }) => role === preferred)
    ?? contract.allowed_bindings[0];
  const playerRef = request.public_conversation_history.at(-1).speaker_ref;
  return npcSpeechPlan(request, {
    utteranceText,
    dominantAct: 'accept',
    supportingOperations: [{ op: 'commit_route_participation', ...bound }]
  });
}

function nonSpeechPlan(request, kind) {
  return {
    schema: 'conversation_contribution_plan_v1',
    request_id: request.request_id,
    boundary_id: request.boundary_id,
    conversation_id: request.conversation_id,
    exchange_id: request.exchange_id,
    state_version: request.state_version,
    speaker_ref: request.npc_ref,
    contribution_kind: kind,
    primary_addressee_ref: null,
    intended_addressee_refs: [], affected_actor_refs: [], speech: null,
    interpretation: {
      intent: 'Не давать показаний.', grounded_contribution: 'Промолчать.',
      adaptation: 'literal'
    },
    resolution: 'automatic',
    activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: [], check: null, handoff: null,
    reason: 'NPC вправе не отвечать.'
  };
}

function actorIds(request) {
  const state = request.player_safe_state ?? {};
  const npcs = state.npcs ?? request.npc_contexts ?? [];
  const bySlot = Object.fromEntries(npcs.map((npc) => [
    npc.participant_slot_ref ?? npc.slot_ref,
    npc.instance_id ?? npc.npc_ref?.entity_id
  ]));
  return {
    player: request.actor?.actor_id ?? state.actor_id,
    zhdanko: bySlot.zhdanko_storehouse_controller
      ?? findNpc(request, 'zhdanko'),
    eremey: bySlot.eremey_fisher ?? findNpc(request, 'eremey'),
    ratsha: bySlot.ratsha_storehouse_helper ?? findNpc(request, 'ratsha'),
    onisim: bySlot.onisim_boatman ?? findNpc(request, 'onisim'),
    fisher: bySlot.background_fisher_1 ?? findNpc(request, 'fisher_1'),
    otherFisher: bySlot.background_fisher_2 ?? findNpc(request, 'fisher_2')
  };
}

function findNpc(request, fragment) {
  const serialized = JSON.stringify(request);
  return serialized.match(new RegExp(
    `(?:npc|character)[^"\\s]*${fragment}[^"\\s]*`, 'iu'))?.[0] ?? null;
}

function activity(actor, targetRefs) {
  return {
    op: 'request_activity', actor_ref: actor, activity_kind: 'other',
    target_refs: targetRefs,
    description: 'Выполнить утверждённый шаг расследования.'
  };
}

function dispositionSelection(request) {
  const projected = request.player_safe_state.temporary_disposition_options;
  const dimensions = [
    ['custody_option_refs', [
      'hold_ratsha_and_zhdanko_for_authorized_handover',
      'hold_ratsha_zhdanko_absent', 'hold_zhdanko_ratsha_absent',
      'hold_zhdanko_ratsha_present_not_held',
      'preserve_open_case_without_custody'
    ]],
    ['property_option_refs', [
      'preserve_recovered_property_for_savva_handover',
      'record_property_unavailable_without_invention',
      'leave_unresolved_property_state_unchanged'
    ]],
    ['promise_option_refs', [
      'preserve_active_no_summary_killing_promise',
      'recognize_fulfilled_promise', 'recognize_broken_promise',
      'record_no_active_promise', 'commit_scope_breach_for_active_promise'
    ]]
  ];
  return dimensions.map(([field, preferred]) =>
    preferred.find((id) => projected?.[field]?.includes(id))).filter(Boolean);
}

function testimonyClaim() {
  return {
    claim_id: 'trace_ld_v1_assertion_onisim_testimony',
    content_summary: 'Онисим сообщает, что перед столкновением слышал голос '
      + 'Жданко, помнит удар шеста и рывок за сумку, а после крушения Ратша '
      + 'вытащил его из воды, связал и отнёс к сушильне.',
    form: 'assertion', speaker_posture: 'believed_true',
    source_knowledge_refs: [{
      entity_kind: 'knowledge_scope',
      entity_id: 'trace_ld_v1_knowledge_scope_hired_boatman_v1'
    }],
    mentioned_entity_refs: []
  };
}

function entityByTemplate(entities, templateId, idField) {
  return (entities ?? []).find(({ template_id: id }) => id === templateId)
    ?.[idField];
}

function narrationOutput(request) {
  const narrationRequest = request.request ?? request;
  return {
    version: 1,
    schema: 'narration_output',
    output_id: narrationRequest.request_id,
    prose: 'События хода завершены; видимые последствия сохранены.',
    action_options: [], used_references: [],
    self_check: { no_new_world_facts: true }
  };
}

function narrationAudit() {
  return {
    version: 1,
    schema: 'narration_audit',
    pass: true,
    concerns: [],
    evidence: ['Нарратив основан на видимом контексте.']
  };
}
