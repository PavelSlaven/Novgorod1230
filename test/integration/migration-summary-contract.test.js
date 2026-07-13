import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();

async function readJson(path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'));
}

test('root migration summaries delegate mutable knowledge counts and evidence', async () => {
  const summary = await readFile(resolve(root, 'MIGRATION_PHASES_SHORT.md'), 'utf8');
  const corpusMigrationReport = await readFile(resolve(root, 'docs/migration/reports/KNOWLEDGE_SOURCE_CORPUS_MIGRATION_REPORT.md'), 'utf8');
  const migration = await readJson('MIGRATION_MANIFEST.json');
  const knowledge = migration.knowledge_source;

  assert.doesNotMatch(summary, /Canonical corpus:\s*\d+/u);
  assert.doesNotMatch(summary, /Graph:\s*\d+\s+nodes/u);
  assert.doesNotMatch(summary, /RAG:\s*\d+\s+chunks/u);
  assert.doesNotMatch(corpusMigrationReport, /Knowledge-source tests:\s*\d+\/\d+/u);
  assert.doesNotMatch(corpusMigrationReport, /(?:Full regression|restored regression)\s*:?[\s\S]{0,20}\d+\/\d+/u);
  assert.doesNotMatch(corpusMigrationReport, /Critic re-audit:\s*`?PASS WITH NOTES/u);
  assert.match(corpusMigrationReport, /data\/knowledge-source\/corpus-manifest\.json/u);
  assert.match(corpusMigrationReport, /generated\/knowledge-source\/graph\/manifest\.json/u);
  assert.match(corpusMigrationReport, /generated\/knowledge-source\/rag\/manifest\.json/u);
  assert.match(corpusMigrationReport, /docs\/migration\/reports\/TEST_REPORT\.md/u);
  assert.match(corpusMigrationReport, /docs\/migration\/reports\/KNOWLEDGE_SOURCE_CRITIC_REPORT\.md/u);

  assert.equal(knowledge.corpus_manifest, 'data/knowledge-source/corpus-manifest.json');
  assert.equal(knowledge.graph_manifest, 'generated/knowledge-source/graph/manifest.json');
  assert.equal(knowledge.rag_manifest, 'generated/knowledge-source/rag/manifest.json');
  assert.equal(migration.test_result.report, 'docs/migration/reports/TEST_REPORT.md');
  assert.equal(migration.critic_report, 'docs/migration/reports/KNOWLEDGE_SOURCE_CRITIC_REPORT.md');

  for (const field of ['document_count', 'graph_node_count', 'graph_link_count', 'graph_hyperedge_count', 'rag_chunk_count']) {
    assert.equal(Object.hasOwn(knowledge, field), false, `${field} must come from its canonical manifest`);
  }
  for (const field of ['total', 'passed', 'failed', 'suites']) {
    assert.equal(Object.hasOwn(migration.test_result, field), false, `${field} must come from TEST_REPORT.md`);
  }
  assert.equal(Object.hasOwn(migration, 'critic_result'), false, 'critic verdict must come from the critic report');

  const corpus = await readJson(knowledge.corpus_manifest);
  const graph = await readJson(knowledge.graph_manifest);
  const rag = await readJson(knowledge.rag_manifest);
  assert.equal(graph.source_document_count, corpus.documents.length);
  assert.equal(rag.source_document_count, corpus.documents.length);
  assert.equal(graph.semantic_document_count + graph.structural_only_document_count, corpus.documents.length);
  assert.equal(rag.semantic_document_count + rag.lexical_only_document_count, corpus.documents.length);

  const reportNames = (await readdir(resolve(root, 'docs/migration/reports'))).filter(
    (name) => name.startsWith('KNOWLEDGE_SOURCE') && name.endsWith('.md') && name !== 'KNOWLEDGE_SOURCE_CRITIC_REPORT.md'
  );
  for (const name of reportNames) {
    const report = await readFile(resolve(root, 'docs/migration/reports', name), 'utf8');
    assert.doesNotMatch(report, /\b(?:9\/9|310\/310)\b/u, `${name} contains stale test totals`);
  }
});
