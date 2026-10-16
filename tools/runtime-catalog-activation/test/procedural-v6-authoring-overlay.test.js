import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateProceduralSceneAuthoringCandidate } from '@rus/materialization';
import { buildProceduralV6ApprovalRequest,
  buildProceduralV6DryingAttestation, buildProceduralV6FinalRowAttestation,
  generateProceduralV6AuthoringOverlay,
  validateVerificationReviewRef } from
  '../../../scripts/generate-procedural-v6-authoring-overlay.mjs';

const root = new URL('../../../', import.meta.url).pathname.replace(/^\/(.:)/u, '$1');

test('route-free candidate and approval request generation is byte-stable', async () => {
  const first = await generateProceduralV6AuthoringOverlay(root);
  const second = await generateProceduralV6AuthoringOverlay(root);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.status, 'partially_authoring_approved');
  assert.equal(first.import_authorized, false);
  assert.equal(first.activation_authorized, false);
  assert.equal(first.activation_request, null);
  assert.equal(first.candidates.length, 3);
  assert.ok(first.candidates.every((candidate) =>
    candidate.route_required === false && !Object.hasOwn(candidate, 'route_ref')
      && !/"(?:quantity|capacity)"\s*:/u.test(JSON.stringify(candidate))));
  const request = buildProceduralV6ApprovalRequest(first);
  assert.equal(request.authoring_approval, 'pending_independent_review');
  assert.equal(request.import_authorized, false);
  assert.equal(request.activation_authorized, false);
  assert.equal(request.rows.length, 2);
  assert.equal(request.approved_rows.length, 1);
  assert.ok(request.rows.every(({ claims }) => claims.length > 0
    && claims.every(({ claim_ref: ref, evidence_refs: evidence }) =>
      ref.startsWith('claim:') && evidence.length > 0)));
});

test('candidate rows use exact v6 closure and approved evidence limits', async () => {
  const overlay = await generateProceduralV6AuthoringOverlay(root);
  assert.ok(overlay.candidates.every(({ spatial_closure_ref: ref }) =>
    ref.world_revision_id === overlay.compatible_world_pin.world_revision_id
      && /^[0-9a-f]{64}$/u.test(ref.scene_template_digest)
      && /^[0-9a-f]{64}$/u.test(ref.g5_digest)
      && ref.g6_slots.length > 0));
  assert.ok(overlay.candidates.flatMap(({ evidence_claims: claims }) => claims)
    .every(({ review_status: status, evidence_refs: evidence,
      source_refs: sources, review_ref: review, limits }) => status === 'approved'
      && evidence.length > 0 && sources.length > 0 && review && limits));
  const natural = overlay.candidates.find(({ family }) =>
    family === 'natural_shore');
  assert.deepEqual(natural.forbidden_implications,
    ['landing', 'access', 'safety', 'stock', 'wreck',
      'local_taxon_assertion']);
  assert.deepEqual(natural.materialization_limits, ['no_local_willow',
    'no_local_tree', 'no_local_stand', 'no_local_stock', 'no_local_entity',
    'no_outcome']);
  assert.ok(natural.evidence_claims.some(({ claim_ref: ref }) =>
    ref === 'claim:white-willow-depends-on-moist-lit-riparian-habitat'));
  assert.deepEqual(natural.evidence_claims.map(({ source_locator: line }) => line),
    [35, 37, 38, 44]);
  assert.equal(natural.evidence_claims[3].use_scope, 'ecology_only');
  assert.equal(natural.evidence_claims[3].local_presence_authorized, false);
  assert.equal(natural.evidence_claims[3].resource_materialization_authorized,
    false);
  const fishing = overlay.candidates.find(({ family }) =>
    family === 'inland_fishing_worksite');
  assert.deepEqual(fishing.forbidden_implications,
    ['station', 'storage', 'catch', 'route']);
  assert.deepEqual(fishing.requirements, { water_adjacent: true,
    mandatory_context_refs: [
      'claim:medieval-novgorod-fishing-attests-major-occupation-food-context'] });
  assert.deepEqual(fishing.data_gap_codes, [
    'FUNCTIONAL_TOOL_MAPPING_MISSING', 'FUNCTIONAL_STORAGE_MAPPING_MISSING',
    'FUNCTIONAL_WORK_MATERIAL_MAPPING_MISSING',
    'FUNCTIONAL_CONTAINER_MAPPING_MISSING']);
  assert.ok(fishing.evidence_claims.flatMap(({ evidence_refs: refs }) => refs)
    .includes('evidence:population-fishing-221'));
  assert.ok(fishing.evidence_claims.flatMap(({ evidence_refs: refs }) => refs)
    .includes('evidence:population-fishing-222'));
  const fishingLedgerClaim = fishing.evidence_claims.find(({ claim_ref: ref }) =>
    ref === 'claim:medieval-novgorod-fishing-attests-major-occupation-food-context');
  assert.equal(fishingLedgerClaim.review_ref,
    'research/verification-environment-ecology.md');
  assert.match(fishingLedgerClaim.limits,
    /no local entity, inventory, ownership, access, exact date, weather or outcome/u);
});

