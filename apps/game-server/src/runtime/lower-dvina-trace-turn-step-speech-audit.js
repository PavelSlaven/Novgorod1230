import { serverError } from '../errors.js';

const PROMPT = 'Верни только JSON с тремя ключами: speech_faithful (boolean), required_input_mode (verbatim или intent_paraphrase) и unexecuted_intent (строка или null). Проверяется только произнесение слов actor. Сначала установи, намерен ли actor вообще издать речь, зов, крик или иной голосовой сигнал. Фраза от первого лица о действии, ожидании, движении, наблюдении, жесте или манипуляции не становится произнесённой репликой лишь потому, что игрок написал её текстом; для неё speech_faithful=false. speech_faithful=false, если явно длительная, повторяемая или ограниченная временем речь сведена к одной короткой реплике. Определи required_input_mode по исходному remaining_intent независимо от предложенного utterance.input_mode: verbatim только для явно заданных слов текущего actor; intent_paraphrase для свободного речевого намерения без заданной цитаты, даже если обращение короткое или его имя встречается в исходном тексте. speech_faithful=true только если первое действие — речь и utterance точно передаёт её смысл при required_input_mode. Неверный предложенный input_mode сам по себе не делает верные слова неверными: код отдельно сравнит режимы. Для verbatim слова должны быть словами текущего actor, а не чужой цитатой или условной репликой. Нельзя менять явную цитату через intent_paraphrase; свободное речевое намерение допускает верную формулировку без новых обещаний, угроз или утверждений. unexecuted_intent — весь дословный остаток remaining_intent ПОСЛЕ речевого действия, который произнесение слов ещё не выполняет. Скопируй остаток до самого конца исходной строки, сохранив начальные союзы и пунктуацию; не выписывай саму цитату или обрамляющее речевое действие. Слушание, осмотр, ожидание, движение, жесты и манипуляции вне реплики остаются неисполненными, даже в том же предложении. Цель, надежда, манера или ожидаемый результат, грамматически относящиеся к этой речи, не являются отдельным действием и не входят в unexecuted_intent. Если после речи нет отдельного действия, unexecuted_intent=null. Глаголы внутри произносимой цитаты сами по себе не являются действиями actor. Не добавляй объяснений или ключей.';

export async function auditFocusedSpeech({ roleRunner, plan, request,
  allow_speech_metadata_projection = false }) {
  const response = await roleRunner.run({
    scope: 'turn_runtime', role_id: 'turn_step_grounding_auditor',
    request_identity: request.request_id,
    messages: [{ role: 'system', content: PROMPT }, {
      role: 'user', content: JSON.stringify({
        remaining_intent: request.remaining_intent,
        actor_ref: request.actor?.actor_id ?? request.actor?.actor_ref ?? null,
        utterance: plan.utterance }) }]
  });
  if (!valid(response?.output)) throw serverError(
    'TRACE_TURN_STEP_GROUNDING_AUDIT_INVALID',
    'Turn-step grounding auditor returned an invalid result.', { status: 503 }
  );
  const classification = response.output;
  const remaining = canonicalSpeechRemainder(classification, plan, request);
  if (!classification.speech_faithful || remaining === request.remaining_intent) return false;
  if (remaining != null && !request.remaining_intent.endsWith(remaining)) {
    if (!removesOneSpan(request.remaining_intent, remaining)) return false;
    throw serverError('TURN_STEP_PLAN_INVALID',
      'Speech is not the earliest independent action.', { details: { errors: [{
        path: '$.utterance', rule: 'operation_semantic_grounding',
        code: 'operation_semantic_grounding',
        message: 'The faithful utterance occurs after an unexecuted earlier action. Discard this speech step, plan the earliest action first, and preserve the utterance plus every later action in continuation.'
      }] } });
  }
  const continuation = plan.continuation;
  const matches = remaining == null ? continuation == null
    : continuation?.remaining_intent === remaining
      && Array.isArray(continuation.depends_on_refs)
      && continuation.depends_on_refs.length === 0
      && continuation.prepared_followup_ref == null
      && continuation.pending_discovery == null;
  const mode = classification.required_input_mode;
  const goalResult = remaining == null ? 'achieved' : 'pending';
  if (matches && plan.utterance.input_mode === mode
      && plan.goal_result === goalResult) return true;
  if (allow_speech_metadata_projection === true && remaining != null
      && plan.resolution === 'direct' && plan.direct_result_kind === 'player_utterance'
      && plan.activity?.owner === 'semantic' && plan.activity.duration_class === 'moment'
      && !Object.hasOwn(plan.activity, 'requested_duration_minutes')
      && plan.activity.effort === 'none' && Array.isArray(plan.operations)
      && plan.operations.length === 0 && plan.check === null && plan.clarification === null
      && (continuation == null || typeof continuation.remaining_intent === 'string'
        && continuation.remaining_intent.length > 0
        && remaining.endsWith(continuation.remaining_intent)
        && Array.isArray(continuation.depends_on_refs)
        && continuation.depends_on_refs.length === 0
        && continuation.prepared_followup_ref == null
        && continuation.pending_discovery == null)) {
    return { corrected_plan: { ...plan, goal_result: 'pending',
      utterance: { ...plan.utterance, input_mode: mode }, continuation: {
        ...(continuation ?? {}), remaining_intent: remaining,
        depends_on_refs: continuation?.depends_on_refs ?? []
    } } };
  }
  const expected = remaining == null ? null
    : { remaining_intent: remaining, depends_on_refs: [] };
  throw serverError('TURN_STEP_PLAN_INVALID',
    'Speech must preserve independent unexecuted intent.', { details: { errors: [{
      path: '$.utterance', rule: 'operation_semantic_grounding',
      code: 'operation_semantic_grounding',
      message: `Keep the faithful utterance and its write-free activity; speech executes no later action. Set utterance.input_mode to ${mode}, continuation exactly to ${JSON.stringify(expected)} and goal_result to ${goalResult}.`
    }] } });
}

function canonicalSpeechRemainder(classification, plan, request) {
  const remaining = classification.unexecuted_intent;
  if (!classification.speech_faithful
      || classification.required_input_mode !== 'verbatim'
      || plan.utterance?.input_mode !== 'verbatim'
      || typeof remaining !== 'string') return remaining;
  const source = request.remaining_intent.trim();
  const matches = [...source.matchAll(/[«“„"]([^»”"]+)[»”"]/gu)];
  if (matches.length !== 1
      || matches[0][1].trim() !== plan.utterance.utterance_text.trim()) {
    return remaining;
  }
  const prefix = source.slice(0, matches[0].index).trim();
  const suffix = source.slice(matches[0].index + matches[0][0].length).trim();
  return suffix === '' && prefix.endsWith(':') && remaining.trim() === prefix
    ? null : remaining;
}

function removesOneSpan(original, remainder) {
  if (typeof remainder !== 'string' || remainder.length >= original.length) return false;
  let prefix = 0;
  while (prefix < remainder.length && original[prefix] === remainder[prefix]) {
    prefix += 1;
  }
  return original.endsWith(remainder.slice(prefix));
}

function valid(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 3
    && typeof value.speech_faithful === 'boolean'
    && ['verbatim', 'intent_paraphrase'].includes(value.required_input_mode)
    && (value.unexecuted_intent === null
      || typeof value.unexecuted_intent === 'string'
        && value.unexecuted_intent.trim().length > 0);
}
