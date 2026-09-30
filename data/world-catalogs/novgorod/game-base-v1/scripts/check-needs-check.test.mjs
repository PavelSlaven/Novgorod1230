import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { NEEDS_CHECK_BLOCKER } from '@rus/runtime-catalog/needs-check-blocker';
import { compileQueueRecord, compileSnapshot, registeredCandidates, validateCatalog } from './check-needs-check.mjs';
import { allowedG0Ids } from './check-region-ids.mjs';

const GAME_BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGIONS = [...allowedG0Ids()];

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
  assert.equal(snowshoe.block_by, 'none');
  assert.equal(snowshoe.doubt_kind, 'regional_presence');
  const trap = snapshot.entries.find(({ queue_id }) => queue_id.endsWith('#HNT0024'));
  assert.equal(trap.block_by, 'name');
  assert.equal(trap.block_region, 'region_novgorod_land');
  assert.equal(trap.block_period, '1230-1250');
  const result = validateCatalog(snapshot);
  assert.equal(result.template_count, snapshot.entries.length);
  assert.equal(result.candidate_count, registeredCandidates().length);
  assert.ok(result.template_hits.every(({ hits }) => hits === 0));
  assert.ok(Number.isInteger(result.informational_id_reference_hits));
  assert.equal(result.regional_presence_entries.length, snapshot.entries.filter(({ doubt_kind }) => doubt_kind === 'regional_presence').length);
  assert.equal(snapshot.entries.filter(({ block_by, doubt_kind }) => block_by !== 'archive_id' && doubt_kind === null).length, 0);
  assert.ok(result.regional_presence_entries.includes('fauna-fish-invertebrates-livestock/fauna/needs_check.csv#fchk_peacock'));
});

test('registry name_folk and name_old_ru fields participate in matching', () => {
  const candidates = registeredCandidates();
  const folk = candidates.find((candidate) => candidate.aliases_ru.some((alias) => alias.toLocaleLowerCase('ru-RU') === 'ракита'));
  const old = candidates.find((candidate) => candidate.source_file.endsWith('/fauna/livestock_types.csv')
    && candidate.aliases_ru.includes('корова'));
  assert.ok(folk);
  assert.ok(old);
  const snapshot = NEEDS_CHECK_BLOCKER.createSnapshot([{ queue_id: 'fixture_alias', doubt_kind: 'anachronism', block_by: 'name',
    block_region: 'region_novgorod_land', block_period: '1230-1250',
    source_ref: 'fixture', reason: 'fixture', patterns: [{ language: 'ru', value: 'Ракита' }], exceptions: [] }], REGIONS);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: folk }).queue_id, 'fixture_alias');
});

test('small queue source_ref uses one queue path', () => {
  const row = compileQueueRecord({ check_id: 'fixture_source', subject: 'Павлин', status: 'needs_check',
    block_pattern_ru: 'Павлин', block_pattern_lat: '', doubt_kind: 'anachronism',
    block_region: 'region_novgorod_land', block_period: '1230-1250', block_exception: '[]' },
  'fauna-fish-invertebrates-livestock/fauna/needs_check.csv');
  assert.equal(row.source_ref, 'fauna-fish-invertebrates-livestock/fauna/needs_check.csv#fixture_source');
});

test('regional-presence queue rows remain informational across candidate regions', () => {
  const snapshot = compileSnapshot();
  const peacock = snapshot.entries.find(({ queue_id }) => queue_id.endsWith('#fchk_peacock'));
  const guineaFowl = snapshot.entries.find(({ queue_id }) => queue_id.endsWith('#fchk_guinea_fowl'));
  assert.equal(peacock.block_by, 'none');
  assert.equal(guineaFowl.block_by, 'none');
  for (const name of ['Павлин', 'Павлины', 'Павлинов', 'Павлина']) {
    assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { region: 'region_other', source_kind: 'item-bearing', name } }), null);
  }
  for (const name of ['Цесарка', 'Цесарки', 'Цесарок', 'Цесарку']) {
    assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { region: 'region_other', source_kind: 'item-bearing', name } }), null);
  }
});

