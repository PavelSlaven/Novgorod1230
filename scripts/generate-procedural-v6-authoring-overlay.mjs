import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateProceduralSceneAuthoringCandidate } from '@rus/materialization';

const WORLD_ROOT = 'data/world-catalogs/novgorod/world-knowledge/production-v1';
const SPATIAL_ROOT = 'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v6';
const CLAIM_FILES = Object.freeze({
  nature: 'final-nature-gap-closure-v1.json',
  biology: 'environment-biology.json', ecology: 'environment-ecology.json',
  population: 'historical-population.json'
});
const FUNCTIONAL_GAPS = Object.freeze(['FUNCTIONAL_TOOL_MAPPING_MISSING',
  'FUNCTIONAL_STORAGE_MAPPING_MISSING',
  'FUNCTIONAL_WORK_MATERIAL_MAPPING_MISSING',
  'FUNCTIONAL_CONTAINER_MAPPING_MISSING']);
const CLAIM_LOCATORS = Object.freeze({
  'claim:final-nature-freeze-thaw-can-break-bank-soil-and-increase-erosion-vulnerability': 35,
  'claim:final-nature-riparian-vegetation-and-organic-debris-can-slow-flow-and-dissipate-energy': 37,
  'claim:final-nature-slower-riparian-flow-can-permit-sediment-deposition': 38,
  'claim:white-willow-depends-on-moist-lit-riparian-habitat': 44,
  'claim:medieval-novgorod-fishing-attests-major-occupation-food-context': 56,
  'claim:population-net-work': 1649, 'claim:population-boat-work': 1689,
  'claim:population-fish-dried-form': 1769,
  'claim:population-fishing-workspace': 1850,
  'claim:population-drying-workspace': 1890,
  'claim:population-household-storage': 1930,
  'claim:population-storage-vessels': 1970
});
const FAMILY_SPECS = Object.freeze([
  { candidate_id: 'novgorod_natural_shore_v3', family: 'natural_shore',
    scene_template_id: 'trace_ld_v1_tpl_wreck_shore',
    g5_id: 'trace_ld_v1_g5_wreck_shore',
    authority: 'evidence_bounded_natural_profile', confidence: 'medium',
    requirements: { water_adjacent: true, mandatory_context_refs: [] },
    allowed_semantics: ['generic_substrate', 'generic_riparian_ecology',
      'water_adjacency'], forbidden_implications: ['landing', 'access', 'safety',
      'stock', 'wreck'], claim_refs: [
      ['nature', 'claim:final-nature-freeze-thaw-can-break-bank-soil-and-increase-erosion-vulnerability'],
      ['nature', 'claim:final-nature-riparian-vegetation-and-organic-debris-can-slow-flow-and-dissipate-energy'],
      ['nature', 'claim:final-nature-slower-riparian-flow-can-permit-sediment-deposition'],
      ['biology', 'claim:white-willow-depends-on-moist-lit-riparian-habitat']
    ], data_gap_codes: [] },
  { candidate_id: 'novgorod_inland_fishing_worksite_v3',
    family: 'inland_fishing_worksite',
    scene_template_id: 'trace_ld_v1_tpl_fishing_camp',
    g5_id: 'trace_ld_v1_g5_fishing_camp',
    authority: 'historical_compatibility_profile', confidence: 'medium',
    requirements: { water_adjacent: true, mandatory_context_refs:
      ['claim:medieval-novgorod-fishing-attests-major-occupation-food-context'] },
    allowed_semantics: ['water_adjacency', 'fishing_land_use_compatibility',
      'workspace_compatibility'], forbidden_implications: ['station', 'storage',
      'catch', 'route'], claim_refs: [
      ['ecology', 'claim:medieval-novgorod-fishing-attests-major-occupation-food-context'],
      ['population', 'claim:population-net-work'],
      ['population', 'claim:population-boat-work'],
      ['population', 'claim:population-fish-dried-form'],
      ['population', 'claim:population-fishing-workspace']
    ], data_gap_codes: FUNCTIONAL_GAPS },
  { candidate_id: 'novgorod_drying_storage_workspace_v3',
    family: 'drying_storage_workspace',
    scene_template_id: 'trace_ld_v1_tpl_old_drying_shed',
    g5_id: 'trace_ld_v1_g5_old_drying_shed',
    authority: 'editorial_reconstruction', confidence: 'medium',
    requirements: { water_adjacent: false, mandatory_context_refs: [] },
    allowed_semantics: ['workspace_compatibility', 'drying_compatibility',
      'storage_compatibility'], forbidden_implications: ['water', 'heat', 'fire',
      'fuel', 'container', 'tool', 'material', 'npc'],
    variants: [{ id: 'dormant', process_owned_requirements: [] },
      { id: 'active', process_owned_requirements:
        ['material_ref', 'tool_ref'] }], claim_refs: [
      ['population', 'claim:population-fish-dried-form'],
      ['population', 'claim:population-drying-workspace'],
      ['population', 'claim:population-household-storage'],
      ['population', 'claim:population-storage-vessels']
    ], data_gap_codes: FUNCTIONAL_GAPS }
]);

