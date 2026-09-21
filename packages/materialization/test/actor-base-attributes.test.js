import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalCandidateDigest, canonicalDigest, canonicalRequestDigest,
  materializeActorBaseAttributes } from '../src/index.js';

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
const candidate = { schema:
    'rus.actor_base_attributes_candidate.v1', status: 'approved',
    runtime_authorized: true, profile, profile_digest: canonicalDigest(profile) };
candidate.candidate_digest = canonicalCandidateDigest(candidate);
const request = { schema: 'rus.actor_base_attributes_approval_request.v1',
  decision: 'approved', runtime_authorized: true, import_authorized: true,
  activation_authorized: true };
request.request_digest = canonicalRequestDigest(request);
const bundle = { schema: 'rus.approved_actor_base_attributes_bundle.v1',
  runtime_authorized: true, candidate, approval_request: request,
  attestation: { schema: 'rus.actor_base_attributes_attestation.v1',
    runtime_authorized: true, candidate_digest: candidate.candidate_digest,
    request_digest: request.request_digest,
    profile_digest: canonicalDigest(profile) } };

test('actor base attributes are pinned, complete and deterministic', () => {
  const input = { approved_bundle: bundle, occupation_archetype_id: 'fishing_water',
    actor_slot_ref: 'worker:0', seed_basis: { world_revision_id: 'world',
      world_catalog_digest: 'b'.repeat(64), parent_seed_digest: 'c'.repeat(64) } };
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
