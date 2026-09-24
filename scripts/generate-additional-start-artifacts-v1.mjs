import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const base = 'data/world-catalogs/novgorod/live-world-runtime-v17';
const output = `${base}/additional-start-artifacts`;
const read = async (path) => readFile(resolve(root, path));
const json = async (path) => JSON.parse(await read(path));
const encode = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const pin = (path, bytes) => ({ path, sha256: sha256(bytes) });

export async function buildStartArtifacts() {
  const originalApprovalPath = 'data/world-catalogs/novgorod/m2c-expansion-repin-data-approval.json';
  const nonforestApprovalPath = `${output}/nonforest-basis-data-approval.json`;
  const [additionalBytes, additionalApprovalBytes, originalApprovalBytes, originalStart,
    originalTransfer, originalBasis] = await Promise.all([
    read(`${base}/additional-starts-candidate.json`),
    read(`${base}/additional-starts-data-approval.json`),
    read(originalApprovalPath),
    json(`${base}/target-start-candidate.json`),
    json(`${base}/player-transfer-candidate.json`),
    json(`${base}/player-basis-candidate.json`)
  ]);
  const additional = JSON.parse(additionalBytes);
  const additionalApproval = JSON.parse(additionalApprovalBytes);
  const originalApproval = JSON.parse(originalApprovalBytes);
  assert.equal(additionalApproval.candidate_sha256, sha256(additionalBytes));
  assert.equal(additionalApproval.decision, 'APPROVE_DATA_ONLY');
  assert.equal(originalApproval.decision, 'APPROVE_DATA_ONLY');
  for (const [file, scope] of [
    ['target-start-candidate.json', 'target_start_proposal_approval'],
    ['player-transfer-candidate.json', 'target_player_transfer_approval'],
    ['player-basis-candidate.json', 'target_player_basis_approval']
  ]) assert.equal(originalApproval[scope].candidate_sha256, sha256(await read(`${base}/${file}`)), file);
  const nonforestApprovalBytes = await read(nonforestApprovalPath);
  const nonforestApproval = JSON.parse(nonforestApprovalBytes);
  const files = new Map();
  const artifacts = [];
  const pendingBasis = [];
  const skillDefaultsPath = 'data/world-base-seeds/occupation_skill_defaults_v1.csv';
  const skillDefaultsBytes = await read(skillDefaultsPath);
  const rows = skillDefaultsBytes.toString('utf8').split(/\r?\n/u);
  const skillDefaults = Object.fromEntries(['transport_guiding', 'fishing_water'].map((archetype) => {
    const matches = rows.filter((row) => row.startsWith(`${archetype},`));
    assert.equal(matches.length, 1, archetype);
    return [archetype, matches[0]];
  }));
  for (const candidate of additional.starts) {
    const id = candidate.scenario_id;
    const start = structuredClone(originalStart);
    start.candidate_id = `${id}_start_v1`;
    start.scenario_id = id;
    start.public_metadata = candidate.public_metadata;
    start.authored_premise = candidate.authored_premise;
    start.initial_placement = { ...candidate.initial_placement, g6_scene_slot_key: 'main' };
    start.player_inputs.name = { ...start.player_inputs.name,
      display_name: candidate.player_inputs.name.display_name,
      source_name_id: candidate.player_inputs.name.source_name_id };
    start.player_inputs.role_ref = candidate.player_inputs.role_ref;
    start.player_inputs.occupation_ref = candidate.player_inputs.occupation_ref;
    start.player_inputs.attributes.occupation_archetype_id = candidate.player_inputs.occupation_archetype_id;
    start.new_game_stage_bindings.initial_resources_policy = candidate.initial_resources_policy;
    delete start.initial_perception_rule;
    delete start.expansion_binding;
    start.expansion_profile_ref = candidate.expansion_profile_ref;
    start.natural_profile_ref = candidate.natural_profile_ref;
    start.natural_placement_ref = candidate.natural_placement_ref;
    start.source_additional_starts = pin(`${base}/additional-starts-candidate.json`, additionalBytes);
    const startPath = `${output}/${id}.start.json`;
    const startBytes = encode(start);
    files.set(startPath, startBytes);

    const transfer = structuredClone(originalTransfer);
    transfer.candidate_id = `${id}_player_transfer_v1`;
    transfer.target_start = { ...transfer.target_start, path: startPath,
      sha256: sha256(startBytes), scenario_id: id };
    transfer.applicability.scenario_id = id;
    transfer.applicability.role_ref = candidate.player_inputs.role_ref;
    transfer.applicability.occupation_ref = candidate.player_inputs.occupation_ref;
    transfer.attribute_transfer.occupation_archetype_id = candidate.player_inputs.occupation_archetype_id;
    if (candidate.player_inputs.occupation_ref !== 'nov_occ_forest_worker') {
      transfer.requested_approval_scope[1] = `Exact new player-character applicability of the existing ordinary actor attribute profile and ${candidate.player_inputs.occupation_archetype_id} mapping through its existing seeded owner.`;
    }
    const transferPath = `${output}/${id}.transfer.json`;
    const transferBytes = encode(transfer);
    files.set(transferPath, transferBytes);

    if (candidate.player_inputs.occupation_ref !== 'nov_occ_forest_worker') {
      artifacts.push({ scenario_id: id, canonical_g5_ref: candidate.initial_placement.canonical_g5_ref,
        start: pin(startPath, startBytes), transfer: pin(transferPath, transferBytes) });
      const basis = structuredClone(originalBasis);
      basis.candidate_id = `${id}_player_basis_v1`;
      basis.target_start = { ...basis.target_start, path: startPath,
        sha256: sha256(startBytes), scenario_id: id, player_transfer_sha256: sha256(transferBytes) };
      const archetype = candidate.player_inputs.occupation_archetype_id;
      assert.ok(Object.hasOwn(skillDefaults, archetype), archetype);
      basis.skills.source_context = `${skillDefaultsPath}#${archetype}`;
      basis.skills.source_context_sha256 = sha256(skillDefaultsBytes);
      basis.skills.directness = 'approved_occupation_primary_to_editorial_player_skill_mapping';
      for (const skill of Object.keys(basis.skills.values)) {
        basis.skills.values[skill] = skill === 'survival'
          ? { level: 'skilled', bonus: 2, basis: `Approved ${archetype} occupation primary survival +2; exact new-player applicability remains pending independent approval.` }
          : { level: 'no_experience', bonus: 0, absence_basis: 'No approved new-player skill bonus for this mechanic; ordinary attempts remain possible.' };
      }
      basis.skills.limits = 'Only survival primary +2 is proposed from the approved occupation default. Secondary +1 requires a biography and is not assigned. travel_transport has no equivalent in the current player skill schema; riding means horseback and remains neutral. Typed gap: player_watercraft_skill_missing. No boat or ferry capability, equipment, route knowledge or biography is granted.';
      basis.approval_request.scope = 'exact_new_player_appearance_applicability_survival_primary_only_language_transfer_and_empty_specific_knowledge';
      const basisPath = `${output}/${id}.basis.json`;
      const basisBytes = encode(basis);
      files.set(basisPath, basisBytes);
      pendingBasis.push({ scenario_id: id, role_ref: candidate.player_inputs.role_ref,
        occupation_ref: candidate.player_inputs.occupation_ref,
        occupation_archetype_id: candidate.player_inputs.occupation_archetype_id,
        start: pin(startPath, startBytes), transfer: pin(transferPath, transferBytes),
        basis: pin(basisPath, basisBytes) });
      continue;
    }
    assert.equal(candidate.player_inputs.occupation_archetype_id, 'forest_hunting');

    const basis = structuredClone(originalBasis);
    basis.candidate_id = `${id}_player_basis_v1`;
    basis.target_start = { ...basis.target_start, path: startPath,
      sha256: sha256(startBytes), scenario_id: id, player_transfer_sha256: sha256(transferBytes) };
    const basisPath = `${output}/${id}.basis.json`;
    const basisBytes = encode(basis);
    files.set(basisPath, basisBytes);

    const approval = {
      schema: 'rus.m2c_supplemental_data_approval.v1',
      decision: 'APPROVE_DATA_ONLY',
      source_approvals: [
        pin(`${base}/additional-starts-data-approval.json`, additionalApprovalBytes),
        pin(originalApprovalPath, originalApprovalBytes)
      ],
      scope: 'Exact forest-worker role and approved canonical placement; body, attributes, clothing and basis transferred from approved forest-worker owner with only scenario and start pins changed.',
      excludes: 'No independent approval of boatman or fisher skills; no operational activation, import or first-screen readback.',
      target_start_proposal_approval: { candidate_sha256: sha256(startBytes) },
      target_player_transfer_approval: { candidate_sha256: sha256(transferBytes) },
      target_player_basis_approval: { candidate_sha256: sha256(basisBytes) },
      activation_authorized: false
    };
    const approvalPath = `${output}/${id}.approval.json`;
    const approvalBytes = encode(approval);
    files.set(approvalPath, approvalBytes);
    artifacts.push({ scenario_id: id, canonical_g5_ref: candidate.initial_placement.canonical_g5_ref,
      start: pin(startPath, startBytes), transfer: pin(transferPath, transferBytes),
      basis: pin(basisPath, basisBytes), approval: pin(approvalPath, approvalBytes) });
  }
  assert.equal(artifacts.length, 6);
  assert.equal(pendingBasis.length, 3);
  const nonforestReviewPath = `${output}/nonforest-basis-review-candidate.json`;
  const nonforestReviewBytes = encode({
    schema: 'rus.m2c_additional_start_nonforest_basis_review_candidate.v1',
    status: 'pending_independent_data_approval',
    required_review: 'Independently approve occupation-to-archetype mapping and exact new-player applicability for three boatman/fisher starts. Proposed 12-skill basis maps only approved survival primary +2; secondary +1 needs biography. travel_transport is unmapped (player_watercraft_skill_missing), never riding.',
    source_pins: [pin(skillDefaultsPath, skillDefaultsBytes),
      pin(`${base}/additional-starts-candidate.json`, additionalBytes),
      pin(`${base}/additional-starts-data-approval.json`, additionalApprovalBytes)],
    approved_skill_default_source_rows: skillDefaults,
    starts: pendingBasis,
    activation_authorized: false
  });
  assert.equal(nonforestApproval.decision, 'APPROVE_DATA_ONLY');
  assert.equal(nonforestApproval.candidate_path, nonforestReviewPath);
  assert.equal(nonforestApproval.candidate_sha256, sha256(nonforestReviewBytes));
  assert.equal(nonforestApproval.activation_authorized, false);
  files.set(nonforestReviewPath, nonforestReviewBytes);
  for (const pending of pendingBasis) {
    const approval = {
      schema: 'rus.m2c_supplemental_data_approval.v1',
      decision: 'APPROVE_DATA_ONLY',
      source_approvals: [pin(`${base}/additional-starts-data-approval.json`, additionalApprovalBytes),
        pin(nonforestApprovalPath, nonforestApprovalBytes)],
      scope: 'Exact new-player appearance, survival primary +2, ordinary speech and empty specific knowledge approved for this boatman or fisher start.',
      excludes: 'No body, attribute or clothing transfer approval; no watercraft skill, boat, ferry capability, equipment, route knowledge, biography, import or activation.',
      target_player_basis_approval: { candidate_sha256: pending.basis.sha256 },
      activation_authorized: false
    };
    const approvalPath = `${output}/${pending.scenario_id}.approval.json`;
    const approvalBytes = encode(approval);
    files.set(approvalPath, approvalBytes);
    const artifact = artifacts.find(({ scenario_id }) => scenario_id === pending.scenario_id);
    artifact.basis = pending.basis;
    artifact.approval = pin(approvalPath, approvalBytes);
  }
  return { files, artifacts };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const { files } = await buildStartArtifacts();
  if (process.argv.includes('--check')) {
    for (const [path, expected] of files) assert.deepEqual(await read(path), expected, path);
  } else {
    await mkdir(resolve(root, output), { recursive: true });
    for (const [path, bytes] of files) await writeFile(resolve(root, path), bytes);
  }
}