export async function generateProceduralV6AuthoringOverlay(rootDir) {
  const root = resolve(rootDir);
  const [manifest, scenes, nodes, parents, slots, perClaim, ...claimPacks] =
    await Promise.all([
      json(resolve(root, SPATIAL_ROOT, 'manifest.json')),
      json(resolve(root, SPATIAL_ROOT, 'datasets/spatial_v3_scene_templates.json')),
      json(resolve(root, SPATIAL_ROOT, 'datasets/spatial_v3_nodes.json')),
      json(resolve(root, SPATIAL_ROOT, 'datasets/spatial_v3_node_parents.json')),
      json(resolve(root, SPATIAL_ROOT, 'datasets/spatial_v3_g6_template_slots.json')),
      json(resolve(root, 'data/world-catalogs/novgorod/world-knowledge/verification/base-per-claim-v2.json')),
      ...Object.values(CLAIM_FILES).map((file) =>
        json(resolve(root, WORLD_ROOT, file)))
    ]);
  if (manifest.status !== 'approved') throw new Error(
    'PROCEDURAL_V6_SPATIAL_CLOSURE_NOT_APPROVED');
  const packs = Object.fromEntries(Object.keys(CLAIM_FILES).map((key, index) =>
    [key, claimPacks[index]]));
  const reviewByClaim = indexReviews(perClaim);
  const worldPin = { world_revision_id: manifest.world_revision_id,
    world_catalog_digest: manifest.catalog_digest };
  const candidates = FAMILY_SPECS.map((spec) => {
    const scene = exact(scenes, spec.scene_template_id);
    const g5 = exact(nodes, spec.g5_id);
    const parent = exact(parents, spec.g5_id, 'child_id');
    const evidenceClaims = spec.claim_refs.map(([packId, ref]) =>
      claimProjection(packs[packId], ref, packId, reviewByClaim));
    const candidate = {
      schema: 'rus.procedural_scene_authoring_candidate.v1',
      candidate_id: spec.candidate_id, version: 1,
      status: 'candidate_approval_pending', family: spec.family,
      authority: spec.authority, confidence: spec.confidence,
      region_id: 'region_novgorod_land', route_required: false,
      spatial_closure_ref: {
        world_revision_id: manifest.world_revision_id,
        scene_template_id: scene.id, scene_template_version: scene.version,
        scene_template_digest: scene.canonical_digest,
        g5_id: g5.id, g5_version: g5.version, g5_digest: g5.canonical_digest,
        parent_id: parent.parent_id, parent_version: parent.parent_version,
        g6_slots: slots.filter(({ scene_template_id: id,
          scene_template_version: version }) => id === scene.id
            && version === scene.version).map(({ scene_slot_key: slot,
          physical_class_id: physicalClass, primary_scene_role_id: role,
          vertical_context_id: vertical, overhead_cover_id: cover }) => ({
          scene_slot_key: slot, physical_class_id: physicalClass,
          primary_scene_role_id: role, vertical_context_id: vertical,
          overhead_cover_id: cover })).sort((a, b) =>
          a.scene_slot_key.localeCompare(b.scene_slot_key))
      },
      allowed_semantics: [...spec.allowed_semantics],
      requirements: structuredClone(spec.requirements),
      forbidden_implications: [...spec.forbidden_implications],
      ...(spec.variants ? { variants: structuredClone(spec.variants) } : {}),
      global_claim_refs: evidenceClaims.filter(({ applicability }) =>
        applicability.context_scope === 'universal').map(({ claim_ref: ref }) => ref),
      regional_claim_refs: evidenceClaims.filter(({ applicability }) =>
        applicability.places?.some(({ place_ref: ref }) =>
          ref === 'region_novgorod_land')).map(({ claim_ref: ref }) => ref),
      evidence_claims: evidenceClaims,
      data_gap_codes: [...spec.data_gap_codes]
    };
    return validateProceduralSceneAuthoringCandidate({ candidate,
      world_pin: worldPin });
  });
  const payload = {
    schema: 'rus.procedural_scene_authoring_overlay.v3', revision: 3,
    overlay_id: 'novgorod_procedural_v6_route_free_overlay_001',
    status: 'candidate_approval_pending', import_authorized: false,
    activation_authorized: false, activation_request: null,
    compatible_world_pin: worldPin, candidates
  };
  return { ...payload, overlay_digest: digest(payload) };
}

