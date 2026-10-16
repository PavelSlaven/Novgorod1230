import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

// D49: every place of the Vikhtuy route slice, after the start place, has at least one person made only from approved data.
// Pure data check (no PostgreSQL): composition -> subject -> newest approved profile -> actor catalog, clothing, regional
// context, sex and D-1 routine. The start place (work_storage) may stay empty.
const root = resolve(import.meta.dirname, '../..');
const catalog = 'data/world-catalogs/novgorod';
const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const wave = (table) => read(`${catalog}/m2c-npc-wave/v1/datasets/${table}.json`);
const pack = (table) => read(`${catalog}/m2c-scene-movement-edges/open-capacity-v2-import/${table}.json`);
const tsv = (path) => {
  const [head, ...lines] = readFileSync(resolve(root, path), 'utf8').split(/\r?\n/u).filter(Boolean);
  const keys = head.split('\t');
  return lines.map((line) => Object.fromEntries(line.split('\t').map((value, index) => [keys[index], value])));
};

const SITE = 'cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_';
const SLICE = ['water_access', 'forest_path', 'meeting_area', 'river_approach', 'landing_candidate',
  'occupation_terrace', 'household_cluster'];
const G4_PREFIX = 'g4v3__gn_nov_g3_xp017_yp026_r2_';
const approvedActor = (path, key) => new Set(tsv(path).filter((row) => row.status === 'approved'
  && row.region_id === 'region_novgorod_land').map((row) => row[key]));
const ROLES = approvedActor('data/novgorod-region/novgorod_social_roles_v1_enriched.tsv', 'role_id');
const OCCUPATIONS = approvedActor('data/novgorod-region/novgorod_occupations_v1_enriched.tsv', 'occupation_id');

const profileRows = [...read(`${catalog}/m2c-npc/datasets/spatial_v3_npc_runtime_profiles.json`), ...pack('spatial_v3_npc_runtime_profiles')]
  .filter((row) => row.status === 'approved');
const newest = (rows) => [...rows.reduce((map, row) => (map.get(row.id)?.version >= row.version ? map : map.set(row.id, row)), new Map()).values()];
const bindings = newest(profileRows.filter((row) => row.profile_kind === 'npc_binding'));
const byRef = (ref) => profileRows.find((row) => row.id === ref.id && row.version === ref.version);
const contexts = [...read(`${catalog}/m2c-npc/datasets/spatial_v3_npc_regional_context_profiles.json`),
  ...pack('spatial_v3_npc_regional_context_profiles')];
const compositions = new Map(wave('place_population_composition_rules').map((row) => [row.place_family_id, row]));
const placeFamily = new Map(wave('spatial_node_place_family_bindings').map((row) => [row.node_id, row.place_family_id]));
const routines = wave('npc_schedule_routine_rules');

function g4Of(siteId) {
  const rest = siteId.split('r2_')[1];
  const g4 = [...placeFamily.keys()].filter((id) => id.startsWith(G4_PREFIX) && rest.startsWith(`${id.slice(G4_PREFIX.length)}_`));
  return g4.sort((a, b) => b.length - a.length)[0];
}

function resolveSubject(subject) {
  const matches = subject.profile_ref != null ? bindings.filter((row) => row.id === subject.profile_ref)
    : bindings.filter((row) => (subject.subject_kind === 'social_role' ? row.role_ref : row.occupation_ref) === subject.subject_ref);
  return matches.length === 1 ? matches[0] : null;
}

/** Everything the materializer re-checks for one profile at one canonical G4, or the first failure reason. */
function profileProblem(profile, g4Id) {
  const payload = profile.payload;
  if (!ROLES.has(profile.role_ref) || !OCCUPATIONS.has(profile.occupation_ref)) return 'role or occupation not approved in the actor catalog';
  const clothing = byRef(payload.clothing_profile_ref);
  if (!clothing?.payload.allowed_role_refs.includes(profile.role_ref)
    || !clothing.payload.allowed_occupation_refs.includes(profile.occupation_ref)) return 'clothing profile does not allow the pair';
  const sexes = (payload.actor_applicability?.sex_category ?? ['male', 'female']).map((id) => id.split('_').at(-1));
  for (const sex of sexes) {
    for (const season of ['summer', 'spring', 'autumn', 'winter']) {
      const variants = clothing.payload.variants.filter((variant) => variant.sex_categories.includes(sex) && variant.seasons.includes(season));
      if (variants.length === 0) return `no clothing variant for ${sex} ${season}`;
    }
  }
  const regional = payload.regional_context_refs.map((ref) => contexts.find((row) => row.id === ref.id && row.version === ref.version));
  const ok = regional.some((row) => row?.status === 'approved' && row.payload.allowed_role_refs.includes(profile.role_ref)
    && row.payload.allowed_occupation_refs.includes(profile.occupation_ref)
    && row.payload.applicability.some((entry) => entry.g4_ref.id === g4Id && entry.generation_template_ref == null
      && entry.canonical_g5_ref == null));
  if (!ok) return 'no regional context applies to the canonical G4';
  if (!byRef(payload.activity_profile_ref) || !byRef(payload.body_profile_ref) || !byRef(payload.routine_profile_ref)) return 'activity, body or routine row missing';
  if (!payload.runtime_profile_refs.every((ref) => byRef(ref))) return 'runtime_profile_refs point to a missing row';
  return null;
}

