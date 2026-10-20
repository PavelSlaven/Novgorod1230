import { freeze, refKey, stableId } from './internal.js';
import {
  contractEntityRef,
  diagnoseConversationPlanDominantAct,
  nonEmptyText,
  plainRecord,
  stateVersion
} from './conversation-contribution-contract.js';
import { validateConversationContributionPlan } from './conversation-contracts.js';

const PLAN_SCHEMA = 'conversation_contribution_plan_v1';
const PLAN_KEYS = ['schema', 'request_id', 'boundary_id', 'conversation_id', 'exchange_id', 'state_version', 'speaker_ref',
  'contribution_kind', 'primary_addressee_ref', 'intended_addressee_refs', 'affected_actor_refs', 'speech', 'interpretation',
  'resolution', 'activity', 'supporting_operations', 'check', 'handoff', 'reason'];
const SPEECH_KEYS = ['utterance_text', 'dominant_act', 'interaction_tags', 'topic_refs', 'claims', 'response_expectation'];
const CLAIM_KEYS = ['claim_id', 'content_summary', 'form', 'speaker_posture', 'source_knowledge_refs', 'mentioned_entity_refs'];
const EXPECTATION_KEYS = ['kind', 'target_refs'];
const INTERPRETATION_KEYS = ['intent', 'grounded_contribution', 'adaptation'];
const ACTIVITY_KEYS = ['duration_class', 'effort'];
const CONTRIBUTION_KINDS = ['speech', 'silence', 'leave_conversation', 'action_handoff', 'combat_handoff'];
const SPEAKER_POSTURES = ['believed_true', 'knowingly_false', 'mixed', 'uncertain', 'withheld'];
const ADAPTATIONS = ['literal', 'historical_equivalent', 'reality_limited', 'make_believe'];
const RESOLUTIONS = ['automatic', 'check_required'];
const DURATION_CLASSES = ['moment', 'brief', 'short', 'domain_owned'];

const ID_FIELDS = [['request_id', stableId], ['boundary_id', stableId], ['conversation_id', stableId], ['exchange_id', stableId],
  ['state_version', stateVersion]];
const REF_MESSAGE = 'Must be an object with exactly entity_kind and entity_id strings.';
const WORD = /[\p{L}\p{M}]+/gu;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const LATIN = /\p{Script=Latin}/u;
const SPELLING_SLOT = '(?:(?!\\p{Script=Latin})[\\p{L}\\p{M}])+';

const error = (code, category, path, message, extra) => ({ code, category, path, message, ...extra });
const typeError = (path, message) => error('invalid_type', 'format', path, message);
const child = (path, key) => `${path}.${key}`;
const own = (parent, key) => parent !== null && Object.hasOwn(parent, key);
const narrowed = (list, all) => (Array.isArray(list) && list.some((value) => all.includes(value))
  ? list.filter((value) => all.includes(value)) : all);

function keyErrors([path, value, keys]) {
  return [
    ...keys.filter((key) => !Object.hasOwn(value, key))
      .map((key) => error('missing_field', 'format', child(path, key), 'Required field is missing.')),
    ...Object.keys(value).filter((key) => !keys.includes(key))
      .map((key) => error('unexpected_field', 'format', child(path, key), 'Field is not part of the contract.'))
  ];
}

function enumError(parent, key, path, allowed) {
  return own(parent, key) && !allowed.includes(parent[key])
    ? [error('invalid_enum', 'format', child(path, key), `${key} must be one of the allowed values.`, { allowed_values: [...allowed] })]
    : [];
}

function refSlots(plan, claims, expectation) {
  const top = (key, list) => (own(plan, key) ? [{ path: child('$', key), value: plan[key], list }] : []);
  const inside = (parent, key, path, list) => (own(parent, key) ? [{ path: child(path, key), value: parent[key], list }] : []);
  return [
    ...top('primary_addressee_ref', 'actor_refs').map((slot) => ({ ...slot, single: true })),
    ...top('intended_addressee_refs', 'actor_refs'),
    ...top('affected_actor_refs', 'actor_refs'),
    ...(expectation ? inside(expectation, 'target_refs', '$.speech.response_expectation', 'actor_refs') : []),
    ...claims.flatMap(([path, claim]) => [
      ...inside(claim, 'source_knowledge_refs', path, 'knowledge_refs'),
      ...inside(claim, 'mentioned_entity_refs', path, 'entity_refs')
    ]),
    ...(plan.contribution_kind === 'combat_handoff' && plainRecord(plan.handoff)
      ? inside(plan.handoff, 'target_actor_refs', '$.handoff', 'combat_target_refs') : [])
  ];
}

function slotRefs({ path, value, single }) {
  if (single) return value === null ? [] : [[path, value]];
  return Array.isArray(value) ? value.map((reference, index) => [`${path}[${index}]`, reference]) : [];
}

