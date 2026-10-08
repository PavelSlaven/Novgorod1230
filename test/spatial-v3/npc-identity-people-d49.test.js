import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { createRandomSource, materializeApprovedProceduralNpc } from '@rus/materialization';
import { binding, bundle, environment } from '../../packages/materialization/test/fixtures/approved-procedural-npc.js';
import { approvedNpcIdentityCatalog } from '../helpers/npc-identity-catalog.js';

// people-data (D49) profiles carry the d2 Novgorod-land context: their people must get a pool name and a full character.
const pack = (table) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../data/world-catalogs/novgorod/m2c-scene-movement-edges/open-capacity-v2-import/${table}.json`), 'utf8'));
const D2 = 'm2c_npc_regional_novgorod_land_d2_v1';
const d2Profiles = pack('spatial_v3_npc_runtime_profiles').filter((row) => row.status === 'approved' && row.profile_kind === 'npc_binding'
  && row.payload.regional_context_refs.some((ref) => ref.id === D2));
const g4 = { world_revision_id: 'world', id: 'g4', version: 1 };
const template = { id: 'template', version: 1 };
const withSex = (source, sex) => {
  const copy = structuredClone(source);
  copy.actor_profiles.universal_categories.find((row) => row.facet === 'sex_category').stable_code = sex;
  return copy;
};

test('the people-data profiles exist in the datasets and their d2 context is bound to the Novgorod pool', async () => {
  assert.ok(d2Profiles.length >= 5, 'ferryman, householder, household mistress and the v3 fisher and servant');
  const catalog = await approvedNpcIdentityCatalog();
  assert.ok(catalog.name_bindings.some((row) => row.regional_context_id === D2 && row.people_ref === 'pp_novgorod_rus'));
});

test('people-data NPC get a pool name of their sex and a full seeded character', async () => {
  const catalog = await approvedNpcIdentityCatalog();
  const pool = new Map(catalog.name_entries.map((row) => [row.name_form, row.sex_category]));
  for (const profile of d2Profiles) {
    for (const sex of ['male', 'female']) {
      for (let index = 0; index < 6; index += 1) {
        const regional = { schema: 'rus.npc_regional_context_profile.v1', id: D2, version: 1, status: 'approved',
          world_revision_id: 'world', allowed_role_refs: [profile.role_ref], allowed_occupation_refs: [profile.occupation_ref],
          applicability: [{ g4_ref: g4, generation_template_ref: template }],
          origin: { label: 'Новгородская земля', directness: 'analogical', confidence: 'low', source_refs: ['src'] },
          language_status: 'unknown', language_repertoire: null };
        const source = withSex(bundle, sex);
        source.roles = [{ ...source.roles[0], role_id: profile.role_ref }];
        source.occupations = [{ ...source.occupations[0], occupation_id: profile.occupation_ref, allowed_social_role_ids: profile.role_ref }];
        const { npc } = materializeApprovedProceduralNpc({ party_id: 'party', run_id: 'run', environment,
          binding: { ...binding, role_ref: profile.role_ref, occupation_ref: profile.occupation_ref,
            regional_context_ref: { id: D2, version: 1 }, g4_ref: g4, generation_template_ref: template,
            parent_seed_digest: `${index}`.padStart(64, 'a') },
          approved_bundle: { ...source, regional_context_profiles: [regional], npc_identity: catalog },
          random: createRandomSource({ seed: 42 + index }) });
        const label = `${profile.id}@${profile.version} ${sex} ${index}`;
        assert.equal(pool.get(npc.identity_state.canonical_name), sex, label);
        const { character } = npc.semantic_state;
        assert.equal(character?.value_refs.length, 2, label);
        assert.ok(character.goals_ru.length >= 1 && typeof character.fear_ru === 'string', label);
      }
    }
  }
});