export function buildProceduralV6ApprovalRequest(overlay) {
  const payload = {
    schema: 'rus.procedural_scene_overlay_approval_request.v1',
    overlay_id: overlay.overlay_id, overlay_digest: overlay.overlay_digest,
    decision_requested: 'review_route_free_authoring_candidates',
    authoring_approval: 'pending_independent_review',
    import_authorized: false, activation_authorized: false,
    activation_request: null,
    rows: overlay.candidates.map((candidate) => ({
      candidate_id: candidate.candidate_id, version: candidate.version,
      spatial_closure_ref: candidate.spatial_closure_ref,
      claims: candidate.evidence_claims.map(({ claim_ref: claimRef,
        source_id: sourceId, evidence_refs: evidenceRefs,
        source_locator: sourceLocator, use_scope: useScope,
        review_ref: reviewRef, limits }) => ({ claim_ref: claimRef,
        source_id: sourceId, evidence_refs: evidenceRefs,
        source_locator: sourceLocator, use_scope: useScope,
        review_ref: reviewRef, limits }))
    }))
  };
  return { ...payload, request_digest: digest(payload) };
}

function claimProjection(pack, claimRef, packId, reviewByClaim) {
  const claim = exact(pack.claims, claimRef, 'claim_ref');
  if (claim.review_status !== 'approved') throw new Error(
    `PROCEDURAL_SOURCE_CLAIM_NOT_APPROVED:${claimRef}`);
  const evidence = claim.evidence_refs.map((ref) => exact(pack.evidence, ref,
    'evidence_ref'));
  const review = reviewByClaim.get(claimRef);
  return { claim_ref: claimRef,
    source_id: `${packId}:${CLAIM_FILES[packId]}`,
    source_locator: CLAIM_LOCATORS[claimRef] ?? null,
    use_scope: claimRef ===
      'claim:white-willow-depends-on-moist-lit-riparian-habitat'
      ? 'ecology_only' : 'evidence_bound',
    review_status: claim.review_status,
    evidence_refs: evidence.map(({ evidence_ref: ref }) => ref).sort(),
    source_refs: [...new Set(evidence.map(({ source_ref: ref }) => ref))].sort(),
    applicability: structuredClone(claim.applicability),
    qualifiers: structuredClone(claim.qualifiers),
    review_ref: review?.review_ref ??
      `verification/${CLAIM_FILES[packId].replace(/\.json$/u, '.md')}`,
    limits: review?.limits ?? { source_claim_object:
      structuredClone(claim.object), knowledge_access:
      structuredClone(claim.knowledge_access), hard_exclusion:
      structuredClone(claim.hard_exclusion) } };
}
function indexReviews(value) {
  const result = new Map();
  const visit = (node) => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === 'object') {
      if (node.claim_ref && node.verdict === 'APPROVE') result.set(
        node.claim_ref, node);
      Object.values(node).forEach(visit);
    }
  };
  visit(value);
  return result;
}
function exact(rows, id, key = 'id') { const found = rows.filter((row) =>
  row[key] === id); if (found.length !== 1) throw new Error(
  `PROCEDURAL_V6_SOURCE_ROW_INVALID:${key}:${id}`); return found[0]; }
function digest(value) { return createHash('sha256').update(JSON.stringify(value))
  .digest('hex'); }
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }

async function main(argv) {
  const root = resolve(argv[0] ?? '.');
  const directory = resolve(root,
    'data/world-catalogs/novgorod/procedural-scene-v2');
  const overlay = await generateProceduralV6AuthoringOverlay(root);
  const request = buildProceduralV6ApprovalRequest(overlay);
  const outputs = [[resolve(directory, 'authoring-overlay.json'), overlay],
    [resolve(directory, 'approval-request.json'), request]];
  if (argv.includes('--check')) {
    for (const [path, value] of outputs) if (await readFile(path, 'utf8')
      !== `${JSON.stringify(value, null, 2)}\n`) throw new Error(
      'PROCEDURAL_V6_AUTHORING_OVERLAY_STALE');
  } else {
    await mkdir(directory, { recursive: true });
    await Promise.all(outputs.map(([path, value]) => writeFile(path,
      `${JSON.stringify(value, null, 2)}\n`)));
  }
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main(process.argv.slice(2));
}
