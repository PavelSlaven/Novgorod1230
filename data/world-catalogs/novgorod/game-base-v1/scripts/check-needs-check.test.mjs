import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { NEEDS_CHECK_BLOCKER } from '@rus/runtime-catalog/needs-check-blocker';
import { compileQueueRecord, compileSnapshot, registeredCandidates, validateCatalog } from './check-needs-check.mjs';

const GAME_BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function activeQueueRows(directory) {
  let count = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('.')) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) count += activeQueueRows(file);
    else if (entry.name === 'needs_check.csv') count += fs.readFileSync(file, 'utf8').split(/\r?\n/u).filter(Boolean).length - 1;
    else if (entry.name === 'needs_check.json') count += JSON.parse(fs.readFileSync(file, 'utf8')).records.length;
  }
  return count;
}

test('needs_check queue compiles fail-closed blocker templates with no catalog collisions', () => {
  const snapshot = compileSnapshot();
  assert.equal(snapshot.entries.length, activeQueueRows(GAME_BASE));
  const snowshoe = snapshot.entries.find(({ queue_id }) => queue_id.endsWith('#HNT0028'));
  assert.equal(snowshoe.block_by, 'name');
  assert.ok(snowshoe.patterns.some(({ language, value }) => language === 'id' && value === 'HNT0028'));
  const result = validateCatalog(snapshot);
  assert.equal(result.template_count, snapshot.entries.length);
  assert.equal(result.candidate_count, registeredCandidates().length);
  assert.ok(result.template_hits.every(({ hits }) => hits === 0));
  assert.ok(Number.isInteger(result.informational_id_reference_hits));
});

test('registry name_folk and name_old_ru fields participate in matching', () => {
  const candidates = registeredCandidates();
  const folk = candidates.find((candidate) => candidate.aliases_ru.some((alias) => alias.toLocaleLowerCase('ru-RU') === 'ракита'));
  const old = candidates.find((candidate) => candidate.source_file.endsWith('/fauna/livestock_types.csv')
    && candidate.aliases_ru.includes('корова'));
  assert.ok(folk);
  assert.ok(old);
  const snapshot = NEEDS_CHECK_BLOCKER.createSnapshot([{ queue_id: 'fixture_alias', block_by: 'name', scope: 'global',
    source_ref: 'fixture', reason: 'fixture', patterns: [{ language: 'ru', value: 'Ракита' }], exceptions: [] }]);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: folk }).queue_id, 'fixture_alias');
});

test('small queue source_ref uses one queue path', () => {
  const row = compileQueueRecord({ check_id: 'fixture_source', subject: 'Павлин', status: 'needs_check',
    block_pattern_ru: 'Павлин', block_pattern_lat: '', block_scope: 'global', block_exception: '[]' },
  'fauna-fish-invertebrates-livestock/fauna/needs_check.csv');
  assert.equal(row.source_ref, 'fauna-fish-invertebrates-livestock/fauna/needs_check.csv#fixture_source');
});

test('queue fixture blocks matching generated output; reviewing the row admits it', () => {
  const file = 'fauna-fish-invertebrates-livestock/fauna/needs_check.csv';
  const queued = compileQueueRecord({
    check_id: 'fixture_peacock', subject: 'Павлин', status: 'needs_check',
    block_pattern_ru: 'Павлин', block_pattern_lat: '',
    block_scope: 'global', block_exception: '[]'
  }, file);
  const unrelated = compileQueueRecord({
    check_id: 'fixture_other', subject: 'Глухарь', status: 'needs_check',
    block_pattern_ru: 'Глухарь', block_pattern_lat: '',
    block_scope: 'global', block_exception: '[]'
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
  assert.throws(() => compileQueueRecord({
    check_id: 'fixture_bad_scope', subject: 'Павлин', status: 'needs_check',
    block_pattern_ru: 'Павлин', block_scope: 'typo-domain', block_exception: '[]'
  }, 'fauna-fish-invertebrates-livestock/fauna/needs_check.csv'), /invalid block_scope/u);
});
