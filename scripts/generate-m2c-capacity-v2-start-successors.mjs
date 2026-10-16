import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const base = 'data/world-catalogs/novgorod/live-world-runtime-v17';
const output = `${base}/capacity-v2-start-successors`;
const capacity = 'data/world-catalogs/novgorod/m2c-scene-movement-edges';
const read = (path) => readFile(resolve(root, path));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const encode = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const pin = (path, bytes) => ({ path, sha256: sha256(bytes) });

export async function buildCapacityV2StartSuccessors() {
  const manifestPath = `${base}/target-starts-manifest.v1.json`;
  const successorPath = `${base}/target-starts-manifest.capacity-v2.candidate.json`;
  const reviewPath = `${output}/review-candidate.json`;
  const successorApprovalPath = `${output}/data-approval.json`;
  const candidatePath = `${capacity}/open-capacity-v2-candidate.json`;
  const approvalPath = `${capacity}/open-capacity-v2-data-approval.json`;
  const [successorBytes, reviewBytes, successorApprovalBytes, candidateBytes, approvalBytes, sceneBytes, profileBytes] = await Promise.all([
    read(successorPath), read(reviewPath), read(successorApprovalPath), read(candidatePath), read(approvalPath),
    read(`${capacity}/open-capacity-v2-import/spatial_v3_scene_templates.json`),
    read(`${capacity}/open-capacity-v2-import/spatial_v3_scene_materialization_profiles.json`)
  ]);
  const proposed = JSON.parse(successorBytes);
  const previous = JSON.parse(reviewBytes);
  const successorApproval = JSON.parse(successorApprovalBytes);
  const original = { ...proposed, status: 'approved', activation_authorized: true,
    starts: proposed.starts.map((entry, index) => ({ ...entry, ...previous.starts[index].previous })) };
  delete original.capacity_v2_repin_review;
  const manifestBytes = encode(original);
  assert.deepEqual(successorApproval.source_pins.active_starts, pin(manifestPath, manifestBytes));
  assert.equal(successorApproval.decision, 'APPROVE_DATA_ONLY');
  assert.equal(successorApproval.candidate_path, reviewPath);
  assert.equal(successorApproval.candidate_sha256, sha256(reviewBytes));
  assert.equal(successorApproval.approved_successors.length, 7);
  const approval = JSON.parse(approvalBytes);
  const scenes = JSON.parse(sceneBytes);
  const profiles = JSON.parse(profileBytes);
  assert.equal(original.status, 'approved');
  assert.equal(original.activation_authorized, true);
  assert.equal(original.starts.length, 7);
  assert.equal(approval.decision, 'APPROVE_DATA_ONLY');
  assert.equal(approval.exact_candidate.path, candidatePath);
  assert.equal(approval.exact_candidate.sha256, sha256(candidateBytes));
  const files = new Map();
  const starts = [];
  const review = [];
  for (const old of original.starts) {
    const source = {};
    for (const kind of ['start', 'transfer', 'basis', 'approval']) {
      const bytes = await read(old[kind].path);
      assert.equal(sha256(bytes), old[kind].sha256, `${old.scenario_id}:${kind}`);
      source[kind] = JSON.parse(bytes);
    }
    assert.equal(source.approval.target_start_proposal_approval.candidate_sha256, old.start.sha256);
    assert.equal(source.approval.target_player_transfer_approval.candidate_sha256, old.transfer.sha256);
    assert.equal(source.approval.target_player_basis_approval.candidate_sha256, old.basis.sha256);
    const start = structuredClone(source.start);
    const placement = start.initial_placement;
    assert.equal(placement.scene_template_ref.version, 1);
    assert.equal(placement.scene_materialization_profile_ref.version, 1);
    const scene = scenes.find((row) => row.id === placement.scene_template_ref.id && row.version === 2);
    const profile = profiles.find((row) => row.id === placement.scene_materialization_profile_ref.id && row.version === 2);
    assert.ok(scene && profile, `${old.scenario_id}: capacity successor closure`);
    assert.equal(profile.source_entity_id, placement.canonical_g5_ref.id);
    placement.scene_template_ref.version = 2;
    placement.scene_materialization_profile_ref.version = 2;
    if (start.initial_perception_rule) {
      const ref = start.initial_perception_rule.scene_template_ref;
      assert.equal(ref.id, scene.id);
      assert.equal(ref.version, 1);
      ref.version = 2;
      ref.canonical_digest = scene.canonical_digest;
    }
    const startPath = `${output}/${old.scenario_id}.start.json`;
    const startBytes = encode(start);
    files.set(startPath, startBytes);
    const transfer = structuredClone(source.transfer);
    assert.equal(transfer.target_start.sha256, old.start.sha256);
    transfer.target_start.path = startPath;
    transfer.target_start.sha256 = sha256(startBytes);
    const transferPath = `${output}/${old.scenario_id}.transfer.json`;
    const transferBytes = encode(transfer);
    files.set(transferPath, transferBytes);
    const basis = structuredClone(source.basis);
    assert.equal(basis.target_start.sha256, old.start.sha256);
    assert.equal(basis.target_start.player_transfer_sha256, old.transfer.sha256);
    basis.target_start.path = startPath;
    basis.target_start.sha256 = sha256(startBytes);
    basis.target_start.player_transfer_sha256 = sha256(transferBytes);
    const basisPath = `${output}/${old.scenario_id}.basis.json`;
    const basisBytes = encode(basis);
    files.set(basisPath, basisBytes);
    const next = { ...old, start: pin(startPath, startBytes), transfer: pin(transferPath, transferBytes),
      basis: pin(basisPath, basisBytes), approval: null };
    starts.push(next);
    review.push({ scenario_id: old.scenario_id, previous: { start: old.start, transfer: old.transfer,
      basis: old.basis, approval: old.approval }, proposed: { start: next.start, transfer: next.transfer,
      basis: next.basis }, scene_template_ref: placement.scene_template_ref,
      scene_materialization_profile_ref: placement.scene_materialization_profile_ref });
  }
  const request = {
    schema: 'rus.m2c_capacity_v2_start_repin_review_candidate.v1',
    status: 'pending_independent_data_approval',
    decision_requested: 'APPROVE_DATA_ONLY',
    scope: 'Exact mechanical repin of seven approved canonical starts to the approved open-capacity scene template and materialization profile version 2; transfer and basis target hashes follow changed start bytes.',
    required_review: 'Independent reviewer must verify exact field-only differences and approve all seven new start, transfer and basis SHA-256 values. The three nonforest starts also need direct approval of successor applicability because their old derived approval pins the former hashes.',
    excludes: 'No import, activation, historical occupancy claim or migration of committed scenes.',
    source_pins: { active_starts: pin(manifestPath, manifestBytes), capacity_candidate: pin(candidatePath, candidateBytes),
      capacity_approval: pin(approvalPath, approvalBytes), scene_templates: pin(`${capacity}/open-capacity-v2-import/spatial_v3_scene_templates.json`, sceneBytes),
      materialization_profiles: pin(`${capacity}/open-capacity-v2-import/spatial_v3_scene_materialization_profiles.json`, profileBytes) },
    starts: review,
    activation_authorized: false
  };
  const requestPath = `${output}/review-candidate.json`;
  const requestBytes = encode(request);
  files.set(requestPath, requestBytes);
  const successorManifest = { ...original, status: 'candidate', activation_authorized: false,
    capacity_v2_repin_review: pin(requestPath, requestBytes), starts };
  files.set(successorPath, encode(successorManifest));
  assert.deepEqual(successorBytes, files.get(successorPath));
  assert.deepEqual(reviewBytes, requestBytes);
  const successorApprovalPin = pin(successorApprovalPath, successorApprovalBytes);
  for (const [index, entry] of starts.entries()) {
    const approved = successorApproval.approved_successors[index];
    assert.equal(approved.scenario_id, entry.scenario_id);
    for (const kind of ['start', 'transfer', 'basis']) assert.deepEqual(approved[kind], entry[kind]);
    assert.deepEqual(successorApproval.previous_approval_pins[entry.scenario_id], original.starts[index].approval);
  }
  files.set(manifestPath, encode({ ...successorManifest, status: 'approved', activation_authorized: true,
    capacity_v2_repin_approval: successorApprovalPin,
    starts: starts.map((entry) => ({ ...entry, approval: successorApprovalPin })) }));
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const files = await buildCapacityV2StartSuccessors();
  for (const [path, bytes] of files) {
    if (process.argv.includes('--check')) assert.deepEqual(await read(path), bytes, path);
    else { await mkdir(dirname(resolve(root, path)), { recursive: true }); await writeFile(resolve(root, path), bytes); }
  }
  console.log(`${files.size} deterministic successor artifacts`);
}
