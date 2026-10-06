import { AsyncLocalStorage } from 'node:async_hooks';
import { createNarrationService } from '@rus/narration';
import { omitWorldKnowledgeContextText } from '@rus/turn';
import { serverError } from '../errors.js';
import { assembleNarrationAuditOutput, narrationAuditInstruction } from
  './lower-dvina-trace-narration-audit.js';
import { worldKnowledgeFactualClosure } from './world-knowledge-grounding.js';
import { isMovementVisibleObject } from './spatial-v3-movement-objects.js';

const PROSE_RULES = `Пиши связную, сдержанную литературную прозу на русском языке, обращаясь ко второму лицу. Сначала передай текущий эпизод. Передай каждый источник required_current_beat ровно один раз и сохрани все содержащиеся в нём положения: действие, результат, неопределённость, говорящего и причинный порядок. Порядок действий ограничивают только источники о совершённых действиях. Сохраняй их относительный порядок, заданный во входных данных. Подчинять более раннее действие более позднему можно только тогда, когда вид глагола или явный маркер недвусмысленно показывает, что раннее действие завершилось до позднего. Не допускай обратного порядка, одновременного выполнения или продолжающегося действия внутри более позднего действия; действия не обязательно описывать отдельными предложениями. Каждое положение о неразрешённом результате внутри обязательного изменения должно оставаться явно неизвестным; совершённое действие с предметом остаётся совершённым, даже если результат наблюдения неизвестен. Незавершённая цель не отменяет зафиксированную операцию. Передавай подтверждённую речь дословно. Показывай невыполненное продолжение как открытый следующий выбор игрока во втором лице, никогда не как уже совершённое действие или действие NPC. Явно укажи, что оно ещё не выполнено и результата пока нет. Используй будущее время или формулировку возможности; не представляй продолжение как действие в настоящем или прошедшем времени, продолжающуюся попытку или выполненную просьбу. Одного указания на намерение недостаточно: проза должна явно сообщать и что действие ещё не произошло, и что его результат пока неизвестен. Выборочно используй дополнительные опорные сведения, чтобы построить эпизод; не пересказывай неизменившиеся сведения о сцене, инвентаре, теле или NPC. Длительность хода — UI-метаданные, которыми управляет код; они не передаются прозе. Не выдумывай прошедшие минуты и не сообщай, сколько времени заняло действие. Дополнительные опорные сведения — набор возможных опор, а не перечень, который нужно весь охватить. После текущего эпизода перечисление неизменившихся, независимых фактов сцены как панорамы или контекста считается static_context_dump, даже если текст связный, факты переставлены, сгруппированы по расположению или помещены после эпизода. Оставляй опорную подробность только тогда, когда она указывает место, создаёт контраст, ограничивает или составляет часть описываемого действия либо результата. Эпизод восприятия может объединять переданные подробности, если они сами являются его результатом восприятия; это не разрешает посторонний пересказ снимка сцены. Описательные факты о сцене можно перенести из порядка источников к соответствующему действию или результату. Сгруппируй их в пространственно связный образ по общим переданным субъектам или пространственным ориентирам, затем выбери единый связный фокус. Если текущее действие осмотра или восприятия сопровождается описательными наблюдениями, оформи это действие придаточной конструкцией или личной формой глагола восприятия, грамматически связывающей с ним хотя бы одну компактную группу фактов. Связывай факты только по переданному общему объекту, пространственному ориентиру или отношению до/после. Не ставь после действия двоеточие с последующим фактическим перечнем. Это правило действует и для плотного, и для неплотного текущего эпизода: отдельное предложение с действием, за которым следует описательный перечень, не ставит действие в центр сцены. Остальные обязательные факты передавай краткими эпизодами последствий или неопределённости. Не выдумывай восприятие или причинность для других классов действий. Сам по себе порядок источников не является ошибкой. Перечень фактов в порядке источников остаётся слабым только тогда, когда он последовательно перечисляет их без общего фокусного эпизода; обоснованная качественная оценка текущего состояния может стать таким фокусным результатом, если связанные факты сцены её обрамляют или предваряют. Если текущий эпизод — оценка, связывай с ней только непосредственно подтверждающие её факты сцены; не добавляй вслед за ней перечень сцены. visible_scene может указать место действия, но не служит источником наблюдаемого объекта или цели действия. Не выдумывай причинную, временную или пространственную связь только ради соединения фактов. При скудных данных пиши кратко, не выдумывая связующие факты и не составляя служебный отчёт.`.replace(/\s+/gu, ' ').trim();

