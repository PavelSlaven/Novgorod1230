import { createHash, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const FREEZE = (value) => Object.freeze(value);
const MANIFEST_PATH = 'docs/migration/spatial-v3/release-evidence.v1.json';
const TRUSTED_KEY_PATH = 'docs/migration/spatial-v3/p28-release-evidence-public-key.pem';
const BLOCKING_GAP_CODES = FREEZE([
  'CANONICAL_G5_INVENTORY_DATA_GAP',
  'DIRECTIONAL_EXIT_READINESS_DATA_GAP',
  'ROUTE_BINDING_DATA_GAP',
  'APPROVED_PROFILE_DATA_GAP'
]);

const APPENDIX_D_ITEMS = FREEZE([
  'D1.github_main_fixed', 'D1.root_agents_read', 'D1.github_agents_read', 'D1.conditional_documents_read', 'D1.navigation_and_catalog_read', 'D1.rag_and_graphify_recorded', 'D1.norm_conflicts_empty',
  'D2.public_contracts_single_declaration', 'D2.contract_types_resolve', 'D2.no_placeholder_or_unresolved_branch', 'D2.versioned_authoring_refs', 'D2.contract_schema_dto_ddl_match', 'D2.plural_relations_normalized', 'D2.schema_reference_ddl_digest', 'D2.route_endpoint_context_validators', 'D2.capacity_proof', 'D2.regional_g5_and_exits_complete', 'D2.empty_candidate_sets_hard_block',
  'D3.one_production_owner_writer', 'D3.preparation_before_activation', 'D3.frontier_no_move_or_time', 'D3.separate_executor_contracts', 'D3.failed_retry_lineage', 'D3.no_open_interval_result', 'D3.rational_time_slice_independent', 'D3.boundary_zero_time_context', 'D3.carrier_root_projection', 'D3.mode_transition_new_plan', 'D3.stranded_save_load_rescue', 'D3.player_projection_no_hidden_topology', 'D3.knowledge_token_pinned_resolution', 'D3.portal_state_exhaustive', 'D3.blocker_capacity_deterministic_locks', 'D3.journey_exact_handoff_snapshot',
  'D4.partial_unique_predicates', 'D4.global_lock_order', 'D4.idempotency_identical_result', 'D4.idempotency_digest_rejected', 'D4.clock_matching_committed_result', 'D4.frontier_capacity_concurrency', 'D4.branch_committed_exhaustion', 'D4.movement_topology_no_free_move', 'D4.journey_reload_no_latest_catalog',
  'D5.full_v2_inventory_mapping', 'D5.ambiguous_hard_block', 'D5.no_dual_write', 'D5.postgres_import_lifecycle', 'D5.new_game_existing_save_e2e', 'D5.docs_catalogs_ownership_sync', 'D5.readme_checks_critic_cycles',
  'D6.contract_unit_tests', 'D6.negative_invariant_tests', 'D6.property_time_route_tests', 'D6.targeted_package_tests', 'D6.full_project_tests', 'D6.postgres_integration', 'D6.generated_artifacts_reproduced', 'D6.independent_critic_accepted'
]);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function safePath(root, evidencePath) {
  if (typeof evidencePath !== 'string' || !evidencePath) return null;
  const absolute = resolve(root, evidencePath);
  const outside = relative(root, absolute).startsWith(`..${sep}`) || relative(root, absolute) === '..';
  return outside ? null : absolute;
}

function immutablePayload(manifest) {
  const { manifest_sha256: _digest, manifest_signature: _signature, ...payload } = manifest;
  return payload;
}

/**
 * P28 is deliberately a release gate, not an activation switch. Permission is
 * derived only from a versioned, hash-bound and signed evidence manifest.
 */
export async function assessSpatialV3Activation({ root = process.cwd(), read = readFile } = {}) {
  const blockers = [];
  const add = (code, evidence = MANIFEST_PATH, details = {}) => blockers.push(FREEZE({ code, evidence, ...details }));
  let manifest;
  let publicKey;
  try {
    manifest = JSON.parse(await read(resolve(root, MANIFEST_PATH), 'utf8'));
  } catch {
    add('release_evidence_manifest_missing');
    return result(blockers);
  }
  try {
    publicKey = await read(resolve(root, TRUSTED_KEY_PATH), 'utf8');
  } catch {
    add('release_evidence_trust_anchor_missing', TRUSTED_KEY_PATH);
  }

  if (manifest.schema !== 'rus.spatial-v3.release-evidence.v1' || manifest.version !== 1) add('release_evidence_manifest_schema_invalid');
  const calculatedManifestDigest = sha256(stableJson(immutablePayload(manifest)));
  if (manifest.manifest_sha256 !== calculatedManifestDigest) add('release_evidence_manifest_digest_mismatch');
  if (!publicKey || !manifest.manifest_signature?.value || manifest.manifest_signature.algorithm !== 'ed25519'
    || !verify(null, Buffer.from(calculatedManifestDigest, 'utf8'), publicKey, Buffer.from(manifest.manifest_signature.value, 'base64'))) {
    add('release_evidence_manifest_signature_invalid');
  }

  const items = manifest.appendix_d_items;
  if (!Array.isArray(items) || items.length !== APPENDIX_D_ITEMS.length || new Set(items.map((item) => item?.id)).size !== APPENDIX_D_ITEMS.length
    || APPENDIX_D_ITEMS.some((id) => !items.some((item) => item?.id === id))) {
    add('appendix_d_evidence_coverage_invalid');
  } else {
    for (const item of items) await validateChecklistItem({ root, read, item, add });
  }

  await validateP12Gaps({ root, read, gaps: manifest.p12_authoring_gaps, add });
  await validateP27Critic({ root, read, releaseId: manifest.release_id, report: manifest.p27_independent_critic, publicKey, add });
  if (manifest.p28_fresh_checkout?.status !== 'passed' || !Array.isArray(manifest.p28_fresh_checkout?.evidence) || manifest.p28_fresh_checkout.evidence.length === 0) {
    add('p28_fresh_checkout_evidence_missing');
  } else {
    for (const evidence of manifest.p28_fresh_checkout.evidence) await validateHashedEvidence({ root, read, evidence, add, code: 'p28_fresh_checkout_evidence_invalid' });
  }
  return result(blockers);
}

async function validateChecklistItem({ root, read, item, add }) {
  if (item.status !== 'passed') {
    add('appendix_d_item_unchecked', MANIFEST_PATH, { item_id: item.id, status: item.status ?? 'missing' });
    return;
  }
  if (!Array.isArray(item.evidence) || item.evidence.length === 0) {
    add('appendix_d_item_evidence_missing', MANIFEST_PATH, { item_id: item.id });
    return;
  }
  for (const evidence of item.evidence) await validateHashedEvidence({ root, read, evidence, add, code: 'appendix_d_evidence_hash_mismatch', details: { item_id: item.id } });
}

async function validateP12Gaps({ root, read, gaps, add }) {
  const expected = new Map([
    ['CANONICAL_G5_INVENTORY_DATA_GAP', 'novgorod:g4-inventory:195'],
    ['DIRECTIONAL_EXIT_READINESS_DATA_GAP', 'novgorod:physical-edge-inventory:358'],
    ['ROUTE_BINDING_DATA_GAP', 'novgorod:graph-edge-inventory:600'],
    ['APPROVED_PROFILE_DATA_GAP', 'novgorod:g4-scene-profiles']
  ]);
  if (!Array.isArray(gaps) || gaps.length !== expected.size || new Set(gaps.map((gap) => gap?.code)).size !== expected.size) {
    add('p12_gap_evidence_coverage_invalid');
    return;
  }
  for (const [code, subject_ref] of expected) {
    const gap = gaps.find((entry) => entry?.code === code);
    if (!gap || gap.subject_ref !== subject_ref) {
      add('p12_gap_identity_or_quantity_mismatch', MANIFEST_PATH, { gap_code: code, subject_ref });
      continue;
    }
    if (gap.status !== 'resolved' || !Array.isArray(gap.resolution_evidence) || gap.resolution_evidence.length === 0) {
      add('spatial_candidate_gap', MANIFEST_PATH, { gap_code: code, subject_ref, resolution_status: gap.status ?? 'missing' });
      continue;
    }
    for (const evidence of gap.resolution_evidence) await validateHashedEvidence({ root, read, evidence, add, code: 'p12_gap_resolution_evidence_invalid', details: { gap_code: code, subject_ref } });
  }
}

async function validateP27Critic({ root, read, releaseId, report, publicKey, add }) {
  if (!report || report.status !== 'passed' || !['PASS', 'PASS WITH NOTES'].includes(report.verdict) || !report.signer || !report.signature?.value) {
    add('p27_independent_critic_evidence_missing');
    return;
  }
  const reportDigest = await validateHashedEvidence({ root, read, evidence: report, add, code: 'p27_independent_critic_hash_mismatch' });
  if (!reportDigest || !publicKey || report.signature.algorithm !== 'ed25519'
    || !verify(null, Buffer.from(`p27:${releaseId}:${reportDigest}`, 'utf8'), publicKey, Buffer.from(report.signature.value, 'base64'))) {
    add('p27_independent_critic_signature_invalid');
  }
}

async function validateHashedEvidence({ root, read, evidence, add, code, details = {} }) {
  const absolute = safePath(root, evidence?.path);
  if (!absolute || !isDigest(evidence?.sha256)) {
    add(code, MANIFEST_PATH, details);
    return null;
  }
  try {
    const actual = sha256(await read(absolute, 'utf8'));
    if (actual !== evidence.sha256) {
      add(code, evidence.path, details);
      return null;
    }
    return actual;
  } catch {
    add(code, evidence.path, details);
    return null;
  }
}

function result(blockers) {
  return FREEZE({
    schema: 'rus.spatial-v3.p28-activation-assessment.v2',
    activation_permitted: blockers.length === 0,
    production_writes: 0,
    composition_changed: false,
    blockers: FREEZE(blockers),
    activation_patch_must_update: FREEZE(['ADR status', 'normative conflict register', 'target/active documentation', 'production composition']),
    required_action: blockers.length === 0 ? 'apply_atomic_activation_patch' : 'reopen_owner_phase_and_keep_v2_production'
  });
}

/** Caller-supplied approval objects are never trusted: this always revalidates disk evidence. */
export async function requireSpatialV3Activation(options = {}) {
  const assessment = await assessSpatialV3Activation(options && typeof options === 'object' && !('activation_permitted' in options) ? options : {});
  if (assessment.activation_permitted) return assessment;
  const error = Object.assign(new Error('P28 activation is blocked by mandatory release evidence.'), { code: 'spatial_v3_activation_blocked', assessment });
  throw error;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const assessment = await assessSpatialV3Activation();
  console.log(JSON.stringify(assessment, null, 2));
  if (!assessment.activation_permitted) process.exitCode = 1;
}
