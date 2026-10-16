import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertOrdinaryMaterializationRequestV1 } from '@rus/contracts/ordinary-materialization-v1';

const root = new URL('../../../../', import.meta.url);
const source = readFileSync(new URL('m2c-finite-only-ordinary-base-candidate.json', import.meta.url));
const candidate = JSON.parse(source);

test('finite-only ordinary base is scoped, source-pinned and request-valid', () => {
  assert.equal(candidate.target_world_revision_id,
    'novgorod_spatial_v3_target_contract_approval_001');
  assert.equal(candidate.status, 'pending_independent_data_approval');
  assert.equal(candidate.activation_authorized, false);
  for (const { path, sha256 } of candidate.provenance.source_refs) {
    const actual = createHash('sha256').update(readFileSync(new URL(path, root)))
      .digest('hex');
    assert.equal(actual, sha256, path);
  }
  const profile = candidate.profile;
  const finite = JSON.parse(readFileSync(new URL(
    candidate.provenance.source_refs[0].path, root))).finite_source_profiles;
  const envelope = profile.execution.mechanics_policy;
  assert.equal(envelope.max_mass_grams,
    Math.max(...finite.map(({ mechanics_policy }) => mechanics_policy.max_mass_grams)));
  assert.equal(envelope.max_packing_slot_cost,
    Math.max(...finite.map(({ mechanics_policy }) => mechanics_policy.max_packing_slot_cost)));
  assert.equal(envelope.max_quantity,
    Math.max(...finite.map(({ mechanics_policy }) => mechanics_policy.max_quantity)));
  assert.deepEqual([...envelope.allowed_external_hand_costs].sort(),
    [...new Set(finite.flatMap(({ mechanics_policy }) =>
      mechanics_policy.allowed_external_hand_costs))].sort());
  assert.deepEqual([...envelope.allowed_carry_forms].sort(),
    [...new Set(finite.flatMap(({ mechanics_policy }) =>
      mechanics_policy.allowed_carry_forms))].sort());
  assert.equal(profile.execution.density_policy.mappings[0].bands.ordinary, 0);
  assert.deepEqual(profile.execution.allowed_disclosure_policy_refs, []);
  assert.equal(profile.o2a_ambient, undefined);
  assert.equal(profile.o2a_context_bound, undefined);
  assertOrdinaryMaterializationRequestV1({
    schema: 'ordinary_materialization_request_v1', request_id: 'm2c:fixture',
    mode: 'seed_scope', scope_ref: { entity_kind: 'g6', entity_id: 'g6:fixture' },
    context_refs: profile.context_refs,
    policy_refs: { ...profile.policy_refs, allowed_supporting_bases: [] },
    ordinary_state: { seeded: false, density_band: null,
      remaining_identity_budget: 0, background_groups: [], presence_resolutions: [],
      closed_observation_scopes: [] },
    candidate_query: null, technical_limits: profile.technical_limits
  });
});
