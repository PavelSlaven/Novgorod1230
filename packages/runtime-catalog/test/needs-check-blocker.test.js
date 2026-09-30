import assert from 'node:assert/strict';
import test from 'node:test';
import { NEEDS_CHECK_BLOCKER } from '../src/needs-check-blocker.js';

const entry = {
  queue_id: 'fauna_peacock',
  doubt_kind: 'anachronism',
  block_by: 'name',
  block_region: 'region_novgorod_land',
  block_period: '1230-1250',
  source_ref: 'authoring/needs_check.csv#fauna_peacock',
  reason: 'Unverified historical form.',
  patterns: [{ language: 'ru', value: 'Павлин' }, { language: 'lat', value: 'Pavo cristatus' }],
  exceptions: ['изображение павлина']
};
const regions = ['region_novgorod_land', 'region_test_other'];

test('blocks anachronisms in matching or unspecified region only', () => {
  const snapshot = NEEDS_CHECK_BLOCKER.createSnapshot([entry], regions);
  for (const region of ['region_novgorod_land', undefined]) {
    assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { region, name: 'павлина' } }).queue_id, 'fauna_peacock');
  }
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { region: 'region_test_other', name: 'павлина' } }), null);
  for (const region of ['region_typo', 'Region_Novgorod_Land', ' region_novgorod_land']) {
    assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { region, name: 'павлина' } }).queue_id, 'fauna_peacock');
  }
});

test('matches Russian inflections and Latin scientific names', () => {
  const snapshot = NEEDS_CHECK_BLOCKER.createSnapshot([entry], regions);
  for (const name of ['павлинами', 'павлинов', 'павлинам', 'павлинах', 'павлином']) {
    assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { name } }).queue_id, 'fauna_peacock');
  }
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { name_lat: 'PAVO CRISTATUS' } }).queue_id, 'fauna_peacock');
});

test('regional presence is informational and never blocks', () => {
  const snapshot = NEEDS_CHECK_BLOCKER.createSnapshot([{ ...entry,
    doubt_kind: 'regional_presence', block_by: 'none', block_region: '', block_period: '' }], regions);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { name: 'павлин' } }), null);
});

test('respects exact exceptions', () => {
  const snapshot = NEEDS_CHECK_BLOCKER.createSnapshot([entry], regions);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { name: 'изображение павлина' } }), null);
});

test('archive ID entries ignore name and region and match only their own ID', () => {
  const snapshot = NEEDS_CHECK_BLOCKER.createSnapshot([{ ...entry, doubt_kind: null,
    block_by: 'archive_id', block_region: '', block_period: '', patterns: [
      { language: 'ru', value: 'Павлин' }, { language: 'id', value: 'FSH0001' }
    ] }], regions);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { region: 'region_other', name: 'павлин' } }), null);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { region: 'region_other', id: 'FSH0001' } }).queue_id, 'fauna_peacock');
});

test('short one-word blockers use exact forms; alternatives and aliases still match', () => {
  const snapshot = NEEDS_CHECK_BLOCKER.createSnapshot([{ ...entry,
    patterns: [{ language: 'ru', value: 'Рис|Аир|Карликовая берёза|Берёза карликовая|Таракан чёрный|Чёрный таракан' },
      { language: 'lat', value: 'Oryza sativa' }], exceptions: [] }], regions);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { name: 'рисую' } }), null);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { name: 'рисом' } }), null);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { name: 'рис' } }).queue_id, 'fauna_peacock');
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { name: 'аир' } }).queue_id, 'fauna_peacock');
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { aliases_ru: ['берёзой карликовой'] } }).queue_id, 'fauna_peacock');
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { name: 'Таракан чёрный' } }).queue_id, 'fauna_peacock');
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { lat_synonyms: ['ORYZA SATIVA'] } }).queue_id, 'fauna_peacock');
});

test('name-blocked archive ID blocks entity inclusion but not item-bearing references', () => {
  const snapshot = NEEDS_CHECK_BLOCKER.createSnapshot([{ ...entry, patterns: [
    { language: 'ru', value: 'Ножной гончарный круг|Гончарный круг ножной' },
    { language: 'id', value: 'CRF0061' }
  ], exceptions: [] }], regions);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { source_kind: 'entity', id: 'CRF0061', name: 'Другая запись' } }).queue_id, 'fauna_peacock');
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { source_kind: 'item-bearing', ids: ['CRF0061'], name: 'Другой предмет' } }), null);
});

test('fails closed on malformed fields, snapshots or changed digest', () => {
  const snapshot = NEEDS_CHECK_BLOCKER.createSnapshot([entry], regions);
  assert.throws(() => NEEDS_CHECK_BLOCKER.matches({ snapshot: { ...snapshot, entries: [] }, candidate: { name: 'павлин' } }), /must contain entries/u);
  assert.throws(() => NEEDS_CHECK_BLOCKER.matches({ snapshot: { ...snapshot, digest: `sha256:${'0'.repeat(64)}` }, candidate: { name: 'павлин' } }), /digest mismatch/u);
  assert.throws(() => NEEDS_CHECK_BLOCKER.createSnapshot([{ ...entry, queue_id: '' }], regions), /Invalid or duplicate/u);
  assert.throws(() => NEEDS_CHECK_BLOCKER.createSnapshot([{ ...entry, doubt_kind: 'regional_presence', block_by: 'name' }], regions), /Invalid or duplicate/u);
  assert.throws(() => NEEDS_CHECK_BLOCKER.createSnapshot([{ ...entry, block_period: '1230' }], regions), /Invalid or duplicate/u);
  assert.throws(() => NEEDS_CHECK_BLOCKER.createSnapshot([{ ...entry, block_region: 'region_typo' }], regions), /Invalid or duplicate/u);
  assert.throws(() => NEEDS_CHECK_BLOCKER.createSnapshot([{ ...entry, patterns: [{ language: 'ru', value: '—' }] }], regions), /Empty normalized/u);
});

test('multiword name does not match an unrelated single word', () => {
  const snapshot = NEEDS_CHECK_BLOCKER.createSnapshot([{ ...entry,
    patterns: [{ language: 'ru', value: 'Железный капкан' }], exceptions: [] }], regions);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { name: 'капкан' } }), null);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { name: 'Железный капкан' } }).queue_id, 'fauna_peacock');
});
