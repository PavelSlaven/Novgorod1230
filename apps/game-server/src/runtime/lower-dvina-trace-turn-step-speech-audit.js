import { serverError } from '../errors.js';

const PROMPT = 'Верни только JSON с двумя ключами: speech_faithful (boolean) и unexecuted_intent (строка или null). Проверяется только произнесение слов actor. speech_faithful=true только если первое действие — речь и utterance точно передаёт её. Для verbatim слова должны быть словами текущего actor, а не чужой цитатой или условной репликой. Нельзя менять явную цитату через intent_paraphrase; свободное речевое намерение допускает верную формулировку без новых обещаний, угроз или утверждений. unexecuted_intent — весь дословный остаток remaining_intent ПОСЛЕ речевого действия, который произнесение слов ещё не выполняет. Скопируй остаток до самого конца исходной строки, сохранив союзы и пунктуацию; не выписывай саму цитату или обрамляющее речевое действие. Слушание, осмотр, ожидание, движение, жесты и манипуляции вне реплики остаются неисполненными, даже в том же предложении. Если после речи нет отдельного действия, unexecuted_intent=null. Глаголы внутри произносимой цитаты сами по себе не являются действиями actor. Не добавляй объяснений или ключей.';

export async function auditFocusedSpeech({ roleRunner, plan, request }) {
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
  const remaining = classification.unexecuted_intent;
  if (!classification.speech_faithful || remaining != null
      && (!request.remaining_intent.endsWith(remaining)
        || remaining === request.remaining_intent)) return false;
  const continuation = plan.continuation;
  const matches = remaining == null ? continuation == null
    : continuation?.remaining_intent === remaining
      && Array.isArray(continuation.depends_on_refs)
      && continuation.depends_on_refs.length === 0
      && continuation.prepared_followup_ref == null
      && continuation.pending_discovery == null;
  if (matches) return true;
  const expected = remaining == null ? null
    : { remaining_intent: remaining, depends_on_refs: [] };
  throw serverError('TURN_STEP_PLAN_INVALID',
    'Speech must preserve independent unexecuted intent.', { details: { errors: [{
      path: '$.utterance', rule: 'operation_semantic_grounding',
      code: 'operation_semantic_grounding',
      message: `Keep the faithful utterance and its write-free activity; speech executes no later action. Set continuation exactly to ${JSON.stringify(expected)} and goal_result to ${remaining == null ? 'achieved' : 'pending'}.`
    }] } });
}

function valid(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2
    && typeof value.speech_faithful === 'boolean'
    && (value.unexecuted_intent === null
      || typeof value.unexecuted_intent === 'string'
        && value.unexecuted_intent.trim().length > 0);
}
