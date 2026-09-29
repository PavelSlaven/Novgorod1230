import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const L = require('./lib.cjs');
const A = require('./archive-inclusions.cjs');
const queue = A.NEEDS_CHECK_ROWS;
const byId = new Map(queue.map(row => [row.archive_id, row]));
const ledger = L.readCsv(path.join(L.DOMAIN_ROOT, 'archive_inclusion_ledger.csv'));
const authoredIds = new Set(A.authoredRows.map(row => row[0].split(':').at(-1)));
const ledgerById = new Map(ledger.map(row => [row.archive_ref.split(':').at(-1), row]));

test('needs_check authoring schema and evidence locators are valid', () => {
  assert.equal(Object.keys(queue[0]).join(','), A.NEEDS_CHECK_HEADER.join(','));
  assert.equal(byId.size, queue.length, 'queue IDs must be unique');
  for (const row of queue) {
    assert.ok(authoredIds.has(row.archive_id), `unknown archive ID ${row.archive_id}`);
    assert.match(row.current_result, /^(new|variant)\/(include|routed|rejected)$/);
    assert.match(row.reason_code, /^(ICA_[A-Z0-9_]+|review_finding|unresolved)$/);
    if (row.finding_ref) {
      assert.match(row.finding_ref, /^(round3-(?:crafts|bicw)\.md#L\d+|REVIEW-B-1#\d+)$/);
    }
    if (row.current_result.startsWith('variant/')) {
      assert.equal(row.current_target_group, 'crafts-tools-processes', `${row.archive_id} must retain its own target owner`);
      assert.ok(row.current_target_ref, `${row.archive_id} must retain its variant target ref`);
    }
  }
});

test('hunting and fishing archive taxonomy is held as one unresolved ownership cluster', () => {
  for (const row of A.authoredRows) {
    const id = row[0].split(':').at(-1);
    if (!A.isHuntingFishingCluster(id)) continue;
    const held = byId.get(id);
    assert.ok(held, `${id} must be queued`);
    assert.equal(held.reason_code, 'unresolved');
    assert.ok(held.cluster_id, `${id} needs a cluster ID`);
    assert.match(held.note, /crafts ↔ fauna\/hunting/);
  }
  for (const id of ['HNT0004', 'HNT0011', 'FSH0018', 'OMI00124', 'OMI01128', 'OMI02099', 'OMI02127', 'OMI00970', 'OMI00929']) {
    assert.ok(A.isHuntingFishingCluster(id), `${id} must be in the boundary`);
  }
  for (const id of ['OMI00366', 'OMI02061']) {
    assert.ok(!A.isHuntingFishingCluster(id), `${id} is outside the boundary`);
  }
});

test('queue is a complete non-terminal partition of archive provenance', () => {
  assert.equal(authoredIds.size, A.authoredRows.length);
  assert.equal(authoredIds.size, 1268);
  assert.equal(ledgerById.size, ledger.length);
  assert.equal(ledgerById.size, 1268);
  for (const id of byId.keys()) {
    const row = ledgerById.get(id);
    assert.ok(row, `${id} missing from generated ledger`);
    assert.equal(row.record_type, 'needs_check');
    assert.equal(row.disposition, 'needs_check');
    assert.equal(row.status, 'needs_check');
    assert.equal(row.game_base_ref, '');
    assert.equal(row.target_group, '');
    assert.equal(row.target_ref, '');
  }
  for (const [id, row] of ledgerById) {
    assert.equal(row.disposition === 'needs_check', byId.has(id), `${id} must occur in exactly one side of the queue partition`);
  }
});

test('round-three findings and owner-boundary decisions remain queued', () => {
  const round3 = `OMI00214 OMI00324 OMI00332 OMI00202 OMI01759 OMI00117 OMI00319 OMI00595 OMI00596 OMI00775 OMI00822 OMI00839 OMI01197 OMI01231 OMI00176 OMI00177 OMI00178 OMI00179 OMI00180`;
  for (const id of round3.split(' ')) assert.ok(byId.has(id), `${id} must be held from round-three findings`);
  for (const id of `OMI01668 OMI01669 OMI01670 OMI01671 OMI00968 OMI00969 OMI00366 OMI00124 OMI01128 OMI00608`.split(' ')) {
    assert.ok(byId.has(id), `${id} must remain queued pending identity or owner review`);
  }
  for (const id of `OMI00753 OMI00754 OMI00755 OMI00756 OMI00757 OMI00758 OMI00759 OMI00760 OMI00761 OMI00762 OMI00763 OMI00764 OMI00767 OMI00788`.split(' ')) {
    const row = A.authoredRows.find(entry => entry[0].endsWith(`:${id}`));
    assert.ok(row?.[3].endsWith('#mt_nonferrous_generic'), `${id} must use generic nonferrous alloy material`);
  }
  for (const id of ['OMI00366', 'OMI00403']) assert.equal(byId.get(id)?.cluster_id, 'cargo_net_OMI00366_OMI00403');
  assert.equal(byId.get('OMI00608')?.cluster_id, 'nail_forging_OMI00607_OMI00608');
  assert.equal(A.authoredRows.some(row => row[0].endsWith(':MSC0003')), false);
});

test('variants remain queued while their base entities are under review', () => {
  for (const [variantId, baseId] of [['OMI00597', 'OMI00596'], ['OMI01760', 'OMI01759']]) {
    const variant = byId.get(variantId);
    assert.ok(variant, `${variantId} must be held with its queued base`);
    assert.ok(byId.has(baseId), `${baseId} must remain queued`);
    assert.equal(variant.current_result, 'variant/include');
    assert.equal(variant.current_target_group, 'crafts-tools-processes');
    assert.equal(variant.current_target_ref, `crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:${baseId.toLowerCase()}`);
    assert.match(variant.note, new RegExp(`target ${baseId} is queued`));
    const ledgerRow = ledgerById.get(variantId);
    assert.equal(ledgerRow?.record_type, 'needs_check');
    assert.equal(ledgerRow?.disposition, 'needs_check');
    assert.equal(ledgerRow?.target_ref, '');
  }
});

test('trv_037 riding-kind mismatch is held as a typed owner decision', () => {
  const ids = `OMI02003 OMI02004 OMI02005 OMI02006 HRS0003 HRS0005 HRS0006 HRS0009 HRS0010 HRS0011 HRS0012 HRS0013 HRS0015 HRS0016 HRS0018 HRS0019 HRS0020 HRS0022 HRS0023 HRS0024 HRS0027 HRS0028 HRS0030`.split(' ');
  for (const id of ids) {
    const row = byId.get(id);
    assert.ok(row, `${id} must not activate the riding route`);
    assert.equal(row.current_result, 'new/routed');
    assert.equal(row.current_target_group, 'transport-health-recreation');
    assert.match(row.current_target_ref, /transport_entities\.csv#trv_037$/);
    assert.match(row.note, /kind=riding/);
  }
});

test('cross-group semantic clusters are held all-or-none', () => {
  const clusters = {
    hay: ['OMI02048','OMI02049','OMI02050','OMI02051','OMI02052','OMI02053','AGR0014','AGR0015'],
    teeth: ['OMI00898','OMI00899','OMI00900','OMI00901','OMI00961','OMI00962'],
    net_thread: ['FSH0012','OMI00382','OMI00383','OMI00408'],
    iron_scrap: ['OMI00643','OMI02164','OMI02270','OMI02271','OMI02275'],
    salt: ['OMI01601','OMI02182'],
    fur: ['OMI00422','OMI00423','OMI00424','OMI00425','OMI00428'],
    resin: ['OMI00162','OMI00163','OMI02141','OMI02186'],
    ceramic_blanks: ['OMI01043','OMI01046'],
    net: ['OMI00390','OMI00400'],
    handoff_OMI02252: ['OMI02252'],
    handoff_OMI02253: ['OMI02253'],
    owner_OMI01225: ['OMI01226','OMI01227'],
  };
  for (const [name, ids] of Object.entries(clusters)) {
    const present = ids.filter(id => authoredIds.has(id));
    if (present.some(id => byId.has(id))) {
      assert.deepEqual(present.filter(id => !byId.has(id)), [], `${name} has a partial queue`);
      for (const id of present) assert.equal(byId.get(id)?.cluster_id, name, `${id} must identify its ${name} cluster`);
    }
  }
});