test('drying workspace stays process-owned and old draft rows are excluded', async () => {
  const overlay = await generateProceduralV6AuthoringOverlay(root);
  const drying = overlay.candidates.find(({ family }) =>
    family === 'drying_storage_workspace');
  assert.equal(drying.authority, 'editorial_reconstruction');
  assert.equal(drying.confidence, 'medium');
  assert.deepEqual(drying.variants, [
    { id: 'dormant', process_owned_requirements: [] },
    { id: 'active', process_owned_requirements: ['material_ref', 'tool_ref'] }
  ]);
  assert.deepEqual(drying.forbidden_implications,
    ['water', 'heat', 'fire', 'fuel', 'container', 'tool', 'material', 'npc']);
  assert.deepEqual(drying.evidence_claims.map(({ source_locator: line }) => line),
    [1769, 1890, 1930, 1970]);
  const serialized = JSON.stringify(overlay);
  for (const oldId of ['lt_low_alluvial_riverbank', 'wb_small_river',
    'lu_inland_capture_fishing', 'pt_river_landing', 'pt_fishing_station',
    'pt_forest_work_camp']) assert.doesNotMatch(serialized, new RegExp(oldId, 'u'));
});

test('candidate validator rejects routes, invented mechanics and pin drift', async () => {
  const overlay = await generateProceduralV6AuthoringOverlay(root);
  const candidate = structuredClone(overlay.candidates[0]);
  const worldPin = overlay.compatible_world_pin;
  assert.deepEqual(validateProceduralSceneAuthoringCandidate({ candidate,
    world_pin: worldPin }), candidate);
  candidate.route_ref = 'route:invented';
  assert.throws(() => validateProceduralSceneAuthoringCandidate({ candidate,
    world_pin: worldPin }), { code: 'PROCEDURAL_SCENE_PROFILE_COMPILER_INVALID' });
  delete candidate.route_ref;
  candidate.capacity = 1;
  assert.throws(() => validateProceduralSceneAuthoringCandidate({ candidate,
    world_pin: worldPin }), { code: 'PROCEDURAL_SCENE_PROFILE_COMPILER_INVALID' });
  const drifted = structuredClone(overlay.candidates[0]);
  drifted.spatial_closure_ref.world_revision_id = 'other-world';
  assert.throws(() => validateProceduralSceneAuthoringCandidate({
    candidate: drifted, world_pin: worldPin }),
  { code: 'PROCEDURAL_SCENE_PROFILE_COMPILER_INVALID' });
});

test('tracked row attestation authorizes only drying authoring, not import/event', async () => {
  const directory = new URL(
    '../../../data/world-catalogs/novgorod/procedural-scene-v2/', import.meta.url);
  const request = JSON.parse(await readFile(new URL('approval-request.json', directory)));
  assert.equal(request.authoring_approval, 'pending_independent_review');
  assert.equal(request.import_authorized, false);
  assert.equal(request.activation_authorized, false);
  assert.equal(request.activation_request, null);
  assert.doesNotMatch(JSON.stringify(request), /"(?:import_id|activation_event)"/u);
  const attestation = JSON.parse(await readFile(new URL(
    'drying-storage-workspace-approval-attestation.json', directory)));
  assert.equal(attestation.candidate_ref,
    'novgorod_drying_storage_workspace_v3@1');
  assert.equal(attestation.candidate_source_commit_sha,
    'e5f6abad33d1bf54cf71622434afc3f08dfad0bf');
  assert.equal(attestation.candidate_digest,
    '0bfe111d4cd73e480a88c11639b3a45dc785bad2b83040aa49a8a95955cd31d5');
  assert.equal(attestation.reviewed_overlay_digest,
    'ce72077addc4392426a346f575fe5c01b5a0b8c37b0518af1814ef3020797b03');
  assert.match(attestation.rebound_candidate_digest, /^[0-9a-f]{64}$/u);
  assert.equal(attestation.authoring_approved, true);
  assert.equal(attestation.import_authorized, false);
  assert.equal(attestation.activation_authorized, false);
  assert.equal(attestation.activation_request, null);
  assert.deepEqual(attestation.data_gap_codes, [
    'FUNCTIONAL_TOOL_MAPPING_MISSING', 'FUNCTIONAL_STORAGE_MAPPING_MISSING',
    'FUNCTIONAL_WORK_MATERIAL_MAPPING_MISSING',
    'FUNCTIONAL_CONTAINER_MAPPING_MISSING']);
  assert.deepEqual(buildProceduralV6DryingAttestation(
    await generateProceduralV6AuthoringOverlay(root)), attestation);
});

