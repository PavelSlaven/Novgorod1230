import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadWorldKnowledgeAuthoringInput } from '../src/world-knowledge-authoring-loader.js';
import { validateCategoryCartography, validatePlaceFirstCartography } from '../src/category-cartography.js';

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

test('place-first need map validates open composition and support, not readiness or presence', async () => {
  const cartography = await json(new URL('place-first-cartography.json', AUTHORING));
  const pack = await loadWorldKnowledgeAuthoringInput(fileURLToPath(AUTHORING));
  assert.deepEqual(validatePlaceFirstCartography({ cartography, pack }), []);
  const expanded = structuredClone(cartography);
  expanded.environment_families.push({
    ...structuredClone(expanded.environment_families[0]),
    id: 'unseen-environment-combination',
    composes_with: [expanded.environment_families[0].id]
  });
  assert.deepEqual(validatePlaceFirstCartography({ cartography: expanded, pack }), []);
  const unsupported = structuredClone(cartography);
  unsupported.environment_families[0].facets[0].coverage = 'supported';
  unsupported.environment_families[0].facets[0].claim_refs = [];
  assert.ok(validatePlaceFirstCartography({ cartography: unsupported, pack })
    .some(error => error.startsWith('PLACE_CARTOGRAPHY_SUPPORT_MISSING:')));
  unsupported.environment_families[0].facets[0].claim_refs = ['claim:nonexistent'];
  unsupported.environment_families[0].composes_with = ['nonexistent-environment'];
  assert.ok(validatePlaceFirstCartography({ cartography: unsupported, pack })
    .includes('PLACE_CARTOGRAPHY_CLAIM_UNMAPPED:claim:nonexistent'));
  assert.ok(validatePlaceFirstCartography({ cartography: unsupported, pack })
    .includes('PLACE_CARTOGRAPHY_COMPOSITION_UNMAPPED:nonexistent-environment'));
});

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
  const danglingSupport = structuredClone(cartography);
  danglingSupport.missing_families[0].supporting_claim_refs = ['claim:missing-support'];
  assert.ok(validateCategoryCartography({ cartography: danglingSupport, pack, locations, materializationProfiles, sourceClaimsByPath })
    .includes('CARTOGRAPHY_MISSING_FAMILY_SUPPORTING_CLAIM_REF_UNMAPPED:claim:missing-support'));
  danglingSupport.missing_families[0].supporting_claim_refs = 'claim:missing-support';
  assert.ok(validateCategoryCartography({ cartography: danglingSupport, pack, locations, materializationProfiles, sourceClaimsByPath })
    .includes('CARTOGRAPHY_MISSING_FAMILY_SUPPORTING_CLAIMS_INVALID'));
  const incompleteNeeds = structuredClone(cartography);
  const domain = pack.manifest.domains[0];
  incompleteNeeds.gameplay_need_cartography.domain_subdomain_dimensions =
    incompleteNeeds.gameplay_need_cartography.domain_subdomain_dimensions.filter(item => item.domain !== domain);
  assert.ok(validateCategoryCartography({ cartography: incompleteNeeds, pack, locations, materializationProfiles, sourceClaimsByPath })
    .includes(`CARTOGRAPHY_GAMEPLAY_DOMAIN_UNMAPPED:${domain}`));
  const missingSemantics = structuredClone(cartography);
  for (const family of missingSemantics.families) {
    delete family.location_applicability;
    delete family.applicability;
    delete family.coverage;
  }
  assert.ok(validateCategoryCartography({ cartography: missingSemantics, pack, locations, materializationProfiles, sourceClaimsByPath })
    .some(error => error.startsWith('CARTOGRAPHY_CATEGORY_FAMILY_INVALID:')));
  const duplicateFamily = structuredClone(cartography);
  duplicateFamily.families.push(duplicateFamily.families[0]);
  assert.ok(validateCategoryCartography({ cartography: duplicateFamily, pack, locations, materializationProfiles, sourceClaimsByPath })
    .includes('CARTOGRAPHY_CATEGORY_FAMILY_DUPLICATE'));
  const incompleteFamilies = structuredClone(cartography);
  const removedRef = pack.claims[0].claim_ref;
  for (const family of incompleteFamilies.families) family.claim_refs = family.claim_refs.filter(ref => ref !== removedRef);
  assert.ok(validateCategoryCartography({ cartography: incompleteFamilies, pack, locations, materializationProfiles, sourceClaimsByPath })
    .includes('CARTOGRAPHY_CATEGORY_CLAIM_COVERAGE_MISMATCH'));
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