const DENSE_COMPOSITION_RULE = `При плотном эпизоде осмотра или восприятия с несколькими переданными наблюдениями группируй наблюдения только по явно указанному общему объекту, месту или отношению до/после. Не описывай сначала отдельное завершённое действие, а затем статичные предложения с наблюдениями: завершающее самостоятельное действие не управляет последующими самостоятельными сказуемыми. Связывай каждую переданную группу с этим действием в том же предложении либо описывай её отдельной личной формой глагола восприятия или действия игрока. Придаточная деепричастная конструкция или относительное придаточное могут обеспечить такое подчинение, если они недвусмысленно связывают наблюдение с завершённым осмотром игрока; не используй сочинение или относительное определение только для того, чтобы повторно связать наблюдение с ближайшим существительным либо заставить последующее статичное сказуемое унаследовать грамматическую связь. При необходимости повторяй переданный ориентир и личную форму глагола. Выражай каждую следующую группу как отдельный, привязанный к своему ориентиру эпизод восприятия или последствий; не оставляй группу в виде голого описания состояния. Не объединяй разные ориентиры в одну сочинительную цепочку или цепочку с точками с запятой. Переданную неопределённость выражай обычным открытым вопросом, обращённым к игроку; не описывай её как правило о том, что доказывают или устанавливают наблюдения. Кратко и обоснованно опиши переданный, уже полученный и зафиксированный результат и последствие для тела. Один раз передай каждое положение, ориентир и степень достоверности; не добавляй связующих фактов, причин, ощущений или результатов.`.replace(/\s+/gu, ' ').trim();

const GROUNDING_RULES = `Используй только переданные факты, безопасные для игрока, и сохраняй степень достоверности. current_light_phase — зафиксированная календарная фаза дневного света, а не наблюдаемое освещение в конкретном месте. Она никогда не подтверждает утверждения о темноте, тусклом или ярком свете, тенях, видимости или освещённости текущего места, если это не подтверждено точным видимым сенсорным фактом. Правдоподобие не является доказательством. Переданный источник, безопасный для игрока, подтверждает ровно содержащиеся в нём атомарные фактические положения, включая явно указанное отношение, движение, причину, уточнение и степень достоверности. Верная проза может использовать обычные грамматические изменения формы или естественный пересказ только при условии, что они не добавляют атомарных положений. Метки, идентификаторы, категории, имена и правдоподобные следствия не подтверждают сенсорные свойства, причинность, время, результат, выполнение действия или степень достоверности. Обосновывай каждое ощущение, действие, временное отношение и причинную связь. Пустые необязательные массивы означают пропуск сведений, а не их отсутствие или тишину. Метка сообщает личность, но не свойства; метка сцены сообщает место, но не атмосферу. Второе лицо относится только к игроку; названный или обозначенный NPC в обязательном изменении остаётся NPC третьего лица. Сохраняй каждое относящееся к NPC указание рядом с соответствующей сущностью. Размещение предмета подтверждает только его размещение; движение действующего лица требует confirmed_outcome.movement_committed=true. Отсутствующие или ложные поля результата — безмолвные ограничения. action_intent сообщает только о намерении и никогда не доказывает выполнение, слышимость, ответ, успех или факт мира. Зафиксированная преходящая попытка подтверждает только совершённое действие с предметом; не добавляй успех, неудачу, результат или неопределённость, если они не переданы. Не добавляй скрытые факты, диагнозы, неподтверждённые сенсорные подробности, реакции или причинные связи.`.replace(/\s+/gu, ' ').trim();

const WRITER_SHAPE = 'Возвращай только объект JSON вида {"prose":"<полный русский текст прозы>"}. Сервер сам добавляет version, schema, output_id, action_options=[], used_references=[] и нейтральный self_check={}; не создавай эти поля.';

/** Per-run pack: ground once on writer; reuse for repair/auditor (F1). */
const narrationWkStore = new AsyncLocalStorage();

