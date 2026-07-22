import { readFile } from 'node:fs/promises';

const [gate, test, manifest, packageJson, log] = await Promise.all([
  readFile('tools/spatial-v3/p28-activation-gate.mjs', 'utf8'),
  readFile('test/spatial-v3/p28-activation.test.js', 'utf8'),
  readFile('docs/migration/spatial-v3/release-evidence.v1.json', 'utf8'),
  readFile('package.json', 'utf8'), readFile('docs/migration/spatial-v3/README.md', 'utf8')
]);
for (const token of ['assessSpatialV3Activation', 'requireSpatialV3Activation', 'fetchGitHubReleaseProof', 'validateGitHubReleaseProof', 'verifyP28EvidenceCommitBinding', 'candidateEvidenceScope', 'p28-evidence-scope.v1.json', 'verifyCommittedRepositoryBytes', 'production_writes: 0', 'composition_changed: false', 'spatial_candidate_gap', 'appendix_d_evidence_coverage_invalid', 'github_release_proof_pr_draft', 'github_release_proof_base_mismatch', 'github_release_proof_exact_approval_missing', 'github_release_proof_required_check_missing_or_not_success', 'github_release_proof_merge_mismatch', 'github_release_proof_signed_tag_invalid_or_untrusted', 'keep_v2_production']) if (!gate.includes(token)) throw new Error(`P28 gate lacks ${token}`);
for (const token of ['exact approved PR head', 'stale approval', 'signed annotated tags', 'network boundary', 'caller-supplied approvals']) if (!test.includes(token)) throw new Error(`P28 test lacks ${token}`);
for (const forbidden of ['validateP28RoleSignature', 'loadP28TrustStore', 'ed25519', 'manifest_signature']) if (gate.toLowerCase().includes(forbidden)) throw new Error(`obsolete P28 authority remains: ${forbidden}`);
const parsed = JSON.parse(manifest);
if (parsed.github_release_proof?.repository !== 'PavelSlaven/Novgorod1230' || !parsed.github_release_proof.required_checks?.includes('clean-clone-generation-test') || parsed.evidence_commit_allowed_paths || parsed.manifest_signature || parsed.manifest_signer) throw new Error('P28 manifest has not adopted immutable GitHub-proof authority');
const scripts = JSON.parse(packageJson).scripts;
if (!scripts['spatial-v3:test-p28']?.includes('p28-activation.test.js') || !scripts['spatial-v3:check-p28'] || !scripts['spatial-v3:p28-github-release-proof']) throw new Error('P28 package scripts are incomplete');
if (!log.includes('P28 — atomic activation gate') || !log.includes('GitHub proof')) throw new Error('P28 work log is missing GitHub-proof authority');
console.log('P28 activation gate: OK (GitHub proof is explicit; deferred activation is non-mutating)');
