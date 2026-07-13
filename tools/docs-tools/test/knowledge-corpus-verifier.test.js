import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyCanonicalCorpus } from '../src/knowledge-corpus-verifier.js';

const repositoryRoot = join(import.meta.dirname, '../../..');
const requiredNormatives = [
  ['development-rules', 'development_rules.txt', 45078, '432e66d1efa4e83f3f1f414d5f368c696f786df9f47c22a3a92d856ba049c441'],
  ['map-g0-g4-workflow', 'map_g0_g4_workflow.txt', 82456, 'a1f91b6b354163c2d502a402faba005be443aeefa01a79b38b18c558c7a181e3'],
  ['base-turn-orchestration', 'base_turn_orchestration.txt', 46599, 'e6b474d691060d57c6b02290aac7ddd02cd62f029566e09f076b0e25a7f114fd'],
  ['read-only-database-and-graph-architecture', 'read_only_database_and_graph_architecture.md', 89475, '99200f3d47053419acc8c1155ff7663609945253682624ce7c84bebbcbeef9b5']
];

async function fixture({ corrupt = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'rus-corpus-'));
  const source = join(root, 'data/knowledge-source');
  const corpus = join(source, 'corpus/DOCUMENTS');
  await mkdir(corpus, { recursive: true });
  const files = [
    ['legacy.txt', 'legacy document\n', 'legacy/path/legacy.txt'],
    ['native.md', '# Native document\n', null]
  ];
  const documents = [];
  for (const [fileName, text, legacyPath] of files) {
    const bytes = Buffer.from(text);
    await writeFile(join(corpus, fileName), bytes);
    documents.push({
      document_id: fileName.replace(/\.(?:md|txt)$/u, ''),
      canonical_path: `corpus/DOCUMENTS/${fileName}`,
      file_name: fileName,
      sha256: corrupt && fileName === 'native.md' ? '0'.repeat(64) : createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
      status: 'active',
      ...(legacyPath ? { source_legacy_path: legacyPath } : {})
    });
  }
  await writeFile(join(source, 'corpus-manifest.json'), `${JSON.stringify({
    schema_version: 'rus.knowledge_corpus_manifest.v1',
    corpus_id: 'test',
    release: 'test',
    documents
  }, null, 2)}\n`);
  await writeFile(join(source, 'source-aliases.json'), `${JSON.stringify({
    schema_version: 'rus.knowledge_source_aliases.v1',
    aliases: { 'legacy.txt': 'legacy', 'native.md': 'native' }
  }, null, 2)}\n`);
  return root;
}

async function mutateJson(root, relativePath, mutate) {
  const path = join(root, 'data/knowledge-source', relativePath);
  const value = JSON.parse(await readFile(path, 'utf8'));
  mutate(value);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

test('accepts canonical documents without legacy provenance', async () => {
  const result = await verifyCanonicalCorpus({ root: await fixture() });
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.document_count, 2);
  assert.equal(result.legacy_document_count, 1);
});

test('rejects a registered document with a stale digest', async () => {
  const result = await verifyCanonicalCorpus({ root: await fixture({ corrupt: true }) });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /native: document hash or size mismatch/u);
});

test('rejects duplicate ids, duplicate paths, unknown aliases and traversal paths', async () => {
  const cases = [
    ['duplicate document id', 'corpus-manifest.json', (manifest) => { manifest.documents[1].document_id = manifest.documents[0].document_id; }, /duplicate document_id/u],
    ['duplicate canonical path', 'corpus-manifest.json', (manifest) => { manifest.documents[1].canonical_path = manifest.documents[0].canonical_path; }, /duplicate canonical_path/u],
    ['unknown alias target', 'source-aliases.json', (aliases) => { aliases.aliases.unknown = 'missing-document'; }, /references unknown document/u],
    ['canonical path traversal', 'corpus-manifest.json', (manifest) => { manifest.documents[1].canonical_path = '../outside.md'; }, /invalid canonical_path/u]
  ];

  for (const [label, path, mutate, pattern] of cases) {
    const root = await fixture();
    await mutateJson(root, path, mutate);
    const result = await verifyCanonicalCorpus({ root });
    assert.equal(result.ok, false, label);
    assert.match(result.errors.join('\n'), pattern, label);
  }
});

test('repository registers the handed-off normatives byte-for-byte with canonical aliases', async () => {
  const sourceRoot = join(repositoryRoot, 'data/knowledge-source');
  const manifest = JSON.parse(await readFile(join(sourceRoot, 'corpus-manifest.json'), 'utf8'));
  const aliases = JSON.parse(await readFile(join(sourceRoot, 'source-aliases.json'), 'utf8')).aliases;
  const byId = new Map(manifest.documents.map((record) => [record.document_id, record]));

  for (const [documentId, fileName, bytes, digest] of requiredNormatives) {
    const record = byId.get(documentId);
    assert.ok(record, `${documentId} is missing from corpus manifest`);
    assert.equal(record.file_name, fileName);
    assert.equal(record.canonical_path, `corpus/DOCUMENTS/${fileName}`);
    assert.equal(record.bytes, bytes);
    assert.equal(record.sha256, digest);
    assert.equal(Object.hasOwn(record, 'source_legacy_path'), false);
    const content = await readFile(join(sourceRoot, record.canonical_path));
    assert.equal(content.length, bytes);
    assert.equal(createHash('sha256').update(content).digest('hex'), digest);
  }

  assert.equal(aliases['development_rules.txt'], 'development-rules');
  assert.equal(aliases['Правила разработки.txt'], 'development-rules');
  assert.equal(aliases['map_g0_g4_workflow.txt'], 'map-g0-g4-workflow');
  assert.equal(aliases['Работа с картой G0-G4.txt'], 'map-g0-g4-workflow');
  assert.equal(aliases['base_turn_orchestration.txt'], 'base-turn-orchestration');
  assert.equal(aliases['base_turn_orcestration.txt'], 'base-turn-orchestration');
  assert.equal(aliases['read_only_database_and_graph_architecture.md'], 'read-only-database-and-graph-architecture');
});
