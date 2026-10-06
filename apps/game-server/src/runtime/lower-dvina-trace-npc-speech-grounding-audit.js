import { serverError } from '../errors.js';

const PROMPT = [
  'Возвращай только {"pass":true,"concerns":[]} либо',
  '{"pass":false,"concerns":[{"kind":"<краткий устойчивый вид замечания>"}]}.',
  'Проверяй переданный план речи NPC только по переданному субъективному',
  'запросу. Проверь каждое фактическое утверждение в utterance_text, claims, reason,',
  'interpretation, topic_refs и supporting_operations. Для каждого фактического',
  'утверждения требуется соответствующее точное свидетельство из запроса, а каждой записи claim нужны',
  'соответствующие source_knowledge_refs. claims:[] допустим, только если реплика',
  'не содержит фактических утверждений. Возвращай pass:false, если речь утверждает наличие',
  'текущего предмета, состояния, ресурса, удобства, доступности или разрешения,',
  'которое не установлено точным полем запроса, даже если это правдоподобно для',
  'места или социальной ситуации. Полученное сообщение доказывает только, что его',
  'говорящий произнёс эти слова, но не истинность их содержания. Правила допуска знаний',
  'разрешают категории, но не создают факты. npc.machine_state.current_activity',
  'описывает только requested_at; оно не доказывает более раннюю или будущую работу, место,',
  'наблюдение или пережитое событие. Для прошлой деятельности или наблюдения от первого лица нужна',
  'точная запись памяти. Пустая или отсутствующая память никогда не доказывает отрицательное',
  'прошлое наблюдение вроде «я этого не видел»; вместо этого выражай неуверенность.',
  'memory.current_observations подтверждает только свой точный настоящий fact_text, если',
  'соответствующий observation_ref указан в source_knowledge_refs; оно не подтверждает прошлое',
  'наблюдение, причину или скрытый факт.',
  'Точный срез world_knowledge в этом запросе является свидетельством для общих',
  'исторических и практических утверждений. Сопоставляй каждое утверждение, включая его',
  'количественные и условные уточнения, с точным применимым фактом или жёстким ограничением;',
  'world_knowledge никогда не доказывает текущее присутствие, владение, доступ, личную',
  'память или скрытое состояние. ref типа knowledge_scope только разрешает сослаться на источник;',
  'сам по себе он не является свидетельством. Каждый указанный ref также должен входить в',
  'allowed_references.knowledge_refs.',
  'Проверяй личные утверждения только по переданным фактам об этом NPC.',
  'canonical_name подтверждает только это точное имя. Явно заданная роль или занятие',
  'подтверждает только эту роль или занятие, но не мотив, ценности, страх, семью,',
  'иждивенцев, происхождение, отчество, прозвище или прошлые встречи. Отсутствующие личные',
  'поля означают «неизвестно», а не то, что факт ложен или отсутствует. Не отклоняй ошибочно',
  'прямой ответ, повторяющий точно заданное имя или роль.',
  'Отклоняй неподтверждённых названных третьих лиц, родство, титулы, отношения,',
  'исторических людей или события, неканонические места и противоречия',
  'переданным фактам личности. Если у claim posture равно knowingly_false, это остаётся',
  'намеренно ложным утверждением говорящего; не считай его объективной истиной и не',
  'требуй, чтобы его содержание было истинным. Но refs должны быть допустимы, а posture —',
  'соответствовать плану речи.',
  'Для указания маршрута нужна соответствующая точная переданная операция',
  'disclose_known_route и refs. Обычные вопросы, отказы,',
  'неуверенность и явно субъективная речь о настоящем могут пройти без claim.',
  'Обязательный отказ: если в memory.records нет точной подтверждающей записи, отклоняй',
  'каждое утверждение от первого лица о том, что NPC раньше видел, не видел, помнит, не',
  'помнит, делал или не делал что-либо. Прежнее высказывание этого NPC',
  'в public_conversation_history остаётся только высказыванием, а не доказательством того, что',
  'описанное наблюдение действительно было. Обязательный отказ: ссылка на текущее наблюдение',
  'подтверждает только точный fact_text, но не соседнее возможное состояние,',
  'неувиденный предмет, объяснение, требуемое следующее действие или более общий вывод.',
  'Не принимай высказывание о незнании того, что услышал игрок, за утверждение',
  'о том, что NPC раньше слышал, не слышал, видел или помнит что-либо.',
  'Не выводи скрытое состояние, не выдумывай свидетельства, не переписывай план и не вызывай другую роль.'
].join(' ');

export async function auditFreshNpcSpeech({ roleRunner, plan, request }) {
  if (plan?.contribution_kind !== 'speech') return true;
  if (plan.speech.claims.some(
    (claim) => claim.source_knowledge_refs.length === 0
  )) return unsupported(['claim_without_source_knowledge']);
  const response = await roleRunner.run({
    scope: 'turn_runtime',
    role_id: 'npc_conversation_grounding_auditor',
    request_identity: request.request_id,
    messages: [{ role: 'system', content: PROMPT }, {
      role: 'user', content: JSON.stringify({ request, plan })
    }],
    overrides: { temperature: 0, maxTokens: 256 }
  });
  if (!valid(response?.output)) throw serverError(
    'TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID',
    'NPC speech grounding auditor returned an invalid result.', { status: 503 }
  );
  return response.output.pass ? true : unsupported(
    response.output.concerns.map(({ kind }) => kind)
  );
}

function unsupported(concernKinds) {
  return { pass: false, errors: [{
    code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
    category: 'semantic_grounding',
    retryable: true,
    concern_kinds: concernKinds,
    message: 'Rewrite the complete response without unsupported factual assertions.'
  }] };
}

function valid(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2
    && typeof value.pass === 'boolean' && Array.isArray(value.concerns)
    && (value.pass ? value.concerns.length === 0 : value.concerns.length > 0)
    && value.concerns.every((concern) => concern != null
      && typeof concern === 'object' && !Array.isArray(concern)
      && Object.keys(concern).length === 1
      && typeof concern.kind === 'string' && concern.kind.trim().length > 0);
}
