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
  const semanticUtterance = speechResponse
    ? perceivedNpcUtterance(semantic, 'TRACE_M2_PHASE_3_VISIBLE_GAP')
    : null;
  const speakerName = playerSafeSelfIntroductionName(
    semanticUtterance, speaker?.identity_state);
  const speakerLabel = speakerName ?? (speaker == null ? 'человек'
    : playerSafeNpc(speaker, null,
      input.retrieved_state?.current_visible_context).display_label);
  const speechLine = speechResponse
    ? `${speakerLabel} говорит: «${semanticUtterance}»` : null;
  const visibleChanges = [responseKind === 'silence'
    ? `${speakerLabel} промолчал.`
    : responseKind === 'leave_conversation'
      ? `${speakerLabel} прекратил разговор.`
      : speechResponse
        ? `${speechLine}${/[.!?…]$/u.test(semanticUtterance) ? '' : '.'}`
        : disclosed
          ? `${speakerLabel} ответил и указал путь к сушильне.`
        : semantic != null
          ? 'Ответа не последовало.'
          : `Разговор с ${speakerLabel} продолжился.`];
  const speakerStatus = responseKind === 'silence'
    ? 'молчит после вашего обращения'
    : responseKind === 'leave_conversation'
      ? 'прекращает разговор с вами'
      : speechResponse ? 'говорит с вами' : null;
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: speechResponse
      ? speechLine
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
      const projected = playerSafeNpc(actor,
        actor.instance_id === speaker?.instance_id ? speakerStatus : null,
        input.retrieved_state?.current_visible_context);
      return actor.instance_id === speaker?.instance_id && speakerName
        ? { ...projected, display_label: speakerName,
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

function perceivedNpcUtterance(semantic, code) {
  const primaryNpcRef = perceivedNpcSpeakerRef(semantic);
  const statement = semantic?.statements?.find(
    ({ speaker_ref: speaker }) =>
      speaker?.entity_kind === primaryNpcRef?.entity_kind
      && speaker.entity_id === primaryNpcRef.entity_id
  );
  if (statement == null) throw visibleGap(code);
  const audience = semantic.audiences?.find(
    ({ statement_ref: statementRef }) =>
      statementRef?.entity_kind === 'conversation_statement'
      && statementRef.entity_id === statement.statement_id
  );
  const playerMessages = audience?.received_messages?.filter(
    ({ listener_ref: listener, comprehension, utterance_text: utterance }) =>
      listener?.entity_kind === 'player_character'
      && comprehension === 'full'
      && utterance === statement.utterance_text
  ) ?? [];
  if (playerMessages.length !== 1) throw visibleGap(code);
  return statement.utterance_text;
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
