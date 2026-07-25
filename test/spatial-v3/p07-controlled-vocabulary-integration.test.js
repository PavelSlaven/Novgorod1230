import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import historicalCatalog from '../../data/contracts/spatial-v3/controlled-vocabularies.v1.json' with { type: 'json' };
import temporalBaselineCatalog from '../../data/contracts/spatial-v3/controlled-vocabularies.v2.json' with { type: 'json' };
import currentCatalog from '../../data/contracts/spatial-v3/controlled-vocabularies.v3.json' with { type: 'json' };
import { controlledVocabularyRegistrySnapshot, validateControlledVocabularyRegistry, validateControlledValue, ControlledVocabularyError } from '../../packages/contracts/src/spatial-v3/controlled-vocabularies.js';

const temporalEntityKinds = [
  'activity_profile', 'body_effect', 'body_state', 'calendar_profile', 'carrier_condition',
  'environment_overlay_state', 'light_state', 'load_state', 'npc_decision_trace',
  'participant_binding', 'party', 'perception_result', 'portal_access_state',
  'propagation_process', 'remote_aggregate_state', 'resource_binding',
  'runtime_calendar_snapshot', 'temporal_boundary_candidate', 'time_slice_result',
  'visible_package_persistence_envelope', 'weather_state'
];
const temporalWriteTargets = [
  'npc_decision_trace', 'participant_binding', 'perception_result',
  'propagation_process_ref', 'remote_aggregate_state', 'resource_binding',
  'time_slice_result', 'visible_package_persistence_envelope'
];

test('P07 keeps approved v1 and Temporal v2 immutable while PR8 current v3 is 21/499', async () => {
  assert.equal(historicalCatalog.version, '1.0.0');
  assert.equal(historicalCatalog.vocabulary_count, 13);
  assert.equal(historicalCatalog.value_count, 426);
  assert.deepEqual(validateControlledVocabularyRegistry(historicalCatalog), { ok: true, errors: [] });

  assert.equal(temporalBaselineCatalog.version, '2.0.0');
  assert.equal(temporalBaselineCatalog.vocabulary_count, 21);
  assert.equal(temporalBaselineCatalog.value_count, 498);
  assert.deepEqual(validateControlledVocabularyRegistry(temporalBaselineCatalog), { ok: true, errors: [] });

  assert.equal(currentCatalog.version, '3.0.0');
  assert.equal(currentCatalog.vocabulary_count, 21);
  assert.equal(currentCatalog.value_count, 499);
  assert.deepEqual(controlledVocabularyRegistrySnapshot(), currentCatalog);
  assert.deepEqual(validateControlledVocabularyRegistry(currentCatalog), { ok: true, errors: [] });

  const standard = await readFile('data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md', 'utf8');
  assert.ok(standard.includes(`The aggregate registry digest is \`${historicalCatalog.aggregate_digest}\`.`));
  for (const vocabulary of historicalCatalog.vocabularies) {
    const row = `| \`${vocabulary.pseudo_type}\` | \`${vocabulary.registry_id}\` | \`data/contracts/spatial-v3/controlled-vocabularies.v1.json\` | \`${vocabulary.version}\` | \`${vocabulary.digest}\` |`;
    assert.ok(standard.includes(row), `B.0.1 mapping missing: ${vocabulary.pseudo_type}`);
  }

  const temporalAmendment = await readFile('data/knowledge-source/corpus/DOCUMENTS/temporal_world_and_interruptible_activities.md', 'utf8');
  assert.ok(temporalAmendment.includes(`\`${currentCatalog.aggregate_digest}\``));
  const temporalVocabularies = temporalBaselineCatalog.vocabularies.filter(({ pseudo_type }) => !historicalCatalog.vocabularies.some((historical) => historical.pseudo_type === pseudo_type));
  assert.equal(temporalVocabularies.length, 8);
  for (const vocabulary of temporalVocabularies) {
    const row = `| \`${vocabulary.pseudo_type}\` | \`${vocabulary.registry_id}\` | \`data/contracts/spatial-v3/controlled-vocabularies.v2.json\` | \`${vocabulary.version}\` | \`${vocabulary.digest}\` |`;
    assert.ok(temporalAmendment.includes(row), `Temporal Appendix C mapping missing: ${vocabulary.pseudo_type}`);
  }
  for (const pseudoType of ['controlled_entity_kind', 'controlled_write_target']) {
    const vocabulary = temporalBaselineCatalog.vocabularies.find(({ pseudo_type }) => pseudo_type === pseudoType);
    const row = `| \`${vocabulary.pseudo_type}\` | \`${vocabulary.registry_id}\` | \`data/contracts/spatial-v3/controlled-vocabularies.v2.json\` | \`${vocabulary.version}\` | \`${vocabulary.digest}\` |`;
    assert.ok(temporalAmendment.includes(row), `Temporal Appendix C amended mapping missing: ${pseudoType}`);
  }
  const historicalEntityKinds = historicalCatalog.vocabularies.find(({ pseudo_type }) => pseudo_type === 'controlled_entity_kind').values.map(({ id }) => id);
  const temporalBaselineEntityKinds = temporalBaselineCatalog.vocabularies.find(({ pseudo_type }) => pseudo_type === 'controlled_entity_kind').values.map(({ id }) => id);
  const currentEntityKinds = currentCatalog.vocabularies.find(({ pseudo_type }) => pseudo_type === 'controlled_entity_kind').values.map(({ id }) => id);
  const historicalWriteTargets = historicalCatalog.vocabularies.find(({ pseudo_type }) => pseudo_type === 'controlled_write_target').values.map(({ id }) => id);
  const temporalBaselineWriteTargets = temporalBaselineCatalog.vocabularies.find(({ pseudo_type }) => pseudo_type === 'controlled_write_target').values.map(({ id }) => id);
  assert.deepEqual(temporalBaselineEntityKinds.filter((id) => !historicalEntityKinds.includes(id)), temporalEntityKinds);
  assert.deepEqual(temporalBaselineWriteTargets.filter((id) => !historicalWriteTargets.includes(id)), temporalWriteTargets);
  assert.deepEqual(
    currentEntityKinds.filter((id) => !temporalBaselineCatalog.vocabularies.find(({ pseudo_type }) => pseudo_type === 'controlled_entity_kind').values.some((value) => value.id === id)),
    ['decision_command']
  );
  const currentEntityVocabulary = currentCatalog.vocabularies.find(({ pseudo_type }) => pseudo_type === 'controlled_entity_kind');
  assert.ok(temporalAmendment.includes(`| \`${currentEntityVocabulary.pseudo_type}\` | \`${currentEntityVocabulary.registry_id}\` | \`data/contracts/spatial-v3/controlled-vocabularies.v3.json\` | \`${currentEntityVocabulary.version}\` | \`${currentEntityVocabulary.digest}\` |`));

  for (const vocabulary of currentCatalog.vocabularies) {
    const known = vocabulary.values[0].id;
    assert.equal(validateControlledValue(vocabulary.pseudo_type, known), known);
    assert.equal(validateControlledValue(vocabulary.pseudo_type, known, [known]), known);
    assert.throws(() => validateControlledValue(vocabulary.pseudo_type, known, []), ControlledVocabularyError);
    assert.throws(() => validateControlledValue(vocabulary.pseudo_type, 'unknown.value'), ControlledVocabularyError);
  }
  assert.throws(() => validateControlledValue('controlled_unknown', 'x'), ControlledVocabularyError);
});
