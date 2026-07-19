import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import catalog from '../../data/contracts/spatial-v3/controlled-vocabularies.v1.json' with { type: 'json' };
import { controlledVocabularyRegistrySnapshot, validateControlledVocabularyRegistry, validateControlledValue, ControlledVocabularyError } from '../../packages/contracts/src/spatial-v3/controlled-vocabularies.js';

test('P07 B.0.1 mappings exactly pin the approved 13/426 catalog and API fails closed', async () => {
  assert.equal(catalog.vocabulary_count, 13);
  assert.equal(catalog.value_count, 426);
  assert.deepEqual(controlledVocabularyRegistrySnapshot(), catalog);
  assert.deepEqual(validateControlledVocabularyRegistry(catalog), { ok: true, errors: [] });
  const standard = await readFile('data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md', 'utf8');
  assert.ok(standard.includes(`The aggregate registry digest is \`${catalog.aggregate_digest}\`.`));
  for (const vocabulary of catalog.vocabularies) {
    const row = `| \`${vocabulary.pseudo_type}\` | \`${vocabulary.registry_id}\` | \`data/contracts/spatial-v3/controlled-vocabularies.v1.json\` | \`${vocabulary.version}\` | \`${vocabulary.digest}\` |`;
    assert.ok(standard.includes(row), `B.0.1 mapping missing: ${vocabulary.pseudo_type}`);
    const known = vocabulary.values[0].id;
    assert.equal(validateControlledValue(vocabulary.pseudo_type, known), known);
    assert.equal(validateControlledValue(vocabulary.pseudo_type, known, [known]), known);
    assert.throws(() => validateControlledValue(vocabulary.pseudo_type, known, []), ControlledVocabularyError);
    assert.throws(() => validateControlledValue(vocabulary.pseudo_type, 'unknown.value'), ControlledVocabularyError);
  }
  assert.throws(() => validateControlledValue('controlled_unknown', 'x'), ControlledVocabularyError);
});