test('ledger review refs exist and candidate limits equal ledger limits', async () => {
  const overlay = await generateProceduralV6AuthoringOverlay(root);
  const ledger = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/world-knowledge/production-v1/verification-ledger.json',
    import.meta.url)));
  const expected = new Map(ledger.verifications.map((row) =>
    [row.claim_ref, row]));
  for (const ref of [
    'claim:white-willow-depends-on-moist-lit-riparian-habitat',
    'claim:medieval-novgorod-fishing-attests-major-occupation-food-context']) {
    const actual = overlay.candidates.flatMap(({ evidence_claims: claims }) =>
      claims).find(({ claim_ref: claimRef }) => claimRef === ref);
    assert.equal(actual.review_ref, expected.get(ref).review_ref);
    assert.equal(actual.limits, expected.get(ref).limits);
    assert.equal(actual.verification_ref, expected.get(ref).verification_ref);
    assert.equal(await validateVerificationReviewRef(root, actual.review_ref), true);
  }
  await assert.rejects(() => validateVerificationReviewRef(root,
    'research/verification-environment-ecology.md#missing-heading'),
  { code: 'PROCEDURAL_VERIFICATION_REVIEW_REF_INVALID' });
});

test('missing required ledger claim yields typed gap and no candidate', async () => {
  const ledger = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/world-knowledge/production-v1/verification-ledger.json',
    import.meta.url)));
  ledger.verifications = ledger.verifications.filter(({ claim_ref: ref }) =>
    ref !== 'claim:white-willow-depends-on-moist-lit-riparian-habitat');
  const overlay = await generateProceduralV6AuthoringOverlay(root,
    { verificationLedger: ledger });
  assert.equal(overlay.candidates.some(({ family }) =>
    family === 'natural_shore'), false);
  assert.deepEqual(overlay.candidate_data_gaps, [{
    candidate_id: 'novgorod_natural_shore_v3',
    code: 'PROCEDURAL_VERIFICATION_LEDGER_GAP',
    claim_ref: 'claim:white-willow-depends-on-moist-lit-riparian-habitat'
  }]);
});

test('final natural and fishing attestations bind frozen audit subjects', async () => {
  const overlay = await generateProceduralV6AuthoringOverlay(root);
  const request = buildProceduralV6ApprovalRequest(overlay);
  const directory = new URL(
    '../../../data/world-catalogs/novgorod/procedural-scene-v2/', import.meta.url);
  for (const [candidateId, file, expectedDigest] of [
    ['novgorod_natural_shore_v3', 'natural-shore-approval-attestation.json',
      '3a8a1b71b22d139f3df7e9c133bd46754ff1038d23c54a06b57f4582111e8abc'],
    ['novgorod_inland_fishing_worksite_v3',
      'inland-fishing-worksite-approval-attestation.json',
      '049e5ecce5310d7f3d85874e9e1bd919f2be723eb681e9f67d8a2d4be957235c']
  ]) {
    const tracked = JSON.parse(await readFile(new URL(file, directory)));
    assert.deepEqual(buildProceduralV6FinalRowAttestation(overlay, request,
      candidateId), tracked);
    assert.equal(tracked.subject_commit_sha,
      '6624b1d32cd1503dc2cf5d8d72b6c8af95de5adb');
    assert.equal(tracked.overlay_digest,
      '52702c0010adc3e3235fd6a6417a10b28f7627d428e65f9dd48e74c3fb19cda3');
    assert.equal(tracked.approval_request_digest,
      '89ae5f2030961c85e8e12f3b220052db04e5b95e3c7af45ac7c6076136453325');
    assert.equal(tracked.candidate_digest, expectedDigest);
    assert.equal(tracked.authoring_approved, true);
    assert.equal(tracked.import_authorized, false);
    assert.equal(tracked.activation_authorized, false);
    assert.equal(tracked.activation_request, null);
    assert.ok(tracked.verification.every(({ claim_ref: claimRef,
      review_ref: reviewRef, limits }) => claimRef && reviewRef && limits));
  }
  const natural = JSON.parse(await readFile(new URL(
    'natural-shore-approval-attestation.json', directory)));
  assert.ok(natural.forbidden_implications.includes('local_taxon_assertion'));
  assert.deepEqual(natural.materialization_limits, ['no_local_willow',
    'no_local_tree', 'no_local_stand', 'no_local_stock', 'no_local_entity',
    'no_outcome']);
  const fishing = JSON.parse(await readFile(new URL(
    'inland-fishing-worksite-approval-attestation.json', directory)));
  assert.deepEqual(fishing.data_gap_codes, [
    'FUNCTIONAL_TOOL_MAPPING_MISSING', 'FUNCTIONAL_STORAGE_MAPPING_MISSING',
    'FUNCTIONAL_WORK_MATERIAL_MAPPING_MISSING',
    'FUNCTIONAL_CONTAINER_MAPPING_MISSING']);
});