export function createLowerDvinaTraceNarrationService({ roleRunner,
  worldKnowledgeGrounder = null, telemetry = null } = {}) {
  if (typeof roleRunner?.run !== 'function') throw serverError(
    'TRACE_PHASE_2_DEPENDENCY_MISSING', 'Configured LLM role runner is required.', { status: 503 });
  const runRole = (roleId, instruction) => async (request) =>
    runNarrationRole(roleRunner, roleId, instruction, request,
      worldKnowledgeGrounder, telemetry);
  const ports = {
    writer: { generate: runRole('gameplay_narrator',
      `${WRITER_SHAPE} ${PROSE_RULES} ${GROUNDING_RULES} ${DENSE_COMPOSITION_RULE}`) },
    formatRepairer: { repair: runRole('gameplay_narrator_format_repair',
      `${WRITER_SHAPE} Исправь некорректную структуру JSON по сообщению о проверке, сохранив подтверждённый смысл. ${PROSE_RULES} ${GROUNDING_RULES} ${DENSE_COMPOSITION_RULE}`) },
    auditor: { audit: runRole('gameplay_narrator_auditor',
      null) },
    semanticRepairer: { repair: runRole('gameplay_narrator_semantic_repair',
      `Возвращай только {"replacements":[{"prose":"<полный исправленный русский текст прозы>"}]} ровно с одной заменой. Вход содержит подготовленные сведения об обязательных фактах, отклонённый текст и содержательные замечания аудитора. Перестрой весь отрывок с учётом замечаний, а не исправляй отдельные предложения; замечания не исчерпывают возможных дефектов. Замена должна отличаться от отклонённой прозы. Повторно примени каждое правило ко всей замене, удали неподтверждённые утверждения и восстанови каждый пропущенный обязательный смысл без повторов. Используй только переданные факты, безопасные для игрока. current_light_phase — календарная фаза дневного света, она не подтверждает тусклый или яркий свет, темноту, тени или видимость в конкретном месте; удали такие утверждения, если их не подтверждает точный сенсорный факт. Один раз точно сохрани каждое обязательное положение и степень достоверности, подтверждённую речь дословно вместе с говорящим NPC, порядок совершённых действий, неопределённость неразрешённого результата и каждую сенсорную модальность. Второе лицо относится только к игроку. Завершённые действия должны остаться завершёнными; подчинение с отношением «раньше» допустимо, но одновременное выполнение или продолжающееся действие внутри другого действия — нет. Невыполненное продолжение остаётся открытым выбором игрока; явно укажи, что оно ещё не произошло и его результат неизвестен. Если в текущем эпизоде осмотра или восприятия переданы наблюдения, независимо от их плотности, оформи действие придаточной конструкцией или личной формой глагола восприятия, грамматически связывающей с ним хотя бы одну компактную группу фактов, объединённую переданным общим объектом, пространственным ориентиром или отношением до/после. Не используй действие с последующим двоеточием и фактическим перечнем; фокусный глагол должен управлять хотя бы одной группой, связанной по переданным фактам. Дополнительная опора — набор возможных опор, а не цель охвата. Для static_context_dump убери неизменившуюся самостоятельную панораму и оставь только опоры, составляющие текущий эпизод; связная пространственная перегруппировка того же снимка не является исправлением. Группируй оставленные наблюдения только по переданным общим субъектам и пространственным ориентирам. visible_scene может указывать место отрывка, но не предоставляет наблюдаемый объект или цель действия. Для elapsed_as_service_report убери формулировки о прошедшем времени; длительность хода относится только к UI. Метка или ID сообщают личность, но не свойство, действие, результат, время, причину или ощущение. Преходящая попытка подтверждает только совершённое действие с предметом, если результат также не передан. При скудных опорах сокращай текст, а не украшай его. Не добавляй скрытый факт, диагноз, неподтверждённую связь, причину, реакцию, ощущение, действие, результат или степень достоверности. Если подтверждённого смысла не осталось, верни пустую прозу. Сервер связывает единственную замену со всем отклонённым текстом. ФИНАЛЬНАЯ ПРОВЕРКА ИСПРАВЛЕНИЯ: исправление слабой композиции не может быть копией, заменой синонимов, изменением пунктуации, порядка придаточных или перестановкой самостоятельных предложений. Сверь каждое грамматическое подлежащее и пространственное отношение с подготовленными обязательными фактами; если при сокращении связь переместится к другому объекту или месту, используй отдельную конструкцию восприятия игрока. ${DENSE_COMPOSITION_RULE}`) }
  };
  const service = createNarrationService(ports);
  return Object.freeze({
    // F1/F3/F7/N7: authoritative only via options/ALS, never request body.
    run(request, options = {}) {
      const authoritative = options.worldKnowledgeAuthoritative ?? null;
      const {
        world_knowledge_authoritative: _auth,
        ...cleanRequest
      } = request ?? {};
      const requestForNarration = promoteArrivalFacts(cleanRequest);
      return narrationWkStore.run({ authoritative, pack: null }, () =>
        service.run(requestForNarration, options));
    }
  });
}

