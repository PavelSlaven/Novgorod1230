import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorldDataPostgresEnabled,
  isNovgorodFrame,
  mapRegionRow,
  resolveHistoryPackId,
  resetWorldBasePool
} from '../src/world/world-base-db.js';

test('resolveHistoryPackId detects central europe frame', () => {
  const packId = resolveHistoryPackId({
    historicalFrame: { year: 1241, regionName: 'Силезия' },
    history: { year: 1241 }
  });
  assert.equal(packId, '1241-central-europe');

  assert.equal(resolveHistoryPackId({ history: { year: 1240 } }), null);
});

test('resolveHistoryPackId detects novgorod 1230-1250 frame', () => {
  assert.equal(resolveHistoryPackId({
    historicalFrame: { year: 1237, regionName: 'Новгородская земля' }
  }), 'novgorod-land-1230-1250');
  assert.equal(isNovgorodFrame({ region: { name: 'Volkhov corridor' } }), true);
});

test('isWorldDataPostgresEnabled requires postgres source and DATABASE_URL', () => {
  assert.equal(isWorldDataPostgresEnabled({ WORLD_DATA_SOURCE: 'fs', DATABASE_URL: 'x' }), false);
  assert.equal(isWorldDataPostgresEnabled({ WORLD_DATA_SOURCE: 'postgres', DATABASE_URL: '' }), false);
  assert.equal(isWorldDataPostgresEnabled({ WORLD_DATA_SOURCE: 'postgres', DATABASE_URL: 'postgresql://x' }), true);
});

test('mapRegionRow returns runtime catalog entry', async () => {
  assert.deepEqual(mapRegionRow({
    id: 'region_novgorod_land',
    slug: 'novgorod_land',
    canonical_name: 'Новгородская земля',
    display_name: 'Новгород',
    summary: 'approved source data',
    status: 'approved',
    confidence: 'high'
  }), {
    id: 'region_novgorod_land',
    slug: 'novgorod_land',
    name: 'Новгород',
    canonicalName: 'Новгородская земля',
    summary: 'approved source data',
    geographicScope: null,
    periodStartYear: null,
    periodEndYear: null,
    status: 'approved',
    confidence: 'high'
  });
  await resetWorldBasePool();
});
