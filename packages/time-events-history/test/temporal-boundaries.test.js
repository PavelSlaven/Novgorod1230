import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeTemporalBoundaryCandidates,
  resolveSameTimeCascade,
  selectEarliestTemporalBoundaryBatch
} from '../src/temporal-boundaries.js';

const timestamp = (wholeMinutes, numerator = '0', denominator = '1') => ({
  whole_minutes: wholeMinutes,
  subminute_numerator: numerator,
  subminute_denominator: denominator
});

const candidate = (overrides = {}) => ({
  boundary_id: 'boundary-a',
  boundary_kind: 'exact_timer',
  scheduled_at: timestamp('10'),
  source_ref: { entity_kind: 'timer', entity_id: 'timer-a' },
  primary_subject_ref: { entity_kind: 'actor', entity_id: 'actor-a' },
  subject_refs: [],
  scope_ref: { entity_kind: 'party', entity_id: 'party-a' },
  rule_ref: { entity_ref: { entity_kind: 'event_rule', entity_id: 'rule-a' }, authoring_version: 'v1' },
  policy_ref: { entity_ref: { entity_kind: 'event_policy', entity_id: 'policy-a' }, authoring_version: 'v1' },
  preconditions_digest: 'a'.repeat(64),
  resolution_class: 'execution_outcome',
  interrupt_effect: 'background',
  visibility_policy_ref: { entity_ref: { entity_kind: 'visibility_policy', entity_id: 'visible-a' }, authoring_version: 'v1' },
  idempotency_key: 'timer-a:10',
  causal_parent_refs: [],
  ...overrides
});

test('Temporal v4 orders boundary candidates independently of input order and deduplicates identical identity', () => {
  const laterRule = candidate({ boundary_id: 'boundary-b', idempotency_key: 'b', rule_ref: { entity_ref: { entity_kind: 'event_rule', entity_id: 'rule-b' }, authoring_version: 'v1' } });
  const normalized = normalizeTemporalBoundaryCandidates([laterRule, candidate(), structuredClone(candidate())]);
  assert.deepEqual(normalized.map(({ boundary_id }) => boundary_id), ['boundary-a', 'boundary-b']);
});

test('Temporal v4 includes a due current-timestamp zero-time batch before a positive slice', () => {
  const batch = selectEarliestTemporalBoundaryBatch({
    from_timestamp: timestamp('10'),
    limit_timestamp: timestamp('12'),
    candidates: [candidate(), candidate({ boundary_id: 'later', idempotency_key: 'later', scheduled_at: timestamp('11') })]
  });
  assert.deepEqual(batch.scheduled_at, timestamp('10'));
  assert.equal(batch.is_current_timestamp_batch, true);
  assert.deepEqual(batch.candidates.map(({ boundary_id }) => boundary_id), ['boundary-a']);
});

test('Temporal v4 rejects conflicting duplicate candidates and unbounded positive advance', () => {
  assert.throws(
    () => normalizeTemporalBoundaryCandidates([candidate(), candidate({ scheduled_at: timestamp('11') })]),
    (error) => error?.code === 'temporal_boundary_ambiguous'
  );
  assert.throws(
    () => selectEarliestTemporalBoundaryBatch({ from_timestamp: timestamp('10'), limit_timestamp: timestamp('12'), candidates: [], execution_requires_boundary: true }),
    (error) => error?.code === 'temporal_execution_unbounded'
  );
});

test('Temporal v4 detects a same-time causal cycle and never silently truncates it', () => {
  const first = candidate({ boundary_id: 'a', idempotency_key: 'a' });
  const second = candidate({ boundary_id: 'b', idempotency_key: 'b', causal_parent_refs: [{ entity_kind: 'temporal_boundary_candidate', entity_id: 'a' }] });
  assert.throws(
    () => resolveSameTimeCascade({
      timestamp: timestamp('10'),
      candidates: [first],
      resolveCandidate: ({ boundary_id }) => boundary_id === 'a'
        ? { follow_up_candidates: [second] }
        : { follow_up_candidates: [candidate({ boundary_id: 'a', idempotency_key: 'a', causal_parent_refs: [{ entity_kind: 'temporal_boundary_candidate', entity_id: 'b' }] })] }
    }),
    (error) => error?.code === 'temporal_boundary_cycle'
  );
});

test('Temporal v4 applies the explicit window and resolution order without mutating provider output', () => {
  const input = [
    candidate({ boundary_id: 'before', idempotency_key: 'before', scheduled_at: timestamp('9') }),
    candidate({ boundary_id: 'reaction', idempotency_key: 'reaction', scheduled_at: timestamp('12'), resolution_class: 'reaction_decision' }),
    candidate({ boundary_id: 'physical', idempotency_key: 'physical', scheduled_at: timestamp('12'), resolution_class: 'physical_hazard_access' }),
    candidate({ boundary_id: 'after', idempotency_key: 'after', scheduled_at: timestamp('13') })
  ];
  const before = structuredClone(input);
  const batch = selectEarliestTemporalBoundaryBatch({
    from_timestamp: timestamp('10'),
    limit_timestamp: timestamp('12'),
    candidates: input
  });
  assert.deepEqual(batch.candidates.map(({ boundary_id }) => boundary_id), ['physical', 'reaction']);
  assert.deepEqual(input, before);
});

test('Temporal v4 fails closed on idempotency collisions, unknown classes and cascade resource exhaustion', () => {
  assert.throws(
    () => normalizeTemporalBoundaryCandidates([candidate(), candidate({ boundary_id: 'other' })]),
    (error) => error?.code === 'temporal_boundary_ambiguous'
  );
  assert.throws(
    () => normalizeTemporalBoundaryCandidates([candidate({ resolution_class: 'invented_class' })]),
    (error) => error?.code === 'controlled_vocabulary_gap'
  );
  assert.throws(
    () => resolveSameTimeCascade({
      timestamp: timestamp('10'),
      candidates: [candidate({ boundary_id: 'chain-0', idempotency_key: 'chain-0' })],
      max_iterations: 3,
      resolveCandidate: ({ boundary_id }) => {
        const ordinal = Number(boundary_id.split('-')[1]) + 1;
        return {
          follow_up_candidates: [candidate({
            boundary_id: `chain-${ordinal}`,
            idempotency_key: `chain-${ordinal}`,
            causal_parent_refs: [{ entity_kind: 'temporal_boundary_candidate', entity_id: boundary_id }]
          })]
        };
      }
    }),
    (error) => error?.code === 'temporal_boundary_cycle'
  );
});
