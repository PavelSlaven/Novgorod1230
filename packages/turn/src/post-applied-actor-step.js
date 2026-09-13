import { deepFreeze } from '@rus/kernel';
import { turnFailure } from './errors.js';

export async function advancePostAppliedActorStep({
  root_turn_id,
  step_index,
  actor,
  actor_step_plan = null,
  working_projection,
  factual_events = []
} = {}, owner = null) {
  const events = requireFactualEvents(factual_events);
  if (owner == null) {
    if (events.length > 0) throw turnFailure(
      'TURN_STEP_POST_APPLIED_OWNER_MISSING',
      'A post-applied owner is required for factual events.');
    return deepFreeze({
      working_projection: structuredClone(working_projection),
      write_fragments: [],
      consequence_fragment: null,
      temporal_results: []
    });
  }
  if (typeof owner !== 'function') throw turnFailure(
    'TURN_STEP_POST_APPLIED_OWNER_INVALID',
    'postAppliedActorStep must be an injected function.');
  const result = await owner(deepFreeze({
    root_turn_id,
    step_index,
    actor: structuredClone(actor),
    actor_step_plan: structuredClone(actor_step_plan),
    working_projection: structuredClone(working_projection),
    factual_events: events
  }));
  if (!plain(result) || !plain(result.working_projection)) {
    throw turnFailure('TURN_STEP_POST_APPLIED_RESULT_INVALID',
      'Post-applied actor-step owner must return working_projection.');
  }
  if (result.temporal_results != null
      && !Array.isArray(result.temporal_results)) {
    throw turnFailure('TURN_STEP_POST_APPLIED_RESULT_INVALID',
      'Post-applied actor-step temporal_results must be an ordered array.');
  }
  return deepFreeze(structuredClone(result));
}

export function requireFactualEvents(value) {
  if (!Array.isArray(value)) throw turnFailure(
    'TURN_STEP_FACTUAL_EVENTS_INVALID',
    'factual_events must be an ordered array.');
  try {
    const copy = structuredClone(value);
    copy.forEach((event, index) => validateFactualEvent(event, index));
    return deepFreeze(copy);
  } catch {
    throw turnFailure('TURN_STEP_FACTUAL_EVENTS_INVALID',
      'factual_events must be cloneable data.');
  }
}

function validateFactualEvent(event, index) {
  const path = `factual_events[${index}]`;
  const keys = ['version', 'schema', 'event_ref', 'source_activity_ref',
    'occurred_at', 'source_ref', 'source_scope_ref', 'rule_ref', 'policy_ref',
    'profile_pin', 'perceptible_signal'];
  if (!plain(event) || !exactKeys(event, keys)
      || event.version !== 1
      || event.schema !== 'turn_step_factual_event_v1'
      || !ref(event.event_ref) || !ref(event.source_activity_ref)
      || event.source_activity_ref.entity_kind !== 'semantic_activity'
      || !ref(event.source_ref)
      || !ref(event.source_scope_ref) || !versionedRef(event.rule_ref)
      || !versionedRef(event.policy_ref) || !profilePin(event.profile_pin)
      || event.rule_ref.entity_kind !== 'activity_profile'
      || event.policy_ref.entity_id !== event.profile_pin.artifact_id
      || event.policy_ref.authoring_version
        !== String(event.profile_pin.revision)
      || event.rule_ref.authoring_version
        !== String(event.profile_pin.revision)
      || !timestamp(event.occurred_at)
      || !signal(event.perceptible_signal)) {
    throw turnFailure('TURN_STEP_FACTUAL_EVENTS_INVALID',
      `${path} must match turn_step_factual_event_v1.`);
  }
}

function profilePin(value) {
  return plain(value) && exactKeys(value, ['artifact_id', 'revision', 'digest'])
    && typeof value.artifact_id === 'string' && value.artifact_id.length > 0
    && Number.isSafeInteger(value.revision) && value.revision >= 1
    && typeof value.digest === 'string' && /^[a-f0-9]{64}$/u.test(value.digest);
}

function signal(value) {
  return plain(value)
    && exactKeys(value, ['channel', 'emission_strength'], ['duration_class'])
    && ['visual', 'acoustic'].includes(value.channel)
    && Number.isSafeInteger(value.emission_strength)
    && value.emission_strength >= 1 && value.emission_strength <= 4
    && (value.duration_class === undefined
      || ['instant', 'brief', 'sustained'].includes(value.duration_class));
}

function timestamp(value) {
  return plain(value) && typeof value.whole_minutes === 'string'
    && /^\d+$/u.test(value.whole_minutes)
    && typeof value.subminute_numerator === 'string'
    && /^\d+$/u.test(value.subminute_numerator)
    && typeof value.subminute_denominator === 'string'
    && /^[1-9]\d*$/u.test(value.subminute_denominator);
}

function ref(value) {
  return plain(value) && exactKeys(value, ['entity_kind', 'entity_id'])
    && typeof value.entity_kind === 'string' && value.entity_kind.length > 0
    && typeof value.entity_id === 'string' && value.entity_id.length > 0;
}

function versionedRef(value) {
  return plain(value)
    && exactKeys(value, ['entity_kind', 'entity_id', 'authoring_version'])
    && typeof value.entity_kind === 'string' && value.entity_kind.length > 0
    && typeof value.entity_id === 'string' && value.entity_id.length > 0
    && typeof value.authoring_version === 'string'
    && /^[1-9]\d*$/u.test(value.authoring_version);
}

function exactKeys(value, required, optional = []) {
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key))
    && keys.every((key) => required.includes(key) || optional.includes(key));
}

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
