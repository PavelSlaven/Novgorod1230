import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTargetRuntimeProfiles } from '../src/internal/target-runtime-profiles.js';
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
