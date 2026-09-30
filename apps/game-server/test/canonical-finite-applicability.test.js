import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { readApprovedCanonicalFiniteApplicability } from
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

test('the committed canonical finite-source file is a pending candidate and grants nothing', async () => {
  const file = JSON.parse(await readFile(fileUrl, 'utf8'));
  assert.notEqual(file.status, 'approved');
  assert.equal(readApprovedCanonicalFiniteApplicability(file, worldRevisionId), null);
  const loaded = await loadTargetFiniteFirstEntryProfile({ worldRevisionId,
    verifiedCatalog: await targetFiniteProfileCatalogFixture() });
  assert.equal(loaded.canonicalNaturalApplicability, null);
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
  const applicability = readApprovedCanonicalFiniteApplicability(approve(file), worldRevisionId);
  assert.deepEqual(applicability.profilesFor(site(WATER), G4), ['m2c_finite_driftwood_v1']);
  assert.deepEqual(applicability.profilesFor(site(WATER), 'other-g4'), []);
  assert.deepEqual(applicability.profilesFor(site('cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area'), G4), []);
  assert.deepEqual(applicability.profilesFor(site(WATER, 'generated'), G4), []);
  for (const bad of [{ ...approve(file), approval: null }, { ...approve(file), world_revision_id: 'x' },
    { ...approve(file), approval: { approved_by: 'reviewer' } },
    { ...approve(file), schema: 'other' }]) {
    assert.equal(readApprovedCanonicalFiniteApplicability(bad, worldRevisionId), null);
  }
});
