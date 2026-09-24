import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTargetRuntimeProfiles, loadTargetFiniteFirstEntryProfile } from '../src/internal/target-runtime-profiles.js';
import { createTargetFiniteFirstEntryPorts } from '../src/infrastructure/postgres/ordinary-materialization-first-entry-provisioning.js';
import { targetFiniteProfileCatalogFixture } from '../../../test/spatial-v3/target-finite-profile-fixture.js';
import { createLowerDvinaTraceA1ProductionResolverFactory } from '../src/runtime/releases/lower-dvina-trace-a1-production.js';
import { validNeutralActionProductionProfile } from '../src/internal/lower-dvina-trace-a1-bundle.js';

const worldRevisionId = 'novgorod_spatial_v3_target_contract_approval_001';

test('target mapped approval admits generic mechanics and preserves explicit missing owners', async () => {
  const loaded = await loadTargetRuntimeProfiles({ worldRevisionId });
  assert.equal(loaded.turn_profile.profile.status, 'approved');
  assert.equal(loaded.applicability.length, 33);
  assert.equal(loaded.ordinary_profiles.s1, null);
  assert.equal(loaded.materialization_profiles.ordinaryMaterializationProfile, null);
  assert.equal(loaded.materialization_profiles.localFireProfile, null);
  const action = loaded.materialization_profiles.actionProductionProfile;
  assert.ok(validNeutralActionProductionProfile(action.profile));
  const factory = createLowerDvinaTraceA1ProductionResolverFactory({ loadedProfile: action,
    pool: { query: async () => { throw new Error('construction must not query'); } } });
  assert.equal(typeof factory, 'function');
  const changed = structuredClone(action);
  changed.profile.max_new_entities = 99;
  assert.throws(() => createLowerDvinaTraceA1ProductionResolverFactory({ loadedProfile: changed,
    pool: { query: async () => ({ rows: [] }) } }), /Exact loaded A1 profile/u);
  await assert.rejects(loadTargetRuntimeProfiles({ worldRevisionId: 'historical-world' }),
    { code: 'SPATIAL_V3_TARGET_RUNTIME_PROFILE_APPROVAL_REQUIRED' });
});

test('finite-only profile is exact-approved and cannot enable ambient or Stage B', async () => {
  const verifiedCatalog = await targetFiniteProfileCatalogFixture();
  const loaded = await loadTargetFiniteFirstEntryProfile({ worldRevisionId, verifiedCatalog });
  assert.equal(loaded.candidate_sha256, 'fcd2b47ff318b79031dc309193c159afd71909418beab1f77e9a455c4160bacd');
  assert.deepEqual(loaded.profile.execution.allowed_disclosure_policy_refs, []);
  assert.deepEqual(loaded.profile.stage_b_classification_eval.cases, []);
  assert.equal(Object.hasOwn(loaded.profile, 'o2a_ambient'), false);
  assert.equal(typeof createTargetFiniteFirstEntryPorts(loaded).prepareFirstEntry, 'function');
  for (const key of ['naturalSourceAuthoring', 'propertySourceAuthoring']) {
    const changed = structuredClone(loaded);
    changed[key].candidateBytes += ' ';
    assert.throws(() => createTargetFiniteFirstEntryPorts(changed));
  }
  await assert.rejects(loadTargetFiniteFirstEntryProfile({ worldRevisionId: 'historical-world' }),
    { code: 'SPATIAL_V3_TARGET_FINITE_PROFILE_APPROVAL_REQUIRED' });
  for (const catalog of [null, { ...verifiedCatalog, records_by_table: { procedural_scene_compiled_records: [] } },
    { ...verifiedCatalog, verified: false }]) {
    await assert.rejects(loadTargetFiniteFirstEntryProfile({ worldRevisionId, verifiedCatalog: catalog }),
      { code: 'SPATIAL_V3_TARGET_FINITE_PROFILE_APPROVAL_REQUIRED' });
  }
});
