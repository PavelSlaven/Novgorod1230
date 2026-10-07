import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import { lowerDvinaTraceTemporalSourceRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-6-temporal-source.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const at = (minutes) => ({ whole_minutes: String(minutes),
  subminute_numerator: '0', subminute_denominator: '1' });

test('body threshold source validator accepts only its exact bound fact', () => {
  const { candidate, projection, request, resolution } = fixture();
  assert.doesNotThrow(() => validate(candidate, projection, request, resolution));
});

test('body threshold validator rejects mismatched candidate and sidecar', () => {
  const { candidate, projection, request, resolution } = fixture();
  const foreign = { ...candidate, boundary_id: 'body-threshold:other:satiety-50' };
  assertInvalid(() => validate(foreign, projection, request, resolution));
});

test('body threshold validator rejects unknown fact kind', () => {
  const { candidate, projection, request, resolution } = fixture();
  resolution.proposals[0].source_event_ref.entity_kind = 'unknown_boundary_kind';
  assertInvalid(() => validate(candidate, projection, request, resolution));
});

test('body threshold validator rejects arbitrary write sets', () => {
  const { candidate, projection, request, resolution } = fixture();
  resolution.proposals[0].write_set = { updates: [] };
  assertInvalid(() => validate(candidate, projection, request, resolution));
});

test('body threshold validator rejects unapproved values and profile-metric mismatch', () => {
  const unsupported = fixture({ threshold: 30 });
  assertInvalid(() => validate(unsupported.candidate, unsupported.projection,
    unsupported.request, unsupported.resolution));

  const mismatched = fixture({ metric: 'energy', profileMetric: 'satiety' });
  assertInvalid(() => validate(mismatched.candidate, mismatched.projection,
    mismatched.request, mismatched.resolution));
});

test('body threshold validator rejects facts with another subject or party scope', () => {
  const subjectMismatch = fixture();
  subjectMismatch.resolution.proposals[0].subject_ref = ref('body_state', 'actor-2');
  assertInvalid(() => validate(subjectMismatch.candidate,
    subjectMismatch.projection, subjectMismatch.request,
    subjectMismatch.resolution));

  const scopeMismatch = fixture();
  scopeMismatch.resolution.proposals[0].scope_ref = ref('party', 'party-2');
  assertInvalid(() => validate(scopeMismatch.candidate, scopeMismatch.projection,
    scopeMismatch.request, scopeMismatch.resolution));
});

test('body threshold validator rejects projection mutation', () => {
  const { candidate, projection, request, resolution } = fixture();
  resolution.state_projection = { ...projection, changed: true };
  assertInvalid(() => validate(candidate, projection, request, resolution));
});

test('event_effect_gap is valid only for a critical zero before the requested end', () => {
  const ordinary = fixture();
  ordinary.resolution.proposals[0].reason_code = 'event_effect_gap';
  assertInvalid(() => validate(ordinary.candidate, ordinary.projection,
    ordinary.request, ordinary.resolution));

  const criticalBeforeEnd = fixture({ threshold: 0, scheduled: 7, limit: 60 });
  criticalBeforeEnd.resolution.proposals[0].reason_code = 'event_effect_gap';
  criticalBeforeEnd.resolution.stop_after_current_batch = true;
  assert.doesNotThrow(() => validate(criticalBeforeEnd.candidate,
    criticalBeforeEnd.projection, criticalBeforeEnd.request,
    criticalBeforeEnd.resolution));

  const criticalAtEnd = fixture({ threshold: 0, scheduled: 60, limit: 60 });
  assert.doesNotThrow(() => validate(criticalAtEnd.candidate,
    criticalAtEnd.projection, criticalAtEnd.request,
    criticalAtEnd.resolution));
});

function validate(candidate, projection, request, resolution) {
  return lowerDvinaTraceTemporalSourceRegistrations([{
    resolve() { return resolution; }
  }])[0].resolve(candidate, { projection, request });
}

function assertInvalid(action) {
  assert.throws(action, { code: 'TRACE_BODY_THRESHOLD_TEMPORAL_SOURCE_PROJECTION_INVALID' });
}

function fixture({ threshold = 50, scheduled = 30, limit = 60,
  metric = 'satiety', profileMetric = metric } = {}) {
  const profileId = {
    satiety: 'satiety_hourly_spend_v2',
    energy: 'energy_awake_spend_v2',
    health: 'starvation_health_harm_v2'
  }[profileMetric];
  const candidate = {
    boundary_id: `body-threshold:actor-1:satiety-${threshold}`,
    boundary_kind: 'body_threshold', scheduled_at: at(scheduled),
    primary_subject_ref: ref('body_state', 'actor-1'),
    subject_refs: [ref('body_state', 'actor-1')],
    scope_ref: ref('party', 'party-1'),
    rule_ref: { entity_ref: ref('body_effect', profileId), authoring_version: '1' },
    policy_ref: { entity_ref: ref('condition_set', `${profileId}:threshold-boundary`),
      authoring_version: '1' }
  };
  const descriptor = { candidate_digest: canonicalDigest(candidate),
    boundary_id: candidate.boundary_id, metric,
    threshold_value: { numerator: String(threshold), denominator: '1' },
    critical: threshold === 0 };
  const projection = { phase6_state: { actor_id: 'actor-1', party_id: 'party-1' },
    body_threshold_descriptors: [descriptor] };
  const request = { inclusive_limit_timestamp: at(limit) };
  const stop = threshold === 0 && scheduled < limit;
  const proposal = { boundary_kind: 'body_threshold',
    boundary_id: candidate.boundary_id,
    candidate_digest: descriptor.candidate_digest,
    source_event_ref: ref('temporal_boundary_candidate', candidate.boundary_id),
    subject_ref: candidate.primary_subject_ref,
    scope_ref: candidate.scope_ref,
    threshold: { metric, value: descriptor.threshold_value },
    ...(stop ? { reason_code: 'event_effect_gap' } : {}) };
  return { candidate, projection, request,
    resolution: { disposition: 'execute', proposals: [proposal],
      stop_after_current_batch: stop } };
}
