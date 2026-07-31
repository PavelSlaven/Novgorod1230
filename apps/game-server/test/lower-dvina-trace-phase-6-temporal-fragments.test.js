import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePhase6TemporalFragments } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-6-temporal-fragments.js';

const base = (proposals) => ({
  partyId: 'party',
  changeSetId: 'change',
  state: { temporal_source_proof: { event_versions: { event: 2 } } },
  intent: { attempt: { external_boundary_refs: ['event'] },
    temporal_advance_result: { combined_change_set: { proposals } } }
});

test('Phase 6 requires source-owned event resolution writes', () => {
  assert.throws(() => validatePhase6TemporalFragments(base([])),
    { code: 'TRACE_PHASE_6_TEMPORAL_SOURCE_WRITE_GAP' });
});

test('Phase 6 accepts one exact source-owned event resolution write', () => {
  assert.doesNotThrow(() => validatePhase6TemporalFragments(base([{
    expected_state_versions: [{ target_table: 'party_temporal_events',
      id: 'event', state_version: 2 }],
    write_set: { appends: [], inserts: [], deletes: [], updates: [{
      target_table: 'party_temporal_events', id: 'event', record: {
        party_id: 'party', status: 'resolved', state_version: 3,
        terminal_change_set_id: 'change'
      }
    }] }
  }])));
});

test('Phase 6 rejects temporal writes without a snapshot projection owner', () => {
  assert.throws(() => validatePhase6TemporalFragments(base([{
    write_set: { appends: [], inserts: [], deletes: [], updates: [{
      target_table: 'party_items', id: 'item', record: {}
    }] }
  }])), { code: 'TRACE_PHASE_6_TEMPORAL_PROJECTION_UNSUPPORTED' });
});

test('Phase 6 requires the current P16 change set on event resolution', () => {
  assert.throws(() => validatePhase6TemporalFragments(base([{
    expected_state_versions: [{ target_table: 'party_temporal_events',
      id: 'event', state_version: 2 }],
    write_set: { appends: [], inserts: [], deletes: [], updates: [{
      target_table: 'party_temporal_events', id: 'event', record: {
        party_id: 'party', status: 'resolved', state_version: 3,
        terminal_change_set_id: 'other-change'
      }
    }] }
  }])), { code: 'TRACE_PHASE_6_TEMPORAL_SOURCE_WRITE_GAP' });
});
