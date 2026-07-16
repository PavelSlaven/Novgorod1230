import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const cli = resolve(root, 'packages/knowledge-source/src/cli.js');

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
  assert.equal(result.semantic_coverage_gap_document_ids.length, 23);
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

test('missing required argument returns typed JSON error and non-zero exit', () => {
  const result = runCli(['query', '--root', root]);
  assert.equal(result.status, 2);
  const payload = JSON.parse(result.stderr);
  assert.equal(payload.schema_version, 'rus.knowledge_cli_error.v1');
  assert.equal(payload.code, 'CLI_ARGUMENT_INVALID');
});
