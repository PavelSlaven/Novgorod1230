import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest, materializeActorBaseAttributes } from '../src/index.js';

const profile = { schema: 'rus.actor_base_attributes_profile.v1', version: 1,
  profile_id: 'ordinary-v1', algorithm_version: 'actor_base_attributes_v1',
  rng_version: 'mulberry32_v1', ordinary_array: [13, 12, 11, 10, 9, 8],
  occupation_archetype_priorities: ['agriculture', 'animal_husbandry',
    'craft_production', 'domestic_service', 'fishing_water', 'forest_hunting',
    'illicit_marginal', 'military_security', 'religious_literate',
    'trade_exchange', 'transport_guiding'].map((occupation_archetype_id) => ({
    mapping_id: occupation_archetype_id, occupation_archetype_id,
    priority_tiers: [['strength'], ['dexterity'], ['endurance'], ['reason'],
      ['attention'], ['influence']] })) };
const bundle = { schema: 'rus.approved_actor_base_attributes_bundle.v1',
  runtime_authorized: true, candidate: { schema:
    'rus.actor_base_attributes_candidate.v1', status: 'approved',
    runtime_authorized: true, candidate_digest: 'a'.repeat(64), profile },
  attestation: { schema: 'rus.actor_base_attributes_attestation.v1',
    runtime_authorized: true, candidate_digest: 'a'.repeat(64),
    profile_digest: canonicalDigest(profile) } };

test('actor base attributes are pinned, complete and deterministic', () => {
  const input = { approved_bundle: bundle, occupation_archetype_id: 'fishing_water',
    actor_slot_ref: 'worker:0', seed_basis: { world_revision_id: 'world',
      materialization_seed: 'seed' } };
  const left = materializeActorBaseAttributes(input);
  const right = materializeActorBaseAttributes(input);
  assert.deepEqual(left, right);
  assert.deepEqual(Object.values(left.values).sort((a, b) => b - a),
    [13, 12, 11, 10, 9, 8]);
  assert.throws(() => materializeActorBaseAttributes({ ...input,
    approved_bundle: { ...bundle, candidate: { ...bundle.candidate,
      profile: { ...profile, occupation_archetype_priorities: [] } } } }),
  { code: 'ACTOR_BASE_ATTRIBUTES_BUNDLE_DATA_GAP' });
});
