import { serverError } from '../errors.js';
import { CLAIM_KINDS_RULE, FACTUAL_ASSERTION_RULE } from
  './lower-dvina-trace-phase-2-conversation-prompt-contract.js';
import { ACT_PATHS, coversActPath } from
  './lower-dvina-trace-conversation-repair-act-paths.js';

const ALLOWED_ROOTS = Object.freeze([
  'speech', 'interpretation', 'reason', 'supporting_operations'
]);

const PROMPT = [
  'Return only {"pass":true,"concerns":[]} or',
  '{"pass":false,"concerns":[{"kind":"<brief stable kind>","path":"<JSON path of the',
  'assertion in plan>","quote":"<exact unsupported words from plan>"}]}.',
  'Each concern path is a JSONPath from the root of the plan. Its first field is $.speech, $.interpretation, $.reason, or $.supporting_operations; for a speech claim use its own index in speech.claims, for example $.speech.claims[0] for the first claim. Never prefix a concern path with $.plan or $.request.',
  'Audit the supplied NPC speech plan against only its supplied subjective',
  'request. Check every factual assertion in utterance_text, claims, reason,',
  'interpretation, topic_refs, and supporting_operations. Every factual',
  'assertion needs matching exact request evidence and every claim needs',
  'matching source_knowledge_refs. For first-person past assertions, the',
  'matching record must be cited in source_knowledge_refs and satisfy the',
  'past rule below; its mere presence elsewhere in the request is insufficient.',
  FACTUAL_ASSERTION_RULE, CLAIM_KINDS_RULE,
  'If an unsupported assertion appears in several plan fields, give a',
  'separate concern for each occurrence, including $.interpretation.intent.',
  'Use the path of each occurrence and quote exact words from that field;',
  'for intent, quote exact words from intent.',
  'Check factual premises inside questions, invitations, offers, acceptances, promises, future intentions, refusals, and statements of not knowing as usual.',
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
  'message. A knowingly_false claim passes as a deliberate lie only for a visible false factual assertion with the exact known fact contradicted by that assertion. A truthful refusal or evasion with knowingly_false is rejected.',
  'Reject a believed_true assertion whose cited',
  'ref does not state it. npc.current_activity',
  'describes only requested_at; it never proves earlier or future work, place,',
  'observation, or experience. Past first-person activity or observation, including a denial, needs an exact knowledge.known_facts entry or event from memory.recent_events or memory.relevant_long_term_events, cited in source_knowledge_refs and supporting the same past assertion. A known fact about a habit, craft, or usual practice supports only that usual practice, not an activity now or an event at a particular past time. When the cited fact describes a present habit, craft, or usual practice, it supports an undated assertion that the speaker had the same usual practice before and still has it now as a usual practice; it does not establish a particular action underway at requested_at. It does not support any detail absent from that fact, including a stated or vague duration or start, frequency, number of occasions, place, person served or worked for, or particular object. It does not support a separate past occurrence even without a stated time, nor a denial or cessation of the practice. A believed_true claim may instead cite the exact knowledge.beliefs entry stating the same belief about that past; it grounds the belief, not objective truth. The cited belief itself must describe the asserted past; an intention, belief about the future, or general stance does not support it. A knowingly_false claim instead cites the exact known fact contradicted by the visible false assertion. An empty or missing memory never proves a negative past observation;',
  'use genuine uncertainty only under the matching-knowledge condition below.',
  'memory.current_observations grounds only its exact present fact_text when a claim',
  'has the same meaning, not necessarily the same words, and the matching',
  'observation_ref is cited in source_knowledge_refs; it proves no past',
  'observation, cause, or hidden fact.',
  'A route-specific offer to guide asserts route knowledge. Route guidance, including such an offer, needs the matching exact supplied disclose_known_route operation and refs.',
  'A spoken offer, acceptance of a request for future action, promise, or statement of future intention is a statement event. The absence of a supporting operation is not a reason to reject that speech. Factual premises within such speech need claims and the ordinary audit. An already completed or current action assertion needs exact request evidence and audit. Do not judge whether the future action will occur. A selected operation is checked against its contract by the action owner.',
  'Mandatory failure: reject a first-person assertion that the NPC saw, did, or experienced something earlier, or that it did not, unless a knowledge.known_facts entry or event from memory.recent_events or memory.relevant_long_term_events is cited in source_knowledge_refs and supports the same past assertion at its stated time rather than only a habit, a believed_true claim cites in source_knowledge_refs the exact knowledge.beliefs entry stating the same belief about that past and itself describing that past rather than an intention or general stance, or a knowingly_false claim cites in source_knowledge_refs the exact known fact contradicted by its visible false assertion. An undated assertion of the same continuing usual practice is not a separate earlier occurrence at a stated time for this mandatory failure; the cited habit or craft fact can support it.',
  'A cited known fact or event from memory.recent_events or memory.relevant_long_term_events must support the same past event asserted in utterance_text; a cited belief must state the same belief about that past; for knowingly_false, the known fact must be the one contradicted by the visible false assertion. A record of speech proves only what was said. A cited memory event recording speech or a perceived_message supports a report of what the same speaker said to the same addressee only when the cited records, read together in their recorded order, entail that report. When judging a speech report, a report that two participants discussed X passes with a cited utterance from either participant to the other; a report that assigns the words to one participant needs that participant as the recorded speaker. Resolve a pronoun only through those cited records; an uncited turn or unstated context cannot supply its referent. Reject a different speaker or addressee, recorded words that do not entail the reported content, and a stated time or number of occasions that the cited records do not establish. A reported-speech frame asserts only that X was said, not that X is objectively true; a separate assertion of X as true needs its own exact evidence.',
  'Saying that the NPC does not remember or does not know, however phrased, passes as genuine uncertainty only if no known fact, belief, memory event, observation, or perceived message in the request answers it. A habit, craft, or usual practice does not answer whether a separate occurrence happened at a particular time, even if it states a frequency; it neither establishes nor excludes that separate occurrence. A fact stating a present habit or craft answers whether the NPC has that usual practice now or has ever practiced it; saying "I do not know" about the practice itself is not genuine uncertainty. When judging not knowing, treat a memory event as answering just its recorded occurrence and recorded details, including that it happened at least once; it leaves unanswered a separate occurrence at another time and any unrecorded detail. When no matching known fact, belief, memory event, observation, or perceived message answers the separate occurrence, saying "I do not remember" about it is genuine uncertainty and needs no ref. A factual premise inside that admission still needs its own claim and exact request evidence; no ref is required only for the uncertainty itself.',
  'A false denial of known information passes only as knowingly_false with source_knowledge_refs citing the exact known fact. Withheld may conceal that known fact with its exact ref but cannot make a false assertion. A disclosure of a known fact or memory event, including a secret, is supported when the visible assertion has the same meaning as its exact cited source ref. Disclosure of a secret with an exact matching ref passes the grounding check for that assertion even when it conflicts with the NPC\'s goals, motives, character, temperament, interests, or expected benefit in the request; the responder decides whether to say it. Do not reject supported disclosure for those NPC goals or motives; this does not change the check that interpretation.intent matches utterance_text or the audit of factual assertions in reason and interpretation. Reject disclosure without a matching source ref or with content broader than the cited source.',
  'A categorical assertion on knowledge.hypotheses alone is unsupported and must be rejected. A hypothesis ref does not prove an earlier perception or the content of its source_event_ref.',
  'A prior statement by this NPC',
  'in public_conversation_history is still only a statement, never evidence that',
  'the asserted observation happened. Mandatory failure: a current-observation',
  'citation supports only its exact fact_text when the claim has the same',
  'meaning, not necessarily the same words; reject a merely possible condition,',
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
  const output = normalizeConcernLocations(response?.output, plan);
  if (!valid(output, plan)) throw serverError(
    'TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID',
    'NPC speech grounding auditor returned an invalid result.', { status: 503 }
  );
  return output.pass ? true : unsupported(output.concerns);
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

function valid(value, plan) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2
    && typeof value.pass === 'boolean' && Array.isArray(value.concerns)
    && (value.pass ? value.concerns.length === 0 : value.concerns.length > 0)
    && value.concerns.every((concern) => concern != null
      && typeof concern === 'object' && !Array.isArray(concern)
      && Object.keys(concern).length === 3
      && ['kind', 'path', 'quote'].every((key) => Object.hasOwn(concern, key)
        && typeof concern[key] === 'string'
        && concern[key].trim().length > 0)
      && concernQuoteMatchesPlan(concern, plan));
}

