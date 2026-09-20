import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateProceduralSceneAuthoringCandidate } from '@rus/materialization';
import { buildProceduralV6ApprovalRequest,
  generateProceduralV6AuthoringOverlay } from
  '../../../scripts/generate-procedural-v6-authoring-overlay.mjs';

const root = new URL('../../../', import.meta.url).pathname.replace(/^\/(.:)/u, '$1');

test('route-free candidate and approval request generation is byte-stable', async () => {
  const first = await generateProceduralV6AuthoringOverlay(root);
  const second = await generateProceduralV6AuthoringOverlay(root);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.status, 'candidate_approval_pending');
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
  assert.equal(request.rows.length, 3);
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
    ['landing', 'access', 'safety', 'stock', 'wreck']);
  assert.ok(natural.evidence_claims.some(({ claim_ref: ref }) =>
    ref === 'claim:white-willow-depends-on-moist-lit-riparian-habitat'));
  assert.deepEqual(natural.evidence_claims.map(({ source_locator: line }) => line),
    [35, 37, 38, 44]);
  assert.equal(natural.evidence_claims[3].use_scope, 'ecology_only');
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

test('tracked artifacts contain request only and no runtime import/event', async () => {
  const directory = new URL(
    '../../../data/world-catalogs/novgorod/procedural-scene-v2/', import.meta.url);
  const request = JSON.parse(await readFile(new URL('approval-request.json', directory)));
  assert.equal(request.authoring_approval, 'pending_independent_review');
  assert.equal(request.import_authorized, false);
  assert.equal(request.activation_authorized, false);
  assert.equal(request.activation_request, null);
  assert.doesNotMatch(JSON.stringify(request), /"(?:import_id|activation_event)"/u);
  await assert.rejects(() => readFile(new URL('approval-attestation.json', directory)),
    { code: 'ENOENT' });
});