function promoteArrivalFacts(request) {
  const visible = request?.visible_context;
  const outcome = request?.context?.outcome ?? request?.confirmed_outcome;
  if (outcome?.movement_committed !== true || !visible || typeof visible !== 'object') return request;
  const changes = Array.isArray(visible.visible_changes) ? [...visible.visible_changes] : [];
  const movementFacts = (Array.isArray(visible.sensory_details) ? visible.sensory_details : [])
    .filter((fact) => typeof fact === 'string'
    && fact.trim() && !changes.some((change) => typeof change === 'string' && change.includes(fact)));
  if (!movementFacts.length && changes.length) return request;
  if (changes.length) {
    changes[changes.length - 1] = `${changes.at(-1)} ${movementFacts.join(' ')}`;
  } else {
    changes.push(['Переход выполнен.', movementFacts.join(' ')].filter(Boolean).join(' '));
  }
  return { ...request, visible_context: { ...visible, visible_changes: changes } };
}

/** Strip service-only fields from nested writer clone (F3). Keep WK prompt-data (F2). */
export function narrationWire(request) {
  const { request: original, world_knowledge_authoritative: _wkAuth,
    party_id: _partyId, world_knowledge: outerWk, ...outer } = request ?? {};
  const cleanedOriginal = original == null ? null : stripNarrationServiceFields(original);
  const { visible_context, style_policy = {}, context, action_intent_context,
    confirmed_outcome: confirmedOutcome,
    world_knowledge: nestedWk,
    ...rest } = cleanedOriginal ? { ...cleanedOriginal, ...outer } : outer;
  const { no_new_world_facts: _noNewWorldFacts, ...promptStylePolicy } = style_policy;
  const worldKnowledge = outerWk ?? nestedWk;
  const { visible_changes, uncertainties, do_not_imply, allowed_tensions,
    current_light_phase, ...support } = visible_context;
  // Passages are route-panel choices, not scene objects: their labels must not reach the prose.
  if (Array.isArray(support.visible_objects)) {
    support.visible_objects = support.visible_objects.filter((row) => !isMovementVisibleObject(row));
  }
  const { outcome: contextOutcome, ...otherContext } = context ?? {};
  const outcome = contextOutcome ?? confirmedOutcome;
  const projectedOutcome = projectNarrationOutcome(outcome);
  const optionalSupport = visible_changes.length || uncertainties.length
    ? { ...(support.visible_scene == null ? {} : { visible_scene: support.visible_scene }) }
    : support;
  return {
    ...rest,
    required_current_beat: {
      changes: visible_changes.map((text, index) => ({ ref: `visible_change_${index + 1}`, text })),
      uncertainties: uncertainties.map((text, index) => ({
        ref: `uncertainty_${index + 1}`, text, status: 'unperformed_result_unknown'
      }))
    },
    ...(current_light_phase == null ? {} : { current_light_phase }),
    optional_support: optionalSupport,
    constraints: { do_not_imply, allowed_tensions, style_policy: promptStylePolicy },
    ...(projectedOutcome === undefined ? {} : { confirmed_outcome: projectedOutcome }),
    ...(action_intent_context === undefined ? {} : { action_intent: action_intent_context }),
    ...(Object.keys(otherContext).length ? { context: otherContext } : {}),
    // §73: party facts above; optional WK prompt-data after them (F2).
    ...(worldKnowledge == null ? {} : { world_knowledge: worldKnowledge })
  };
}

function projectNarrationOutcome(outcome) {
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) return outcome;
  const { check_outcomes, ...rest } = outcome;
  if (!Array.isArray(check_outcomes)) return rest;
  return { ...rest, check_outcomes: check_outcomes.map((check) => {
    if (!check || typeof check !== 'object' || Array.isArray(check)) return check;
    return Object.fromEntries(['action', 'band', 'margin']
      .filter((key) => Object.hasOwn(check, key)).map((key) => [key, check[key]]));
  }) };
}

function stripNarrationServiceFields(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return value;
  const { world_knowledge_authoritative: _a, party_id: _p, ...rest } = value;
  return rest;
}