function concernQuoteMatchesPlan(concern, plan) {
  const segments = planPathSegments(concern.path);
  if (segments === null || !ALLOWED_ROOTS.includes(segments[0])) return false;
  const target = valueAtPath(plan, segments);
  return target.found && containsExactQuote(target.value, concern.quote);
}

function normalizeConcernLocations(output, plan) {
  if (!isCorrectableReject(output)) return output;
  let normalized = null;
  for (const [index, concern] of output.concerns.entries()) {
    const segments = planPathSegments(concern.path);
    if (segments === null || !ALLOWED_ROOTS.includes(segments[0])
      || concern.quote.trim().length === 0) return output;
    const target = valueAtPath(plan, segments);
    if (target.found && containsExactQuote(target.value, concern.quote)) continue;

    const matches = exactQuoteLeafPaths(plan, concern.quote);
    if (matches.length !== 1) return output;
    const match = matches[0];
    if (match.path === null || match.segments[0] !== segments[0]
      || !sameActCoverage(concern.path, match.path)) return output;
    normalized ??= structuredClone(output);
    normalized.concerns[index].path = match.path;
  }
  return normalized ?? output;
}

function isCorrectableReject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2
    && Object.hasOwn(value, 'pass') && value.pass === false
    && Array.isArray(value.concerns) && value.concerns.length > 0
    && value.concerns.every((concern) => concern != null
      && typeof concern === 'object' && !Array.isArray(concern)
      && Object.keys(concern).length === 3
      && ['kind', 'path', 'quote'].every((key) =>
        Object.hasOwn(concern, key) && typeof concern[key] === 'string'
        && concern[key].trim().length > 0));
}

