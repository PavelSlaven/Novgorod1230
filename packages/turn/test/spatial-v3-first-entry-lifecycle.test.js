import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSpatialV3FirstEntryLifecycle } from '../src/index.js';

const digest = 'a'.repeat(64);
const write = (target_table, id) => ({ target_schema: 'party_runtime',
  target_table, id, record: { party_id: 'party-1', id } });

function input(overrides = {}) {
  const value = {
    party_id: 'party-1', change_set_id: 'change-1',
    approved_transition: { status: 'approved', from_g4_id: 'g4-origin',
      to_g4_id: 'g4-destination', route_plan_id: 'route-plan-1',
      route_plan_digest: digest, route_plan_execution_id: 'execution-1',
      relation_ref: 'relation-1' },
    destination: { g4_id: 'g4-destination', status: 'unprepared' },
    preparation: {
      snapshot_id: 'snapshot-1', snapshot_digest: digest,
      member: { baseline_disposition: 'create', g4_id: 'g4-destination',
        preparation_snapshot_id: 'snapshot-1', preparation_member_ordinal: 0,
        preparation_snapshot_digest: digest, preparation_member_digest: digest,
        route_plan_id: 'route-plan-1', route_plan_digest: digest,
        route_plan_execution_id: 'execution-1', preparation_claim_id: 'claim-1',
        scene_baseline_id: 'baseline-1', g5_site_id: 'g5-1',
        g6_instance_id: 'g6-1', position_id: 'position-1' },
      claim: { ...write('preparation_claims', 'claim-1'), state_version: 3 },
      journey_location: { ...write('party_journey_locations', 'location-1'),
        state_version: 4 },
      physical_writes: [write('party_scene_baselines', 'baseline-1'),
        write('party_g6_instances', 'g6-1'),
        write('scene_position_nodes', 'position-1')]
    }
  };
  return { ...value, ...overrides };
}

test('unprepared approved destination yields one exact first-entry extension', () => {
  const result = resolveSpatialV3FirstEntryLifecycle(input());
  assert.equal(result.ok, true);
  assert.equal(result.disposition, 'first_entry');
  assert.equal(result.extension.operation_kind, 'first_entry');
  assert.equal(result.extension.commit_rechecks.length, 1);
  assert.deepEqual(result.extension.approved_write_sets[0].updates.map(
    ({ target_table }) => target_table),
  ['party_journey_locations', 'preparation_claims']);
  assert.equal(result.extension.approved_write_sets[0].updates[0].record
    .scene_position_id, 'position-1');
  assert.equal(result.extension.approved_write_sets[0].updates[1].record
    .claim_status, 'consumed');
  assert.equal('model_request' in result.extension, false);
});

test('prepared destination leaves first-entry extension empty', () => {
  const result = resolveSpatialV3FirstEntryLifecycle(input({
    destination: { g4_id: 'g4-destination', status: 'prepared' }
  }));
  assert.deepEqual(result, { ok: true, disposition: 'prepared', extension: {
    commit_rechecks: [], approved_write_sets: [], expected_state_versions: [],
    lock_context: { g4_keys: [], physical_keys: [] }
  } });
});

test('same-G4 approved relation still creates an unprepared destination', () => {
  const base = input();
  const result = resolveSpatialV3FirstEntryLifecycle({ ...base,
    approved_transition: { ...base.approved_transition,
      to_g4_id: 'g4-origin' },
    destination: { g4_id: 'g4-origin', status: 'unprepared' },
    preparation: { ...base.preparation, member: { ...base.preparation.member,
      g4_id: 'g4-origin' } }
  });
  assert.equal(result.ok, true);
  assert.equal(result.disposition, 'first_entry');
});

test('missing relation and mismatched prepared member reject with typed errors', () => {
  const invalidTopology = resolveSpatialV3FirstEntryLifecycle(input({
    approved_transition: { ...input().approved_transition,
      relation_ref: null }
  }));
  assert.equal(invalidTopology.ok, false);
  assert.equal(invalidTopology.error.code, 'route_endpoint_invalid');
  const mismatched = resolveSpatialV3FirstEntryLifecycle(input({ preparation: {
    ...input().preparation, member: { ...input().preparation.member,
      route_plan_execution_id: 'other-execution' }
  } }));
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.error.code, 'target_preparation_failed');
});
