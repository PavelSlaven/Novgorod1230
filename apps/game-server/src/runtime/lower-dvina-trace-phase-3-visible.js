import { playerSafeSelfIntroductionName } from
  './lower-dvina-trace-player-safe-npc-details.js';

export function withPhase3Conversation({ input, contracts, movement }) {
  if (input.consequence.conversation == null) return movement;
  const conversation = phase3ConversationProjection(input, contracts);
  return {
    ...conversation,
    visible_changes: unique([
      ...movement.visible_changes, ...conversation.visible_changes
    ]),
    sensory_details: unique([
      ...movement.sensory_details, ...conversation.sensory_details
    ]),
    known_context: unique([
      ...movement.known_context, ...conversation.known_context
    ]),
    uncertainties: unique([
      ...movement.uncertainties, ...conversation.uncertainties
    ]),
    allowed_tensions: unique([
      ...movement.allowed_tensions, ...conversation.allowed_tensions
    ]),
    do_not_imply: unique([
      ...movement.do_not_imply, ...conversation.do_not_imply
    ])
  };
}

export function phase3ConversationProjection(input, contracts) {
  const conversation = input.consequence.conversation;
  const semantic = conversation.semantic_exchange ?? null;
  const responseKind = semantic?.response_kind ?? null;
  const speakerRef = responseKind == null
    ? null : perceivedNpcSpeakerRef(semantic);
  const speaker = contracts.actors.find(({ instance_id: instanceId }) =>
    instanceId === speakerRef?.entity_id);
  if (responseKind != null && speaker == null) {
    throw visibleGap('TRACE_M2_PHASE_3_VISIBLE_SPEAKER_GAP');
  }
  const speakerIsEremey = speaker?.ref === contracts.ids.eremeyRef;
  const disclosed = semantic
    ? semantic.route_disclosure != null
    : conversation.route_knowledge_ref != null;
  const speechResponse = semantic !== null && [
    'route_disclosure', 'withhold', 'speech'
  ].includes(responseKind);
  const groupResponses = semantic == null ? null
    : perceivedNpcGroupResponses(semantic, contracts,
        input.retrieved_state?.current_visible_context);
  const speechEntries = groupResponses == null
    ? speechResponse ? [perceivedNpcSpeech(semantic, contracts,
        input.retrieved_state?.current_visible_context)
      ] : []
    : groupResponses.filter(({ kind }) => kind === 'speech');
  const primarySpeech = speechEntries.find(({ actor }) =>
    actor.instance_id === speaker?.instance_id);
  if (speechResponse && primarySpeech == null) {
    throw visibleGap('TRACE_M2_PHASE_3_VISIBLE_GAP');
  }
  const speakerName = primarySpeech?.name ?? null;
  const speakerLabel = primarySpeech?.label ?? (speaker == null ? 'человек'
    : playerSafeNpc(speaker, null,
      input.retrieved_state?.current_visible_context).display_label);
  const speechLines = speechEntries.map(({ label, utterance }) =>
    `${label} говорит: «${utterance}»${/[.!?…]$/u.test(utterance) ? '' : '.'}`);
  const groupLines = groupResponses?.map(responseLine) ?? null;
  const visibleChanges = groupLines ?? (speechResponse ? speechLines : [responseKind === 'silence'
    ? `${speakerLabel} промолчал.`
    : responseKind === 'leave_conversation'
      ? `${speakerLabel} прекратил разговор.`
      : disclosed
          ? `${speakerLabel} ответил и указал путь к сушильне.`
        : semantic != null
          ? 'Ответа не последовало.'
          : `Разговор с ${speakerLabel} продолжился.`]);
  const responseByActor = new Map((groupResponses ?? speechEntries).map((entry) => [
    entry.actor.instance_id, entry
  ]));
  const speakerStatus = responseKind === 'silence'
    ? 'молчит после вашего обращения'
    : responseKind === 'leave_conversation'
      ? 'прекращает разговор с вами'
      : speechResponse ? 'говорит с вами' : null;
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: groupLines != null
      ? groupLines.join(' ')
      : speechResponse
      ? speechLines.join(' ')
      : responseKind === 'silence'
        ? `${speakerLabel} молчит.`
        : responseKind === 'leave_conversation'
          ? `${speakerLabel} прекращает разговор.`
          : semantic
            ? 'На ваш вопрос никто не ответил.'
      : disclosed
        ? `${speakerLabel} рассказал, что слышал удар и видел мокрого Ратшу с чужой сумкой.`
        : `${speakerLabel} уклонился от полного ответа о крушении.`,
    visible_changes: visibleChanges,
    sensory_details: [],
    visible_npc: contracts.actors.map((actor) => {
      const actorResponse = responseByActor.get(actor.instance_id);
      const projected = playerSafeNpc(actor,
        actorResponse == null
          ? actor.instance_id === speaker?.instance_id ? speakerStatus : null
          : actorResponse.status,
        input.retrieved_state?.current_visible_context);
      return actorResponse?.name
        ? { ...projected, display_label: actorResponse.name,
            recognition: 'recognized' }
        : projected;
    }),
    visible_objects: [],
    known_context: [
      ...(semantic ? [] : [conversation.journal_ref]),
      ...(disclosed ? [
        `${speakerLabel} указал существующий путь к сушильне.`,
        `Слова ${speakerLabel} и найденная синяя шерсть остаются независимыми сведениями.`
      ] : [])
    ],
    uncertainties: responseKind == null || !speakerIsEremey
      ? [] : disclosed
      ? ['Синяя шерсть ещё не сопоставлена с одеждой Ратши.']
      : [`${speakerLabel} мог сообщить не всё, что знает.`],
    allowed_tensions: [],
    do_not_imply: [
      'blue_wool_matches_ratsha_caftan',
      'ratsha_participated_blue_wool_route',
      'conclusion:principal_zhdanko'
    ]
  };
}