async function runNarrationRole(roleRunner, roleId, instruction, request,
  worldKnowledgeGrounder = null, telemetry = null) {
  const store = narrationWkStore.getStore();
  const grounded = await resolveNarrationGrounded(roleId, request, store,
    worldKnowledgeGrounder, telemetry);
  const modelRequest = omitWorldKnowledgeContextText(grounded);
  const projection = projectNarrationRoleInput(roleId, modelRequest);
  const systemInstruction = roleId === 'gameplay_narrator_auditor'
    ? [narrationAuditInstruction(projection.promptRequest, projection),
      ...worldKnowledgeFactualClosure(grounded)].join(' ')
    : [instruction, ...worldKnowledgeFactualClosure(grounded)].join(' ');
  const response = await roleRunner.run({ scope: 'turn_runtime', role_id: roleId,
    request_identity: request.request_id ?? request.request?.request_id
      ?? request.output?.output_id,
    ...(request.phase == null ? {} : { request_phase: request.phase }),
    messages: [{ role: 'system', content: systemInstruction },
      { role: 'user', content: projection.content }],
    overrides: { temperature: roleId === 'gameplay_narrator_semantic_repair' ? 0.2 : 0 } });
  if (!response?.output || typeof response.output !== 'object') throw serverError(
    'TRACE_PHASE_2_DEPENDENCY_MISSING',
    `Narration role ${roleId} returned no JSON object.`, { status: 503 });
  const output = roleId === 'gameplay_narrator_auditor'
    ? restoreNarrationAuditBindings(response.output, projection) : response.output;
  return assembleNarrationRoleOutput(roleId, output, request);
}

/** Give each narration role only its task view; canonical bindings stay server-side. */
function projectNarrationRoleInput(roleId, request) {
  if (roleId === 'gameplay_narrator') {
    return { content: prepareNarrationFacts(narrationWire(request)) };
  }
  if (roleId === 'gameplay_narrator_format_repair') {
    const facts = prepareNarrationFacts(narrationWire(request?.request ?? {}));
    const rejectedProse = request?.invalid_output?.prose;
    const proseText = typeof rejectedProse === 'string'
      ? rejectedProse : 'Поле текста прозы имеет неверный тип.';
    return { content: [facts, 'Проверка формата: поле прозы должно быть текстом.',
      'Отклонённый текст:', proseText].filter(Boolean).join('\n\n') };
  }
  if (roleId === 'gameplay_narrator_semantic_repair') {
    const facts = prepareNarrationFacts(narrationWire(request));
    const prose = Array.isArray(request?.source_segments)
      ? request.source_segments.map((segment) => segment.prose).filter(Boolean).join('\n') : '';
    const concerns = Array.isArray(request?.concerns)
      ? request.concerns.map(projectNarrationConcern).filter(Boolean).join('\n') : '';
    return { content: [facts, 'Отклонённый текст:', prose,
      'Замечания аудитора:', concerns].filter(Boolean).join('\n\n') };
  }

  const projectedRequest = structuredClone(request);
  const sourceBindings = new Map();
  const segmentBindings = new Map();
  projectedRequest.segments = (request.segments ?? []).map((segment, index) => {
    const key = `p${index + 1}`;
    segmentBindings.set(key, segment.segment_id);
    return { segment_id: key, prose: segment.prose };
  });
  projectedRequest.visible_context = {
    visible_changes: (request.visible_context?.visible_changes ?? []).map((text, index) => {
      const key = `c${index + 1}`;
      sourceBindings.set(key, `visible_change_${index + 1}`);
      return text;
    }),
    uncertainties: (request.visible_context?.uncertainties ?? []).map((text, index) => {
      const key = `u${index + 1}`;
      sourceBindings.set(key, `uncertainty_${index + 1}`);
      return text;
    }),
    ...Object.fromEntries(Object.entries(request.visible_context ?? {})
      .filter(([key]) => !['visible_changes', 'uncertainties', 'version', 'schema'].includes(key)))
  };
  const wire = omitProjectionMetadata(narrationWire(projectedRequest));
  const projectedWire = Object.fromEntries(['segments', 'required_current_beat',
    'optional_support', 'current_light_phase', 'constraints', 'confirmed_outcome',
    'action_intent', 'context', 'world_knowledge']
    .filter((key) => Object.hasOwn(wire, key)).map((key) => [key, wire[key]]));
  projectedWire.segments = projectedRequest.segments;
  if (typeof projectedRequest.output?.prose === 'string') {
    projectedWire.output = { prose: projectedRequest.output.prose };
  }
  if (projectedWire.world_knowledge) {
    const knowledgeText = renderProjectedValue(
      projectWorldKnowledge(projectedWire.world_knowledge));
    if (knowledgeText) projectedWire.world_knowledge = knowledgeText;
    else delete projectedWire.world_knowledge;
  }
  (projectedWire.required_current_beat?.changes ?? []).forEach((source, index) => {
    source.ref = `c${index + 1}`;
  });
  (projectedWire.required_current_beat?.uncertainties ?? []).forEach((source, index) => {
    source.ref = `u${index + 1}`;
    source.status = 'Действие ещё не выполнено; результат пока неизвестен.';
  });
  return { content: JSON.stringify(projectedWire), sourceBindings, segmentBindings,
    promptRequest: projectedRequest,
    sourceKeys: [...sourceBindings.keys()], segmentKeys: [...segmentBindings.keys()] };
}

