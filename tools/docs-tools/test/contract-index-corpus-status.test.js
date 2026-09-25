import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  mapIndexLabelToCorpusFields,
  parseContractIndexCorpusStatuses
} from '../src/contract-index-corpus-status.js';
import { repinCanonicalCorpus } from '../src/knowledge-corpus-repin.js';
import { verifyCanonicalCorpus } from '../src/knowledge-corpus-verifier.js';

function sha(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('CONTRACT_INDEX labels map UNDECLARED/REFERENCE/REDIRECT away from active', () => {
  assert.equal(mapIndexLabelToCorpusFields('UNDECLARED / DOMAIN GUIDE').status, 'deprecated');
  assert.equal(mapIndexLabelToCorpusFields('REFERENCE / DOMAIN GUIDE').status, 'deprecated');
  assert.equal(mapIndexLabelToCorpusFields('SUPERSEDED / REDIRECT').status, 'deprecated');
  assert.equal(mapIndexLabelToCorpusFields('ACTIVE SPECIALIZATION').status, 'active');
  assert.equal(mapIndexLabelToCorpusFields('ACTIVE SPECIALIZATION').priority_tier, 'highest_materialization_normative');
  assert.equal(mapIndexLabelToCorpusFields('PROPOSED').status, 'proposed');
});

test('parser keeps first ACTIVE SPECIALIZATION over later plain ACTIVE repeat', () => {
  const markdown = [
    '| Document | Status | Scope |',
    '|---|---|---|',
    '| [`spatial_v3_target_code_driven_world_materialization_architecture.md`](spatial_v3_target_code_driven_world_materialization_architecture.md) | `ACTIVE SPECIALIZATION` | scope |',
    '| [`spatial_v3_target_code_driven_world_materialization_architecture.md`](spatial_v3_target_code_driven_world_materialization_architecture.md) | `ACTIVE` | not proposed |'
  ].join('\n');
  const byFile = parseContractIndexCorpusStatuses(markdown);
  assert.equal(
    byFile.get('spatial_v3_target_code_driven_world_materialization_architecture.md').priority_tier,
    'highest_materialization_normative'
  );
});

test('unseen-equivalent: CONTRACT_INDEX status change updates manifest status and priority_tier via repin', async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'rus-index-status-'));
  const sourceRoot = join(fixtureRoot, 'data/knowledge-source');
  await mkdir(join(sourceRoot, 'corpus/DOCUMENTS'), { recursive: true });
  const indexName = 'CONTRACT_INDEX.md';
  const docName = 'items_and_property.txt';
  const writeIndex = async (docStatus) => {
    await writeFile(
      join(sourceRoot, 'corpus/DOCUMENTS', indexName),
      [
        '# Index',
        '',
        '| Document | Status | Scope |',
        '|---|---|---|',
        '| [`CONTRACT_INDEX.md`](CONTRACT_INDEX.md) | `ACTIVE` | nav |',
        `| [\`${docName}\`](${docName}) | \`${docStatus}\` | items |`,
        ''
      ].join('\n')
    );
  };
  await writeIndex('PROPOSED');
  const docBytes = Buffer.from('items contract body\n');
  await writeFile(join(sourceRoot, 'corpus/DOCUMENTS', docName), docBytes);
  const indexBytes = await readFile(join(sourceRoot, 'corpus/DOCUMENTS', indexName));
  const manifest = {
    schema_version: 'rus.knowledge_corpus_manifest.v2',
    corpus_id: 'test',
    release: 'test',
    documents: [
      {
        document_id: 'contract-index',
        canonical_path: 'corpus/DOCUMENTS/CONTRACT_INDEX.md',
        file_name: indexName,
        sha256: sha(indexBytes),
        bytes: indexBytes.length,
        status: 'active',
        priority_tier: 'navigation',
        provenance_mode: 'native'
      },
      {
        document_id: 'items-and-property',
        canonical_path: `corpus/DOCUMENTS/${docName}`,
        file_name: docName,
        sha256: sha(docBytes),
        bytes: docBytes.length,
        status: 'active',
        priority_tier: 'technical_contract',
        provenance_mode: 'native'
      }
    ]
  };
  await writeFile(join(sourceRoot, 'corpus-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(sourceRoot, 'source-aliases.json'), `${JSON.stringify({ schema_version: 'rus.knowledge_source_aliases.v1', aliases: {} }, null, 2)}\n`);
  await writeFile(join(sourceRoot, 'retrieval-policy.json'), `${JSON.stringify({
    schema_version: 'rus.knowledge_retrieval_policy.v1',
    policy_version: '1.0.0',
    baseline_manifest_sha256: '0'.repeat(64),
    default_statuses: ['active'],
    documents: [
      {
        document_id: 'contract-index',
        document_type: 'navigation',
        priority_tier: 'navigation',
        subsystems: [],
        related_document_ids: [],
        related_module_paths: [],
        related_contracts: [],
        search_terms: [],
        conflicts_with_document_ids: []
      },
      {
        document_id: 'items-and-property',
        document_type: 'canonical_normative',
        priority_tier: 'technical_contract',
        subsystems: [],
        related_document_ids: [],
        related_module_paths: [],
        related_contracts: [],
        search_terms: [],
        conflicts_with_document_ids: []
      }
    ],
    control_queries: [{ query_id: 'q', query: 'items', expected_document_ids: ['items-and-property'], top_k: 3 }]
  }, null, 2)}\n`);

  await repinCanonicalCorpus({ root: fixtureRoot });
  const after = JSON.parse(await readFile(join(sourceRoot, 'corpus-manifest.json'), 'utf8'));
  const items = after.documents.find((d) => d.document_id === 'items-and-property');
  assert.equal(items.status, 'proposed');
  assert.equal(items.priority_tier, 'profile_normative');
  const check = await verifyCanonicalCorpus({ root: fixtureRoot });
  assert.equal(check.ok, true, check.errors.join('\n'));

  await writeIndex('ACTIVE');
  await repinCanonicalCorpus({ root: fixtureRoot });
  const promoted = JSON.parse(await readFile(join(sourceRoot, 'corpus-manifest.json'), 'utf8'));
  const items2 = promoted.documents.find((d) => d.document_id === 'items-and-property');
  assert.equal(items2.status, 'active');
  assert.equal(items2.priority_tier, 'technical_contract');
});