function slotTypeErrors(slot) {
  const { path, value, single } = slot;
  if (single) return value === null || contractEntityRef(value) ? [] : [typeError(path, REF_MESSAGE)];
  if (!Array.isArray(value)) return [typeError(path, 'Must be an array of entity references.')];
  return slotRefs(slot).filter(([, reference]) => !contractEntityRef(reference)).map(([at]) => typeError(at, REF_MESSAGE));
}

function scannedTexts(plan) {
  if (!plainRecord(plan)) return [];
  const texts = [];
  if (plainRecord(plan.speech)) {
    texts.push(['$.speech.utterance_text', plan.speech.utterance_text]);
    if (Array.isArray(plan.speech.claims)) {
      plan.speech.claims.forEach((claim, index) => {
        if (plainRecord(claim)) texts.push([`$.speech.claims[${index}].content_summary`, claim.content_summary]);
      });
    }
  }
  if (plainRecord(plan.interpretation)) texts.push(['$.interpretation.grounded_contribution', plan.interpretation.grounded_contribution]);
  return texts.filter(([, text]) => typeof text === 'string');
}

const mixedWords = (text) => [...text.matchAll(WORD)].map(([word]) => word).filter((word) => CYRILLIC.test(word) && LATIN.test(word));

function envelopeErrors(plan, request) {
  const errors = [];
  if (own(plan, 'schema') && plan.schema !== PLAN_SCHEMA) {
    errors.push(error('envelope_mismatch', 'format', '$.schema', `schema must be ${PLAN_SCHEMA}.`));
  }
  for (const [key, usable] of ID_FIELDS) {
    if (!own(plan, key)) continue;
    if (request !== null && usable(request[key])) {
      if (plan[key] !== request[key]) errors.push(error('envelope_mismatch', 'format', child('$', key), `${key} must equal the value in the request.`));
    } else if (!usable(plan[key])) {
      errors.push(typeError(child('$', key), `${key} has the wrong type.`));
    }
  }
  if (request !== null && contractEntityRef(plan.speaker_ref, 'npc') && contractEntityRef(request.npc_ref, 'npc')
    && refKey(plan.speaker_ref) !== refKey(request.npc_ref)) {
    errors.push(error('envelope_mismatch', 'format', '$.speaker_ref', 'speaker_ref must equal npc_ref of the request.'));
  }
  return errors;
}

function referenceErrors(slots, request) {
  const allowed = request !== null && plainRecord(request.allowed_references) ? request.allowed_references : null;
  if (allowed === null) return [];
  const keys = (...lists) => new Set(lists.flatMap((list) => (Array.isArray(list)
    ? list.filter((reference) => contractEntityRef(reference)).map(refKey) : [])));
  const sets = {
    actor_refs: keys(allowed.actor_refs),
    knowledge_refs: keys(allowed.knowledge_refs),
    entity_refs: keys(allowed.entity_refs, allowed.actor_refs),
    combat_target_refs: keys(allowed.combat_target_refs)
  };
  return slots.flatMap((slot) => slotRefs(slot)
    .filter(([, reference]) => contractEntityRef(reference) && !sets[slot.list].has(refKey(reference)))
    .map(([path, reference]) => error('reference_not_allowed', 'semantic_grounding', path,
      `Reference is not in allowed_references.${slot.list === 'entity_refs' ? 'entity_refs or actor_refs' : slot.list}.`,
      { quote: JSON.stringify(reference) })));
}