function projectNarrationConcern(concern = {}) {
  const labels = {
    missing_visible_change: 'Не полностью передано обязательное положение.',
    unsupported_attempt: 'В прозе неподтверждённо описана попытка.',
    unsupported_success: 'В прозе неподтверждённо описан успех.',
    unsupported_object_use: 'В прозе неподтверждённо описано использование предмета.',
    unsupported_result: 'В прозе неподтверждён результат.',
    unsupported_sensory: 'В прозе есть неподтверждённое чувственное утверждение.',
    unsupported_event: 'В прозе описано неподтверждённое событие.',
    unsupported_world_state: 'В прозе описано неподтверждённое состояние мира.',
    unsupported_npc_state: 'В прозе описано неподтверждённое действие или состояние персонажа.',
    unsupported_fact: 'В прозе есть неподтверждённое утверждение.',
    literary_quality: 'Нужно улучшить связность прозы.',
    technical_presentation: 'Нужно убрать служебную подачу.'
  };
  const label = labels[concern.kind] ?? '';
  return label;
}

function restoreNarrationAuditBindings(output, projection) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return output;
  const mapSegment = (key) => projection.segmentBindings.get(key);
  const mapSource = (key) => projection.sourceBindings.get(key);
  return {
    ...output,
    reviewed_segments: Array.isArray(output.reviewed_segments)
      ? output.reviewed_segments.map(mapSegment) : output.reviewed_segments,
    source_reviews: Array.isArray(output.source_reviews)
      ? output.source_reviews.map((row) => ({ ...row, ref: mapSource(row?.ref),
        segment_choices: Array.isArray(row?.segment_choices)
          ? row.segment_choices.map(mapSegment) : row?.segment_choices }))
      : output.source_reviews,
    unsupported: Array.isArray(output.unsupported)
      ? output.unsupported.map((row) => ({ ...row,
        segment_choice: mapSegment(row?.segment_choice) })) : output.unsupported,
    literary_failures: Array.isArray(output.literary_failures)
      ? output.literary_failures.map((row) => ({ ...row,
        segment_choice: mapSegment(row?.segment_choice) })) : output.literary_failures
  };
}

function prepareNarrationFacts(wire) {
  const required = wire.required_current_beat ?? {};
  const support = omitProjectionMetadata(wire.optional_support ?? {});
  const sections = [];
  for (const [title, values] of [
    ['Обязательные положения текущего эпизода', [
      ...(required.changes ?? []).map(({ text }) => text),
      ...(required.uncertainties ?? []).map(({ text }) => text)
    ]],
    ['Переданные сведения об обстановке', support],
    ['Подтверждённый результат', wire.confirmed_outcome],
    ['Контекст намерения', wire.action_intent],
    ['Дополнительный контекст', wire.context],
    ['Фаза дневного света', wire.current_light_phase],
    ['Правила подачи', Object.fromEntries(Object.entries(
      wire.constraints?.style_policy ?? {}).filter(([key]) => key !== 'no_new_world_facts'))],
    ['Сведения о мире', projectWorldKnowledge(wire.world_knowledge)]
  ]) {
    const rendered = renderProjectedValue(values);
    if (rendered) sections.push(`${title}:\n${rendered}`);
  }
  return sections.join('\n\n');
}

