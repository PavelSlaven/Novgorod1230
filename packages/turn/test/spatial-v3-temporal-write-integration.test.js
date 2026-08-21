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

test('legacy temporal fragments do not require or add local-fire owner locks', () => {
  const legacyBase = structuredClone(base);
  delete legacyBase.lock_context.owner_keys;
  const fragment = seal({
    proposal_id: 'legacy-background', write_target: 'party_npcs:npc-1',
    write_set: { appends: [], inserts: [], deletes: [], updates: [{
      target_table: 'party_npcs', id: 'npc-1',
      record: { party_id: 'party-1', npc_id: 'npc-1' }
    }] },
    expected_state_versions: [],
    physical_keys: ['party_runtime.party_npcs:npc-1']
  });
  const result = integrateSpatialV3TemporalWriteFragments({
    base_write_plan_input: legacyBase,
    temporal_result: seal({ combined_change_set: { proposals: [fragment] } })
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(Object.hasOwn(result.input.lock_context, 'owner_keys'), false);
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

test('local-fire temporal proposal contributes its mandatory physical locks', () => {
  const proposal = localFireProposal();
  const localFire = proposal.local_fire_atomic_write_plans;
  const required = proposal.physical_keys;
  const temporal = seal({ combined_change_set: { proposals: [proposal] } });
  const integrated = integrateSpatialV3TemporalWriteFragments({
    base_write_plan_input: base, temporal_result: temporal
  });
  assert.equal(integrated.ok, true, JSON.stringify(integrated));
  assert.deepEqual(integrated.input.local_fire_atomic_write_plans, localFire);
  assert.deepEqual(integrated.input.lock_context.physical_keys,
    [...base.lock_context.physical_keys, ...required].sort());
  assert.deepEqual(integrated.input.lock_context.owner_keys,
    base.lock_context.owner_keys);

  const missing = integrateSpatialV3TemporalWriteFragments({
    base_write_plan_input: base,
    temporal_result: seal({ combined_change_set: { proposals: [{
      proposal_id: 'local-fire:fire-1:due',
      local_fire_atomic_write_plans: localFire
    }] } })
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'temporal_change_set_conflict');

  const noOwnerLocks = structuredClone(base);
  delete noOwnerLocks.lock_context.owner_keys;
  const missingOwner = integrateSpatialV3TemporalWriteFragments({
    base_write_plan_input: noOwnerLocks, temporal_result: temporal
  });
  assert.equal(missingOwner.ok, false);
  assert.equal(missingOwner.error.code, 'temporal_change_set_conflict');

});

function localFireProposal() {
  const at = { whole_minutes: '15', subminute_numerator: '0',
    subminute_denominator: '1' };
  const process = { schema: 'local_world_process_state_v1',
    process_ref: 'fire-1', process_mode: 'local_exact', process_kind: 'fire',
    scope_ref: 'shore', causal_basis_ref: 'ignition', status: 'active',
    started_at: { whole_minutes: '10', subminute_numerator: '0',
      subminute_denominator: '1' }, next_boundary_at: at,
    fuel_bindings: [{ fuel_ref: 'fuel-1',
      fuel_class: 'ordinary_solid_fuel_unit' }], state_version: 2 };
  const boundaryId = 'local-fire:fire-1:state:2';
  const localFire = { schema: 'local_fire_atomic_write_plan_v1',
    party_id: 'party-1', base_party_state_version: 2,
    change_set_id: 'change-1', actor_ref: 'actor:system',
    profile_pin: {}, input_pins: [], ignition_basis_pin: null,
    item_retirement_transition: null, transition_proposal: {
      action: 'due_boundary', at_timestamp: at, process_before: process,
      cause: { kind: 'temporal_boundary', boundary_id: boundaryId,
        expected_process_state_version: 2, due_at: at } } };
  const ownerKeys = [];
  const physicalKeys = [
    'party_runtime.party_local_world_processes:party-1:fire-1',
    'party_runtime.party_items:party-1:fuel-1'
  ];
  const proposalId = 'local-fire:fire-1:due';
  return { proposal_id: proposalId, local_fire_atomic_write_plans: [localFire],
    owner_keys: ownerKeys, physical_keys: physicalKeys };
}
