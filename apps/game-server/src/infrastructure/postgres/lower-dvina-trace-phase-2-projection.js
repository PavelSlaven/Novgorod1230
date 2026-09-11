import { canonicalDigest } from '@rus/materialization';
import { publicCheckProjection, publicTimeProjection,
  stripPublicInternals } from './lower-dvina-trace-public-projection-filter.js';
import { createTurnScreenReadModel } from '@rus/presentation';
import { projectLowerDvinaTraceScreenPanels } from
  './lower-dvina-trace-screen-panels.js';

const SPEECH_RESPONSE_KINDS = new Set([
  'route_disclosure',
  'withhold',
  'surrender',
  'lie',
  'bargain',
  'speech'
]);
const NON_SPEECH_RESPONSE_KINDS = new Set([
  'silence',
  'leave_conversation',
  'action_handoff',
  'combat_handoff'
]);

export function phase2PublicResult({ payload, screen }) {
  const consequence = payload.last_turn.consequence;
  return stripPublicInternals({
    party_id: payload.party_id,
    turn_number: payload.party_state.turn_number,
    state_version: payload.party_state.state_version,
    option_id: payload.last_turn.option_id,
    screen,
    check: publicCheckProjection(payload.last_turn.check_result),
    time_update: publicTimeProjection(payload.last_turn.time_update),
    body_update: payload.last_turn.body_update,
    observations: consequence.observations ?? [],
    evidence: consequence.evidence_relations ?? [],
    clue: consequence.clue_materialization ?? null,
    movement: consequence.movement ?? null,
    conversation: publicConversationProjection({
      conversation: consequence.conversation
        ?? semanticNegotiationCandidate(consequence.negotiation),
      payload
    })
  });
}

export function committedPendingPhase2PublicResult({ payload, screen }) {
  return phase2PublicResult({ payload: structuredClone(payload),
    screen: structuredClone(screen) });
}

function semanticNegotiationCandidate(negotiation) {
  return negotiation?.semantic_exchange_projection != null
      || negotiation?.semantic_exchange != null
    ? negotiation
    : null;
}

function publicConversationProjection({ conversation, payload }) {
  if (conversation?.semantic_exchange != null) {
    throw new TypeError(
      'Private semantic exchange cannot be projected from shared state.'
    );
  }
  const semantic = conversation?.semantic_exchange_projection;
  if (semantic == null) return conversation;
  if (semantic.factual_status === 'not_applied') {
    if (semantic.npc_ref !== null
        || semantic.response_kind !== null
        || semantic.time_budget?.status !== 'paused'
        || !Array.isArray(semantic.statement_refs)
        || semantic.statement_refs.length !== 0
        || semantic.route_disclosure !== null) {
      throw new TypeError(
        'Unapplied semantic conversation projection is invalid.'
      );
    }
    return null;
  }
  const responseKind = semantic.response_kind;
  const speechResponse = SPEECH_RESPONSE_KINDS.has(responseKind);
  const nonSpeechResponse = NON_SPEECH_RESPONSE_KINDS.has(responseKind);
  const noResponse = responseKind === null;
  if (!speechResponse && !nonSpeechResponse && !noResponse) {
    throw new TypeError(
      'Semantic conversation response kind is not player-projectable.'
    );
  }
  const statementRefs = semantic.statement_refs;
  const expectedStatementCount = speechResponse || noResponse ? 1 : 0;
  if (!Array.isArray(statementRefs)
      || statementRefs.length !== expectedStatementCount
      || statementRefs.some(({ entity_kind: kind, entity_id: id }) =>
        kind !== 'conversation_statement'
        || typeof id !== 'string'
        || id.length === 0)) {
    throw new TypeError('Semantic statement references are invalid.');
  }
  const statementIds = new Set(statementRefs.map(
    ({ entity_id: statementId }) => statementId
  ));
  if (statementIds.size !== statementRefs.length) {
    throw new TypeError('Semantic statement references are duplicated.');
  }
  const npcRef = semantic.npc_ref;
  if ((noResponse && npcRef !== null)
      || (!noResponse && (npcRef?.entity_kind !== 'npc'
        || typeof npcRef.entity_id !== 'string'
        || npcRef.entity_id.length === 0))) {
    throw new TypeError('Semantic NPC reference is invalid.');
  }
  const routeDisclosure = semantic.route_disclosure;
  const disclosedRouteRef = routeDisclosure?.route_ref;
  if (responseKind === 'route_disclosure'
      ? typeof disclosedRouteRef !== 'string'
        || disclosedRouteRef.length === 0
      : routeDisclosure !== null) {
    throw new TypeError('Semantic route disclosure is invalid.');
  }
  const referencedStatements = (payload.conversation_statements ?? []).filter(
    ({ statement_id: statementId }) => statementIds.has(statementId)
  );
  if (referencedStatements.length !== expectedStatementCount) {
    throw new TypeError('Semantic statement references are incomplete.');
  }
  if (noResponse && referencedStatements.some(({ speaker_ref: speaker }) =>
    speaker?.entity_kind !== 'player_character'
      || speaker.entity_id !== payload.actor_id)) {
    throw new TypeError(
      'Semantic statement does not belong to the projected player.'
    );
  }
  if (!noResponse && referencedStatements.some(({ speaker_ref: speaker }) =>
    speaker?.entity_kind !== npcRef.entity_kind
      || speaker.entity_id !== npcRef.entity_id)) {
    throw new TypeError(
      'Semantic statement does not belong to the projected NPC.'
    );
  }
  let npcUtterance = null;
  if (speechResponse) {
    const playerMessages = referencedStatements.flatMap((statement) => {
      const audience = (payload.conversation_audiences ?? []).find(
        ({ statement_ref: statementRef }) =>
          statementRef?.entity_kind === 'conversation_statement'
          && statementRef.entity_id === statement.statement_id
      );
      return (audience?.received_messages ?? []).filter(
        ({ listener_ref: listener, comprehension,
          utterance_text: utterance }) =>
          listener?.entity_kind === 'player_character'
          && listener.entity_id === payload.actor_id
          && comprehension === 'full'
          && utterance === statement.utterance_text
      );
    });
    if (referencedStatements.length !== 1 || playerMessages.length !== 1) {
      throw new TypeError(
        'Semantic conversation has no single player-visible NPC utterance.'
      );
    }
    npcUtterance = playerMessages[0].utterance_text;
  }
  const {
    semantic_exchange_projection: _semanticProjection,
    ...publicConversation
  } = conversation;
  const projectedConversation = structuredClone(publicConversation);
  if (projectedConversation.check_result != null) {
    projectedConversation.check_result = publicCheckProjection(
      projectedConversation.check_result
    );
  }
  return {
    ...projectedConversation,
    semantic_exchange: {
      response_kind: responseKind === 'lie' ? 'speech' : responseKind,
      npc_utterance: npcUtterance,
      disclosed_route_ref: responseKind === 'route_disclosure'
        ? disclosedRouteRef
        : null
    }
  };
}