export function playerSafeNpc(actor, visibleStatus = null,
  visibleContext = null) {
  const visible = (visibleContext?.visible_npc ?? []).filter((npc) =>
    npc?.entity_ref?.entity_kind === 'npc'
      && npc.entity_ref.entity_id === actor?.instance_id
      && text(npc.display_label) && text(npc.recognition));
  const identity = visible.length === 1 ? visible[0] : {
    display_label: 'человек', recognition: 'unrecognized'
  };
  return {
    entity_ref: {
      entity_kind: 'npc', entity_id: actor.instance_id
    },
    display_label: identity.display_label,
    recognition: identity.recognition,
    ...(visibleStatus == null ? {} : { visible_status: visibleStatus })
  };
}

export function visibleGap(code) {
  return Object.assign(
    new Error('The semantic NPC utterance is not player-visible.'),
    { code }
  );
}

function perceivedNpcSpeech(semantic, contracts, visibleContext) {
  const primaryNpcRef = perceivedNpcSpeakerRef(semantic);
  const statements = (semantic?.statements ?? []).filter((statement) =>
    statement?.speaker_ref?.entity_kind === 'npc'
      && statement.speaker_ref.entity_kind === primaryNpcRef?.entity_kind
      && statement.speaker_ref.entity_id === primaryNpcRef.entity_id);
  if (statements.length === 0) throw visibleGap('TRACE_M2_PHASE_3_VISIBLE_GAP');
  return perceivedSpeechEntry(
    semantic, contracts, visibleContext, statements[0]
  );
}

