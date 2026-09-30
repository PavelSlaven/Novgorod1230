import assert from 'node:assert/strict';
import test from 'node:test';
import { NEEDS_CHECK_BLOCKER } from '@rus/runtime-catalog/needs-check-blocker';
import { compileQueueRecord, compileSnapshot, validateCatalog } from './check-needs-check.mjs';

test('needs_check queue compiles fail-closed blocker templates with no catalog collisions', () => {
  const snapshot = compileSnapshot();
  assert.ok(snapshot.entries.length > 0);
  const result = validateCatalog(snapshot);
  assert.ok(result.candidate_count > 0);
  assert.ok(result.template_hits.every(({ hits }) => hits === 0));
  assert.ok(Number.isInteger(result.informational_id_reference_hits));
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
    assert.match(error.message, /needs_check blocker hits/u);
    assert.match(error.message, /fixture_peacock/u);
    return true;
  });

  const reviewed = NEEDS_CHECK_BLOCKER.createSnapshot([unrelated]);
  const report = validateCatalog(reviewed, [generatedOutput]);
  assert.equal(report.candidate_count, 1);
  assert.equal(report.template_hits.find(({ queue_id }) => queue_id.endsWith('#fixture_other')).hits, 0);
});

test('incomplete active queue row fails closed with its source ID', () => {
  assert.throws(() => compileQueueRecord({
    check_id: 'fixture_incomplete', subject: 'Павлин', status: 'needs_check',
    block_pattern_ru: 'Павлин', block_exception: '[]'
  }, 'fauna-fish-invertebrates-livestock/fauna/needs_check.csv'), /fixture_incomplete: blocker fields are incomplete/u);
});
