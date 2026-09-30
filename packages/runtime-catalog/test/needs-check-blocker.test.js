import assert from 'node:assert/strict';
import test from 'node:test';
import { NEEDS_CHECK_BLOCKER } from '../src/needs-check-blocker.js';

const entry = {
  queue_id: 'fauna_peacock',
  block_by: 'name',
  scope: 'fauna',
  source_ref: 'authoring/needs_check.csv#fauna_peacock',
  reason: 'Unverified regional occurrence.',
  patterns: [{ language: 'ru', value: 'Павлин' }, { language: 'lat', value: 'Pavo cristatus' }],
  exceptions: ['изображение павлина']
};

test('matches Russian inflections after normalization', () => {
  const snapshot = NEEDS_CHECK_BLOCKER.createSnapshot([entry]);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { scope: 'fauna', name: 'павлина' } }).queue_id, 'fauna_peacock');
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { scope: 'fauna', name: 'павлинами' } }).queue_id, 'fauna_peacock');
  for (const name of ['павлинов', 'павлинам', 'павлинах', 'павлином']) {
    assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { scope: 'fauna', name } }).queue_id, 'fauna_peacock');
  }
});

test('matches Latin scientific names case-insensitively', () => {
  const snapshot = NEEDS_CHECK_BLOCKER.createSnapshot([entry]);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { scope: 'fauna', name_lat: 'PAVO CRISTATUS' } }).queue_id, 'fauna_peacock');
});

test('respects block scope and exact exceptions', () => {
  const snapshot = NEEDS_CHECK_BLOCKER.createSnapshot([entry]);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { scope: 'flora', name: 'павлин' } }), null);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { scope: 'fauna', name: 'изображение павлина' } }), null);
});

test('archive ID entries never block by a shared name and missing candidate scope checks all scopes', () => {
  const snapshot = NEEDS_CHECK_BLOCKER.createSnapshot([{ ...entry, block_by: 'archive_id', scope: 'fauna', patterns: [
    { language: 'ru', value: 'Павлин' }, { language: 'id', value: 'FSH0001' }
  ] }]);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { name: 'павлин', scope: 'crafts' } }), null);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { id: 'FSH0001', scope: 'crafts' } }).queue_id, 'fauna_peacock');
});

test('does not block a common word without its queue context, but catches the exact name', () => {
  const scopedEntry = { ...entry, patterns: [{ language: 'ru', value: 'Лапти в городском и сельском контексте' }] };
  const snapshot = NEEDS_CHECK_BLOCKER.createSnapshot([scopedEntry]);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { scope: 'fauna', name: 'лапти' } }), null);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { scope: 'fauna', name: 'Лапти в городском и сельском контексте' } }).queue_id, 'fauna_peacock');
});

test('short one-word blockers use exact forms; alternatives and aliases still match', () => {
  const snapshot = NEEDS_CHECK_BLOCKER.createSnapshot([{ ...entry,
    patterns: [{ language: 'ru', value: 'Рис|Аир|Карликовая берёза|Берёза карликовая|Таракан чёрный|Чёрный таракан' },
      { language: 'lat', value: 'Oryza sativa' }], exceptions: [] }]);
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
  ], exceptions: [] }]);
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { source_kind: 'entity', id: 'CRF0061', name: 'Другая запись' } }).queue_id, 'fauna_peacock');
  assert.equal(NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate: { source_kind: 'item-bearing', ids: ['CRF0061'], name: 'Другой предмет' } }), null);
});

test('fails closed on malformed entries and snapshots or a changed digest', () => {
  const snapshot = NEEDS_CHECK_BLOCKER.createSnapshot([entry]);
  assert.throws(() => NEEDS_CHECK_BLOCKER.matches({ snapshot: { ...snapshot, entries: [] }, candidate: { name: 'павлин' } }), /must contain entries/u);
  assert.throws(() => NEEDS_CHECK_BLOCKER.matches({ snapshot: { ...snapshot, digest: `sha256:${'0'.repeat(64)}` }, candidate: { name: 'павлин' } }), /digest mismatch/u);
  assert.throws(() => NEEDS_CHECK_BLOCKER.createSnapshot([{ ...entry, queue_id: '' }]), /Invalid or duplicate/u);
  assert.throws(() => NEEDS_CHECK_BLOCKER.createSnapshot([{ ...entry, patterns: [{ language: 'ru', value: '—' }] }]), /Empty normalized/u);
});
