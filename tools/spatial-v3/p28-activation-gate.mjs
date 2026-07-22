import { createHash } from 'node:crypto';
import { readFile, realpath as realpathFs } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { posix, relative, resolve, win32 } from 'node:path';
import { pathToFileURL } from 'node:url';

const FREEZE = (value) => Object.freeze(value);
const MANIFEST_PATH = 'docs/migration/spatial-v3/release-evidence.v1.json';
const EVIDENCE_SCOPE_PATH = 'docs/migration/spatial-v3/p28-evidence-scope.v1.json';
const execFile = promisify(execFileCallback);
export const P28_P12_GAPS = FREEZE([
  FREEZE({ code: 'CANONICAL_G5_INVENTORY_DATA_GAP', subject_ref: 'novgorod:g4-inventory:195' }),
  FREEZE({ code: 'DIRECTIONAL_EXIT_READINESS_DATA_GAP', subject_ref: 'novgorod:physical-edge-inventory:358' }),
  FREEZE({ code: 'ROUTE_BINDING_DATA_GAP', subject_ref: 'novgorod:graph-edge-inventory:600' }),
  FREEZE({ code: 'APPROVED_PROFILE_DATA_GAP', subject_ref: 'novgorod:g4-scene-profiles' })
]);
export const P28_APPENDIX_D_ITEMS = FREEZE([
  'D1.github_main_fixed', 'D1.root_agents_read', 'D1.github_agents_read', 'D1.conditional_documents_read', 'D1.navigation_and_catalog_read', 'D1.rag_and_graphify_recorded', 'D1.norm_conflicts_empty',
  'D2.public_contracts_single_declaration', 'D2.contract_types_resolve', 'D2.no_placeholder_or_unresolved_branch', 'D2.versioned_authoring_refs', 'D2.contract_schema_dto_ddl_match', 'D2.plural_relations_normalized', 'D2.schema_reference_ddl_digest', 'D2.route_endpoint_context_validators', 'D2.capacity_proof', 'D2.regional_g5_and_exits_complete', 'D2.empty_candidate_sets_hard_block',
  'D3.one_production_owner_writer', 'D3.preparation_before_activation', 'D3.frontier_no_move_or_time', 'D3.separate_executor_contracts', 'D3.failed_retry_lineage', 'D3.no_open_interval_result', 'D3.rational_time_slice_independent', 'D3.boundary_zero_time_context', 'D3.carrier_root_projection', 'D3.mode_transition_new_plan', 'D3.stranded_save_load_rescue', 'D3.player_projection_no_hidden_topology', 'D3.knowledge_token_pinned_resolution', 'D3.portal_state_exhaustive', 'D3.blocker_capacity_deterministic_locks', 'D3.journey_exact_handoff_snapshot',
  'D4.partial_unique_predicates', 'D4.global_lock_order', 'D4.idempotency_identical_result', 'D4.idempotency_digest_rejected', 'D4.clock_matching_committed_result', 'D4.frontier_capacity_concurrency', 'D4.branch_committed_exhaustion', 'D4.movement_topology_no_free_move', 'D4.journey_reload_no_latest_catalog',
  'D5.full_v2_inventory_mapping', 'D5.ambiguous_hard_block', 'D5.no_dual_write', 'D5.postgres_import_lifecycle', 'D5.new_game_existing_save_e2e', 'D5.docs_catalogs_ownership_sync', 'D5.readme_checks_critic_cycles',
  'D6.contract_unit_tests', 'D6.negative_invariant_tests', 'D6.property_time_route_tests', 'D6.targeted_package_tests', 'D6.full_project_tests', 'D6.postgres_integration', 'D6.generated_artifacts_reproduced', 'D6.independent_critic_accepted'
]);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const isDigest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const isCommit = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
async function gitText(root, args) { const { stdout } = await execFile('git', args, { cwd: root, windowsHide: true, encoding: 'utf8' }); return stdout.trim(); }
async function gitRaw(root, args) { const { stdout } = await execFile('git', args, { cwd: root, windowsHide: true, encoding: 'buffer' }); return stdout; }
export { gitRaw as readP28GitRaw };

