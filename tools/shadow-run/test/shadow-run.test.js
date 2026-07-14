import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  REQUIRED_SHADOW_CATEGORIES,
  buildShadowReport,
  compareStructuralObservations,
  parseTapSummary,
  runShadowCorpus,
  validateShadowManifest
} from '../src/index.js';

function manifest(cases) {
  return {
    schema_version: 'rus.shadow_corpus.v1',
    version: 1,
    corpus_id: 'test-corpus',
    comparison_policy: { prose_comparison: 'semantic_invariants_only' },
    cases
  };
}

function coveredCase(overrides = {}) {
  return {
    id: 'covered',
    kind: 'rollback',
    severity: 'blocking',
    test_file: 'test/pass.test.js',
    categories: [...REQUIRED_SHADOW_CATEGORIES],
    ...overrides
  };
}

test('manifest requires every normative comparison category and safe test paths', () => {
  const valid = validateShadowManifest(manifest([coveredCase()]), '/tmp/root');
  assert.equal(valid.cases.length, 1);
  assert.throws(() => validateShadowManifest(manifest([{ ...coveredCase(), categories: ['schema_equivalence'] }]), '/tmp/root'), (error) => error.code === 'SHADOW_MANIFEST_INVALID');
  assert.throws(() => validateShadowManifest(manifest([coveredCase({ test_file: '../escape.test.js' })]), '/tmp/root'), (error) => error.code === 'SHADOW_MANIFEST_INVALID');
});

test('TAP summary parser extracts test totals and failing names', () => {
  const parsed = parseTapSummary('TAP version 13\nnot ok 1 - broken invariant\n# tests 2\n# pass 1\n# fail 1\n# skipped 0\n# duration_ms 12.5\n');
  assert.deepEqual(parsed.failed_tests, ['broken invariant']);
  assert.equal(parsed.tests, 2);
  assert.equal(parsed.pass, 1);
  assert.equal(parsed.fail, 1);
  assert.equal(parsed.duration_ms, 12.5);
});

test('structural comparison ignores prose but not audits or hidden-boundary flags', () => {
  const legacy = { schema: 'screen', prose: 'old words', audit: { pass: true }, hidden_leak: false };
  const modular = { schema: 'screen', prose: 'new words', audit: { pass: true }, hidden_leak: false };
  assert.equal(compareStructuralObservations(legacy, modular).equivalent, true);
  const failed = compareStructuralObservations(legacy, { ...modular, hidden_leak: true });
  assert.equal(failed.equivalent, false);
  assert.equal(failed.differences[0].path, '$.hidden_leak');
});

test('report recommends staged cutover only with full coverage, zero blockers and passed rollback', () => {
  const validManifest = validateShadowManifest(manifest([coveredCase()]), '/tmp/root');
  const result = {
    id: 'covered', kind: 'rollback', severity: 'blocking', test_file: 'test/pass.test.js',
    categories: [...REQUIRED_SHADOW_CATEGORIES], status: 'passed', exit_code: 0, duration_ms: 1,
    tests: 1, pass: 1, fail: 0, skipped: 0, failed_tests: [], stderr_tail: ''
  };
  const report = buildShadowReport({ manifest: validManifest, caseResults: [result], startedAt: 'a', completedAt: 'b' });
  assert.equal(report.recommendation.decision, 'go_to_staged_cutover');
  const blocked = buildShadowReport({ manifest: validManifest, caseResults: [{ ...result, status: 'failed', fail: 1, pass: 0, failed_tests: ['x'] }], startedAt: 'a', completedAt: 'b' });
  assert.equal(blocked.recommendation.decision, 'no_go');
});

test('runner executes allowlisted Node tests and writes a report model', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shadow-run-'));
  await mkdir(join(root, 'test'), { recursive: true });
  await writeFile(join(root, 'test/pass.test.js'), "import test from 'node:test'; import assert from 'node:assert/strict'; test('ok',()=>assert.equal(1,1));\n");
  const validManifest = validateShadowManifest(manifest([coveredCase()]), root);
  const report = await runShadowCorpus({ root, manifest: validManifest, runId: 'unit-shadow' });
  assert.equal(report.totals.case_count, 1);
  assert.equal(report.totals.failed_case_count, 0);
  assert.equal(report.recommendation.decision, 'go_to_staged_cutover');
});
