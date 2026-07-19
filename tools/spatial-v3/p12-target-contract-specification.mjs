import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(import.meta.dirname, '../..');
const INDEX_PATH = 'data/world-catalogs/novgorod/spatial-v3/source-approval/index.json';
const EXPECTED = Object.freeze({
  package_id: 'p12_target_contract_compilation_spec_v1',
  package_path: 'data/world-catalogs/novgorod/spatial-v3/target-contract-spec/P12_TARGET_CONTRACT_COMPILATION_SPEC_V1.zip',
  sha256: '1833b383e5ee2568330ab88ae40c7d5b9d057dbde81aa4f43641c48ecd3eb6f3',
  bound_source_zip_sha256: 'e3342beac492ff6433a03ecbf7c32dbffdc9dafce8e7ebd623af826b33d7bbbe',
  status: 'specification_pass_activation_blocked'
});

const digest = (value) => createHash('sha256').update(value).digest('hex');
const issue = (code, subject_ref) => Object.freeze({ code, subject_ref });
const inside = (root, candidate) => {
  const path = relative(root, candidate);
  return !!path && path !== '..' && !path.startsWith(`..${sep}`);
};

/**
 * Validates only the byte-pinned editorial specification.  It deliberately
 * does not promote its proposed contracts, fill its stated hard blocks, or
 * authorize P28.  A SHA-256 pin authenticates the exact ZIP bytes while the
 * source package validator remains responsible for source-data validation.
 */
export async function validateP12TargetContractSpecification({ root = ROOT, indexPath = INDEX_PATH } = {}) {
  const projectRoot = resolve(root);
  let index;
  try { index = JSON.parse(await readFile(resolve(projectRoot, indexPath), 'utf8')); }
  catch { return Object.freeze({ ok: false, errors: Object.freeze([issue('P12_TARGET_SPEC_INDEX_MISSING', indexPath)]) }); }
  const spec = index?.target_contract_specification;
  const errors = [];
  for (const key of ['package_id', 'package_path', 'sha256', 'bound_source_zip_sha256', 'status']) {
    if (spec?.[key] !== EXPECTED[key]) errors.push(issue('P12_TARGET_SPEC_IDENTITY_MISMATCH', key));
  }
  if (spec?.activation !== 'not_authorized' || spec?.authoring_contract_status !== 'proposed_not_active') {
    errors.push(issue('P12_TARGET_SPEC_STATUS_INVALID', 'target_contract_specification'));
  }
  const requiredBlocks = ['p12_target_world_revision_missing', 'p12_parent_version_pin_missing', 'p12_connection_profile_missing', 'p12_route_chain_missing', 'p27_signed_evidence_missing', 'fresh_checkout_evidence_missing'];
  if (!Array.isArray(spec?.unresolved_hard_blocks) || requiredBlocks.some((code) => !spec.unresolved_hard_blocks.includes(code))) {
    errors.push(issue('P12_TARGET_SPEC_BLOCK_LEDGER_INVALID', 'unresolved_hard_blocks'));
  }
  const zip = resolve(projectRoot, spec?.package_path ?? '');
  if (!inside(projectRoot, zip)) errors.push(issue('P12_TARGET_SPEC_PATH_ESCAPE', spec?.package_path ?? 'unknown'));
  else {
    try {
      if (digest(await readFile(zip)) !== EXPECTED.sha256) errors.push(issue('P12_TARGET_SPEC_DIGEST_MISMATCH', spec.package_path));
    } catch { errors.push(issue('P12_TARGET_SPEC_PACKAGE_MISSING', spec?.package_path ?? 'unknown')); }
  }
  return Object.freeze({
    ok: errors.length === 0,
    package_id: EXPECTED.package_id,
    package_path: EXPECTED.package_path,
    activation: 'not_authorized',
    compilation: 'blocked_pending_branch_owned_approved_inputs',
    errors: Object.freeze(errors)
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validateP12TargetContractSpecification();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
