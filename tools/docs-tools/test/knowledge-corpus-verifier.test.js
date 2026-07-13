import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyCanonicalCorpus } from '../src/knowledge-corpus-verifier.js';

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
