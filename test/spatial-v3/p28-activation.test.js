import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyP28CiProfile } from '../../tools/spatial-v3/p28-ci-profile.mjs';
import { fetchGitHubReleaseProof, isAcceptedP27Critic, P28_APPENDIX_D_ITEMS, P28_P12_GAPS, validateAppendixDItems, validateGitHubReleaseProof, validateReleaseEvidenceShape, verifyP28EvidenceCommitBinding } from '../../tools/spatial-v3/p28-activation-gate.mjs';

const evidenceCommit = 'a'.repeat(40);
const config = Object.freeze({
  schema: 'rus.spatial-v3.github-release-proof.v1', version: 1,
  repository: 'PavelSlaven/Novgorod1230', base_ref: 'main', pull_request_number: 14,
  required_checks: ['clean-clone-generation-test'], completion_proof: { kind: 'github_merge' }
});
function completedProof(overrides = {}) {
  return {
    pull: { draft: false, merged: true, base: { ref: 'main', repo: { full_name: 'PavelSlaven/Novgorod1230' } }, head: { sha: evidenceCommit }, merge_commit_sha: 'b'.repeat(40) },
    checks: { check_runs: [{ name: 'clean-clone-generation-test', status: 'completed', conclusion: 'success' }] },
    completion: { kind: 'github_merge', compare: { status: 'ahead' } }, ...overrides
  };
}
function codes(configToTest, proof) {
  const blockers = [];
  validateGitHubReleaseProof({ config: configToTest, proof, evidenceCommit, add: (code, _path, details = {}) => blockers.push({ code, ...details }) });
  return blockers;
}

test('P28 GitHub proof accepts a solo-maintainer exact PR head with its pinned successful check and merge ancestry', () => {
  assert.deepEqual(codes(config, completedProof()), []);
  assert.deepEqual(codes(config, completedProof({ reviews: [] })), []);
  assert.equal(P28_APPENDIX_D_ITEMS.length, 58);
  assert.equal(P28_P12_GAPS.length, 4);
});

test('P28 GitHub proof fails closed for a pending/missing check, draft or unmerged PR, and merge mismatch', () => {
  assert(codes(config, completedProof({ pull: { ...completedProof().pull, head: { sha: 'c'.repeat(40) } } })).some(({ code }) => code === 'github_release_proof_head_mismatch'));
  assert(codes(config, completedProof({ checks: { check_runs: [{ name: 'clean-clone-generation-test', conclusion: 'in_progress' }] } })).some(({ code }) => code === 'github_release_proof_required_check_missing_or_not_success'));
  assert(codes(config, completedProof({ checks: { check_runs: [{ name: 'clean-clone-generation-test', status: 'in_progress', conclusion: 'success' }] } })).some(({ code }) => code === 'github_release_proof_required_check_missing_or_not_success'));
  assert(codes(config, completedProof({ pull: { draft: true, merged: false, head: { sha: evidenceCommit }, merge_commit_sha: 'b'.repeat(40) } })).some(({ code }) => code === 'github_release_proof_pr_draft'));
  assert(codes(config, completedProof({ pull: { draft: false, merged: false, head: { sha: evidenceCommit }, merge_commit_sha: 'b'.repeat(40) } })).some(({ code }) => code === 'github_release_proof_pr_unmerged'));
  assert(codes(config, completedProof({ pull: { ...completedProof().pull, base: { ref: 'release', repo: { full_name: 'PavelSlaven/Novgorod1230' } } } })).some(({ code }) => code === 'github_release_proof_base_mismatch'));
  assert(codes(config, completedProof({ completion: { kind: 'github_merge', compare: { status: 'diverged' } } })).some(({ code }) => code === 'github_release_proof_merge_mismatch'));
});

