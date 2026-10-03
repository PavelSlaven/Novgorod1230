import assert from 'node:assert/strict';
import test from 'node:test';
import { selectG4NaturalMembers } from '../src/g4-natural-baseline.js';

function fixture() {
  const profile = { profile_id: 'natural', profile_version: 2,
    g4_ref: { world_revision_id: 'world' }, natural_profile: { season_matrix: { spring: {
      ground_cover: { applicability: 'present', mandatory_member_refs: ['baseline:ground_cover'],
        excluded_candidate_refs: [], incompatibility: { status: 'resolved', member_refs: [['common', 'rare']] },
        members: [
          { member_ref: 'baseline:ground_cover', eligibility: 'approved_broad_context' },
          { member_ref: 'dominant', eligibility: 'conditional_current_state', frequency_category: 'dominant', editorial_weight: 8 },
          { member_ref: 'common', eligibility: 'conditional_current_state', frequency_category: 'common', editorial_weight: 4 },
          { member_ref: 'rare', eligibility: 'conditional_current_state', frequency_category: 'rare', editorial_weight: 1 }
        ] }
    } } } };
  return { profile, frequency_weight_policy: { version: 1,
    weights: { dominant: 8, common: 4, rare: 1 } },
    party_id: 'party', g5_site_id: 'site', season: 'spring',
    eligible_member_refs: ['dominant', 'common', 'rare'] };
}

test('natural members: stable seeded choice, mandatory dominant and one weighted alternative', () => {
  const input = fixture();
  const first = selectG4NaturalMembers(input);
  assert.deepEqual(selectG4NaturalMembers(structuredClone(input)), first);
  assert.deepEqual(first.layers[0].member_refs.filter((ref) => ref === 'dominant'), ['dominant']);
  assert.equal(first.layers[0].member_refs.length, 3);
  assert.ok(first.layers[0].member_refs.includes('common') || first.layers[0].member_refs.includes('rare'));
  assert.match(first.selection_digest, /^[0-9a-f]{64}$/);
  assert.notEqual(selectG4NaturalMembers({ ...input, g5_site_id: 'other' }).layers[0].seed_digest,
    first.layers[0].seed_digest);
});

test('natural members: unresolved source and incompatible mandatory members fail closed', () => {
  const input = fixture();
  input.profile.natural_profile.season_matrix.spring.ground_cover.incompatibility.status = 'unresolved_source_gap';
  assert.throws(() => selectG4NaturalMembers(input), { code: 'G4_NATURAL_BASELINE_DATA_GAP' });
  input.profile.natural_profile.season_matrix.spring.ground_cover.incompatibility = {
    status: 'resolved', member_refs: [['baseline:ground_cover', 'dominant']] };
  assert.throws(() => selectG4NaturalMembers(input), (error) =>
    error.details.reason === 'MANDATORY_MEMBER_INCOMPATIBLE');
});

test('natural members: frequency weights come only from versioned policy', () => {
  const input = fixture();
  input.profile.natural_profile.season_matrix.spring.ground_cover.members[2].editorial_weight = 99;
  assert.throws(() => selectG4NaturalMembers(input), (error) =>
    error.details.reason === 'MEMBER_WEIGHT_INVALID');
});