test('every slice place after the start has a composition group whose subject resolves to a materializable approved profile', () => {
  for (const name of SLICE) {
    const site = `${SITE}${name}`;
    const pf = placeFamily.get(site);
    assert.ok(pf, `${name}: primary place family`);
    const groups = compositions.get(pf).population_groups.filter((group) => group.min_count >= 1);
    assert.ok(groups.length >= 1, `${name} (${pf}): a group with min_count >= 1`);
    for (const group of groups) {
      assert.equal(group.count_weights.length, group.max_count - group.min_count + 1, `${group.group_id}: count_weights length`);
      for (const subject of group.weighted_subjects) {
        const profile = resolveSubject(subject);
        assert.ok(profile, `${group.group_id}: profile for ${subject.subject_ref}`);
        assert.equal(profileProblem(profile, g4Of(site)), null, `${name} ${subject.subject_ref} -> ${profile.id}@${profile.version}`);
        assert.ok(routines.some((row) => row.scope_ref === pf && row.subject_kind === subject.subject_kind
          && row.subject_ref === subject.subject_ref), `${name}: D-1 routine of ${subject.subject_ref} on ${pf}`);
      }
    }
    const materializable = groups.flatMap((group) => group.weighted_subjects).some((subject) => {
      const profile = resolveSubject(subject);
      return profile && profileProblem(profile, g4Of(site)) === null;
    });
    assert.ok(materializable, `${name}: at least one materializable person`);
  }
});

test('the start place family may be empty, the generated place after Vikhtuy locality is never empty', () => {
  const g4 = pack('spatial_v3_g4_npc_composition_bindings').find((row) => row.g4_id === `${G4_PREFIX}vikhtuy_locality`);
  assert.ok(g4.min_count >= 1);
  assert.equal(g4.payload.count_weights.length, g4.max_count - g4.min_count + 1);
  assert.ok(g4.payload.weighted_profile_refs.every((entry) => byRef(entry.profile_ref)?.profile_kind === 'npc_binding'));
});

test('a place family threshold never leaves a presence rule for the same subject (one owner)', () => {
  const rules = wave('presence_rules');
  for (const composition of compositions.values()) {
    for (const group of composition.population_groups) {
      for (const subject of group.weighted_subjects) {
        assert.ok(!rules.some((rule) => rule.scope_ref === composition.place_family_id && rule.subject_kind === subject.subject_kind
          && rule.subject_ref === subject.subject_ref), `${group.group_id}: presence rule duplicates composition`);
      }
    }
  }
});

test('new people profiles carry one sex from the game-base applicability and use only existing approved rows', () => {
  const expected = { m2c_npc_ferryman_v1: 'male', m2c_npc_householder_v1: 'male', m2c_npc_household_mistress_v1: 'female' };
  for (const [id, sex] of Object.entries(expected)) {
    const row = bindings.find((entry) => entry.id === id);
    assert.deepEqual(row.payload.actor_applicability.sex_category, [`nov_1200_1250_sex_category_${sex}`], id);
    assert.ok(row.payload.actor_applicability.source_refs.length >= 2, id);
    assert.ok(row.payload.clothing_variant_requirements.every((variant) => variant.sex_categories.every((category) => category === sex)), id);
    assert.equal(row.payload.actor_profile_rule_ref, id);
  }
  assert.equal(bindings.find((entry) => entry.id === 'm2c_npc_fisher_v1').version, 3);
  assert.equal(bindings.find((entry) => entry.id === 'm2c_npc_household_servant_v1').version, 3);
});
