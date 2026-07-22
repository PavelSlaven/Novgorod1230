import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const cli = resolve(root, 'packages/knowledge-source/src/cli.js');
const retrievalPolicy = JSON.parse(readFileSync(resolve(root, 'data/knowledge-source/retrieval-policy.json'), 'utf8'));
const corpusManifest = JSON.parse(readFileSync(resolve(root, 'data/knowledge-source/corpus-manifest.json'), 'utf8'));
const activeDocumentIds = new Set(corpusManifest.documents.filter((document) => document.status === 'active').map((document) => document.document_id));
const baselineGapCount = retrievalPolicy.documents
  .filter((document) => activeDocumentIds.has(document.document_id) && document.semantic_coverage_disposition === 'baseline_gap')
  .length;

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8'
  });
}

function parseJson(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test('status returns machine-readable RAG readiness', () => {
  const result = parseJson(runCli(['status', '--root', root]));
  assert.equal(result.schema_version, 'rus.knowledge_rag_readiness.v1');
  assert.equal(result.status, 'degraded');
  assert.equal(result.semantic_coverage_gap_document_ids.length, baselineGapCount);
});

test('query returns ranked chunks with provenance', () => {
  const result = parseJson(runCli(['query', '--root', root, '--query', 'материализация NPC', '--limit', '3']));
  assert.equal(result.schema_version, 'rus.knowledge_ranked_search_result.v1');
  assert.equal(result.query, 'материализация NPC');
  assert.ok(result.results.length > 0);
  assert.ok(result.results.length <= 3);
  assert.ok(result.results.every((item) => item.document_id && item.source_sha256 && item.start_line >= 1));
});

test('read returns an integrity-checked canonical document', () => {
  const result = parseJson(runCli(['read', '--root', root, '--document-id', 'code-driven-world-materialization-architecture']));
  assert.equal(result.schema_version, 'rus.knowledge_document.v2');
  assert.equal(result.document_id, 'code-driven-world-materialization-architecture');
  assert.match(result.text, /Архитектура кодовой материализации мира/u);
});

test('query can explicitly include non-active statuses only when requested', () => {
  const result = runCli(['query', '--root', root, '--query', 'materialization', '--statuses', 'active,proposed']);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.requested_statuses, ['active', 'proposed']);
});

test('active-only query excludes proposed classification policy while explicit status selection exposes it', () => {
  const query = 'universal category classification policy stable code facet';
  const activeOnly = parseJson(runCli(['query', '--root', root, '--query', query, '--statuses', 'active']));
  assert.ok(activeOnly.results.every((item) => item.document_id !== 'universal-category-classification-policy'));

  const explicit = parseJson(runCli(['query', '--root', root, '--query', query, '--statuses', 'active,proposed']));
  assert.ok(explicit.results.some((item) => item.document_id === 'universal-category-classification-policy'));
  assert.equal(
    explicit.results.find((item) => item.document_id === 'universal-category-classification-policy').status,
    'proposed'
  );
});

test('controls returns a machine-readable successful report', () => {
  const result = parseJson(runCli(['controls', '--root', root]));
  assert.equal(result.schema_version, 'rus.knowledge_retrieval_control_report.v1');
  assert.equal(result.ok, true);
  assert.ok(result.checks.length > 0);
});

test('missing required argument returns typed JSON error and non-zero exit', () => {
  const result = runCli(['query', '--root', root]);
  assert.equal(result.status, 2);
  const payload = JSON.parse(result.stderr);
  assert.equal(payload.schema_version, 'rus.knowledge_cli_error.v1');
  assert.equal(payload.code, 'CLI_ARGUMENT_INVALID');
});

test('unknown command returns a typed argument error', () => {
  const result = runCli(['unknown-command', '--root', root]);
  assert.equal(result.status, 2);
  const payload = JSON.parse(result.stderr);
  assert.equal(payload.schema_version, 'rus.knowledge_cli_error.v1');
  assert.equal(payload.code, 'CLI_ARGUMENT_INVALID');
});
