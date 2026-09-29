import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const L = require('./lib.cjs');
const A = require('./archive-inclusions.cjs');
const REVIEW_ROOT = path.resolve(L.REPO, '../../fleet/tasks/imp-crafts/review');
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
      assert.match(row.finding_ref, /^round3-(crafts|bicw)\.md#L\d+$/);
      const [, filename, line] = row.finding_ref.match(/^(round3-(?:crafts|bicw)\.md)#L(\d+)$/);
      const review = fs.readFileSync(path.join(REVIEW_ROOT, filename), 'utf8').split(/\r?\n/);
      assert.ok(Number(line) > 0 && Number(line) <= review.length, `finding line is outside ${filename}: ${line}`);
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
  for (const id of ['HNT0004', 'HNT0011', 'FSH0018', 'OMI02099', 'OMI02127', 'OMI00970', 'OMI00929']) {
    assert.ok(A.isHuntingFishingCluster(id), `${id} must be in the boundary`);
  }
  for (const id of ['OMI00366', 'OMI02061']) {
    assert.ok(!A.isHuntingFishingCluster(id), `${id} is outside the boundary`);
  }
});

test('queue is a complete non-terminal partition of archive provenance', () => {
  assert.equal(authoredIds.size, A.authoredRows.length);
  assert.equal(authoredIds.size, 1269);
  assert.equal(ledgerById.size, ledger.length);
  assert.equal(ledgerById.size, 1269);
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
