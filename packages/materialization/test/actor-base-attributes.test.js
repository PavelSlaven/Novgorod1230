import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest,
  materializeActorBaseAttributes, materializeOrPreserveActorBaseAttributes } from '../src/index.js';

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
const runtimeProfile = { schema: 'rus.actor_base_attributes_runtime_profile.v1',
  catalog_scope: 'actor_base_attributes_v1', catalog_revision_id: 'attributes-v1',
  catalog_digest: 'a'.repeat(64), activation_event_id: 'activation-v1',
  import_id: 'import-v1', import_audit_digest: 'd'.repeat(64),
  record_registry_digest: 'f'.repeat(64),
  runtime_contract_digest: 'e'.repeat(64), profile_id: profile.profile_id,
  profile_digest: canonicalDigest(profile), profile };

test('actor base attributes are pinned, complete and deterministic', () => {
  const input = { runtime_profile: runtimeProfile,
    occupation_archetype_id: 'fishing_water',
    actor_slot_ref: 'worker:0', seed_basis: { world_revision_id: 'world',
      world_catalog_digest: 'b'.repeat(64), parent_seed_digest: 'c'.repeat(64) } };
  const left = materializeActorBaseAttributes(input);
  const right = materializeActorBaseAttributes(input);
  assert.deepEqual(left, right);
  assert.deepEqual(Object.values(left.values).sort((a, b) => b - a),
    [13, 12, 11, 10, 9, 8]);
  assert.throws(() => materializeActorBaseAttributes({ ...input,
    runtime_profile: { ...runtimeProfile,
      profile: { ...profile, occupation_archetype_priorities: [] } } }),
  { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_DATA_GAP' });
});

test('actor attributes preserve only their exact original materialization binding', () => {
  const input = { runtime_profile: runtimeProfile,
    occupation_archetype_id: 'fishing_water',
    actor_slot_ref: 'actor-A', seed_basis: { world_revision_id: 'world',
      world_catalog_digest: 'b'.repeat(64), parent_seed_digest: 'c'.repeat(64) } };
  const snapshot = materializeActorBaseAttributes(input);
  assert.deepEqual(materializeOrPreserveActorBaseAttributes({ ...input,
    existing_attributes: snapshot }), snapshot);
  for (const change of [{ actor_slot_ref: 'actor-B' },
    { occupation_archetype_id: 'trade_exchange' },
    { seed_basis: { ...input.seed_basis, world_revision_id: 'other' } },
    { seed_basis: { ...input.seed_basis, world_catalog_digest: 'd'.repeat(64) } }]) {
    assert.throws(() => materializeOrPreserveActorBaseAttributes({ ...input,
      ...change, existing_attributes: snapshot }),
    { code: 'ACTOR_BASE_ATTRIBUTES_SNAPSHOT_DATA_GAP' });
  }
  assert.deepEqual(materializeOrPreserveActorBaseAttributes({ ...input,
    seed_basis: { ...input.seed_basis, parent_seed_digest: 'e'.repeat(64) },
    existing_attributes: snapshot }), snapshot);
});