export function rebuildPhase2HistoricalScreen({
  payload,
  turnId,
  visiblePayload,
  narrationOutput,
  narrationOutputDigest,
  presentation = null
}) {
  const visibleContext = phase2VisibleContextFromPayload(visiblePayload);
  const narration = {
    ...structuredClone(narrationOutput.flow_result),
    presentation: {
      package_digest: narrationOutput.package_digest,
      output_digest: narrationOutputDigest
    }
  };
  return buildPhase2ReadyScreen({
    payload,
    turnId,
    visibleContext,
    narration,
    narrationOutputDigest,
    presentation
  });
}

export function buildPhase2ReadyScreen({
  payload,
  turnId,
  visibleContext,
  narration,
  narrationOutputDigest,
  presentation = null
}) {
  const combatState = publicCombatStateFromConsequence(
    payload.last_turn?.consequence);
  const screen = projectLowerDvinaTraceScreenPanels({
    payload, presentation,
    screen: {
      ...createTurnScreenReadModel({
        partyId: payload.party_id,
        turnId,
        turnNumber: payload.party_state.turn_number,
        visibleContext,
        narration,
        actions: [],
        checks: projectPlayerSafeChecks(payload),
        panels: {}
      }),
      scenario_id: 'lower_dvina_trace_v1',
      screen_kind: 'trace_turn',
      delivery_state: {
        ready: true,
        generated_at: payload.last_turn.received_at
      },
      opening_screen_digest:
        payload.opening_identity.opening_screen_digest,
      schema: 'lower_dvina_trace_turn_screen',
      screen_status: 'ready',
      ...(combatState == null ? {} : { combat_state: combatState }),
      current_projection_anchor: {
        committed_state_version:
          payload.party_state.state_version,
        package_id: payload.last_turn.visible_package.package_id,
        package_digest:
          payload.last_turn.visible_package.package_digest,
        narration_output_digest: narrationOutputDigest
      }
    }
  });
  screen.screen_digest = phase2ScreenDigest(screen);
  return screen;
}

export function publicCombatStateFromConsequence(consequence) {
  const session = consequence?.combat?.session_after
    ?? consequence?.accusation?.combat_initialization?.session
    ?? consequence?.accusation?.combat_initialization
    ?? consequence?.combat_initialization?.session
    ?? consequence?.combat_initialization;
  const paused = session?.status === 'paused_for_player'
    && session.player_response_required === true;
  const ended = session?.status === 'ended'
    && session.player_response_required === false;
  return paused || ended ? { status: session.status,
    player_response_required: session.player_response_required } : null;
}

