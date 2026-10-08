import { allTurnStepPlanMappings } from './lower-dvina-trace-turn-step-plan-mappings.js';

export function turnStepRepairSpecificInstructions(repairContext, request) {
  const codes = new Set(repairContext?.structural_errors
    ?.map(({ code }) => code) ?? []);
  const instructions = [];
  if (repairContext?.original_output?.direct_result_kind === 'player_utterance'
      || repairContext?.structural_errors?.some(({ path }) =>
        path === '$.utterance' || path?.startsWith('$.utterance.'))) instructions.push(
    'Для исправления речи без адресата используй полную структуру player_utterance: resolution direct, activity {"owner":"semantic","duration_class":"moment","effort":"none"}, direct_result_kind player_utterance, operation_family null, operation_choice null, operations [], check null, clarification null. В utterance должны быть ровно speaker_ref, равный текущему актору, utterance_text только с предполагаемыми произнесёнными словами и input_mode verbatim для точных переданных слов или intent_paraphrase для верной передачи невысказанного дословно намерения говорить. Речь не создаёт сущность и не выполняет физическую операцию. Для завершённого шага, состоящего только из речи, используй goal_result achieved и continuation null. Если остаётся любое независимое последующее действие, используй goal_result pending и continuation {"remaining_intent":"<точный непокрытый текст последующего действия>","depends_on_refs":[]}; произнесённые слова не покрывают последующее слушание, наблюдение, перемещение или манипуляцию.'
  );
  if (repairContext?.structural_errors?.some(({ path }) =>
    path === '$.utterance')) instructions.push(
    'Обязательное исправление речи: сохрани речевой шаг текущего актора и исправь только его utterance и непокрытое continuation. Для явно заданных игроком слов нужны verbatim и точная задуманная цитата; не копируй чужую речь. Для намерения говорить без точных слов используй intent_paraphrase с верными словами, не добавляя утверждений, обещаний или обязательств. Никогда не заменяй отклонённую речь поиском, жестом или молчаливым пропуском.'
  );
  if (codes.has('direct_result_kind')) instructions.push(
    'Обязательное исправление: ненулевой direct_result_kind используется только для успешного прямого результата без записи, у которого activity имеет semantic moment/none: player_safe_body_observation — для переданного тела актора; player_safe_item_observation — для переданных переносимых или надетых предметов; player_safe_observation — для других переданных player-safe фактов; player_utterance — для явной речи без адресата с utterance:{speaker_ref,utterance_text,input_mode}; no_state_gesture — для простого жеста. Verbatim копирует переданные слова; intent_paraphrase формулирует намерение говорить без точных слов. Никогда не классифицируй речь как жест. Для длительной semantic activity требуется direct_result_kind null.'
  );
  if (codes.has('continuation_progress')) instructions.push(
    `Исправление текущего шага: планируй только request.remaining_intent=${JSON.stringify(request.remaining_intent)}. root_player_action и completed_steps — история, а не исполняемый ввод. Не повторяй завершённый шаг в grounded_attempt или continuation. Исправленный шаг должен выполнить самое раннее событие из этого точного remaining_intent; continuation равен null, если это событие исчерпывает его, иначе он содержит только точный непокрытый остаток.`
  );
  if (codes.has('elapsed_time_grounding')) instructions.push(
    'Обязательное исправление привязки прошедшего времени: сохрани activity.requested_duration_minutes без изменений, но удали из interpretation.grounded_attempt все формулировки о прошедшей длительности. grounded_attempt называет только выполненное действие, поскольку точное прошедшее время показывает UI, управляемый кодом. Не меняй действие, число минут, результат, класс activity, continuation или adaptation.'
  );
  if (repairContext?.structural_errors?.some(({ path, code }) =>
    path === '$.utterance' && code === 'operation_semantic_grounding')) {
    instructions.push(
      'Предложенный utterance не прошёл семантическую привязку. Определи по request.remaining_intent, действительно ли игрок намерен говорить или подать голосовой сигнал. Если нет, отбрось utterance и используй подходящее семантическое сопоставление для неречевого действия, сохранив явно заданную длительность. Если да, верно исправь player_utterance. Напечатанное от первого лица описание действия не является речью.'
    );
  }
  if (repairContext?.structural_errors?.some(({ path, code }) =>
    path === '$.activity' && code === 'operation_semantic_grounding')) {
    instructions.push(
      'Предложенная прямая semantic activity не прошла привязку. Заново спланируй самое раннее действие через его фактического владельца. Discovery или materialization в completed_steps не означает, что полученный предмет взят или перемещён. Для сбора, взятия или перемещения переданного подходящего целого предмета используй один move_entity с этим точным стабильным item_ref и запрошенным размещением; никогда не создавай дубликат. Речь, просьба, ответ, оклик, крик или другой голосовой сигнал должны использовать player_utterance или переданный вариант взаимодействия; никогда не завершай их как обычную semantic activity. Сохрани каждое независимое последующее действие в continuation.'
    );
  }
  if (codes.has('operation_semantic_grounding')) instructions.push(
    'Обязательное исправление привязки операции: сначала проверь, не отвечают ли current_visible_context.sensory_details или значения visible_status у visible_npc прямо на каждый запрошенный видимый факт, включая явно отрицательный факт или текущее действие NPC. Если отвечают, отбрось discovery и верни achieved direct player_safe_observation с semantic moment/none, без operations, continuation и выдуманных подробностей. Иначе discovery только раскрывает или материализует; он не берёт, не перемещает, не преобразует, не обрабатывает и не использует найденный объект. Слова, скопированные в запрос discovery, не выполняют физическое действие. Сохрани в continuation каждое физическое действие, не выполненное другой текущей операцией, даже если его слова образуют текстовый префикс запроса.'
  );
  if (repairContext?.structural_errors?.some(({ code, rejected_operation: operation }) =>
    code === 'operation_semantic_grounding' && operation?.op === 'create_entity')) {
    instructions.push(
      'Отклонённый прямой create_entity не использовал переданную ambient_ordinary_capability. Если его source_ref — уже существующий переданный предмет, а игрок собирает, берёт или перемещает этот предмет целиком, замени создание одним move_entity с этим точным стабильным item_ref и запрошенным размещением; не дублируй, не разделяй, не переименовывай и не выдумывай механику. Сохрани каждое последующее действие в continuation. Для действительно нового преобразованного результата используй action_production, а не прямой create_entity.'
    );
  }
  if (codes.has('domain_owner_unavailable')) instructions.push(
    'У предложенной domain operation нет владельца, поэтому её нужно отбросить. Если current_visible_context.sensory_details или значения visible_status у visible_npc уже отвечают на запрос, верни achieved direct player_safe_observation с semantic moment/none, operations [], continuation null, clarification null и без assessment. Не выдумывай и не повторяй недоступный request_discovery.'
  );
  if (codes.has('source_semantic_grounding')) instructions.push(
    `Обязательное исправление источника: отбрось action_production и каждую устаревшую ссылку на источник. Верни один domain_request request_discovery с discovery_kind inspect, actor_ref текущего актора, одной ссылкой на текущую видимую область и запросом, называющим только отсутствующий обычный материал или физически связанную группу. Сохрани исходное действие целиком и дословно в continuation.remaining_intent=${JSON.stringify(request.remaining_intent)} с depends_on_refs:[]. Не выбирай фиксированный авторский discovery и не выполняй преобразование на этом шаге.`
  );
  if (codes.has('ordinary_discovery_query_identity')) instructions.push(
    `Обязательное исправление запроса ordinary discovery: исправь запрос и continuation вместе. Если discovery — необходимое условие для взятия, использования, обработки или преобразования обычного объекта, запрос называет только нужный объект, материал или физически связанную группу, а continuation в точности равен {"remaining_intent":${JSON.stringify(request.remaining_intent)},"depends_on_refs":[]}. Не выдумывай refs или результаты и не выполняй последующее действие. Иначе без потерь сохрани самостоятельный focused discovery: запрос равен полному request.remaining_intent без continuation либо его точному самому раннему фрагменту discovery, а continuation.remaining_intent — точному непокрытому остатку. Никогда не пересказывай, не пропускай и не переписывай ни одну из частей.`
  );
  if (repairContext?.structural_errors?.length === 1
      && repairContext.structural_errors[0].path === '$.resolution'
      && repairContext.structural_errors[0].code === 'operation_semantic_grounding') {
    const mapping = allTurnStepPlanMappings().ordinary_material_prerequisite;
    mapping.continuation.remaining_intent = request.remaining_intent;
    Object.assign(mapping, { operation_choice: null, operation_family: null,
      direct_result_kind: null, clarification: null });
    instructions.push(
    `Обязательное исправление literal denial: сначала проверь переданные предметы на наличие семантически подходящего используемого объекта. Если он уже существует, а намерение состоит во временном контакте или обращении без преобразования, используй transient_item_use с его стабильным item_ref; используй предмет на месте, если он виден сейчас и его размещение совпадает с текущей позицией; сохрани размещение и добавь move_entity только при явно запрошенном перемещении. Не повторяй discovery для того же известного предмета и не выдумывай его преобразование. Иначе для отсутствующего обычного объекта ОБЯЗАТЕЛЬНО используй ordinary_material_prerequisite с interpretation.adaptation literal, resolution domain_request, goal_result pending, activity owner domain. Выдай ровно один request_discovery с discovery_kind inspect, actor_ref текущего актора и одной ссылкой на текущую видимую область. query должен содержать только именное описание отсутствующего обычного объекта, материала или физически связанной группы; исключи получение, перемещение, обработку, использование, преобразование, цель и каждую формулировку действия. query не должен равняться request.remaining_intent или копировать его. Точно сохрани continuation как {"remaining_intent":${JSON.stringify(request.remaining_intent)},"depends_on_refs":[]}. Discovery не выполняет никакую часть этого физического намерения. Эта ошибка resolution делает неверной всю причинную структуру: замени исходные operations, activity, goal_result и continuation вместе, хотя путь ошибки указывает только на $.resolution. Не сохраняй отклонённый прямой отказ или его объяснение отсутствием операции. Отсутствие зарегистрированного обработчика последующего физического действия не препятствует поиску его обычного необходимого материала. Только для отсутствующего объекта верни это семантическое сопоставление, подставив его именной запрос и текущие refs из request: ${JSON.stringify(mapping)}`
    );
  }
  return instructions;
}
