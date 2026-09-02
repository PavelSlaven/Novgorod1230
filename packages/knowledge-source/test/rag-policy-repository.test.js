import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createFileSystemKnowledgeSourceStorage } from '../src/adapters/filesystem-storage.js';
import { createKnowledgeRagReader } from '../src/services/rag-reader.js';
import { validateCorpusManifest } from '../src/domain/manifest.js';
import { validateRetrievalPolicy } from '../src/domain/retrieval-policy.js';

const root = resolve(import.meta.dirname, '../../..');
const sourceRoot = resolve(root, 'data/knowledge-source');
const generatedRoot = resolve(root, 'generated/knowledge-source');

function sha(value) { return createHash('sha256').update(value).digest('hex'); }

function activeBaselineGapCount(policy, manifest) {
  const activeDocumentIds = new Set(manifest.documents.filter((document) => document.status === 'active').map((document) => document.document_id));
  return policy.documents.filter((document) => (
    activeDocumentIds.has(document.document_id) && document.semantic_coverage_disposition === 'baseline_gap'
  )).length;
}

test('repository retrieval policy covers every registered document and pins current corpus', async () => {
  const manifestBytes = await readFile(resolve(sourceRoot, 'corpus-manifest.json'));
  const manifest = validateCorpusManifest(JSON.parse(manifestBytes.toString('utf8')));
  const policy = validateRetrievalPolicy(JSON.parse(await readFile(resolve(sourceRoot, 'retrieval-policy.json'), 'utf8')), manifest);
  assert.equal(policy.baseline_manifest_sha256, sha(manifestBytes));
  assert.equal(policy.documents.length, manifest.documents.length);
  assert.ok(policy.control_queries.length >= 5);
});

test('repository policy registers proposed classification documents without changing their corpus status', async () => {
  const manifest = validateCorpusManifest(JSON.parse(await readFile(resolve(sourceRoot, 'corpus-manifest.json'), 'utf8')));
  const policy = validateRetrievalPolicy(JSON.parse(await readFile(resolve(sourceRoot, 'retrieval-policy.json'), 'utf8')), manifest);
  const proposedIds = [
    'universal-category-classification-policy',
    'universal-category-classification-references'
  ];
  assert.deepEqual(
    manifest.documents.filter((document) => proposedIds.includes(document.document_id)).map((document) => document.status),
    ['proposed', 'proposed']
  );
  assert.deepEqual(
    policy.documents.filter((document) => proposedIds.includes(document.document_id)).map((document) => document.document_id),
    proposedIds
  );
});

test('repository registers active spatial v3 specializations and excludes deprecated v2 sources from default retrieval', async () => {
  const manifest = validateCorpusManifest(JSON.parse(await readFile(resolve(sourceRoot, 'corpus-manifest.json'), 'utf8')));
  const policy = validateRetrievalPolicy(JSON.parse(await readFile(resolve(sourceRoot, 'retrieval-policy.json'), 'utf8')), manifest);
  const activeV3Ids = [
    'spatial-v3-target-code-driven-world-materialization-architecture',
    'spatial-v3-target-world-base-materialization-table-requirements',
    'spatial-v3-target-read-only-database-and-graph-architecture',
    'spatial-v3-target-map-g0-g4-workflow'
  ];
  const deprecatedV2Ids = [
    'read-only-database-and-graph-architecture',
    'map-g0-g4-workflow'
  ];
  assert.deepEqual(
    manifest.documents.filter((document) => activeV3Ids.includes(document.document_id)).map((document) => document.status),
    ['active', 'active', 'active', 'active']
  );
  assert.deepEqual(
    manifest.documents.filter((document) => deprecatedV2Ids.includes(document.document_id)).map((document) => document.status),
    ['deprecated', 'deprecated']
  );
  assert.deepEqual(policy.default_statuses, ['active']);
  assert.equal(policy.documents.filter((document) => activeV3Ids.includes(document.document_id)).length, activeV3Ids.length);
  const indexMetadata = policy.documents.find((document) => document.document_id === 'contract-index');
  assert.equal(indexMetadata?.document_type, 'navigation');
  assert.equal(indexMetadata?.priority_tier, 'navigation');
  assert.ok(policy.control_queries.some((item) => item.expected_document_ids.includes('contract-index')));

  const reader = createKnowledgeRagReader({
    storage: createFileSystemKnowledgeSourceStorage({ sourceRoot, generatedRoot }),
    allowedStatuses: ['active', 'deprecated']
  });
  const defaultResult = await reader.searchKnowledge({ query: 'finite party-generated G5' });
  assert.ok(defaultResult.results.some((result) => activeV3Ids.includes(result.document_id)));
  assert.ok(defaultResult.results.every((result) => !deprecatedV2Ids.includes(result.document_id)));

  const deprecatedResult = await reader.searchKnowledge({ query: 'migration rollback G0 G4', statuses: ['deprecated'] });
  assert.ok(deprecatedResult.results.length > 0);
  assert.ok(deprecatedResult.results.every((result) => deprecatedV2Ids.includes(result.document_id)));
});

