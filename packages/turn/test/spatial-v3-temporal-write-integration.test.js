import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import {
  integrateSpatialV3TemporalWriteFragments
} from '../src/spatial-v3-temporal-write-integration.js';

const seal = (value) => ({
  ...value,
  canonical_digest: computeSpatialV3CanonicalDigest(value)
});
const changeWrite = {
  target_schema: 'party_runtime',
  target_table: 'party_v3_change_sets',
  id: 'change-1',
  record: {
    id: 'change-1',
    party_id: 'party-1',
    operation_kind: 'temporal_boundary',
    idempotency_record_id: 'idem-1'
  }
};
const base = {
  plan_id: 'plan-1',
  party_id: 'party-1',
  canonical_input_digest: 'sha256:command',
  expected_state_versions: [],
  lock_context: {
    owner_keys: [],
    execution_keys: [],
    g4_keys: [],
    physical_keys: ['party_runtime.party_v3_change_sets:change-1']
  },
  approved_write_sets: [{
    appends: [changeWrite],
    inserts: [],
    updates: []
  }]
};

test('temporal fragments extend the one P16 input and bind idempotency to the temporal result', () => {
  const perceptionWrite = {
    target_schema: 'party_runtime',
    target_table: 'party_perception_records',
    id: 'perception-1',
    record: { perception_id: 'perception-1', party_id: 'party-1' }
  };
  const fragment = seal({
    proposal_id: 'perception-boundary:perception-reaction',
    write_target: 'perception-reaction:request-1',
    write_set: {
      appends: [perceptionWrite],
      inserts: [],
      updates: []
    },
    expected_state_versions: [],
    physical_keys: [
      'party_runtime.party_perception_records:perception-1'
    ]
  });
  const temporal = seal({
    combined_change_set: { proposals: [fragment] }
  });
  const result = integrateSpatialV3TemporalWriteFragments({
    base_write_plan_input: base,
    temporal_result: temporal
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.fragment_count, 1);
  assert.equal(result.input.approved_write_sets.length, 2);
  assert.equal(
    result.input.approved_write_sets[1].appends[0].id,
    'perception-1'
  );
  assert.equal(
    result.input.lock_context.physical_keys.includes(
      'party_runtime.party_perception_records:perception-1'
    ),
    true
  );
  assert.notEqual(
    result.input.canonical_input_digest,
    base.canonical_input_digest
  );
  assert.deepEqual(base.approved_write_sets, [{
    appends: [changeWrite],
    inserts: [],
    updates: []
  }]);
});

test('temporal fragment integration fails closed on duplicate writes or conflicting versions', () => {
  const duplicate = integrateSpatialV3TemporalWriteFragments({
    base_write_plan_input: base,
    temporal_result: seal({
      combined_change_set: {
        proposals: [seal({
          write_set: {
            appends: [changeWrite],
            inserts: [],
            updates: []
          },
          expected_state_versions: [],
          physical_keys: []
        })]
      }
    })
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.code, 'temporal_change_set_conflict');

  const versionedBase = {
    ...structuredClone(base),
    expected_state_versions: [{
      target_table: 'party_clocks',
      id: 'party-1',
      state_version: 2
    }]
  };
  const conflict = integrateSpatialV3TemporalWriteFragments({
    base_write_plan_input: versionedBase,
    temporal_result: seal({
      combined_change_set: {
        proposals: [seal({
          write_set: { appends: [], inserts: [], updates: [] },
          expected_state_versions: [{
            target_table: 'party_clocks',
            id: 'party-1',
            state_version: 3
          }],
          physical_keys: []
        })]
      }
    })
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.code, 'temporal_change_set_conflict');
});
