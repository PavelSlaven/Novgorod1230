import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest, materializeProceduralSceneBaseline } from
  '@rus/materialization';

const PATH = 'data/world-catalogs/novgorod/live-world-runtime-v1/procedural-scene-baselines.json';
const MANIFEST_PATH = 'data/world-catalogs/novgorod/live-world-runtime-v1/manifest.json';

export async function loadProceduralSceneBaselineCatalog({
  rootDir = process.cwd()
} = {}) {
  const [value, manifest] = await Promise.all([PATH, MANIFEST_PATH].map(async (path) =>
    JSON.parse(await readFile(resolve(rootDir, path), 'utf8'))));
  const binding = manifest?.profile_sets?.filter(({ profile_set_id: id }) =>
    id === 'novgorod_procedural_scene_baselines_v1');
  if (value?.schema !== 'rus.procedural_scene_baseline_catalog.v1'
      || value.revision !== 1 || value.status !== 'approved'
      || value.rng_algorithm_id !== 'mulberry32_v1'
      || !Array.isArray(value.profiles) || value.profiles.length < 3
      || binding?.length !== 1 || binding[0].path !== PATH
      || binding[0].status !== 'approved') fail();
  const refs = new Set();
  for (const profile of value.profiles) {
    if (!Array.isArray(profile.location_profile_refs)
        || profile.location_profile_refs.length === 0
        || profile.location_profile_refs.some((ref) => !text(ref) || refs.has(ref))) fail();
    profile.location_profile_refs.forEach((ref) => refs.add(ref));
    materializeProceduralSceneBaseline({ party_id: 'catalog-validation',
      scope_ref: { entity_kind: 'g6', entity_id: profile.profile_id }, profile,
      seed_context: { party_id: 'catalog-validation', profile_id: profile.profile_id,
        scope_ref: { entity_kind: 'g6', entity_id: profile.profile_id },
        rng_algorithm_id: value.rng_algorithm_id } });
  }
  return Object.freeze({ ...structuredClone(value),
    catalog_digest: canonicalDigest(value) });
}

export function resolveProceduralSceneBaselineProfile(catalog, locationRef) {
  const matches = catalog?.profiles?.filter(({ location_profile_refs: refs }) =>
    refs.includes(locationRef)) ?? [];
  if (matches.length !== 1) fail();
  return structuredClone(matches[0]);
}

function text(value) { return typeof value === 'string' && value.trim() === value && value.length > 0; }
function fail() { throw Object.assign(new Error('PROCEDURAL_SCENE_BASELINE_CATALOG_INVALID'),
  { code: 'PROCEDURAL_SCENE_BASELINE_CATALOG_INVALID' }); }