test('repository registers the audited spatial architecture standard as an active target normative', async () => {
  const manifest = validateCorpusManifest(JSON.parse(await readFile(resolve(sourceRoot, 'corpus-manifest.json'), 'utf8')));
  const policy = validateRetrievalPolicy(JSON.parse(await readFile(resolve(sourceRoot, 'retrieval-policy.json'), 'utf8')), manifest);
  const document = manifest.documents.find((item) => item.document_id === 'spatial-architecture-standard-g0-g6');
  const metadata = policy.documents.find((item) => item.document_id === 'spatial-architecture-standard-g0-g6');

  assert.deepEqual(document && {
    canonical_path: document.canonical_path,
    file_name: document.file_name,
    status: document.status
  }, {
    canonical_path: 'corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md',
    file_name: 'spatial_architecture_standard_g0_g6.md',
    status: 'active'
  });
  assert.equal(metadata?.document_type, 'target_normative');
  assert.equal(metadata?.priority_tier, 'highest_materialization_normative');
  assert.ok(policy.control_queries.some((item) => item.expected_document_ids.includes('spatial-architecture-standard-g0-g6')));
});

test('repository exposes the accepted Temporal World amendment through active-only retrieval', async () => {
  const manifest = validateCorpusManifest(JSON.parse(await readFile(resolve(sourceRoot, 'corpus-manifest.json'), 'utf8')));
  const freeze = JSON.parse(await readFile(resolve(root, 'docs/work/temporal-world-v4/normative-freeze.json'), 'utf8'));
  const document = manifest.documents.find((item) => item.document_id === 'temporal-world-and-interruptible-activities');
  assert.equal(document?.status, 'active');
  assert.equal(freeze.status, 'active_after_final_acceptance');

  const reader = createKnowledgeRagReader({
    storage: createFileSystemKnowledgeSourceStorage({ sourceRoot, generatedRoot })
  });
  const result = await reader.searchKnowledge({
    query: 'exact GameTimestamp interruptible activities same-time cascades'
  });
  assert.ok(result.results.some((item) => item.document_id === document.document_id));
});

test('repository RAG exposes explicit baseline semantic gaps and no unacknowledged blocker', async () => {
  const storage = createFileSystemKnowledgeSourceStorage({ sourceRoot, generatedRoot });
  const status = await createKnowledgeRagReader({ storage }).getReadinessStatus();
  const manifest = validateCorpusManifest(JSON.parse(await readFile(resolve(sourceRoot, 'corpus-manifest.json'), 'utf8')));
  const policy = validateRetrievalPolicy(JSON.parse(await readFile(resolve(sourceRoot, 'retrieval-policy.json'), 'utf8')), manifest);
  assert.equal(status.status, 'degraded');
  assert.equal(status.semantic_coverage_blocker_document_ids.length, 0);
  assert.equal(status.semantic_coverage_gap_document_ids.length, activeBaselineGapCount(policy, manifest));
});
