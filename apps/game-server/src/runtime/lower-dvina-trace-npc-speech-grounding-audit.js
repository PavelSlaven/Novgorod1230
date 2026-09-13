import { serverError } from '../errors.js';

const PROMPT = [
  'Return only {"pass":true,"concerns":[]} or',
  '{"pass":false,"concerns":[{"kind":"<brief stable kind>"}]}.',
  'Audit the supplied NPC speech plan against only its supplied subjective',
  'request. Check every factual assertion in utterance_text, claims, reason,',
  'interpretation, topic_refs, and supporting_operations. Every factual',
  'assertion needs matching exact request evidence and every claim needs',
  'matching source_knowledge_refs. claims:[] is valid only when the utterance',
  'contains no factual assertion. Default to pass:false when speech asserts',
  'a current object, condition, resource, amenity, availability, or permission',
  'that no exact request field establishes, even when it is plausible for the',
  'place or social situation. A received statement proves only that its',
  'speaker said it, not that its content is true. Knowledge admission rules',
  'permit categories but do not create facts. npc.machine_state.current_activity',
  'describes only requested_at; it never proves earlier or future work, place,',
  'observation, or experience. Past first-person activity or observation needs',
  'an exact memory record. An empty or missing memory never proves a negative',
  'past observation such as "I did not see it"; use uncertainty instead.',
  'memory.current_observations grounds only its exact present fact_text when the',
  'matching observation_ref is cited in source_knowledge_refs; it proves no past',
  'observation, cause, or hidden fact.',
  'Route guidance needs the matching exact supplied',
  'disclose_known_route operation and refs. Ordinary questions, refusals,',
  'uncertainty, and clearly subjective present speech may pass without a claim.',
  'Mandatory failure: when memory.records has no exact supporting record, reject',
  'every first-person assertion that the NPC saw, did not see, remembers, does not',
  'remember, did, or did not do something earlier. A prior statement by this NPC',
  'in public_conversation_history is still only a statement, never evidence that',
  'the asserted observation happened. Mandatory failure: a current-observation',
  'citation supports only its exact fact_text, never a nearby possible condition,',
  'unseen object, explanation, required next action, or broader conclusion.',
  'Do not infer hidden state, invent evidence, rewrite the plan, or call another role.'
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
