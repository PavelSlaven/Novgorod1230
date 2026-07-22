import assert from 'node:assert/strict';
import test from 'node:test';
import { assessSpatialV3Activation, fetchGitHubReleaseProof, P28_APPENDIX_D_ITEMS, P28_P12_GAPS, requireSpatialV3Activation, validateGitHubReleaseProof, verifyP28EvidenceCommitBinding } from '../../tools/spatial-v3/p28-activation-gate.mjs';

const evidenceCommit = 'a'.repeat(40);
const config = Object.freeze({
  schema: 'rus.spatial-v3.github-release-proof.v1', version: 1,
  repository: 'PavelSlaven/Novgorod1230', base_ref: 'main', pull_request_number: 14,
  required_checks: ['clean-clone-generation-test'], completion_proof: { kind: 'github_merge' }
});
function approvedProof(overrides = {}) {
  return {
    pull: { draft: false, merged: true, base: { ref: 'main', repo: { full_name: 'PavelSlaven/Novgorod1230' } }, head: { sha: evidenceCommit }, merge_commit_sha: 'b'.repeat(40) },
    reviews: [{ state: 'APPROVED', commit_id: evidenceCommit }],
    checks: { check_runs: [{ name: 'clean-clone-generation-test', status: 'completed', conclusion: 'success' }] },
    completion: { kind: 'github_merge', compare: { status: 'ahead' } }, ...overrides
  };
}
function codes(configToTest, proof) {
  const blockers = [];
  validateGitHubReleaseProof({ config: configToTest, proof, evidenceCommit, add: (code, _path, details = {}) => blockers.push({ code, ...details }) });
  return blockers;
}

test('P28 GitHub proof accepts only an exact approved PR head with its pinned successful check and merge ancestry', () => {
  assert.deepEqual(codes(config, approvedProof()), []);
  assert.equal(P28_APPENDIX_D_ITEMS.length, 58);
  assert.equal(P28_P12_GAPS.length, 4);
});

test('P28 GitHub proof fails closed for a stale approval, pending/missing check, draft or unmerged PR, and merge mismatch', () => {
  assert(codes(config, approvedProof({ reviews: [{ state: 'APPROVED', commit_id: 'c'.repeat(40) }] })).some(({ code }) => code === 'github_release_proof_exact_approval_missing'));
  assert(codes(config, approvedProof({ checks: { check_runs: [{ name: 'clean-clone-generation-test', conclusion: 'in_progress' }] } })).some(({ code }) => code === 'github_release_proof_required_check_missing_or_not_success'));
  assert(codes(config, approvedProof({ checks: { check_runs: [{ name: 'clean-clone-generation-test', status: 'in_progress', conclusion: 'success' }] } })).some(({ code }) => code === 'github_release_proof_required_check_missing_or_not_success'));
  assert(codes(config, approvedProof({ pull: { draft: true, merged: false, head: { sha: evidenceCommit }, merge_commit_sha: 'b'.repeat(40) } })).some(({ code }) => code === 'github_release_proof_pr_draft'));
  assert(codes(config, approvedProof({ pull: { draft: false, merged: false, head: { sha: evidenceCommit }, merge_commit_sha: 'b'.repeat(40) } })).some(({ code }) => code === 'github_release_proof_pr_unmerged'));
  assert(codes(config, approvedProof({ pull: { ...approvedProof().pull, base: { ref: 'release', repo: { full_name: 'PavelSlaven/Novgorod1230' } } } })).some(({ code }) => code === 'github_release_proof_base_mismatch'));
  assert(codes(config, approvedProof({ completion: { kind: 'github_merge', compare: { status: 'diverged' } } })).some(({ code }) => code === 'github_release_proof_merge_mismatch'));
});

