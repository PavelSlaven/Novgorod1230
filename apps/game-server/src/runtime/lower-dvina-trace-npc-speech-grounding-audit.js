import { serverError } from '../errors.js';

const PROMPT = 'Return only {"pass":true,"concerns":[]} or {"pass":false,"concerns":[{"kind":"unsupported_world_assertion"}]}. Audit the supplied NPC conversation speech plan only against its supplied player-safe subjective request. Check utterance, claims, topic_refs, and supporting_operations for actionable or world-facing assertions and directions. Every such assertion or direction must be grounded by the request subjective context or exact supplied operation and allowed refs; an exact supplied operation may support only its matching semantic effect. Ordinary non-factual social speech and speech grounded in the NPC subjective context may pass. Do not invent facts, infer hidden state, write prose, operations, or a replacement.';

export async function auditFreshNpcSpeech({ roleRunner, plan, request }) {
  if (plan?.contribution_kind !== 'speech') return true;
  const response = await roleRunner.run({
    scope: 'turn_runtime', role_id: 'npc_conversation_grounding_auditor',
    request_identity: request.request_id,
    messages: [{ role: 'system', content: PROMPT }, {
      role: 'user', content: JSON.stringify({ request, plan })
    }], overrides: { temperature: 0, maxTokens: 800 }
  });
  if (!valid(response?.output)) throw serverError(
    'TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID',
    'NPC speech grounding auditor returned an invalid result.', { status: 503 }
  );
  return response.output.pass ? true : { pass: false, errors: [{
    code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
    category: 'semantic_grounding', retryable: true
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
      && typeof concern.kind === 'string' && concern.kind.trim());
}
