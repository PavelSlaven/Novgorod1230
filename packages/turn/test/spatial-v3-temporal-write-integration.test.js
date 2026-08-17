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
  const localFire = proposal.local_fire_atomic_write_plan;
  const required = proposal.physical_keys;
  const temporal = seal({ combined_change_set: { proposals: [proposal] } });
  const integrated = integrateSpatialV3TemporalWriteFragments({
    base_write_plan_input: base, temporal_result: temporal
  });
  assert.equal(integrated.ok, true, JSON.stringify(integrated));
  assert.deepEqual(integrated.input.local_fire_atomic_write_plan, localFire);
  assert.deepEqual(integrated.input.lock_context.physical_keys,
    [...base.lock_context.physical_keys, ...required].sort());
  assert.deepEqual(integrated.input.lock_context.owner_keys,
    [...base.lock_context.owner_keys,
      'actor:system:local_fire_boundary'].sort());
  assert.equal(integrated.input.local_fire_temporal_evidence
    .candidate_evidence.candidate_digest,
  proposal.temporal_candidate_evidence.candidate_digest);

  const missing = integrateSpatialV3TemporalWriteFragments({
    base_write_plan_input: base,
    temporal_result: seal({ combined_change_set: { proposals: [{
      proposal_id: 'local-fire:fire-1:due',
      local_fire_atomic_write_plan: localFire
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

  const drifted = localFireProposal();
  const forgedBoundary = 'local-fire:fire-1:state:forged';
  drifted.temporal_candidate_evidence.candidate_snapshot.boundary_id =
    forgedBoundary;
  drifted.temporal_candidate_evidence.candidate_snapshot.idempotency_key =
    forgedBoundary;
  drifted.local_fire_atomic_write_plan.transition_proposal.causal_identity
    .action_ref = `local-fire-boundary:${forgedBoundary}`;
  drifted.local_fire_atomic_write_plan.write_plan_digest = 'sha256:forged-fire';
  drifted.temporal_candidate_evidence.candidate_digest =
    computeSpatialV3CanonicalDigest(
      drifted.temporal_candidate_evidence.candidate_snapshot);
  drifted.temporal_candidate_evidence.local_fire_write_plan_digest =
    drifted.local_fire_atomic_write_plan.write_plan_digest;
  drifted.temporal_candidate_evidence.resolution_identity_digest =
    computeSpatialV3CanonicalDigest({ proposal_id: drifted.proposal_id,
      local_fire_write_plan_digest:
        drifted.local_fire_atomic_write_plan.write_plan_digest,
      owner_keys: drifted.owner_keys, physical_keys: drifted.physical_keys });
  const drift = integrateSpatialV3TemporalWriteFragments({
    base_write_plan_input: base,
    temporal_result: seal({ combined_change_set: { proposals: [drifted] } })
  });
  assert.equal(drift.ok, false);
  assert.equal(drift.error.code, 'temporal_change_set_conflict');
});

function localFireProposal() {
  const at = { whole_minutes: '15', subminute_numerator: '0',
    subminute_denominator: '1' };
  const process = { process_ref: 'fire-1', state_version: 2 };
  process.next_boundary_at = at;
  process.fuel_bindings = [{ fuel_ref: 'fuel-1', binding_ordinal: 0 }];
  const boundaryId = 'local-fire:fire-1:state:2';
  const localFire = { schema: 'local_fire_atomic_write_plan_v1',
    write_plan_digest: 'sha256:local-fire', transition_proposal: {
      action: 'due_boundary', at_timestamp: at, process_before: process,
      causal_identity: { action_ref: `local-fire-boundary:${boundaryId}` } },
    party_id: 'party-1', authority_pin: { persisted_row: {
      policy_ref: 'policy-fire', policy_version: 1 } } };
  const ownerKeys = ['actor:system:local_fire_boundary'];
  const physicalKeys = [
    'party_runtime.party_local_world_processes:party-1:fire-1',
    'party_runtime.party_items:party-1:fuel-1'
  ];
  const ruleRef = { entity_ref: { entity_kind: 'world_process_rule',
    entity_id: 'local_exact_fire_due_v1' }, authoring_version: '1' };
  const policyRef = { entity_ref: { entity_kind: 'world_process_policy',
    entity_id: 'policy-fire' }, authoring_version: '1' };
  const subjects = [{ entity_kind: 'item', entity_id: 'fuel-1' }];
  const candidate = { boundary_id: boundaryId, boundary_kind:'world_process',
    source_ref: { entity_kind: 'local_world_process', entity_id: 'fire-1' },
    primary_subject_ref: subjects[0],
    scope_ref: { entity_kind: 'party', entity_id: 'party-1' },
    rule_ref: ruleRef, policy_ref: policyRef,
    scheduled_at: at, preconditions_digest: computeSpatialV3CanonicalDigest({
      process_state: process, expected_state_version: 2 }),
    resolution_class: 'local_exact_fire_due', interrupt_effect: 'background',
    visibility_policy_ref: policyRef, idempotency_key: boundaryId,
    subject_refs: subjects, causal_parent_refs: [] };
  const proposalId = 'local-fire:fire-1:due';
  return { proposal_id: proposalId, local_fire_atomic_write_plan: localFire,
    owner_keys: ownerKeys, physical_keys: physicalKeys,
    temporal_candidate_evidence: {
      schema: 'rus.turn.local_fire_temporal_candidate_evidence.v1',
      rule_ref: ruleRef, policy_ref: policyRef,
      candidate_snapshot: candidate,
      candidate_digest: computeSpatialV3CanonicalDigest(candidate),
      local_fire_write_plan_digest: localFire.write_plan_digest,
      resolution_identity_digest: computeSpatialV3CanonicalDigest({
        proposal_id: proposalId,
        local_fire_write_plan_digest: localFire.write_plan_digest,
        owner_keys: ownerKeys, physical_keys: physicalKeys })
    } };
}
