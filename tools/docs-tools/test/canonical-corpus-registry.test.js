import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateCanonicalCorpusDelegation } from '../src/canonical-corpus-registry.js';

const root = resolve(import.meta.dirname, '../../..');

test('CANONICAL_PATHS delegates corpus files to the corpus manifest without duplicate registrations', async () => {
  const manifest = JSON.parse(await readFile(resolve(root, 'data/knowledge-source/corpus-manifest.json'), 'utf8'));
  const result = await validateCanonicalCorpusDelegation({ root });
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.corpus_document_count, manifest.documents.length);
  assert.equal(result.duplicate_canonical_path_count, 0);
  assert.equal(result.direct_corpus_file_registration_count, 0);
});
