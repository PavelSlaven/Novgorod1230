import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalStringify } from '../src/canonical-records.js';
import { loadApprovedNeedsCheckBlockerSnapshot } from '../src/needs-check-blocker-catalog.js';
import { NEEDS_CHECK_BLOCKER } from '../src/needs-check-blocker.js';

const pin = Object.freeze({ schema: 'rus.runtime_catalog_pin.v2',
  compatible_world_revision_id: 'world-v1', compatible_world_catalog_digest: '1'.repeat(64) });
const source = NEEDS_CHECK_BLOCKER.createSnapshot([{
  queue_id: 'wheel', doubt_kind: 'anachronism', block_by: 'name',
  block_region: 'region_novgorod_land', block_period: '1230-1250',
  source_ref: 'needs_check.csv#wheel', reason: 'Unresolved date.',
  patterns: [{ language: 'ru', value: 'Колёсная прялка' }], exceptions: []
}], ['region_novgorod_land']);

function verifiedCatalog(snapshot = source) {
  const payloadDigest = createHash('sha256').update(canonicalStringify(snapshot)).digest('hex');
  return Object.freeze({ schema: 'rus.verified_item_catalog.v2', verified: true,
    pin, records_by_table: { procedural_scene_compiled_records: [{
      record_id: 'profile:needs_check_blockers', version: 2,
      record_kind: 'profile', status: 'approved_authoring_not_runtime_selectable',
      payload: snapshot, payload_digest: payloadDigest
    }] } });
}

test('loads the blocker only from exact verified catalog membership', () => {
  const snapshot = loadApprovedNeedsCheckBlockerSnapshot({ verifiedCatalog: verifiedCatalog(), pin });
  assert.deepEqual(snapshot, source);
  assert.equal(Object.isFrozen(snapshot.entries[0]), true);
  assert.equal(loadApprovedNeedsCheckBlockerSnapshot({
    verifiedCatalog: { ...verifiedCatalog(), records_by_table: {} }, pin
  }), null);
  assert.throws(() => loadApprovedNeedsCheckBlockerSnapshot({
    verifiedCatalog: verifiedCatalog(), pin: { ...pin, catalog_digest: '2'.repeat(64) }
  }), { code: 'NEEDS_CHECK_BLOCKER_CATALOG_INVALID' });
});

test('rejects a missing digest, malformed snapshot or duplicate blocker profile', () => {
  const malformed = { ...source, digest: `sha256:${'0'.repeat(64)}` };
  assert.throws(() => loadApprovedNeedsCheckBlockerSnapshot({
    verifiedCatalog: verifiedCatalog(malformed), pin
  }), { code: 'NEEDS_CHECK_BLOCKER_CATALOG_INVALID' });
  const catalog = verifiedCatalog();
  catalog.records_by_table.procedural_scene_compiled_records.push(
    catalog.records_by_table.procedural_scene_compiled_records[0]);
  assert.throws(() => loadApprovedNeedsCheckBlockerSnapshot({ verifiedCatalog: catalog, pin }),
    { code: 'NEEDS_CHECK_BLOCKER_CATALOG_INVALID' });
});