const RUSSIAN_FIELD_LABELS = {
  visible_scene: 'обстановка', sensory_details: 'наблюдения', visible_npc: 'люди',
  player_input: 'Ввод игрока', raw_input: 'текст', raw_text: 'текст',
  visible_objects: 'предметы', known_context: 'известные сведения',
  qualitative_assessment: 'оценка', movement_committed: 'переход выполнен',
  changes: 'события', uncertainties: 'неопределённость', text: 'содержание',
  name: 'имя', display_label: 'имя', visible_status: 'наблюдаемое состояние',
  typicality: 'обычность',
  recognition: 'узнавание', description: 'описание', relation: 'отношение',
  location: 'место', before: 'раньше', after: 'позже', speaker: 'говорящий',
  speech: 'речь', outcome: 'результат', action: 'действие', result: 'результат',
  check_outcomes: 'результаты проверок', band: 'степень результата',
  margin: 'разница результата',
  certainty: 'достоверность', status: 'состояние', source: 'источник',
  style_policy: 'стиль', tone: 'тон', no_new_world_facts: 'не добавлять факты мира',
  current_light_phase: 'фаза дневного света', season: 'сезон', weather: 'погода',
  sounds: 'звуки', smells: 'запахи', vegetation: 'растительность',
  actor_facets: 'сведения о персонажах', historical_events: 'сведения о прошлом',
  runtime_text: 'содержание', facts: 'факты', hard_constraints: 'установленные пределы',
  disputes: 'разногласия', gaps: 'неустановленные сведения', claims: 'утверждения',
  notice: 'пояснение', qualifiers: 'уточнения',
  directness: 'характер утверждения', quantifier: 'объём утверждения',
  confidence: 'достоверность', conditions: 'условия', speech_text: 'содержание речи',
  notice: 'пояснение'
};

function projectWorldKnowledge(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  if (value.sufficiency === 'NO_KNOWLEDGE_REQUIRED') return null;
  return Object.fromEntries(['facts', 'hard_constraints', 'disputes', 'gaps']
    .filter((key) => Array.isArray(value[key]) && value[key].length > 0)
    .map((key) => [key, value[key].map((entry) => projectWorldKnowledgeEntry(entry, key))
      .filter(Boolean)]));
}

function projectWorldKnowledgeEntry(entry, category) {
  if (category === 'gaps') {
    const status = {
      unresolved: 'Запрос не дал достаточных сведений.',
      out_of_scope: 'Нужные сведения вне охвата собранных материалов.',
      not_covered: 'Нужные сведения не покрыты собранными материалами.',
      conflict_group_exceeds_candidate_budget:
        'Разногласие не удалось полностью проверить в пределах поиска.'
    }[entry?.status] ?? 'Нужные сведения не установлены.';
    return { notice: status };
  }
  if (category === 'disputes' && Array.isArray(entry?.claims)) {
    const claims = entry.claims.map((claim) => projectWorldKnowledgeEntry(claim, 'facts'))
      .filter(Boolean);
    return claims.length ? { claims } : null;
  }
  if (typeof entry === 'string') return { runtime_text: entry };
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const runtimeText = entry.runtime_text ?? entry.text;
  if (typeof runtimeText !== 'string' || !runtimeText.trim()) return null;
  const qualifiers = entry.qualifiers && typeof entry.qualifiers === 'object'
    && !Array.isArray(entry.qualifiers) ? entry.qualifiers : undefined;
  return { runtime_text: runtimeText, ...(qualifiers ? { qualifiers } : {}) };
}

const PROJECTED_ENUMS = {
  band: { clean_success: 'чистый успех', success: 'успех',
    success_with_cost: 'успех с ценой', failure_with_consequence: 'неудача с последствием',
    severe_failure: 'тяжёлая неудача' },
  directness: { direct: 'прямое утверждение', inferred: 'вывод из источника',
    analogical: 'вывод по аналогии', editorial: 'редакторское изложение',
    unknown: 'неизвестно' },
  typicality: { common: 'обычное', attested: 'засвидетельствованное',
    uncommon: 'необычное', exceptional: 'исключительное', unknown: 'неизвестное' },
  quantifier: { some: 'некоторые', all: 'все', most: 'большинство',
    none: 'ни одного', unknown: 'неизвестно' },
  confidence: { low: 'низкая', medium: 'средняя', high: 'высокая',
    unknown: 'неизвестна' },
  recognition: { known: 'узнан', unknown: 'не узнан' }
};

