import assert from 'node:assert/strict';
import test from 'node:test';
import { loadProceduralSceneBaselineCatalog,
  resolveProceduralSceneBaselineProfile } from
  '../src/internal/procedural-scene-baselines.js';
import { materializeProceduralSceneBaseline } from '@rus/materialization';

test('approved catalog supplies three families through one materializer', async () => {
  const catalog = await loadProceduralSceneBaselineCatalog();
  const cases = [
    ['trace_ld_v1_loc_wreck_shore', 'river_bank'],
    ['trace_ld_v1_smp_fishing_camp', 'fishing_worksite'],
    ['trace_ld_v1_smp_old_drying_shed', 'craft_human_place']
  ];
  for (const [location, family] of cases) {
    const profile = resolveProceduralSceneBaselineProfile(catalog, location);
    const scope_ref = { entity_kind: 'g6', entity_id: `g6:${family}` };
    const result = materializeProceduralSceneBaseline({ party_id: 'party:fixed',
      scope_ref, profile, seed_context: { party_id: 'party:fixed',
        profile_id: profile.profile_id, scope_ref,
        rng_algorithm_id: catalog.rng_algorithm_id } });
    assert.equal(result.family, family);
    assert.ok(result.components.every(({ component_ref }) => component_ref));
    assert.ok(result.components.some(({ kind }) => kind === 'finite_source'));
  }
  assert.equal(resolveProceduralSceneBaselineProfile(catalog,
    'trace_ld_v1_tpl_old_drying_shed').family, 'craft_human_place');
});
