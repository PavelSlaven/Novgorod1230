import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadApprovedInitialHistoricalEvents } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-1b.js';

test('party start loads the approved temporal famine record into snapshot events', async () => {
  let parameters;
  const record = await famineRecord();
  const events = await loadApprovedInitialHistoricalEvents(async (sql, values) => {
    assert.match(sql, /world_base\.temporal_authoring_records/u);
    assert.match(sql, /status='approved'/u);
    parameters = values;
    return { rows: [record] };
  });
  assert.deepEqual(parameters, [
    'record:historical_phase_local_effect_rules:novgorod_famine_1230_v2'
  ]);
  assert.equal(events.length, 11);
  assert.deepEqual(events.at(-1).source_ref, {
    record_id: 'record:historical_phase_local_effect_rules:novgorod_famine_1230_v2',
    catalog_digest: 'a'.repeat(64)
  });
});

test('party start rejects missing approved temporal source', async () => {
  await assert.rejects(
    loadApprovedInitialHistoricalEvents(async () => ({ rows: [] })),
    { code: 'TRACE_PHASE_1B_TEMPORAL_HISTORY_REQUIRED' }
  );
});

async function famineRecord() {
  const [record] = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/temporal-v4/datasets/'
      + 'historical_phase_local_effect_rules.json', import.meta.url), 'utf8'));
  return { ...record, canonical_digest: 'a'.repeat(64) };
}
