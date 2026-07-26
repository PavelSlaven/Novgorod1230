import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, posix, resolve, win32 } from 'node:path';
import { pathToFileURL } from 'node:url';

export const READINESS_MANIFEST_PATH =
  'docs/implementation/lower-dvina-first-playable/evidence/first_playable_content_readiness_manifest.v1.json';

const SCHEMA = 'rus.lower_dvina.first_playable_content_readiness_manifest.v1';
const CAPABILITIES = Object.freeze(['local_scene', 'boundary_crossing']);
const CHECK_IDENTITY = Object.freeze({
  immediate_action: 'action_run_id',
  timed_activity: 'activity_execution_id+attempt_ordinal',
  traversal: 'traversal_interval_result_id'
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function repositoryPath(value) {
  return typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    !isAbsolute(value) &&
    !win32.isAbsolute(value) &&
    posix.normalize(value) === value &&
    value.split('/').every((part) => part !== '.' && part !== '..');
}

function isDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function isCommitSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
}

function stringArray(value, { empty = false } = {}) {
  return Array.isArray(value) &&
    (empty || value.length > 0) &&
    new Set(value).size === value.length &&
    value.every((entry) => typeof entry === 'string' && entry.length > 0);
}

export async function validateFirstPlayableReadiness(
  manifest,
  { readRepositoryFile = (path) => readFile(resolve(path)) } = {}
) {
  const errors = [];
  const issue = (code, details = {}) => errors.push(Object.freeze({ code, ...details }));

  if (manifest?.schema !== SCHEMA || manifest?.version !== 1) {
    issue('readiness_manifest_schema_invalid');
  }
  if (!isCommitSha(manifest?.exact_head)) issue('readiness_exact_head_invalid');
  if (manifest?.manifest_status !== 'sealed_valid') issue('readiness_manifest_status_invalid');

  const capabilityKeys = Object.keys(manifest?.capabilities ?? {});
  if (capabilityKeys.length !== CAPABILITIES.length ||
      CAPABILITIES.some((key) => !capabilityKeys.includes(key))) {
    issue('readiness_capability_coverage_invalid');
  } else {
    for (const capability of CAPABILITIES) {
      const gate = manifest.capabilities[capability];
      if (!['ready', 'blocked'].includes(gate?.status) ||
          !stringArray(gate?.blocking_gaps, { empty: true }) ||
          (gate.status === 'ready' && gate.blocking_gaps.length > 0) ||
          (gate.status === 'blocked' && gate.blocking_gaps.length === 0)) {
        issue('readiness_capability_gate_invalid', { capability });
      }
    }
  }

  if (!Array.isArray(manifest?.scopes) || manifest.scopes.length === 0) {
    issue('readiness_scope_coverage_empty');
  } else {
    const scopeKeys = new Set();
    for (const scope of manifest.scopes) {
      const typedKey = scope?.scope_key;
      const canonicalKey = `${typedKey?.kind ?? ''}:${typedKey?.id ?? ''}`;
      if (!typedKey || typeof typedKey.kind !== 'string' || typeof typedKey.id !== 'string' ||
          typedKey.kind.length === 0 || typedKey.id.length === 0 || scopeKeys.has(canonicalKey)) {
        issue('readiness_typed_scope_key_invalid', { scope_key: canonicalKey });
      }
      scopeKeys.add(canonicalKey);

      if (!repositoryPath(scope?.source_path) || !isDigest(scope?.source_sha256) ||
          !stringArray(scope?.stable_ids) || !stringArray(scope?.applicability) ||
          !stringArray(scope?.blocking_gaps, { empty: true }) ||
          !isDigest(scope?.candidate_set_digest) ||
          !Number.isInteger(scope?.candidate_count) || scope.candidate_count < 0 ||
          !Number.isInteger(scope?.compatible_tuple_count) || scope.compatible_tuple_count < 0 ||
          scope.compatible_tuple_count > scope.candidate_count) {
        issue('readiness_scope_contract_invalid', { scope_key: canonicalKey });
        continue;
      }
      if (scope.compatible_tuple_count === 0 && scope.blocking_gaps.length === 0) {
        issue('readiness_empty_candidate_set_without_gap', { scope_key: canonicalKey });
      }
      if (scope.approval_status !== 'approved' && scope.compatible_tuple_count !== 0) {
        issue('readiness_unapproved_scope_must_fail_closed', { scope_key: canonicalKey });
      }
      try {
        const bytes = await readRepositoryFile(scope.source_path);
        if (sha256(bytes) !== scope.source_sha256) {
          issue('readiness_source_digest_mismatch', { scope_key: canonicalKey });
        }
      } catch {
        issue('readiness_source_unreadable', { scope_key: canonicalKey });
      }
      if (scope.approval_evidence !== undefined) {
        if (!Array.isArray(scope.approval_evidence) || scope.approval_evidence.length === 0) {
          issue('readiness_approval_evidence_invalid', { scope_key: canonicalKey });
        } else {
          for (const evidence of scope.approval_evidence) {
            if (!repositoryPath(evidence?.path) || !isDigest(evidence?.sha256)) {
              issue('readiness_approval_evidence_invalid', { scope_key: canonicalKey });
              continue;
            }
            try {
              const evidenceBytes = await readRepositoryFile(evidence.path);
              if (sha256(evidenceBytes) !== evidence.sha256) {
                issue('readiness_approval_evidence_digest_mismatch', {
                  scope_key: canonicalKey,
                  evidence_path: evidence.path
                });
              }
            } catch {
              issue('readiness_approval_evidence_unreadable', {
                scope_key: canonicalKey,
                evidence_path: evidence.path
              });
            }
          }
        }
      }
    }
  }

  if (!stringArray(manifest?.unresolved_required_scopes, { empty: true })) {
    issue('readiness_unresolved_scopes_invalid');
  }
  if (manifest?.activation?.requested !== false ||
      manifest?.activation?.production_activation !== false ||
      manifest?.activation?.operator_database_touched !== false) {
    issue('readiness_activation_boundary_invalid');
  }

  return Object.freeze({
    schema: 'rus.lower_dvina.first_playable_content_readiness_assessment.v1',
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    capability_gates: Object.freeze(Object.fromEntries(CAPABILITIES.map((capability) => [
      capability,
      Object.freeze({
        ready: manifest?.capabilities?.[capability]?.status === 'ready',
        blocking_gaps: Object.freeze([...(manifest?.capabilities?.[capability]?.blocking_gaps ?? [])])
      })
    ]))),
    check_identity: CHECK_IDENTITY,
    production_activation: false
  });
}

export async function readAndValidateFirstPlayableReadiness(root = process.cwd()) {
  const path = resolve(root, READINESS_MANIFEST_PATH);
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  return validateFirstPlayableReadiness(manifest, {
    readRepositoryFile: (repositoryPath) => readFile(resolve(root, repositoryPath))
  });
}

async function main() {
  const root = resolve(process.argv[2] ?? process.cwd());
  const result = await readAndValidateFirstPlayableReadiness(root);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
