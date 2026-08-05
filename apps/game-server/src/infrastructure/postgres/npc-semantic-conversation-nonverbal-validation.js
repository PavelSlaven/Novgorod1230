import { sameRef } from
  './npc-semantic-conversation-write-validation.js';

export function validNonverbalAudience(contribution) {
  const audience = contribution.nonverbal_audience;
  if (!record(audience)
      || audience.schema
        !== 'conversation_nonverbal_audience_projection_v1'
      || audience.contribution_ref?.entity_kind
        !== 'conversation_contribution'
      || audience.contribution_ref.entity_id !== contribution.contribution_id
      || !Array.isArray(audience.actual_observer_refs)
      || !Array.isArray(audience.observations)
      || !Array.isArray(audience.witness_candidate_refs)
      || audience.actual_observer_refs.length !== audience.observations.length) {
    return false;
  }
  const observerKeys = new Set(audience.actual_observer_refs.map(refKey));
  const observationKeys = new Set(
    audience.observations.map(({ observer_ref: observerRef }) =>
      refKey(observerRef))
  );
  return observerKeys.size === audience.actual_observer_refs.length
    && observationKeys.size === audience.observations.length
    && [...observerKeys].every((key) => observationKeys.has(key))
    && audience.observations.every((observation) =>
      observation?.source_contribution_ref?.entity_kind
        === 'conversation_contribution'
      && observation.source_contribution_ref.entity_id
        === contribution.contribution_id
      && observerKeys.has(refKey(observation.observer_ref))
      && observation.perception_result_ref?.entity_kind === 'perception_result'
      && ['perceived_partial', 'recognized']
        .includes(observation.perception_result)
      && observation.observed_kind === 'silence')
    && audience.witness_candidate_refs.every((reference) =>
      observerKeys.has(refKey(reference)));
}

export function hasNonverbalDecisionEvidence({
  signalRecords,
  contributions
}) {
  if (contributions.some((contribution) =>
    contribution.contribution_kind === 'silence'
      && !validNonverbalAudience(contribution))) {
    return false;
  }
  const signals = signalRecords.filter((signal) =>
    signal.category === 'others'
      && signal.source_event_ref.entity_kind === 'conversation_contribution'
  );
  return signals.every((signal) => contributions.some((contribution) =>
    contribution.contribution_id === signal.source_event_ref.entity_id
      && contribution.contribution_kind === 'silence'
      && contribution.nonverbal_audience?.observations?.some((observation) =>
        sameRef(observation.observer_ref, signal.subject_ref)
          && sameRef(observation.speaker_ref, contribution.speaker_ref)
          && sameRef(observation.source_contribution_ref,
            signal.source_event_ref)
          && sameRef(observation.perception_result_ref,
            signal.source_perception_ref))
  ));
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function refKey(reference) {
  return `${reference?.entity_kind ?? ''}:${reference?.entity_id ?? ''}`;
}