function valueAtPath(root, segments) {
  let value = root;
  for (const segment of segments) {
    if (value === null || typeof value !== 'object'
      || !Object.hasOwn(value, segment)) return { found: false };
    value = value[segment];
  }
  return { found: true, value };
}

function exactQuoteLeafPaths(plan, quote) {
  const matches = [];
  for (const root of ALLOWED_ROOTS) {
    if (!Object.hasOwn(plan, root)) continue;
    collectExactQuoteLeaves(plan[root], quote, [root], matches);
  }
  return matches;
}

function collectExactQuoteLeaves(value, quote, segments, matches) {
  if (typeof value === 'string') {
    if (value.includes(quote)) {
      matches.push({ path: jsonPathForSegments(segments), segments });
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    collectExactQuoteLeaves(child, quote, [...segments, key], matches);
  }
}

function jsonPathForSegments(segments) {
  let path = '$';
  for (const segment of segments) {
    if (/^(0|[1-9]\d*)$/u.test(segment)) {
      path += '[' + segment + ']';
    } else if (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(segment)) {
      path += '.' + segment;
    } else {
      return null;
    }
  }
  return path;
}

function sameActCoverage(originalPath, correctedPath) {
  const coverage = path => ACT_PATHS
    .map(parts => '$.' + parts.join('.'))
    .filter(anchor => coversActPath(path, anchor));
  const original = coverage(originalPath);
  const corrected = coverage(correctedPath);
  return original.length === corrected.length
    && original.every((path, index) => path === corrected[index]);
}

function planPathSegments(path) {
  if (typeof path !== 'string' || !path.startsWith('$')) return null;
  const segments = [];
  let remaining = path.slice(1);
  while (remaining.length > 0) {
    const field = /^\.([A-Za-z_][A-Za-z0-9_]*)/u.exec(remaining);
    if (field !== null) {
      segments.push(field[1]);
      remaining = remaining.slice(field[0].length);
      continue;
    }
    const member = /^\[(?:'([A-Za-z_][A-Za-z0-9_]*)'|"([A-Za-z_][A-Za-z0-9_]*)")\]/u
      .exec(remaining);
    if (member !== null) {
      segments.push(member[1] ?? member[2]);
      remaining = remaining.slice(member[0].length);
      continue;
    }
    const index = /^\[(0|[1-9]\d*)\]/u.exec(remaining);
    if (index !== null) {
      segments.push(index[1]);
      remaining = remaining.slice(index[0].length);
      continue;
    }
    return null;
  }
  return segments.length > 0 ? segments : null;
}

function containsExactQuote(target, quote) {
  if (typeof target === 'string') return target.includes(quote);
  if (target === null || typeof target !== 'object') return false;
  return Object.values(target).some((value) => containsExactQuote(value, quote));
}