export function validateP28P12GapIdentities(gaps) {
  if (!Array.isArray(gaps) || gaps.length !== P28_P12_GAPS.length || new Set(gaps.map((gap) => gap?.code)).size !== P28_P12_GAPS.length || P28_P12_GAPS.some(({ code }) => !gaps.some((gap) => gap?.code === code))) return FREEZE([FREEZE({ code: 'p12_gap_evidence_coverage_invalid' })]);
  return FREEZE(P28_P12_GAPS.flatMap(({ code, subject_ref }) => gaps.find((entry) => entry?.code === code)?.subject_ref === subject_ref ? [] : [FREEZE({ code: 'p12_gap_identity_or_quantity_mismatch', gap_code: code, subject_ref })]));
}
export function validateReleaseEvidenceShape(manifest) {
  const errors = [];
  if (manifest && Object.hasOwn(manifest, 'p28_fresh_checkout')) errors.push(FREEZE({ code: 'duplicate_fresh_checkout_authority_forbidden' }));
  return FREEZE(errors);
}
export function isSafeRepositoryPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || value.includes('\\') || win32.isAbsolute(value) || posix.isAbsolute(value) || /^[a-z]:/iu.test(value) || /^[\\/]{2}/u.test(value)) return false;
  return !value.split('/').some((part) => !part || part === '.' || part === '..') && posix.normalize(value) === value;
}
function referencedEvidencePaths(manifest) {
  return [
    ...(manifest.appendix_d_items ?? []).flatMap((item) => (item?.evidence ?? []).map((evidence) => evidence?.path)),
    ...(manifest.p12_authoring_gaps ?? []).flatMap((gap) => (gap?.resolution_evidence ?? []).map((evidence) => evidence?.path)),
    manifest.p27_independent_critic?.path
  ].filter((path) => typeof path === 'string');
}
async function candidateEvidenceScope({ root, candidateCommit, gitRaw: readGitRaw }) {
  try {
    const scope = JSON.parse(Buffer.from(await readGitRaw(root, ['show', `${candidateCommit}:${EVIDENCE_SCOPE_PATH}`])).toString('utf8'));
    const paths = scope?.allowed_evidence_child_paths;
    if (scope?.schema !== 'rus.spatial-v3.p28-evidence-scope.v1' || scope?.version !== 1 || !Array.isArray(paths) || !paths.length || new Set(paths).size !== paths.length || paths.some((path) => !isSafeRepositoryPath(path))) return null;
    return new Set([MANIFEST_PATH, ...paths]);
  } catch { return null; }
}
export async function verifyCommittedRepositoryBytes({ root = process.cwd(), path, bytes, commit = 'HEAD', gitRaw: readGitRaw = gitRaw } = {}) {
  if (!isSafeRepositoryPath(path) || bytes == null) return false;
  try { return Buffer.from(await readGitRaw(root, ['show', `${commit}:${path}`])).equals(Buffer.from(bytes)); } catch { return false; }
}
export async function resolveSafeRepositoryPath(root, evidencePath, realpath = realpathFs) {
  if (!isSafeRepositoryPath(evidencePath)) return null;
  try { const [rootReal, targetReal] = await Promise.all([realpath(root), realpath(resolve(root, evidencePath))]); const rel = relative(rootReal, targetReal); return rel && !rel.startsWith('..') && !win32.isAbsolute(rel) && !posix.isAbsolute(rel) ? targetReal : null; } catch { return null; }
}
/** The evidence commit is a strict direct child; this avoids a manifest self-SHA. */
export async function verifyP28EvidenceCommitBinding({ root = process.cwd(), manifestPath = MANIFEST_PATH, manifest, manifestBytes, gitText: readGitText = gitText, gitRaw: readGitRaw = gitRaw } = {}) {
  const errors = []; const issue = (code, details = {}) => errors.push(FREEZE({ code, evidence: manifestPath, ...details }));
  if (!isCommit(manifest?.activation_candidate_commit)) { issue('activation_candidate_commit_invalid'); return FREEZE(errors); }
  try {
    const head = (await readGitText(root, ['rev-parse', 'HEAD'])).toLowerCase();
    const evidenceCommit = (await readGitText(root, ['log', '-1', '--format=%H', '--', manifestPath])).toLowerCase();
    if (!isCommit(head) || head !== evidenceCommit) issue('activation_evidence_commit_not_current_head');
    const lineage = (await readGitText(root, ['rev-list', '--parents', '-n', '1', evidenceCommit])).toLowerCase().split(/\s+/u).filter(Boolean);
    if (lineage.length !== 2 || lineage[1] !== manifest.activation_candidate_commit) issue('activation_evidence_commit_parent_mismatch');
    const allowed = await candidateEvidenceScope({ root, candidateCommit: manifest.activation_candidate_commit, gitRaw: readGitRaw });
    if (!allowed) issue('activation_evidence_scope_invalid');
    const changed = (await readGitText(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', evidenceCommit])).split(/\r?\n/u).filter(Boolean);
    if (!allowed || !changed.includes(manifestPath) || changed.some((path) => !allowed.has(path))) issue('activation_evidence_commit_scope_invalid');
    if (!await verifyCommittedRepositoryBytes({ root, path: manifestPath, bytes: manifestBytes, commit: evidenceCommit, gitRaw: readGitRaw })) issue('release_evidence_manifest_not_committed_exactly');
  } catch { issue('activation_evidence_commit_unverifiable'); }
  return FREEZE(errors);
}
export async function validateP28HashedEvidence({ root, read, realpath, gitRaw: readGitRaw, evidence, add, code, details = {} }) {
  const absolute = await resolveSafeRepositoryPath(root, evidence?.path, realpath);
  if (!absolute || !isDigest(evidence?.sha256)) { add(code, MANIFEST_PATH, details); return null; }
  try { const bytes = await read(absolute); const digest = sha256(bytes); if (digest !== evidence.sha256) { add(code, evidence.path, details); return null; } if (!await verifyCommittedRepositoryBytes({ root, path: evidence.path, bytes, gitRaw: readGitRaw })) { add('release_evidence_path_not_committed_exactly', evidence.path, details); return null; } return digest; } catch { add(code, evidence.path, details); return null; }
}

function validProofConfig(proof) {
  return proof?.schema === 'rus.spatial-v3.github-release-proof.v1' && proof.version === 1 && proof.repository === 'PavelSlaven/Novgorod1230' && proof.base_ref === 'main' && Number.isInteger(proof.pull_request_number) && proof.pull_request_number > 0 && Array.isArray(proof.required_checks) && proof.required_checks.length > 0 && new Set(proof.required_checks).size === proof.required_checks.length && proof.required_checks.every((check) => typeof check === 'string' && check.length > 0) && (proof.completion_proof?.kind === 'github_merge' || (proof.completion_proof?.kind === 'signed_annotated_tag' && typeof proof.completion_proof.tag_name === 'string' && proof.completion_proof.tag_name.length > 0));
}
async function githubJson(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: { accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) } });
  if (!response?.ok) throw new Error(`GitHub response ${response?.status ?? 'unavailable'}`);
  return response.json();
}
/** Explicit GitHub network adapter. Its result is never accepted from a production caller. */
export async function fetchGitHubReleaseProof({ repository, pullRequestNumber, pull_request_number, evidenceCommit, requiredChecks, required_checks, completionProof, completion_proof, fetchImpl = globalThis.fetch, verifyTag = verifyLocalSignedTag } = {}) {
  pullRequestNumber ??= pull_request_number;
  requiredChecks ??= required_checks;
  completionProof ??= completion_proof;
  if (!fetchImpl || !isCommit(evidenceCommit)) throw new Error('github_proof_input_invalid');
  const base = `https://api.github.com/repos/${repository}`;
  const [pull, checks] = await Promise.all([
    githubJson(fetchImpl, `${base}/pulls/${pullRequestNumber}`),
    githubJson(fetchImpl, `${base}/commits/${evidenceCommit}/check-runs?per_page=100`)
  ]);
  const proof = { pull, checks, completion: null };
  if (completionProof.kind === 'github_merge') proof.completion = { kind: 'github_merge', compare: await githubJson(fetchImpl, `${base}/compare/${evidenceCommit}...${pull.merge_commit_sha}`) };
  else {
    const tag = await githubJson(fetchImpl, `${base}/git/ref/tags/${completionProof.tag_name}`);
    const annotated = tag?.object?.type === 'tag' ? await githubJson(fetchImpl, `${base}/git/tags/${tag.object.sha}`) : null;
    proof.completion = { kind: 'signed_annotated_tag', tag, annotated, local_verification: await verifyTag({ tagName: completionProof.tag_name, expectedTagObject: tag?.object?.sha, expectedCommit: evidenceCommit }) };
  }
  return proof;
}
async function verifyLocalSignedTag({ tagName, expectedTagObject, expectedCommit } = {}) {
  if (!tagName || !isCommit(expectedTagObject) || !isCommit(expectedCommit)) return { verified: false };
  try {
    const [tagObject, target, verification] = await Promise.all([
      gitText(process.cwd(), ['rev-parse', `${tagName}^{tag}`]), gitText(process.cwd(), ['rev-parse', `${tagName}^{commit}`]), execFile('git', ['verify-tag', '--raw', tagName], { cwd: process.cwd(), windowsHide: true, encoding: 'utf8' })
    ]);
    return { verified: tagObject.toLowerCase() === expectedTagObject && target.toLowerCase() === expectedCommit };
  } catch { return { verified: false }; }
}
export function validateGitHubReleaseProof({ config, proof, evidenceCommit, add }) {
  if (!validProofConfig(config)) { add('github_release_proof_config_invalid'); return; }
  const pull = proof?.pull;
  if (pull?.draft === true) add('github_release_proof_pr_draft');
  if (pull?.base?.repo?.full_name !== config.repository || pull?.base?.ref !== config.base_ref) add('github_release_proof_base_mismatch');
  if (pull?.head?.sha?.toLowerCase() !== evidenceCommit) add('github_release_proof_head_mismatch');
  const runs = proof?.checks?.check_runs;
  for (const required of config.required_checks) if (!Array.isArray(runs) || !runs.some((run) => run?.name === required && run?.status === 'completed' && run?.conclusion === 'success')) add('github_release_proof_required_check_missing_or_not_success', MANIFEST_PATH, { check: required });
  if (config.completion_proof.kind === 'github_merge') {
    if (pull?.merged !== true) add('github_release_proof_pr_unmerged');
    if (proof?.completion?.kind !== 'github_merge' || !isCommit(pull?.merge_commit_sha) || !['ahead', 'identical'].includes(proof.completion.compare?.status)) add('github_release_proof_merge_mismatch');
  } else {
    const tag = proof?.completion; const annotated = tag?.annotated;
    if (tag?.kind !== 'signed_annotated_tag' || tag.tag?.object?.type !== 'tag' || annotated?.object?.type !== 'commit' || annotated.object.sha?.toLowerCase() !== evidenceCommit || annotated.verification?.verified !== true || annotated.verification?.reason !== 'valid' || tag.local_verification?.verified !== true) add('github_release_proof_signed_tag_invalid_or_untrusted');
  }
}
export function validateAppendixDItems(items) {
  const errors = [];
  if (!Array.isArray(items) || items.length !== P28_APPENDIX_D_ITEMS.length || new Set(items.map((item) => item?.id)).size !== P28_APPENDIX_D_ITEMS.length || P28_APPENDIX_D_ITEMS.some((id) => !items.some((item) => item?.id === id))) {
    return FREEZE([FREEZE({ code: 'appendix_d_evidence_coverage_invalid' })]);
  }
  for (const item of items) {
    if (item.status !== 'passed') errors.push(FREEZE({ code: 'appendix_d_item_unchecked', item_id: item.id, status: item.status ?? 'missing' }));
    else if (!Array.isArray(item.evidence) || !item.evidence.length) errors.push(FREEZE({ code: 'appendix_d_item_evidence_missing', item_id: item.id }));
  }
  return FREEZE(errors);
}
async function validateChecklistEvidence({ root, read, realpath, gitRaw: readGitRaw, item, add }) {
  for (const evidence of item.evidence) await validateP28HashedEvidence({ root, read, realpath, gitRaw: readGitRaw, evidence, add, code: 'appendix_d_evidence_hash_mismatch', details: { item_id: item.id } });
}
async function validateP12Gaps({ root, read, gitRaw: readGitRaw, gaps, add }) {
  const identityErrors = validateP28P12GapIdentities(gaps); for (const { code, ...details } of identityErrors) add(code, MANIFEST_PATH, details);
  if (identityErrors.some((error) => error.code === 'p12_gap_evidence_coverage_invalid')) return;
  for (const { code, subject_ref } of P28_P12_GAPS) { const gap = gaps.find((entry) => entry?.code === code); if (gap.status !== 'resolved' || !Array.isArray(gap.resolution_evidence) || !gap.resolution_evidence.length) { add('spatial_candidate_gap', MANIFEST_PATH, { gap_code: code, subject_ref, resolution_status: gap?.status ?? 'missing' }); continue; } for (const evidence of gap.resolution_evidence) await validateP28HashedEvidence({ root, read, gitRaw: readGitRaw, evidence, add, code: 'p12_gap_resolution_evidence_invalid', details: { gap_code: code, subject_ref } }); }
}
export function isAcceptedP27Critic(report, candidateCommit) {
  return report?.status === 'passed' && report.verdict === 'PASS' && report.activation_candidate_commit === candidateCommit;
}
async function validateP27Critic({ root, read, realpath, gitRaw: readGitRaw, candidateCommit, report, add }) {
  if (!isAcceptedP27Critic(report, candidateCommit)) return add('p27_independent_critic_evidence_missing');
  await validateP28HashedEvidence({ root, read, realpath, gitRaw: readGitRaw, evidence: report, add, code: 'p27_independent_critic_hash_mismatch' });
}
function result(blockers) { return FREEZE({ schema: 'rus.spatial-v3.p28-activation-assessment.v2', activation_permitted: blockers.length === 0, production_writes: 0, composition_changed: false, blockers: FREEZE(blockers), required_action: blockers.length === 0 ? 'release_proof_accepted_no_repository_patch' : 'keep_v2_production' }); }
function localResult(blockers) { return FREEZE({ schema: 'rus.spatial-v3.p28-local-evidence-assessment.v1', local_evidence_ready: blockers.length === 0, production_writes: 0, composition_changed: false, blockers: FREEZE(blockers) }); }
async function collectLocalEvidence({ root = process.cwd(), read = readFile, realpath = realpathFs, gitText: readGitText = gitText, gitRaw: readGitRaw = gitRaw } = {}) {
  const blockers = []; const add = (code, evidence = MANIFEST_PATH, details = {}) => blockers.push(FREEZE({ code, evidence, ...details })); let manifest; let manifestBytes;
  try { manifestBytes = Buffer.from(await read(resolve(root, MANIFEST_PATH))); manifest = JSON.parse(manifestBytes.toString('utf8')); } catch { add('release_evidence_manifest_missing'); return { blockers, manifest: null, evidenceCommit: null }; }
  if (manifest.schema !== 'rus.spatial-v3.release-evidence.v1' || manifest.version !== 1) add('release_evidence_manifest_schema_invalid');
  for (const { code, ...details } of validateReleaseEvidenceShape(manifest)) add(code, MANIFEST_PATH, details);
  for (const error of await verifyP28EvidenceCommitBinding({ root, manifest, manifestBytes, gitText: readGitText, gitRaw: readGitRaw })) add(error.code, error.evidence);
  const items = manifest.appendix_d_items;
  const itemErrors = validateAppendixDItems(items);
  for (const { code, ...details } of itemErrors) add(code, MANIFEST_PATH, details);
  if (itemErrors.length === 0) for (const item of items) await validateChecklistEvidence({ root, read, realpath, gitRaw: readGitRaw, item, add });
  await validateP12Gaps({ root, read, gitRaw: readGitRaw, gaps: manifest.p12_authoring_gaps, add });
  await validateP27Critic({ root, read, realpath, gitRaw: readGitRaw, candidateCommit: manifest.activation_candidate_commit, report: manifest.p27_independent_critic, add });
  let evidenceCommit = null; try { evidenceCommit = (await readGitText(root, ['rev-parse', 'HEAD'])).toLowerCase(); } catch { add('github_release_proof_unavailable'); }
  return { blockers, manifest, evidenceCommit };
}
export async function assessSpatialV3LocalEvidence(options = {}) {
  const { blockers } = await collectLocalEvidence(options);
  return localResult(blockers);
}
export async function assessSpatialV3Activation({ githubProofClient = fetchGitHubReleaseProof, ...options } = {}) {
  const { blockers, manifest, evidenceCommit } = await collectLocalEvidence(options);
  const add = (code, evidence = MANIFEST_PATH, details = {}) => blockers.push(FREEZE({ code, evidence, ...details }));
  if (!manifest) return result(blockers);
  if (evidenceCommit && validProofConfig(manifest.github_release_proof)) { try { validateGitHubReleaseProof({ config: manifest.github_release_proof, proof: await githubProofClient({ ...manifest.github_release_proof, evidenceCommit }), evidenceCommit, add }); } catch { add('github_release_proof_unavailable'); } } else if (evidenceCommit) add('github_release_proof_config_invalid');
  return result(blockers);
}
/** Production accepts no caller-supplied approval/proof; it always performs the real local and GitHub checks. */
export async function requireSpatialV3Activation(options = {}) { void options; const assessment = await assessSpatialV3Activation(); if (assessment.activation_permitted) return assessment; throw Object.assign(new Error('P28 activation is blocked by mandatory release evidence.'), { code: 'spatial_v3_activation_blocked', assessment }); }
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const localOnly = process.argv.includes('--local-evidence-only');
  const assessment = localOnly ? await assessSpatialV3LocalEvidence() : await assessSpatialV3Activation();
  console.log(JSON.stringify(assessment, null, 2));
  if (localOnly ? !assessment.local_evidence_ready : !assessment.activation_permitted) process.exitCode = 1;
}