test('regional anachronism block applies to Nova and unknown regions', () => {
  const snapshot = compileSnapshot();
  for (const region of ['region_novgorod_land', undefined]) {
    assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { region, name: 'Железный капкан' } }).queue_id,
      'crafts-tools-processes/authoring/needs_check.csv#HNT0024');
  }
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: {
    region: 'region_typo', name: 'Железный капкан'
  } }).queue_id, 'crafts-tools-processes/authoring/needs_check.csv#HNT0024');
});

test('queue fixture blocks matching generated output; reviewing the row admits it', () => {
  const file = 'fauna-fish-invertebrates-livestock/fauna/needs_check.csv';
  const queued = compileQueueRecord({
    check_id: 'fixture_peacock', subject: 'Павлин', status: 'needs_check',
    block_pattern_ru: 'Павлин', block_pattern_lat: '', doubt_kind: 'anachronism',
    block_region: 'region_novgorod_land', block_period: '1230-1250', block_exception: '[]'
  }, file);
  const unrelated = compileQueueRecord({
    check_id: 'fixture_other', subject: 'Глухарь', status: 'needs_check',
    block_pattern_ru: 'Глухарь', block_pattern_lat: '', doubt_kind: 'anachronism',
    block_region: 'region_novgorod_land', block_period: '1230-1250', block_exception: '[]'
  }, file);
  const generatedOutput = { region: 'region_novgorod_land', id: 'bird_fixture', name: 'Павлина' };
  const blocked = NEEDS_CHECK_BLOCKER.createSnapshot([queued, unrelated], REGIONS);
  assert.throws(() => validateCatalog(blocked, [generatedOutput]), (error) => {
    assert.match(error.message, /needs_check blocker hits/u);
    assert.match(error.message, /fixture_peacock/u);
    return true;
  });

  const reviewed = NEEDS_CHECK_BLOCKER.createSnapshot([unrelated], REGIONS);
  const report = validateCatalog(reviewed, [generatedOutput]);
  assert.equal(report.candidate_count, 1);
  assert.equal(report.template_hits.find(({ queue_id }) => queue_id.endsWith('#fixture_other')).hits, 0);
});

test('incomplete active queue row fails closed with its source ID', () => {
  assert.throws(() => compileQueueRecord({
    check_id: 'fixture_incomplete', subject: 'Павлин', status: 'needs_check',
    block_pattern_ru: 'Павлин', doubt_kind: 'anachronism', block_exception: '[]'
  }, 'fauna-fish-invertebrates-livestock/fauna/needs_check.csv'), /fixture_incomplete: blocker fields are incomplete/u);
  assert.throws(() => compileQueueRecord({
    check_id: 'fixture_unclassified', subject: 'Павлин', status: 'needs_check',
    block_pattern_ru: 'Павлин', block_pattern_lat: '', doubt_kind: '', block_region: '', block_period: '', block_exception: '[]'
  }, 'fauna-fish-invertebrates-livestock/fauna/needs_check.csv'), /requires doubt_kind/u);
  assert.throws(() => compileQueueRecord({
    archive_id: 'HRS9999', current_result: 'new/include', reason_code: 'unresolved',
    note: 'Запросить источник.', block_pattern_ru: 'Дуга', block_pattern_lat: '',
    doubt_kind: '', block_region: '', block_period: '', block_exception: '[]'
  }, 'crafts-tools-processes/authoring/needs_check.csv', new Map([
    ['HRS9999', { archive_ref: 'master:HRS9999', archive_name: 'Дуга' }]
  ])), /requires doubt_kind/u);
  assert.throws(() => compileQueueRecord({
    check_id: 'fixture_unknown_region', subject: 'Павлин', status: 'needs_check',
    block_pattern_ru: 'Павлин', block_pattern_lat: '', doubt_kind: 'anachronism', block_region: 'region_typo', block_period: '1230-1250', block_exception: '[]'
  }, 'fauna-fish-invertebrates-livestock/fauna/needs_check.csv'), /unknown block_region/u);
});