function perceivedNpcGroupResponses(semantic, contracts, visibleContext) {
  const sourceRef = semantic?.decision_request?.perceived_message
    ?.source_statement_ref;
  if (sourceRef?.entity_kind !== 'conversation_statement') return null;
  const source = semantic.statements?.find(({ statement_id: statementId }) =>
    statementId === sourceRef.entity_id);
  const intended = (source?.intended_addressee_refs ?? []).filter(
    ({ entity_kind: kind }) => kind === 'npc');
  if (intended.length < 2) return null;
  if (new Set(intended.map(({ entity_id: id }) => id)).size !== intended.length) {
    throw visibleGap('TRACE_M2_PHASE_3_VISIBLE_GAP');
  }
  const requests = (semantic.decisions ?? []).map(({ request }) => request)
    .filter((request) => sameStatementRef(
      request?.perceived_message?.source_statement_ref, sourceRef));
  return intended.map((npcRef) => {
    const actor = contracts.actors.find(({ instance_id: id }) =>
      id === npcRef.entity_id);
    if (actor == null) {
      throw visibleGap('TRACE_M2_PHASE_3_VISIBLE_SPEAKER_GAP');
    }
    const label = playerSafeNpc(actor, null, visibleContext).display_label;
    const matchingRequests = requests.filter(({ npc_ref: ref }) =>
      ref?.entity_kind === npcRef.entity_kind
        && ref.entity_id === npcRef.entity_id);
    if (matchingRequests.length > 1) {
      throw visibleGap('TRACE_M2_PHASE_3_VISIBLE_GAP');
    }
    const request = matchingRequests[0];
    const projected = request == null ? null : (semantic.npc_outcomes ?? [])
      .filter(({ request_id: id }) => id === request.request_id).at(-1) ?? null;
    if (projected?.applied === true
        && projected.contribution_ref?.entity_kind
          === 'conversation_statement') {
      const statement = semantic.statements?.find(({ statement_id: id }) =>
        id === projected.contribution_ref.entity_id);
      if (statement == null) throw visibleGap('TRACE_M2_PHASE_3_VISIBLE_GAP');
      return perceivedSpeechEntry(
        semantic, contracts, visibleContext, statement
      );
    }
    if (projected?.applied === true
        && ['silence', 'leave_conversation'].includes(
          projected.outcome?.kind)) {
      return { actor, label, kind: projected.outcome.kind,
        status: projected.outcome.kind === 'silence'
          ? 'молчит после вашего обращения'
          : 'прекращает разговор с вами' };
    }
    return { actor, label, kind: 'unavailable', status: 'не ответил' };
  });
}

function perceivedSpeechEntry(semantic, contracts, visibleContext, statement) {
  const actor = contracts.actors.find(({ instance_id: instanceId }) =>
    instanceId === statement.speaker_ref.entity_id);
  if (actor == null) {
    throw visibleGap('TRACE_M2_PHASE_3_VISIBLE_SPEAKER_GAP');
  }
  const audience = semantic.audiences?.find(
    ({ statement_ref: statementRef }) => sameStatementRef(statementRef, {
      entity_kind: 'conversation_statement', entity_id: statement.statement_id
    }));
  const playerMessages = audience?.received_messages?.filter(
    ({ listener_ref: listener, comprehension, utterance_text: utterance }) =>
      listener?.entity_kind === 'player_character'
      && comprehension === 'full'
      && utterance === statement.utterance_text) ?? [];
  if (playerMessages.length !== 1) {
    throw visibleGap('TRACE_M2_PHASE_3_VISIBLE_GAP');
  }
  const name = playerSafeSelfIntroductionName(statement.utterance_text);
  return { actor, utterance: statement.utterance_text, name, kind: 'speech',
    status: 'говорит с вами', label: name
      ?? playerSafeNpc(actor, null, visibleContext).display_label };
}

function responseLine({ kind, label, utterance }) {
  if (kind === 'speech') {
    return `${label} говорит: «${utterance}»${/[.!?…]$/u.test(utterance)
      ? '' : '.'}`;
  }
  if (kind === 'silence') return `${label} промолчал.`;
  if (kind === 'leave_conversation') return `${label} прекратил разговор.`;
  return `${label} не ответил.`;
}

function sameStatementRef(left, right) {
  return left?.entity_kind === right?.entity_kind
    && left?.entity_id === right?.entity_id;
}

function perceivedNpcSpeakerRef(semantic) {
  return semantic?.resumed_npc_execution?.plan?.speaker_ref
    ?? semantic?.decision_request?.npc_ref;
}

function unique(values) {
  return [...new Set(values)];
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
