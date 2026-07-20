import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { validateP12TargetMaterializationApprovalV11, verifyP12DependencyClosureBinding, verifyP12HistoricalIntakeBinding } from '../../tools/spatial-v3/p12-target-materialization-approval-v1_1.mjs';

const SHA = 'a'.repeat(40);
const SUBJECT = 'b'.repeat(40);
const BLOB = 'd'.repeat(40);
const bindingPath = 'evidence/binding.json';
const manifestPath = 'bundle/manifest.json';
const manifestBytes = Buffer.from(JSON.stringify({ files: [{ path: 'approved.json' }] }));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const validBinding = () => ({
  closure_subject_commit: SUBJECT,
  status: 'APPROVED_FOR_P12_DEPENDENCY_CLOSURE',
  allowed_evidence_paths: [],
  closure_manifest_path: manifestPath,
  required_subject_tree_paths: [
    { path: manifestPath, sha256: hash(manifestBytes) },
    { path: 'bundle/manifest.sha256', sha256: hash('abc') },
    { path: 'bundle/approved.json', sha256: hash('abc') }
  ],
});
const gitText = async (_root, args) => {
  if (args[0] === 'show') return SUBJECT;
  if (args[0] === 'rev-parse') return BLOB;
  if (args[0] === 'log') return SHA;
  if (args[0] === 'diff') return bindingPath;
  throw new Error(`unexpected git args ${args.join(' ')}`);
};
const gitRaw = async (_root, args) => {
  const target = args[1].slice(args[1].indexOf(':') + 1);
  if (target === bindingPath) return Buffer.from(JSON.stringify(validBinding()));
  if (target === manifestPath) return manifestBytes;
  return Buffer.from('abc');
};

test('P12 V1.1 immutable payload remains fail-closed when dependency closure evidence is missing', async () => {
  const result = await verifyP12DependencyClosureBinding({
    projectRoot: '.',
    bindingPath,
    head: SHA,
    gitRaw: async () => { throw new Error('missing binding'); }
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [{
    code: 'P12_V11_DEPENDENCY_CLOSURE_EVIDENCE_INVALID',
    subject_ref: bindingPath
  }]);
});

test('P12 dependency closure accepts only an exact two-commit, current, digest-pinned evidence chain', async () => {
  const result = await verifyP12DependencyClosureBinding({ projectRoot: '.', bindingPath, binding: validBinding(), head: SHA, gitText, gitRaw });
  assert.equal(result.ok, true);
  assert.equal(result.dependencyClosureApproved, true);
  assert.deepEqual(result.errors, []);
});

test('P12 closure rejects replay, broad evidence diffs, missing or altered subject files and unapproved evidence', async () => {
  const future = await verifyP12DependencyClosureBinding({ projectRoot: '.', bindingPath, binding: validBinding(), head: 'c'.repeat(40), gitText, gitRaw });
  assert.ok(future.errors.some((entry) => entry.code === 'P12_V11_CLOSURE_BINDING_NOT_INTRODUCED_BY_EVIDENCE_COMMIT'));
  const broad = await verifyP12DependencyClosureBinding({ projectRoot: '.', bindingPath, binding: validBinding(), head: SHA, gitText: async (_root, args) => args[0] === 'diff' ? `${bindingPath}\nunexpected.txt` : gitText(_root, args), gitRaw });
  assert.ok(broad.errors.some((entry) => entry.code === 'P12_V11_CLOSURE_BINDING_COMMIT_SCOPE_INVALID'));
  const missing = await verifyP12DependencyClosureBinding({ projectRoot: '.', bindingPath, binding: validBinding(), head: SHA, gitText, gitRaw: async (_root, args) => args[1].endsWith('bundle/approved.json') ? Promise.reject(new Error('missing')) : gitRaw(_root, args) });
  assert.ok(missing.errors.some((entry) => entry.code === 'P12_V11_CLOSURE_SUBJECT_TREE_PATH_MISSING'));
  const altered = await verifyP12DependencyClosureBinding({ projectRoot: '.', bindingPath, binding: validBinding(), head: SHA, gitText, gitRaw: async (_root, args) => args[1].endsWith('bundle/approved.json') ? Buffer.from('altered') : gitRaw(_root, args) });
  assert.ok(altered.errors.some((entry) => entry.code === 'P12_V11_CLOSURE_SUBJECT_TREE_DIGEST_MISMATCH'));
  const unapproved = validBinding(); unapproved.status = 'PROPOSED_FOR_P12_DEPENDENCY_CLOSURE';
  const pending = await verifyP12DependencyClosureBinding({ projectRoot: '.', bindingPath, binding: unapproved, head: SHA, gitText, gitRaw: async (_root, args) => args[1].endsWith(bindingPath) ? Buffer.from(JSON.stringify(unapproved)) : gitRaw(_root, args) });
  assert.ok(pending.errors.some((entry) => entry.code === 'P12_V11_DEPENDENCY_CLOSURE_EVIDENCE_INVALID'));
});

test('P12 closure rejects duplicate, unsafe or manifest-incomplete subject-tree declarations', async () => {
  for (const mutate of [
    (binding) => binding.required_subject_tree_paths.push(binding.required_subject_tree_paths[0]),
    (binding) => { binding.required_subject_tree_paths[0].path = '../manifest.json'; },
    (binding) => binding.required_subject_tree_paths.pop()
  ]) {
    const candidate = validBinding(); mutate(candidate);
    const raw = async (_root, args) => args[1].endsWith(bindingPath) ? Buffer.from(JSON.stringify(candidate)) : gitRaw(_root, args);
    const result = await verifyP12DependencyClosureBinding({ projectRoot: '.', bindingPath, head: SHA, gitText, gitRaw: raw });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((entry) => ['P12_V11_CLOSURE_SUBJECT_TREE_EVIDENCE_INVALID', 'P12_V11_CLOSURE_SUBJECT_TREE_COVERAGE_INCOMPLETE'].includes(entry.code)));
  }
});

test('historical V1.1 intake remains valid when its evidence commit is an ancestor rather than HEAD', async () => {
  const historical = {
    subject_commit: 'e6be7c06cbd6c37c375658af6f2fe529d4f64353',
    required_subject_tree_paths: [{ path: 'approved.json', sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' }]
  };
  const historicalGit = async (_root, args) => {
    if (args[0] === 'rev-parse') return '3b7e8593543145f7fd3764e372c720858c6b9146';
    if (args[0] === 'log') return '99938a6dc90a0f12a2ecb07872ca8fde4c48a5cb';
    if (args[0] === 'show') return historical.subject_commit;
    if (args[0] === 'merge-base') return '';
    throw new Error(`unexpected git args ${args.join(' ')}`);
  };
  const historicalRaw = async (_root, args) => args[1].endsWith(bindingPath) ? Buffer.from(JSON.stringify(historical)) : Buffer.from('abc');
  const result = await verifyP12HistoricalIntakeBinding({ projectRoot: '.', bindingPath, binding: historical, head: 'c'.repeat(40), gitText: historicalGit, gitRaw: historicalRaw });
  assert.equal(result.ok, true);
});
