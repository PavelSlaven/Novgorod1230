import { serverError } from '../errors.js';
import { CLAIM_KINDS_RULE, FACTUAL_ASSERTION_RULE } from
  './lower-dvina-trace-phase-2-conversation-prompt-contract.js';

const PROMPT = [
  'Return only {"pass":true,"concerns":[]} or',
  '{"pass":false,"concerns":[{"kind":"<brief stable kind>","path":"<JSON path of the',
  'assertion in plan>","quote":"<exact unsupported words from plan>"}]}.',
  'Audit the supplied NPC speech plan against only its supplied subjective',
  'request. Check every factual assertion in utterance_text, claims, reason,',
  'interpretation, topic_refs, and supporting_operations. Every factual',
  'assertion needs matching exact request evidence and every claim needs',
  'matching source_knowledge_refs.', FACTUAL_ASSERTION_RULE, CLAIM_KINDS_RULE,
  'Check factual premises inside questions, invitations, offers, refusals, and statements of not knowing as usual.',
  'Judge visible utterance_text; a hidden content_summary cannot replace, support, or repair what was spoken.',
  'claims:[] is valid only when the utterance',
  'contains no factual assertion. Default to pass:false when speech asserts',
  'a current object, condition, resource, amenity, availability, or permission',
  'that no exact request field establishes, even when it is plausible for the',
  'place or social situation. A received statement proves only that its',
  'speaker said it, not that its content is true. Knowledge admission rules',
  'permit categories but do not create facts. A cited knowledge.known_facts entry',
  'grounds that fact; a cited knowledge.beliefs entry grounds only the speaker\'s',
  'belief, not objective truth; a cited npc_identity ref grounds the speaker own name,',
  'age, origin, and craft from npc.identity and npc.social_role;',
  'perceived_message.perception_result_ref grounds that the speaker hears the current',
  'message. A knowingly_false claim that cites the known fact it contradicts or hides',
  'is a lawful deliberate lie and passes. Reject a believed_true assertion whose cited',
  'ref does not state it. npc.current_activity',
  'describes only requested_at; it never proves earlier or future work, place,',
  'observation, or experience. Past first-person activity or observation needs',
  'an exact memory record. An empty or missing memory never proves a negative past observation;',
  'use genuine uncertainty only under the matching-knowledge condition below.',
  'memory.current_observations grounds only its exact present fact_text when the',
  'matching observation_ref is cited in source_knowledge_refs; it proves no past',
  'observation, cause, or hidden fact.',
  'Route guidance needs the matching exact supplied',
  'disclose_known_route operation and refs.',
  'Reject an offer or promise of a future physical or code-owned action without its exact permitted supporting operation, regardless of speech.dominant_act.',
  'An earlier spoken promise is a statement, not that operation.',
  'Mandatory failure: when memory.recent_events has no exact supporting event, reject',
  'every first-person assertion that the NPC saw, did, or experienced something',
  'earlier, and every assertion that it did not.',
  'A cited memory.recent_events entry must support the same past event asserted in utterance_text; a record of speech proves only what was said.',
  'Saying that the NPC does not remember or does not know, however phrased, passes as genuine uncertainty only if no known fact, belief, memory event, observation, or perceived message in the request answers it.',
  'A false denial of known information passes only as knowingly_false with source_knowledge_refs citing the exact known fact; withheld may conceal that fact with its exact ref but cannot make a false assertion.',
  'A prior statement by this NPC',
  'in public_conversation_history is still only a statement, never evidence that',
  'the asserted observation happened. Mandatory failure: a current-observation',
  'citation supports only its exact fact_text, never a nearby possible condition,',
  'unseen object, explanation, required next action, or broader conclusion.',
  'Do not infer hidden state, invent evidence, rewrite the plan, or call another role.'
].join(' ');

export async function auditFreshNpcSpeech({
  roleRunner, plan, request, requestWire = (value) => value
}) {
  if (plan?.contribution_kind !== 'speech') return true;
  const unsupportedClaims = plan.speech.claims.flatMap((claim, index) =>
    claim.source_knowledge_refs.length === 0
      && claim.speaker_posture !== 'uncertain'
      ? [{ kind: 'claim_without_source_knowledge',
        path: `$.speech.claims[${index}].source_knowledge_refs`,
        quote: claim.content_summary }]
      : []);
  if (unsupportedClaims.length > 0) return unsupported(unsupportedClaims);
  const response = await roleRunner.run({
    scope: 'turn_runtime',
    role_id: 'npc_conversation_grounding_auditor',
    request_identity: request.request_id,
    messages: [{ role: 'system', content: PROMPT }, {
      role: 'user', content: JSON.stringify(requestWire({ request, plan }, PROMPT))
    }],
    overrides: { temperature: 0, maxTokens: 256 }
  });
  if (!valid(response?.output)) throw serverError(
    'TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID',
    'NPC speech grounding auditor returned an invalid result.', { status: 503 }
  );
  return response.output.pass ? true : unsupported(
    response.output.concerns
  );
}

function unsupported(concerns) {
  return { pass: false, errors: concerns.map(({ kind, path, quote }) => ({
    code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
    category: 'semantic_grounding',
    retryable: true,
    concern_kinds: [kind],
    path,
    quote,
    message: 'Rewrite the complete response without unsupported factual assertions.'
  })) };
}

function valid(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2
    && typeof value.pass === 'boolean' && Array.isArray(value.concerns)
    && (value.pass ? value.concerns.length === 0 : value.concerns.length > 0)
    && value.concerns.every((concern) => concern != null
      && typeof concern === 'object' && !Array.isArray(concern)
      && Object.keys(concern).length === 3
      && ['kind', 'path', 'quote'].every((key) => Object.hasOwn(concern, key)
        && typeof concern[key] === 'string'
        && concern[key].trim().length > 0));
}