export function diagnoseConversationPlan(plan, request) {
  if (!plainRecord(plan)) {
    return freeze([error('conversation_plan_not_object', 'format', '$', 'Response must be a JSON object.')]);
  }
  const scope = plainRecord(request) ? request : null;
  const decisionScope = scope?.decision_scope;
  const kind = plan.contribution_kind;
  const speechMustBeNull = CONTRIBUTION_KINDS.includes(kind) && kind !== 'speech';
  const speech = plainRecord(plan.speech) && !speechMustBeNull ? plan.speech : null;
  const speechBad = own(plan, 'speech') && speech === null && !(plan.speech === null && kind !== 'speech');
  const claimsBad = speech !== null && own(speech, 'claims') && !Array.isArray(speech.claims);
  const claims = speech !== null && Array.isArray(speech.claims)
    ? Array.from(speech.claims, (claim, index) => [`$.speech.claims[${index}]`, claim]) : [];
  const claimRecords = claims.filter(([, claim]) => plainRecord(claim));
  const record = (parent, key) => (own(parent, key) && plainRecord(parent[key]) ? parent[key] : null);
  const expectation = speech === null ? null : record(speech, 'response_expectation');
  const interpretation = record(plan, 'interpretation');
  const activity = record(plan, 'activity');
  const slots = refSlots(plan, claimRecords, expectation);

  const structure = [
    ['$', plan, PLAN_KEYS],
    ...(speech === null ? [] : [['$.speech', speech, SPEECH_KEYS]]),
    ...claimRecords.map(([path, claim]) => [path, claim, CLAIM_KEYS]),
    ...(expectation === null ? [] : [['$.speech.response_expectation', expectation, EXPECTATION_KEYS]]),
    ...(interpretation === null ? [] : [['$.interpretation', interpretation, INTERPRETATION_KEYS]]),
    ...(activity === null ? [] : [['$.activity', activity, ACTIVITY_KEYS]])
  ];
  const enums = [
    ...enumError(plan, 'contribution_kind', '$', narrowed(decisionScope?.allowed_contribution_kinds, CONTRIBUTION_KINDS)),
    ...(speech !== null && own(speech, 'dominant_act')
      ? diagnoseConversationPlanDominantAct(plan).map((entry) => ({ ...entry, category: 'format' })) : []),
    ...claimRecords.flatMap(([path, claim]) => enumError(claim, 'speaker_posture', path, SPEAKER_POSTURES)),
    ...(interpretation === null ? [] : enumError(interpretation, 'adaptation', '$.interpretation', ADAPTATIONS)),
    ...enumError(plan, 'resolution', '$', RESOLUTIONS),
    ...(activity === null ? []
      : enumError(activity, 'duration_class', '$.activity', narrowed(decisionScope?.allowed_duration_classes, DURATION_CLASSES)))
  ];
  const texts = [
    ...(speech === null ? [] : [['$.speech.utterance_text', speech, 'utterance_text']]),
    ...claimRecords.map(([path, claim]) => [`${path}.content_summary`, claim, 'content_summary']),
    ...(interpretation === null ? [] : [['$.interpretation.intent', interpretation, 'intent'],
      ['$.interpretation.grounded_contribution', interpretation, 'grounded_contribution']]),
    ['$.reason', plan, 'reason']
  ].filter(([, parent, key]) => own(parent, key));
  const types = [
    ...(speechBad ? [typeError('$.speech', 'speech must be an object for speech contributions and null for every other kind.')] : []),
    ...(claimsBad ? [typeError('$.speech.claims', 'Must be an array of claim objects.')] : []),
    ...claims.filter(([, claim]) => !plainRecord(claim)).map(([path]) => typeError(path, 'Must be a claim object.')),
    ...(speech !== null && own(speech, 'response_expectation') && expectation === null
      ? [typeError('$.speech.response_expectation', 'Must be an object.')] : []),
    ...['interpretation', 'activity'].filter((key) => own(plan, key) && record(plan, key) === null)
      .map((key) => typeError(child('$', key), 'Must be an object.')),
    ...texts.filter(([, parent, key]) => !nonEmptyText(parent[key])).map(([path]) => typeError(path, 'Must be a non-empty string.')),
    ...(own(plan, 'speaker_ref') && !contractEntityRef(plan.speaker_ref, 'npc')
      ? [typeError('$.speaker_ref', 'Must be an npc entity reference with exactly entity_kind and entity_id.')] : []),
    ...slots.flatMap(slotTypeErrors)
  ];
  const errors = [
    ...structure.flatMap(keyErrors),
    ...enums,
    ...types,
    ...envelopeErrors(plan, scope),
    ...referenceErrors(slots, scope),
    ...scannedTexts(plan).flatMap(([path, text]) => mixedWords(text)
      .map((word) => error('mixed_script_word', 'format', path, 'This word mixes Latin and Cyrillic letters.', { quote: word })))
  ];
  if (errors.length === 0 && !accepted(plan, request)) {
    errors.push(error('conversation_contribution_schema_invalid', 'format', '$',
      'Response does not satisfy conversation_contribution_plan_v1 rules not covered by a named check.'));
  }
  return freeze(errors);
}

function accepted(plan, request) {
  try {
    return validateConversationContributionPlan(plan, request);
  } catch {
    return false;
  }
}

const escapeLiteral = (text) => text.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');

function onlyListedWordsRespelled(original, words, repaired) {
  if (typeof repaired !== 'string') return false;
  if (words.length === 0) return repaired === original;
  const listed = new Set(words);
  let source = '';
  let last = 0;
  for (const match of original.matchAll(WORD)) {
    if (!listed.has(match[0])) continue;
    source += escapeLiteral(original.slice(last, match.index)) + SPELLING_SLOT;
    last = match.index + match[0].length;
  }
  return new RegExp(`^${source}${escapeLiteral(original.slice(last))}$`, 'u').test(repaired);
}

export function diagnoseMixedScriptRepair(original, repaired, errors) {
  const listed = (Array.isArray(errors) ? errors : []).filter((entry) => entry?.code === 'mixed_script_word');
  const after = new Map(scannedTexts(repaired));
  return freeze(scannedTexts(original)
    .filter(([path, text]) => !onlyListedWordsRespelled(text,
      listed.filter((entry) => entry.path === path).map(({ quote }) => quote), after.get(path)))
    .map(([path]) => error('mixed_script_repair_changed_text', 'format', path,
      'Format repair may change only the spelling of the listed mixed-script words.')));
}
