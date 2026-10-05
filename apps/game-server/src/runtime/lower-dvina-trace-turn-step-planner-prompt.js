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
  return `Сопоставление для активного разговора: ${JSON.stringify({ resolution: 'domain_request', operation_choice: interaction.choice_id })} — обязательный выбор, когда самая ранняя граница ответственности в текущем намерении — речь или просьба, адресованная активному собеседнику. Сюда входит просьба к этому человеку разрешить, воспрепятствовать или помочь с физическим вмешательством, для которого не передана физическая доменная операция; владелец взаимодействия определяет ответ, но не подтверждает само вмешательство. Обращённая речь или просьба сама завершается этим взаимодействием: желаемый ответ или реакция — результат, за который отвечает владелец взаимодействия, а не continuation. Если дальше нет независимого действия игрока, используй goal_result achieved и continuation null; используй pending только если это дальнейшее действие сохранено в continuation. Вопрос остаётся разговором, даже если в нём спрашивают, где или как найти место, предмет или сведения; тема ответа не превращает его в request_discovery. Напротив, для независимого намерения игрока лично осмотреть, поискать, послушать, вспомнить или копнуть глубже используй соответствующий переданный request_discovery.`;
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
    return [`Маршрут разговора с видимым персонажем ${JSON.stringify(label)}: выбери ровно один подходящий переданный вариант из ${JSON.stringify(matches.map(({ choice_id: operation_choice, operation }) => ({ interaction_kind: operation.interaction_kind, operation_choice })))}. В player_safe_grounding каждого варианта эта метка и наблюдаемые признаки персонажа указаны рядом с непрозрачной ссылкой на цель; используй эти признаки, чтобы распознать адресата по обычному описанию. Для утверждения используй speech, для просьбы ответить, действовать, разрешить, воспрепятствовать или помочь — request, для предложения обмена — offer. Переданное содержимое операции обозначает доступную возможность, а не произнесённые слова и не ограничение формулировки; исходный текст игрока остаётся репликой и семантическим вводом. Мимолётный взгляд на уже видимого персонажа перед обращением к нему относится к контексту: ОБЯЗАТЕЛЬНО выбери этот разговор до visible_general_look, в том числе если игрок говорит «сначала» или «затем»; настоящее более раннее действие — поиск, манипуляция, перемещение или другое действие со своим переданным владельцем — всё ещё выполняется первым. Физическое вмешательство без соответствующего переданного владельца не становится прямым отказом лишь потому, что физическая операция не передана, если текст также обращён к видимому персонажу и его ответ — следующая граница ответственности. Предложение выполнить такое вмешательство, за которым следует прямое обращение, повеление или просьба помочь, образует одну границу взаимодействия, а не сначала завершённую физическую попытку с необязательной речью. Не считай обращённую просьбу отдельным действием: выбери подходящее взаимодействие и передай владельцу решение об ответе. Роль или имя, подтверждённые текущим видимым контекстом либо зафиксированной историей разговора, могут указывать на этого персонажа, даже если слова игрока отличаются от display_label; такое обоснованное обращение имеет приоритет над другим active_interlocutor. Если visible_scene вводит одного безымянного человека через положение или родственную связь, а игрок повторяет это описание, сопоставь его с соответствующей общей меткой видимого персонажа, а не с отдельно названным человеком, который тоже присутствует. Не используй эти варианты для другого NPC и не выдумывай завершённый физический результат.`];
  });
}

export function preparedFollowupPrompt(candidates) {
  return [
    'prepared_followup_candidates — закрытое сопоставление, заданное кодом:',
    JSON.stringify(candidates),
    'Выбирай вариант, только если текущая операция плана совпадает с его precursor_operation, а его operation по смыслу покрывает всё continuation.remaining_intent, включая каждую последующую часть предложения или фразу; если остаётся непокрытое намерение, prepared_followup_ref равен null.',
    'Выбрав вариант, точно скопируй его prepared_followup_ref вместе с remaining_intent и depends_on_refs в полный объект continuation:',
    JSON.stringify(candidates.map(({ prepared_followup_ref }) => ({
      remaining_intent: '<скопируй следующее непокрытое намерение>',
      depends_on_refs: ['<скопируй только необходимые player-safe refs>'],
      prepared_followup_ref
    }))),
    'Эта метка сохраняет только этот точный вариант для последующего допуска с учётом текущего состояния; она ни резервирует его, ни выполняет. Никогда не выдумывай метку.'
  ].join(' ');
}
