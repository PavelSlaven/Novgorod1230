import assert from 'node:assert/strict';
import test from 'node:test';
import { validateP12TargetMaterializationApprovalV11, verifyP12SubjectCommitBinding } from '../../tools/spatial-v3/p12-target-materialization-approval-v1_1.mjs';

const SHA = 'a'.repeat(40);
const SUBJECT = 'b'.repeat(40);
const bindingPath = 'evidence/binding.json';
const validBinding = () => ({
  binding_commit: SHA,
  subject_commit: SUBJECT,
  allowed_evidence_paths: [],
  required_subject_tree_paths: [{ path: 'approved.json', sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' }],
  approved_dependency_closure: { status: 'APPROVED', evidence_commit: SHA, evidence_id: 'closure-1' },
});
const gitText = async (_root, args) => {
  if (args[0] === 'show') return SUBJECT;
  if (args[0] === 'log') return SHA;
  if (args[0] === 'diff') return bindingPath;
  throw new Error(`unexpected git args ${args.join(' ')}`);
};
const gitRaw = async () => Buffer.from('abc');

test('P12 V1.1 immutable payload remains fail-closed until approved dependency closure evidence is current', async () => {
  const result = await validateP12TargetMaterializationApprovalV11();
  assert.equal(result.ok, false);
  assert.equal(result.materialization_authorized, false);
  assert.equal(result.p12_operational_gaps_closed, false);
  assert.equal(result.p28_activation, 'not_authorized');
  assert.ok(result.errors.some((entry) => entry.code === 'P12_V11_SUBJECT_COMMIT_BINDING_INVALID' || entry.code === 'P12_V11_BINDING_HEAD_REPLAY_OR_FUTURE'));
});

test('P12 V1.1 accepts only an exact two-commit, current, digest-pinned evidence chain', async () => {
  const result = await verifyP12SubjectCommitBinding({ projectRoot: '.', bindingPath, binding: validBinding(), head: SHA, gitText, gitRaw });
  assert.equal(result.ok, true);
  assert.equal(result.dependencyClosureApproved, true);
  assert.deepEqual(result.errors, []);
});

test('P12 V1.1 rejects replay, broad evidence diffs, missing or altered subject files and unapproved dependency closure', async () => {
  const replay = await verifyP12SubjectCommitBinding({ projectRoot: '.', bindingPath, binding: validBinding(), head: 'c'.repeat(40), gitText, gitRaw });
  assert.ok(replay.errors.some((entry) => entry.code === 'P12_V11_BINDING_HEAD_REPLAY_OR_FUTURE'));
  const broad = await verifyP12SubjectCommitBinding({ projectRoot: '.', bindingPath, binding: validBinding(), head: SHA, gitText: async (_root, args) => args[0] === 'diff' ? `${bindingPath}\nunexpected.txt` : gitText(_root, args), gitRaw });
  assert.ok(broad.errors.some((entry) => entry.code === 'P12_V11_BINDING_COMMIT_SCOPE_INVALID'));
  const missing = await verifyP12SubjectCommitBinding({ projectRoot: '.', bindingPath, binding: validBinding(), head: SHA, gitText, gitRaw: async () => { throw new Error('missing'); } });
  assert.ok(missing.errors.some((entry) => entry.code === 'P12_V11_SUBJECT_TREE_PATH_MISSING'));
  const altered = await verifyP12SubjectCommitBinding({ projectRoot: '.', bindingPath, binding: validBinding(), head: SHA, gitText, gitRaw: async () => Buffer.from('altered') });
  assert.ok(altered.errors.some((entry) => entry.code === 'P12_V11_SUBJECT_TREE_DIGEST_MISMATCH'));
  const unapproved = validBinding(); unapproved.approved_dependency_closure.status = 'PENDING';
  const pending = await verifyP12SubjectCommitBinding({ projectRoot: '.', bindingPath, binding: unapproved, head: SHA, gitText, gitRaw });
  assert.ok(pending.errors.some((entry) => entry.code === 'P12_V11_DEPENDENCY_CLOSURE_EVIDENCE_MISSING'));
});