test('P28 GitHub proof validates signed annotated tags against the exact commit and configured local trust', () => {
  const tagConfig = { ...config, completion_proof: { kind: 'signed_annotated_tag', tag_name: 'spatial-v3-v1' } };
  const valid = approvedProof({ completion: { kind: 'signed_annotated_tag', tag: { object: { type: 'tag', sha: 'd'.repeat(40) } }, annotated: { object: { type: 'commit', sha: evidenceCommit }, verification: { verified: true, reason: 'valid' } }, local_verification: { verified: true, fingerprint: 'f'.repeat(40) } } });
  assert.deepEqual(codes(tagConfig, valid), []);
  assert.deepEqual(codes(tagConfig, { ...valid, pull: { ...valid.pull, merged: false } }), []);
  assert(codes(tagConfig, { ...valid, completion: { ...valid.completion, local_verification: { verified: false } } }).some(({ code }) => code === 'github_release_proof_signed_tag_invalid_or_untrusted'));
});

test('GitHub adapter is a network boundary and assembles exact PR, review, check and merge evidence', async () => {
  const urls = [];
  const response = (body) => ({ ok: true, json: async () => body });
  const proof = await fetchGitHubReleaseProof({ ...config, evidenceCommit, fetchImpl: async (url) => {
    urls.push(url);
    if (url.includes('/pulls/14/reviews')) return response([{ state: 'APPROVED', commit_id: evidenceCommit }]);
    if (url.includes('/check-runs')) return response({ check_runs: [{ name: 'clean-clone-generation-test', status: 'completed', conclusion: 'success' }] });
    if (url.includes('/compare/')) return response({ status: 'ahead' });
    return response({ draft: false, merged: true, base: { ref: 'main', repo: { full_name: 'PavelSlaven/Novgorod1230' } }, head: { sha: evidenceCommit }, merge_commit_sha: 'b'.repeat(40) });
  } });
  assert.equal(urls.length, 4);
  assert.deepEqual(codes(config, proof), []);
});

test('P28 evidence scope is read from the immutable candidate and blocks a self-added runtime allowlist', async () => {
  const candidate = 'b'.repeat(40); const head = 'c'.repeat(40);
  const scopePath = 'docs/migration/spatial-v3/p28-evidence-scope.v1.json';
  const manifest = { activation_candidate_commit: candidate, evidence_commit_allowed_paths: ['apps/game-server/src/server.js'] };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const scopeBytes = Buffer.from(JSON.stringify({ schema: 'rus.spatial-v3.p28-evidence-scope.v1', version: 1, allowed_evidence_child_paths: ['docs/migration/spatial-v3/p28-appendix-d-evidence-ledger.md'] }));
  const verify = async ({ args }) => {
    if (args[0] === 'rev-parse') return head;
    if (args[0] === 'log') return head;
    if (args[0] === 'rev-list') return `${head} ${candidate}`;
    if (args[0] === 'diff-tree') return 'docs/migration/spatial-v3/release-evidence.v1.json\ndocs/migration/spatial-v3/p28-appendix-d-evidence-ledger.md';
    throw new Error(`unexpected git text ${args.join(' ')}`);
  };
  const options = { manifest, manifestBytes, gitText: (_root, args) => verify({ args }), gitRaw: async (_root, args) => args[1] === `${candidate}:${scopePath}` ? scopeBytes : manifestBytes };
  assert.deepEqual(await verifyP28EvidenceCommitBinding(options), []);
  const rejected = await verifyP28EvidenceCommitBinding({ ...options, gitText: async (_root, args) => args[0] === 'diff-tree' ? 'docs/migration/spatial-v3/release-evidence.v1.json\napps/game-server/src/server.js' : verify({ args }) });
  assert(rejected.some(({ code }) => code === 'activation_evidence_commit_scope_invalid'));
});

test('current deferred manifest remains blocked and production ignores caller-supplied approvals', async () => {
  const assessment = await assessSpatialV3Activation({ githubProofClient: async () => approvedProof() });
  assert.equal(assessment.activation_permitted, false);
  assert(assessment.blockers.some(({ code }) => code === 'appendix_d_item_unchecked'));
  await assert.rejects(() => requireSpatialV3Activation({ githubProofClient: async () => approvedProof() }), { code: 'spatial_v3_activation_blocked' });
});