const CHECK_MODIFIER_LABELS = Object.freeze({
  attribute: 'Характеристика', skill: 'Навык', state: 'Состояние',
  equipment: 'Снаряжение и нагрузка', circumstances: 'Обстоятельства'
});
const ATTRIBUTE_LABELS = Object.freeze({
  strength: 'Сила', dexterity: 'Ловкость', endurance: 'Выносливость',
  reason: 'Разум', attention: 'Внимание', influence: 'Влияние'
});
const SKILL_LABELS = Object.freeze({
  athletics: 'Атлетика', stealth: 'Скрытность', melee: 'Ближний бой',
  ranged_combat: 'Дальний бой', craft: 'Ремесло', household: 'Хозяйство',
  survival: 'Выживание', riding: 'Верховая езда', healing: 'Лечение',
  observation: 'Наблюдение', communication: 'Общение',
  custom_and_law: 'Обычай и право'
});

export function projectPlayerSafeChecks(payload) {
  const projected = [];
  const seen = new Set();
  const actorLabel = cleanText(payload.player_profile?.identity?.name) ?? 'Вы';
  const actionFallback = cleanText(payload.last_turn?.raw_text)
    ?? 'Проверка действия';
  const add = (result, labels = {}, actionLabel = actionFallback) => {
    if (result == null || seen.has(result.check_id)) return;
    seen.add(result.check_id);
    projected.push(playerSafeCheck({
      result, ordinal: projected.length + 1, actorLabel, actionLabel, labels
    }));
  };

  const commit = payload.last_turn?.turn_step_commit;
  if (commit?.checks?.results?.length) {
    for (const result of commit.checks.results) {
      const trace = commit.loop_trace?.step_traces?.find((candidate) =>
        candidate?.applied === true
        && candidate.check_binding?.check_id === result.check_id);
      add(result, checkSourceLabels(trace?.approved_plan?.check),
        cleanText(trace?.approved_plan?.interpretation?.grounded_attempt)
          ?? actionFallback);
    }
  } else {
    add(payload.last_turn?.check_result);
  }
  add(payload.last_turn?.consequence?.conversation?.check_result);

  const combat = payload.last_turn?.consequence?.combat;
  for (const result of combat?.check_results ?? []) {
    const step = combat.exchange?.technical_steps?.find((candidate) =>
      result.check_id === `combat-check:${candidate.proposal_id}`);
    if (step?.actor_ref?.entity_kind !== 'player_character'
        || step.actor_ref.entity_id !== payload.actor_id) continue;
    add(result, {}, actionFallback);
  }
  return projected;
}

function playerSafeCheck({ result, ordinal, actorLabel, actionLabel, labels }) {
  const modifierKinds = Object.keys(CHECK_MODIFIER_LABELS);
  return {
    ordinal,
    actor_label: actorLabel,
    action_label: actionLabel,
    die: 'd20',
    formula: 'd20 + характеристика + навык + состояние + снаряжение + обстоятельства',
    roll: result.roll,
    difficulty: result.difficulty,
    modifiers: modifierKinds.map((kind) => ({
      kind,
      label: labels[kind] ?? CHECK_MODIFIER_LABELS[kind],
      value: result.modifiers[kind]
    })),
    total: result.total,
    outcome: {
      band: result.outcome.band,
      margin: result.outcome.margin,
      success: result.outcome.success,
      cost_required: result.outcome.cost_required,
      severe_failure: result.outcome.severe_failure,
      roll_note: result.outcome.roll_note
    },
    consequence_label: null
  };
}

function checkSourceLabels(check) {
  const attribute = ATTRIBUTE_LABELS[check?.attribute_ref];
  const skill = check?.skill_ref == null ? 'без подходящего навыка'
    : SKILL_LABELS[check.skill_ref];
  return {
    ...(attribute ? { attribute: `Характеристика: ${attribute}` } : {}),
    ...(skill ? { skill: `Навык: ${skill}` } : {})
  };
}

function cleanText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function phase2VisibleContextFromPayload(payload) {
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: payload.perceived_scene,
    visible_changes: structuredClone(payload.perceived_changes),
    sensory_details: structuredClone(payload.sensory_details),
    visible_npc: structuredClone(payload.visible_npcs),
    visible_objects: structuredClone(payload.visible_objects),
    known_context: structuredClone(payload.known_context),
    uncertainties: structuredClone(payload.uncertainties),
    allowed_tensions: [],
    do_not_imply: []
  };
}

export function phase2ScreenDigest(screen) {
  const { screen_digest: _digest, ...payload } = screen;
  return canonicalDigest(payload);
}