test('P28 accepts only an exact PASS from the candidate-bound independent critic', () => {
  const report = { status: 'passed', verdict: 'PASS', activation_candidate_commit: evidenceCommit };
  assert.equal(isAcceptedP27Critic(report, evidenceCommit), true);
  assert.equal(isAcceptedP27Critic({ ...report, verdict: 'PASS WITH NOTES' }, evidenceCommit), false);
  assert.equal(isAcceptedP27Critic({ ...report, activation_candidate_commit: 'c'.repeat(40) }, evidenceCommit), false);
});

test('P28 GitHub proof validates signed annotated tags against the exact commit and configured local trust', () => {
  const tagConfig = { ...config, completion_proof: { kind: 'signed_annotated_tag', tag_name: 'spatial-v3-v1' } };
  const valid = completedProof({ completion: { kind: 'signed_annotated_tag', tag: { object: { type: 'tag', sha: 'd'.repeat(40) } }, annotated: { object: { type: 'commit', sha: evidenceCommit }, verification: { verified: true, reason: 'valid' } }, local_verification: { verified: true, fingerprint: 'f'.repeat(40) } } });
  assert.deepEqual(codes(tagConfig, valid), []);
  assert.deepEqual(codes(tagConfig, { ...valid, pull: { ...valid.pull, merged: false } }), []);
  assert(codes(tagConfig, { ...valid, completion: { ...valid.completion, local_verification: { verified: false } } }).some(({ code }) => code === 'github_release_proof_signed_tag_invalid_or_untrusted'));
});

test('GitHub adapter is a network boundary and assembles exact PR, check and merge evidence', async () => {
  const urls = [];
  const response = (body) => ({ ok: true, json: async () => body });
  const proof = await fetchGitHubReleaseProof({ ...config, evidenceCommit, fetchImpl: async (url) => {
    urls.push(url);
    if (url.includes('/check-runs')) return response({ check_runs: [{ name: 'clean-clone-generation-test', status: 'completed', conclusion: 'success' }] });
    if (url.includes('/compare/')) return response({ status: 'ahead' });
    return response({ draft: false, merged: true, base: { ref: 'main', repo: { full_name: 'PavelSlaven/Novgorod1230' } }, head: { sha: evidenceCommit }, merge_commit_sha: 'b'.repeat(40) });
  } });
  assert.equal(urls.length, 3);
  assert(!urls.some((url) => url.includes('/reviews')));
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

test('one complete Appendix D manifest is locally ready without a duplicate fresh-checkout authority', () => {
  const evidence = [{ path: 'docs/migration/spatial-v3/p28-appendix-d-evidence-ledger.md', sha256: 'f'.repeat(64) }];
  const items = P28_APPENDIX_D_ITEMS.map((id) => ({ id, status: 'passed', evidence }));
  assert.deepEqual(validateAppendixDItems(items), []);
  assert(validateAppendixDItems(items.map((item, index) => index === 0 ? { ...item, status: 'blocked' } : item)).some(({ code }) => code === 'appendix_d_item_unchecked'));
  assert.deepEqual(validateReleaseEvidenceShape({ appendix_d_items: items }), []);
  assert(validateReleaseEvidenceShape({ appendix_d_items: items, p28_fresh_checkout: { status: 'passed' } }).some(({ code }) => code === 'duplicate_fresh_checkout_authority_forbidden'));
});

test('required CI uses the light profile only for an exact evidence child', () => {
  const manifest = 'docs/migration/spatial-v3/release-evidence.v1.json';
  const allowed = ['docs/migration/spatial-v3/p27-candidate-evidence.md', 'docs/migration/spatial-v3/p28-appendix-d-evidence-ledger.md'];
  assert.equal(classifyP28CiProfile([manifest, ...allowed], allowed), 'evidence_only');
  assert.equal(classifyP28CiProfile([manifest, 'tools/spatial-v3/p28-activation-gate.mjs'], allowed), 'full');
  assert.equal(classifyP28CiProfile(allowed, allowed), 'full');
});
