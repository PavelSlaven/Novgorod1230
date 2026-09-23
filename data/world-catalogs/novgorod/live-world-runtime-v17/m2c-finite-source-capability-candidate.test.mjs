import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const candidatePath = 'data/world-catalogs/novgorod/live-world-runtime-v17/m2c-finite-source-capability-candidate.json';
const candidate = read(candidatePath);
const itemPath = 'data/world-catalogs/novgorod/m2c-items/candidate.json';
const propertyPath = 'data/world-catalogs/novgorod/m2c-items/property-context-candidate.json';
const naturalPath = 'data/world-catalogs/novgorod/m2c-natural/candidate.json';
const item = read(itemPath);
const property = read(propertyPath);
const natural = read(naturalPath);

assert.equal(candidate.status, 'pending_independent_data_approval');
assert.equal(candidate.approved, false);
assert.equal(candidate.import_authorized, false);
assert.equal(candidate.activation_authorized, false);
assert.equal(candidate.applicability.length, 32);
assert.equal(new Set(candidate.applicability.map((row) => row.g4_ref.id)).size, 32);
assert.equal(new Set(candidate.applicability.map((row) => row.generation_template_ref.id)).size, 25);
assert.equal(candidate.finite_source_profiles.length, 4);
assert.equal(candidate.applicability.filter((row) => row.finite_source_capability_profile_refs.length).length, 5);

for (const { path, sha256 } of candidate.source_set) {
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), sha256, `${path} SHA`);
}

const expected = new Map(item.natural_finite_source_profiles.map((row) => [row.profile_id, row]));
for (const row of candidate.applicability) {
  const family = item.family_profiles.find((entry) => entry.profile_id === row.item_family_profile_ref.id);
  const naturalRow = natural.natural_profiles.find((entry) => entry.g4_ref.id === row.g4_ref.id);
  const propertyBinding = property.g4_bindings.find((entry) => entry.g4_id === row.g4_ref.id);
  assert.ok(family && naturalRow && propertyBinding, row.g4_ref.id);
  assert.deepEqual(row.finite_source_capability_profile_refs, family.natural_finite_source_profile_refs ?? []);
  assert.equal(row.natural_profile_ref.id, naturalRow.profile_id);
  assert.equal(row.property_profile_ref.id, propertyBinding.profile_id);
  assert.equal(row.source_directness.current_node_state, null);
  assert.equal(row.source_directness.current_quantity, null);
  for (const ref of row.finite_source_capability_profile_refs) {
    const source = expected.get(ref);
    assert.ok(source, ref);
    assert.ok(source.applicable_family_refs.includes(row.generation_template_ref.id), ref);
  }
}

for (const source of candidate.finite_source_profiles) {
  const authored = expected.get(source.profile_id);
  assert.ok(authored, source.profile_id);
  assert.equal(source.initial_quantity, authored.initial_quantity);
  assert.deepEqual(source.initial_amount_bounds, authored.initial_amount_bounds);
  assert.deepEqual(source.mechanics_policy, authored.mechanics_policy);
  assert.deepEqual(source.output_mechanics, authored.output_mechanics);
}

assert.equal(candidate.ordinary_materialization_owner.target_profile, null);
assert.equal(candidate.access_and_state.runtime_lookup_required, true);
assert.equal(candidate.access_and_state.no_optional_absence_fallback, true);
assert.equal(JSON.stringify(candidate).includes('fishing_camp'), false);
console.log('M2c finite-source capability candidate: 32 G4, 25 families, 5 finite-source scopes');
