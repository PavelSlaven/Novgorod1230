import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { canonicalFiniteProfilesFor, readApprovedCanonicalFiniteApplicability } from
  '../src/infrastructure/postgres/ordinary-materialization-canonical-natural.js';
import { loadTargetFiniteFirstEntryProfile } from '../src/internal/target-runtime-profiles.js';
import { targetFiniteProfileCatalogFixture } from '../../../test/spatial-v3/target-finite-profile-fixture.js';

const worldRevisionId = 'novgorod_spatial_v3_target_contract_approval_001';
const fileUrl = new URL(
  '../../../data/world-catalogs/novgorod/m2c-items/canonical-finite-applicability.json', import.meta.url);
const WATER = 'cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access';
const G4 = 'g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_locality';
const approve = (file) => ({ ...file, status: 'approved', approval: { approved_by: 'reviewer',
  approved_on: '2026-09-30', approved_path: 'p', approved_commit: 'c'.repeat(40) } });
const site = (id, origin = 'canonical') => ({ origin, canonical_g5_ref: { entity_id: id,
  authoring_version: '1' } });

const candidateCopy = (file) => ({ ...file, status: 'candidate_pending_independent_data_approval', approval: null });

test('the committed canonical finite-source file is approved with limits and loads', async () => {
  const file = JSON.parse(await readFile(fileUrl, 'utf8'));
  assert.equal(file.status, 'approved');
  for (const key of ['approved_by', 'approved_on', 'approved_path', 'approved_commit']) {
    assert.ok(file.approval[key].length > 0, key);
  }
  assert.equal(file.approval.approved_commit, '44c1a3a95d8f03434a69847255507a9bdc16f1d8');
  assert.ok(file.approval.limits.length > 0);
  assert.equal(file.rows.length, 4);
  const applicability = readApprovedCanonicalFiniteApplicability(file, worldRevisionId);
  assert.notEqual(applicability, null);
  const loaded = await loadTargetFiniteFirstEntryProfile({ worldRevisionId,
    verifiedCatalog: await targetFiniteProfileCatalogFixture() });
  assert.deepEqual(loaded.canonicalNaturalApplicability, applicability);
  structuredClone(loaded); // the loaded profile stays plain data
  // Explicit unapproved copies grant nothing.
  assert.equal(readApprovedCanonicalFiniteApplicability(candidateCopy(file), worldRevisionId), null);
  assert.equal(readApprovedCanonicalFiniteApplicability({ ...file, approval: null }, worldRevisionId), null);
  // Every row uses one of the four approved profiles and only common-land place families.
  const profiles = new Set(['m2c_finite_reeds_v1', 'm2c_finite_deadwood_v1',
    'm2c_finite_driftwood_v1', 'm2c_finite_standing_wood_v1']);
  for (const row of file.rows) {
    assert.ok(row.natural_finite_source_profile_refs.every((id) => profiles.has(id)));
    assert.ok(Object.hasOwn(file.rule.place_family_to_source, row.place_family), row.place_family);
  }
});

test('only an approved file for this world revision yields profiles, and only for its canonical rows', async () => {
  const file = JSON.parse(await readFile(fileUrl, 'utf8'));
  const applicability = readApprovedCanonicalFiniteApplicability(file, worldRevisionId);
  const profilesFor = (at, g4) => canonicalFiniteProfilesFor(applicability, at, g4);
  assert.deepEqual(profilesFor(site(WATER), G4), ['m2c_finite_driftwood_v1']);
  assert.deepEqual(profilesFor(site(WATER), 'other-g4'), []);
  assert.deepEqual(profilesFor(site('cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area'), G4), []);
  assert.deepEqual(profilesFor(site(WATER, 'generated'), G4), []);
  assert.deepEqual(profilesFor(site('cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path'), G4),
    ['m2c_finite_deadwood_v1']);
  for (const bad of [{ ...approve(file), approval: null }, { ...approve(file), world_revision_id: 'x' },
    { ...approve(file), approval: { approved_by: 'reviewer' } },
    { ...approve(file), schema: 'other' }]) {
    assert.equal(readApprovedCanonicalFiniteApplicability(bad, worldRevisionId), null);
  }
});