function renderProjectedValue(value, parentKey = '') {
  if (value == null || value === '') return '';
  if (value === false) return 'нет';
  if (typeof value === 'string') {
    return PROJECTED_ENUMS[parentKey]?.[value] ?? value;
  }
  if (typeof value === 'number' || value === true) {
    return String(value);
  }
  if (Array.isArray(value)) return value.map((child) =>
    renderProjectedValue(child, parentKey)).filter(Boolean).join('\n');
  if (typeof value !== 'object') return '';
  return Object.entries(value).map(([key, child]) => {
    if (isProjectionMetadata(key)) return '';
    const rendered = renderProjectedValue(child, key);
    if (!rendered) return '';
    const label = RUSSIAN_FIELD_LABELS[key] ?? key.replaceAll('_', ' ');
    return `${label}: ${rendered}`;
  }).filter(Boolean).join('\n');
}

function omitProjectionMetadata(value) {
  if (Array.isArray(value)) return value.map(omitProjectionMetadata).filter((item) =>
    item != null && !(Array.isArray(item) && item.length === 0)
      && !(typeof item === 'object' && !Array.isArray(item) && !Object.keys(item).length));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !isProjectionMetadata(key))
    .map(([key, child]) => [key, omitProjectionMetadata(child)])
    .filter(([, child]) => !(Array.isArray(child) && child.length === 0)
      && !(child && typeof child === 'object' && !Array.isArray(child)
        && Object.keys(child).length === 0)));
}

function isProjectionMetadata(key) {
  return ['version', 'schema', 'request_id', 'output_id', 'party_id', 'ref',
    'action_options', 'used_references', 'self_check', 'do_not_imply',
    'allowed_tensions', 'pack_revision']
    .includes(key) || /(?:^|_)(?:id|ids|ref|refs|trace|counter|index)$/u.test(key);
}

async function resolveNarrationGrounded(roleId, request, store,
  worldKnowledgeGrounder, telemetry = null) {
  // F1: ground once on writer narration_request; reuse pack; never re-ground repair/auditor.
  if (roleId === 'gameplay_narrator' && worldKnowledgeGrounder != null) {
    try {
      const authoritative = store?.authoritative ?? null;
      const grounded = await worldKnowledgeGrounder.ground(request, 'narration', {
        clock: authoritative?.clock ?? null,
        historical_events: Array.isArray(authoritative?.historical_events)
          ? authoritative.historical_events : [],
        actor_facets: authoritative?.actor_facets ?? {}
      });
      if (store) store.pack = grounded?.world_knowledge ?? null;
      return grounded;
    } catch (error) {
      // §73/B2: degrade on WK/turn-WK codes or provider failure; never on turn budget.
      const code = typeof error?.code === 'string' ? error.code : '';
      const budgetExhausted = code === 'LLM_TURN_BUDGET_EXHAUSTED';
      const wkFailure = code.startsWith('WORLD_KNOWLEDGE_')
        || code.startsWith('TURN_WORLD_KNOWLEDGE_');
      const providerFailure = error?.llm_provider_failure === true;
      if (!budgetExhausted && (wkFailure || providerFailure)) {
        const requestId = request?.request_id ?? request?.request?.request_id
          ?? null;
        const degradation = Object.freeze({
          schema: 'world_knowledge_narration_degradation_v1',
          event: 'world_knowledge_narration_degraded',
          code: code || 'LLM_ROLE_FAILED',
          purpose: 'narration',
          request_identity: requestId,
          request_id: requestId
        });
        if (store) store.pack = null;
        // A4/B5: ALS store dies after run(); telemetry keeps the §73 trace.
        telemetry?.onGameplayTrace?.(degradation);
        telemetry?.onDetail?.(degradation);
        return request;
      }
      throw error;
    }
  }
  if (store?.pack != null) {
    return { ...request, world_knowledge: store.pack };
  }
  return request;
}

export function assembleNarrationRoleOutput(roleId, output, request) {
  if (['gameplay_narrator', 'gameplay_narrator_format_repair']
    .includes(roleId)) return {
    version: 1, schema: 'narration_output',
    output_id: request.request_id ?? request.request?.request_id,
    prose: output.prose, action_options: [], used_references: [],
    self_check: {}
  };
  if (roleId === 'gameplay_narrator_auditor') {
    return assembleNarrationAuditOutput(output, request);
  }
  if (roleId === 'gameplay_narrator_semantic_repair') return {
    version: 1, schema: 'narration_semantic_repair',
    replacements: Array.isArray(output.replacements)
      ? output.replacements.map((replacement, index) => ({
          segment_id: request.segments?.[index]?.segment_id,
          prose: replacement.prose
        })) : output.replacements
  };
  return output;
}
