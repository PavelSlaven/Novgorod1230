import { serverError } from '../errors.js';

const PROMPT = [
  'Return only {"pass":true,"concerns":[]} or',
  '{"pass":false,"concerns":[{"kind":"<brief stable kind>"}]}.',
  'Audit the supplied NPC speech plan against only its supplied subjective',
  'request. Check every factual assertion in utterance_text, claims, reason,',
  'interpretation, topic_refs, and supporting_operations. Every factual',
  'assertion needs matching exact request evidence and every claim needs',
  'matching source_knowledge_refs. claims:[] is valid only when the utterance',
  'contains no factual assertion. A received statement proves only that its',
  'speaker said it, not that its content is true. Knowledge admission rules',
  'permit categories but do not create facts. npc.machine_state.current_activity',
  'describes only requested_at; it never proves earlier or future work, place,',
  'observation, or experience. Past first-person activity or observation needs',
  'an exact memory record. Route guidance needs the matching exact supplied',
  'disclose_known_route operation and refs. Ordinary questions, refusals,',
  'uncertainty, and clearly subjective present speech may pass without a claim.',
  'Do not infer hidden state, invent evidence, rewrite the plan, or call another role.'
].join(' ');

export async function auditFreshNpcSpeech({ roleRunner, plan, request }) {
  if (plan?.contribution_kind !== 'speech') return true;
  const response = await roleRunner.run({
    scope: 'turn_runtime',
    role_id: 'npc_conversation_grounding_auditor',
    request_identity: request.request_id,
    messages: [{ role: 'system', content: PROMPT }, {
      role: 'user', content: JSON.stringify({ request, plan })
    }],
    overrides: { temperature: 0, maxTokens: 20_000 }
  });
  if (!valid(response?.output)) throw serverError(
    'TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID',
    'NPC speech grounding auditor returned an invalid result.', { status: 503 }
  );
  return response.output.pass ? true : { pass: false, errors: [{
    code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
    category: 'semantic_grounding',
    retryable: true,
    concern_kinds: response.output.concerns.map(({ kind }) => kind),
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
