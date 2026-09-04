import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadWorldKnowledgeAuthoringInput } from '../src/world-knowledge-authoring-loader.js';
import { validateCategoryCartography } from '../src/category-cartography.js';

const CARTOGRAPHY = new URL('../../../data/world-catalogs/novgorod/world-knowledge/production-v1/category-cartography.json', import.meta.url);
const AUTHORING = new URL('../../../data/world-catalogs/novgorod/world-knowledge/production-v1/authoring.json', import.meta.url);
const TRACE_ROOT = new URL('../../../data/world-catalogs/novgorod/lower-dvina-trace-v1/', import.meta.url);
const ACTIVE_CONSUMER_PATHS = [
  'phase-m7-content/ordinary-materialization-profile.json',
  'phase-m8-content/ordinary-container-contents-profile.json',
  'phase-m9-content/action-production-profile.json',
  'phase-m10-content/local-fire-profile.json',
  'phase-m12-content/spatial-semantic-profile.json',
  'phase-1b-v26/scene-presentation-v2.json'
];

async function json(url) { return JSON.parse(await readFile(url, 'utf8')); }

test('production category cartography covers real profiles, locations, and claims without declaring completeness', async () => {
  const [cartography, pack, locations] = await Promise.all([
    json(CARTOGRAPHY), loadWorldKnowledgeAuthoringInput(fileURLToPath(AUTHORING)),
    json(new URL('phase-0b/location-topology-set.json', TRACE_ROOT))
  ]);
  const descriptor = await json(AUTHORING);
  const sourceClaimsByPath = new Map((await Promise.all(descriptor.includes.map(async (path) => [
    path, (await json(new URL(path, AUTHORING))).claims ?? []
  ]))).filter(([, claims]) => claims.length > 0));
  const materializationProfiles = await Promise.all(ACTIVE_CONSUMER_PATHS.map((path) =>
    json(new URL(path, TRACE_ROOT))));
  assert.deepEqual(cartography.materialization_profile_mappings.map((entry) => entry.source_path)
    .sort(), ACTIVE_CONSUMER_PATHS.map((path) =>
      `data/world-catalogs/novgorod/lower-dvina-trace-v1/${path}`).sort());
  assert.deepEqual(validateCategoryCartography({ cartography, pack, locations, materializationProfiles, sourceClaimsByPath }), []);
  assert.ok(cartography.absent_or_partial_families.length > 0);
  const broken = structuredClone(cartography);
  broken.world_knowledge_profile_mappings.pop();
  broken.families[0].claim_refs = ['claim:missing'];
  broken.location_profile_mappings[0].expected_family_ids = ['missing-family'];
  broken.materialization_profile_mappings.pop();
  sourceClaimsByPath.delete('wild-flora.json');
  const errors = validateCategoryCartography({ cartography: broken, pack, locations, materializationProfiles, sourceClaimsByPath });
  assert.ok(errors.includes('CARTOGRAPHY_PROFILE_UNMAPPED'));
  assert.ok(errors.includes('CARTOGRAPHY_CATEGORY_CLAIM_REF_UNMAPPED:claim:missing'));
  assert.ok(errors.includes('CARTOGRAPHY_EXPECTED_CATEGORY_UNMAPPED:missing-family'));
  assert.ok(errors.includes('CARTOGRAPHY_EVIDENCE_FAMILY_EXTRA_OR_DUPLICATE'));
  assert.ok(errors.some((error) => error.startsWith('CARTOGRAPHY_MATERIALIZATION_PROFILE_UNMAPPED:')));
});
