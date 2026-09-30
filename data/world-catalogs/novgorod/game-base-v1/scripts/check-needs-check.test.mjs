import assert from 'node:assert/strict';
import test from 'node:test';
import { NEEDS_CHECK_BLOCKER } from '@rus/runtime-catalog/needs-check-blocker';
import { compileQueueRecord, compileSnapshot, validateCatalog } from './check-needs-check.mjs';

test('needs_check queue compiles fail-closed blocker templates with no catalog collisions', () => {
  const snapshot = compileSnapshot();
  assert.equal(snapshot.entries.length, 666);
  const queueCounts = snapshot.entries.reduce((counts, { queue_id }) => {
    const file = queue_id.split('#')[0];
    counts[file] = (counts[file] ?? 0) + 1;
    return counts;
  }, {});
  assert.deepEqual(queueCounts, {
    'buildings-interiors-containers/authoring/needs_check.csv': 214,
    'buildings-interiors-containers/containers/needs_check.csv': 1,
    'buildings-interiors-containers/landmarks/needs_check.csv': 4,
    'clothing-appearance/authoring/needs_check.csv': 2,
    'crafts-tools-processes/authoring/needs_check.csv': 422,
    'crafts-tools-processes/materials_registry/needs_check.csv': 5,
    'fauna-fish-invertebrates-livestock/fauna/needs_check.csv': 3,
    'flora-herbs-berries-mushrooms/authoring/needs_check.csv': 3,
    'flora-trees-shrubs/authoring/needs_check.csv': 7,
    'food-drink/authoring/needs_check.json': 3,
    'items-household-personal/authoring/needs_check.csv': 2
  });
  const report = validateCatalog(snapshot);
  assert.equal(report.candidate_count, 3153);
  assert.equal(report.template_count, 666);
  assert.ok(report.template_hits.every(({ hits }) => hits === 0));
});

test('queue fixture blocks matching generated output; reviewing the row admits it', () => {
  const file = 'fauna-fish-invertebrates-livestock/fauna/needs_check.csv';
  const queued = compileQueueRecord({
    check_id: 'fixture_peacock', subject: 'Павлин', status: 'needs_check',
    block_pattern_ru: 'Павлин', block_pattern_lat: '',
    block_scope: 'fauna-fish-invertebrates-livestock', block_exception: '[]'
  }, file);
  const unrelated = compileQueueRecord({
    check_id: 'fixture_other', subject: 'Глухарь', status: 'needs_check',
    block_pattern_ru: 'Глухарь', block_pattern_lat: '',
    block_scope: 'fauna-fish-invertebrates-livestock', block_exception: '[]'
  }, file);
  const generatedOutput = { scope: 'fauna-fish-invertebrates-livestock', id: 'bird_fixture', name: 'Павлина' };
  const blocked = NEEDS_CHECK_BLOCKER.createSnapshot([queued, unrelated]);
  assert.throws(() => validateCatalog(blocked, [generatedOutput]), (error) => {
    assert.match(error.message, /needs_check blocker hit/u);
    assert.match(error.message, /fixture_peacock/u);
    return true;
  });

  const reviewed = NEEDS_CHECK_BLOCKER.createSnapshot([unrelated]);
  assert.equal(validateCatalog(reviewed, [generatedOutput]).candidate_count, 1);
});

test('incomplete active queue row fails closed with its source ID', () => {
  assert.throws(() => compileQueueRecord({
    check_id: 'fixture_incomplete', subject: 'Павлин', status: 'needs_check',
    block_pattern_ru: 'Павлин', block_exception: '[]'
  }, 'fauna-fish-invertebrates-livestock/fauna/needs_check.csv'), /fixture_incomplete: blocker fields are incomplete/u);
});
