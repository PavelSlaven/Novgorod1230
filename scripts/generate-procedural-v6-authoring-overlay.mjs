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
const LEDGER_REQUIRED_CLAIMS = new Set([
  'claim:white-willow-depends-on-moist-lit-riparian-habitat',
  'claim:medieval-novgorod-fishing-attests-major-occupation-food-context'
]);
const REVIEW_OVERRIDES = Object.freeze({
  'claim:final-nature-freeze-thaw-can-break-bank-soil-and-increase-erosion-vulnerability':
    'verification/final-nature-gap-closure-v1.md#Promotion reconciliation',
  'claim:final-nature-riparian-vegetation-and-organic-debris-can-slow-flow-and-dissipate-energy':
    'verification/final-nature-gap-closure-v1.md#Promotion reconciliation',
  'claim:final-nature-slower-riparian-flow-can-permit-sediment-deposition':
    'verification/final-nature-gap-closure-v1.md#Promotion reconciliation'
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
const REVIEWED_CANDIDATE_COMMIT =
  'e5f6abad33d1bf54cf71622434afc3f08dfad0bf';
const REVIEWED_OVERLAY_DIGEST =
  'ce72077addc4392426a346f575fe5c01b5a0b8c37b0518af1814ef3020797b03';
const REVIEWED_DRYING_CANDIDATE_DIGEST =
  '0bfe111d4cd73e480a88c11639b3a45dc785bad2b83040aa49a8a95955cd31d5';
const FINAL_AUDIT_SUBJECT_COMMIT =
  '6624b1d32cd1503dc2cf5d8d72b6c8af95de5adb';
const FINAL_AUDIT_OVERLAY_DIGEST =
  '52702c0010adc3e3235fd6a6417a10b28f7627d428e65f9dd48e74c3fb19cda3';
const FINAL_AUDIT_REQUEST_DIGEST =
  '89ae5f2030961c85e8e12f3b220052db04e5b95e3c7af45ac7c6076136453325';
const FINAL_AUDIT_CANDIDATE_DIGESTS = Object.freeze({
  novgorod_natural_shore_v3:
    '3a8a1b71b22d139f3df7e9c133bd46754ff1038d23c54a06b57f4582111e8abc',
  novgorod_inland_fishing_worksite_v3:
    '049e5ecce5310d7f3d85874e9e1bd919f2be723eb681e9f67d8a2d4be957235c'
});
const FAMILY_SPECS = Object.freeze([
  { candidate_id: 'novgorod_natural_shore_v3', family: 'natural_shore',
    scene_template_id: 'trace_ld_v1_tpl_wreck_shore',
    g5_id: 'trace_ld_v1_g5_wreck_shore',
    authority: 'evidence_bounded_natural_profile', confidence: 'medium',
    requirements: { water_adjacent: true, mandatory_context_refs: [] },
    allowed_semantics: ['generic_substrate', 'generic_riparian_ecology',
      'water_adjacency'], forbidden_implications: ['landing', 'access', 'safety',
      'stock', 'wreck', 'local_taxon_assertion'],
    materialization_limits: ['no_local_willow', 'no_local_tree',
      'no_local_stand', 'no_local_stock', 'no_local_entity', 'no_outcome'],
    claim_refs: [
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

export async function generateProceduralV6AuthoringOverlay(rootDir,
  { verificationLedger: injectedLedger } = {}) {
  const root = resolve(rootDir);
  const [manifest, scenes, nodes, parents, slots, perClaim, loadedLedger,
    ...claimPacks] =
    await Promise.all([
      json(resolve(root, SPATIAL_ROOT, 'manifest.json')),
      json(resolve(root, SPATIAL_ROOT, 'datasets/spatial_v3_scene_templates.json')),
      json(resolve(root, SPATIAL_ROOT, 'datasets/spatial_v3_nodes.json')),
      json(resolve(root, SPATIAL_ROOT, 'datasets/spatial_v3_node_parents.json')),
      json(resolve(root, SPATIAL_ROOT, 'datasets/spatial_v3_g6_template_slots.json')),
      json(resolve(root, 'data/world-catalogs/novgorod/world-knowledge/verification/base-per-claim-v2.json')),
      json(resolve(root, `${WORLD_ROOT}/verification-ledger.json`)),
      ...Object.values(CLAIM_FILES).map((file) =>
        json(resolve(root, WORLD_ROOT, file)))
    ]);
  if (manifest.status !== 'approved') throw new Error(
    'PROCEDURAL_V6_SPATIAL_CLOSURE_NOT_APPROVED');
  const packs = Object.fromEntries(Object.keys(CLAIM_FILES).map((key, index) =>
    [key, claimPacks[index]]));
  const reviewByClaim = indexReviews(perClaim);
  const verificationByClaim = indexVerifications(injectedLedger ?? loadedLedger);
  const worldPin = { world_revision_id: manifest.world_revision_id,
    world_catalog_digest: manifest.catalog_digest };
  const candidates = [];
  const candidateDataGaps = [];
  for (const spec of FAMILY_SPECS) {
    const scene = exact(scenes, spec.scene_template_id);
    const g5 = exact(nodes, spec.g5_id);
    const parent = exact(parents, spec.g5_id, 'child_id');
    let evidenceClaims;
    try {
      evidenceClaims = spec.claim_refs.map(([packId, ref]) =>
        claimProjection(packs[packId], ref, packId, reviewByClaim,
          verificationByClaim));
    } catch (error) {
      if (error.code !== 'PROCEDURAL_VERIFICATION_LEDGER_GAP') throw error;
      candidateDataGaps.push({ candidate_id: spec.candidate_id,
        code: error.code, claim_ref: error.claim_ref });
      continue;
    }
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
      ...(spec.materialization_limits ? { materialization_limits:
        [...spec.materialization_limits] } : {}),
      ...(spec.variants ? { variants: structuredClone(spec.variants) } : {}),
      global_claim_refs: evidenceClaims.filter(({ applicability }) =>
        applicability.context_scope === 'universal').map(({ claim_ref: ref }) => ref),
      regional_claim_refs: evidenceClaims.filter(({ applicability }) =>
        applicability.places?.some(({ place_ref: ref }) =>
          ref === 'region_novgorod_land')).map(({ claim_ref: ref }) => ref),
      evidence_claims: evidenceClaims,
      data_gap_codes: [...spec.data_gap_codes]
    };
    const validated = validateProceduralSceneAuthoringCandidate({ candidate,
      world_pin: worldPin });
    candidates.push({ ...validated, candidate_digest: digest(validated),
      authoring_approval: spec.family === 'drying_storage_workspace'
        ? 'approved_row_scoped' : 'pending_independent_review' });
  }
  for (const candidate of candidates) for (const claim of
    candidate.evidence_claims) await validateVerificationReviewRef(root,
    claim.review_ref);
  const payload = {
    schema: 'rus.procedural_scene_authoring_overlay.v3', revision: 3,
    overlay_id: 'novgorod_procedural_v6_route_free_overlay_001',
    status: 'partially_authoring_approved', import_authorized: false,
    activation_authorized: false, activation_request: null,
    compatible_world_pin: worldPin, candidates,
    candidate_data_gaps: candidateDataGaps
  };
  return { ...payload, overlay_digest: digest(payload) };
}

export function buildProceduralV6ApprovalRequest(overlay, dryingAttestation =
  buildProceduralV6DryingAttestation(overlay)) {
  const payload = {
    schema: 'rus.procedural_scene_overlay_approval_request.v1',
    overlay_id: overlay.overlay_id, overlay_digest: overlay.overlay_digest,
    decision_requested: 'review_route_free_authoring_candidates',
    authoring_approval: 'pending_independent_review',
    import_authorized: false, activation_authorized: false,
    activation_request: null,
    rows: overlay.candidates.filter(({ authoring_approval: status }) =>
      status === 'pending_independent_review').map((candidate) => ({
      candidate_id: candidate.candidate_id, version: candidate.version,
      spatial_closure_ref: candidate.spatial_closure_ref,
      claims: candidate.evidence_claims.map(({ claim_ref: claimRef,
        source_id: sourceId, evidence_refs: evidenceRefs,
        source_locator: sourceLocator, use_scope: useScope,
        review_ref: reviewRef, limits }) => ({ claim_ref: claimRef,
        source_id: sourceId, evidence_refs: evidenceRefs,
        source_locator: sourceLocator, use_scope: useScope,
        review_ref: reviewRef, limits }))
    })),
    approved_rows: [{ candidate_ref: dryingAttestation.candidate_ref,
      attestation_path:
        'data/world-catalogs/novgorod/procedural-scene-v2/drying-storage-workspace-approval-attestation.json',
      attestation_digest: dryingAttestation.attestation_digest }]
  };
  return { ...payload, request_digest: digest(payload) };
}

export function buildProceduralV6DryingAttestation(overlay) {
  const candidate = overlay.candidates.find(({ candidate_id: id }) =>
    id === 'novgorod_drying_storage_workspace_v3');
  if (!candidate) throw new Error('PROCEDURAL_DRYING_CANDIDATE_MISSING');
  const payload = {
    schema: 'rus.procedural_scene_row_approval_attestation.v1',
    candidate_ref: `${candidate.candidate_id}@${candidate.version}`,
    candidate_source_commit_sha: REVIEWED_CANDIDATE_COMMIT,
    candidate_path:
      'data/world-catalogs/novgorod/procedural-scene-v2/authoring-overlay.json',
    candidate_digest: REVIEWED_DRYING_CANDIDATE_DIGEST,
    reviewed_overlay_digest: REVIEWED_OVERLAY_DIGEST,
    rebound_candidate_digest: candidate.candidate_digest,
    overlay_digest: overlay.overlay_digest,
    authoring_approved: true, import_authorized: false,
    activation_authorized: false, activation_request: null,
    approved_by: 'independent_reaudit',
    approval_basis: 're_audit_of_e5f6abad_route_free_candidate',
    authority: 'editorial_reconstruction', confidence: 'medium',
    data_gap_codes: [...FUNCTIONAL_GAPS],
    forbidden_implications: [...candidate.forbidden_implications],
    variants: structuredClone(candidate.variants),
    research_report_refs: [
      'data/world-catalogs/novgorod/world-knowledge/research/procedural-scene-family-authoring-v1.md#5. Семейство: старая сушильня / ремесленно-складское место',
      'data/world-catalogs/novgorod/world-knowledge/research/procedural-scene-family-authoring-v1.md#7. Human approval checklist',
      'data/world-catalogs/novgorod/world-knowledge/research/procedural-scene-family-authoring-v1.md#8. Research verdict'
    ], approval_scope: 'authoring_row_only'
  };
  return { ...payload, attestation_digest: digest(payload) };
}

export function buildProceduralV6FinalRowAttestation(overlay, approvalRequest,
  candidateId) {
  const expectedCandidateDigest = FINAL_AUDIT_CANDIDATE_DIGESTS[candidateId];
  const candidate = overlay.candidates.find(({ candidate_id: id }) =>
    id === candidateId);
  if (!candidate || !expectedCandidateDigest
      || overlay.overlay_digest !== FINAL_AUDIT_OVERLAY_DIGEST
      || approvalRequest.request_digest !== FINAL_AUDIT_REQUEST_DIGEST
      || candidate.candidate_digest !== expectedCandidateDigest) throw new Error(
    'PROCEDURAL_FINAL_AUDIT_SUBJECT_MISMATCH');
  const payload = {
    schema: 'rus.procedural_scene_row_approval_attestation.v1',
    candidate_ref: `${candidate.candidate_id}@${candidate.version}`,
    subject_commit_sha: FINAL_AUDIT_SUBJECT_COMMIT,
    candidate_path:
      'data/world-catalogs/novgorod/procedural-scene-v2/authoring-overlay.json',
    overlay_digest: FINAL_AUDIT_OVERLAY_DIGEST,
    approval_request_digest: FINAL_AUDIT_REQUEST_DIGEST,
    candidate_digest: expectedCandidateDigest,
    authoring_approved: true, import_authorized: false,
    activation_authorized: false, activation_request: null,
    approved_by: 'independent_final_audit',
    approval_scope: 'authoring_row_only',
    verification: candidate.evidence_claims.map(({ claim_ref: claimRef,
      verification_ref: verificationRef, review_ref: reviewRef, limits }) => ({
      claim_ref: claimRef, verification_ref: verificationRef,
      review_ref: reviewRef, limits })),
    ...(candidate.family === 'natural_shore' ? {
      forbidden_implications: [...candidate.forbidden_implications],
      materialization_limits: [...candidate.materialization_limits]
    } : { data_gap_codes: [...candidate.data_gap_codes],
      forbidden_implications: [...candidate.forbidden_implications] })
  };
  return { ...payload, attestation_digest: digest(payload) };
}

function claimProjection(pack, claimRef, packId, reviewByClaim,
  verificationByClaim) {
  const claim = exact(pack.claims, claimRef, 'claim_ref');
  if (claim.review_status !== 'approved') throw new Error(
    `PROCEDURAL_SOURCE_CLAIM_NOT_APPROVED:${claimRef}`);
  const evidence = claim.evidence_refs.map((ref) => exact(pack.evidence, ref,
    'evidence_ref'));
  const ledger = verificationByClaim.get(claimRef);
  if (LEDGER_REQUIRED_CLAIMS.has(claimRef) && !ledger) {
    throw Object.assign(new Error(`Verification ledger row missing: ${claimRef}`),
      { code: 'PROCEDURAL_VERIFICATION_LEDGER_GAP', claim_ref: claimRef });
  }
  const review = ledger ?? reviewByClaim.get(claimRef);
  const reviewRef = review?.review_ref ?? REVIEW_OVERRIDES[claimRef];
  if (!reviewRef) throw Object.assign(new Error(
    `Verification review missing: ${claimRef}`), {
    code: 'PROCEDURAL_VERIFICATION_LEDGER_GAP', claim_ref: claimRef });
  return { claim_ref: claimRef,
    source_id: `${packId}:${CLAIM_FILES[packId]}`,
    source_locator: CLAIM_LOCATORS[claimRef] ?? null,
    use_scope: claimRef ===
      'claim:white-willow-depends-on-moist-lit-riparian-habitat'
      ? 'ecology_only' : 'evidence_bound',
    ...(claimRef === 'claim:white-willow-depends-on-moist-lit-riparian-habitat'
      ? { local_presence_authorized: false,
        resource_materialization_authorized: false } : {}),
    review_status: claim.review_status,
    evidence_refs: evidence.map(({ evidence_ref: ref }) => ref).sort(),
    source_refs: [...new Set(evidence.map(({ source_ref: ref }) => ref))].sort(),
    applicability: structuredClone(claim.applicability),
    qualifiers: structuredClone(claim.qualifiers),
    verification_ref: ledger?.verification_ref ?? null,
    review_ref: reviewRef,
    limits: review?.limits ?? { source_claim_object:
      structuredClone(claim.object), knowledge_access:
      structuredClone(claim.knowledge_access), hard_exclusion:
      structuredClone(claim.hard_exclusion) } };
}
function indexVerifications(value) {
  return new Map((value?.verifications ?? []).filter(({ verdict }) =>
    verdict === 'APPROVE').map((row) => [row.claim_ref, row]));
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

export async function validateVerificationReviewRef(rootDir, reviewRef) {
  const [relativePath, heading] = String(reviewRef ?? '').split('#');
  if (!relativePath) throw Object.assign(new Error('Review path missing.'), {
    code: 'PROCEDURAL_VERIFICATION_REVIEW_REF_INVALID', review_ref: reviewRef });
  let markdown;
  try {
    markdown = await readFile(resolve(rootDir,
      'data/world-catalogs/novgorod/world-knowledge', relativePath), 'utf8');
  } catch {
    throw Object.assign(new Error('Review path missing.'), {
      code: 'PROCEDURAL_VERIFICATION_REVIEW_REF_INVALID', review_ref: reviewRef });
  }
  if (heading) {
    const headings = markdown.match(/^#{1,6}\s+.+$/gmu) ?? [];
    const found = headings.some((line) => {
      const text = line.replace(/^#{1,6}\s+/u, '').trim();
      return text === heading || slug(text) === heading;
    });
    if (!found) throw Object.assign(new Error('Review heading missing.'), {
      code: 'PROCEDURAL_VERIFICATION_REVIEW_REF_INVALID', review_ref: reviewRef });
  }
  return true;
}
function slug(value) { return value.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '')
  .trim().replace(/\s/gu, '-'); }

async function main(argv) {
  const root = resolve(argv[0] ?? '.');
  const directory = resolve(root,
    'data/world-catalogs/novgorod/procedural-scene-v2');
  const overlay = await generateProceduralV6AuthoringOverlay(root);
  const attestation = buildProceduralV6DryingAttestation(overlay);
  const request = buildProceduralV6ApprovalRequest(overlay, attestation);
  const naturalAttestation = buildProceduralV6FinalRowAttestation(overlay,
    request, 'novgorod_natural_shore_v3');
  const fishingAttestation = buildProceduralV6FinalRowAttestation(overlay,
    request, 'novgorod_inland_fishing_worksite_v3');
  const outputs = [[resolve(directory, 'authoring-overlay.json'), overlay],
    [resolve(directory, 'approval-request.json'), request],
    [resolve(directory, 'drying-storage-workspace-approval-attestation.json'),
      attestation],
    [resolve(directory, 'natural-shore-approval-attestation.json'),
      naturalAttestation],
    [resolve(directory, 'inland-fishing-worksite-approval-attestation.json'),
      fishingAttestation]];
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
