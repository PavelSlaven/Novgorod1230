import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { validateCanonicalCorpusDelegation } from '../src/canonical-corpus-registry.js';

const root = resolve(import.meta.dirname, '../../..');

test('CANONICAL_PATHS delegates corpus files to the corpus manifest without duplicate registrations', async () => {
  const result = await validateCanonicalCorpusDelegation({ root });
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.ok(result.corpus_document_count >= 22);
  assert.equal(result.duplicate_canonical_path_count, 0);
  assert.equal(result.direct_corpus_file_registration_count, 0);
});
