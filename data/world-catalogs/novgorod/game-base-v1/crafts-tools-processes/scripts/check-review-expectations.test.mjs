import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareExpectations } from './check-review-expectations.mjs';

test('review mismatch is reported unless a concrete disagreement covers the archive id', () => {
  const expectation = [{ archive_id: 'OMI00001', expected_action: 'variant',
    expected_target_ref: '', expected_target_group: '', review_source: 'round2-bicw.md:9',
    source_rank: 'round2', superseded_by: '' }];
  const records = new Map([['OMI00001', [{ record_type: 'new', disposition: 'include' }]]]);
  assert.equal(compareExpectations(expectation, [], records).mismatches.length, 1);
  assert.equal(compareExpectations(expectation, [{ archive_id: 'OMI00001', reason: 'Review target lacks stable identity.' }], records).mismatches.length, 0);
});

test('superseded expectations are excluded from verification and counted', async () => {
  const { expectationCounts } = await import('./check-review-expectations.mjs');
  const expectations = [
    { archive_id: 'OMI00001', expected_action: 'ref', review_source: 'bic.md:3', source_rank: 'round1', superseded_by: 'AMEND-imp-crafts-2' },
    { archive_id: 'OMI00001', expected_action: 'routed', expected_target_group: 'items-household-personal', review_source: 'round2-bicw.md:5', source_rank: 'round2', superseded_by: '' },
  ];
  const records = new Map([['OMI00001', [{ status: 'routed', target_group: 'items-household-personal' }]]]);
  const result = compareExpectations(expectations, [], records);
  assert.equal(result.mismatches.length, 0);
  assert.deepEqual(expectationCounts(result), { total: 2, superseded: 1, fulfilled_direct: 1, fulfilled_equivalent: 0, mismatches: 0, accepted_disagreements: 0 });
});

test('source rank is required even on superseded rows', () => {
  const expectations = [{ archive_id: 'OMI00001', expected_action: 'ref', review_source: 'bic.md:3',
    source_rank: '', superseded_by: 'AMEND-imp-crafts-2' }];
  assert.throws(() => compareExpectations(expectations, [], new Map()).mismatches, /invalid source_rank/);
});

test('variant or ref expectation is fulfilled by a routed target that exists in the owner group', () => {
  const expectation = [{ archive_id: 'OMI00282', expected_action: 'variant', expected_target_ref: 'it_hh_thread_skein',
    expected_target_group: '', review_source: 'round2-crafts.md:25', source_rank: 'round2', superseded_by: '' }];
  const records = new Map([['OMI00282', [{ _group: 'crafts-tools-processes', status: 'routed',
    target_group: 'items-household-personal', target_ref: 'it_hh_thread_skein' }]]]);
  const result = compareExpectations(expectation, [], records, (group, target) => group === 'items-household-personal' && target === 'it_hh_thread_skein');
  assert.equal(result.mismatches.length, 0);
  assert.equal(result.equivalent.size, 1);
});

test('a non-owner ledger row cannot mask the owner decision; other rows route to that owner', () => {
  const expectation = [{ archive_id: 'OMI00009', expected_action: 'entity', expected_target_ref: '',
    expected_target_group: '', review_source: 'round2-bicw.md:6', source_rank: 'round2', superseded_by: '' }];
  const valid = new Map([['OMI00009', [
    { _group: 'buildings-interiors-containers', record_type: 'new', disposition: 'include' },
    { _group: 'crafts-tools-processes', status: 'routed', target_group: 'buildings-interiors-containers' },
  ]]]);
  assert.equal(compareExpectations(expectation, [], valid).direct.size, 1);
  const invalid = new Map([['OMI00009', [
    { _group: 'buildings-interiors-containers', record_type: 'new', disposition: 'include' },
    { _group: 'crafts-tools-processes', record_type: 'new', disposition: 'include' },
  ]]]);
  assert.match(compareExpectations(expectation, [], invalid).mismatches[0].issue, /multiple owners/);
});

test('an explicit equivalence accepts ref or variant to the same target without a new entity', () => {
  const expectation = [{ archive_id: 'OMI01550', expected_action: 'ref', expected_target_ref: 'ct_bale_wrapped',
    expected_target_group: '', review_source: 'round2-bicw.md:5', source_rank: 'round2', superseded_by: '' }];
  const records = new Map([['OMI01550', [{ _group: 'buildings-interiors-containers', match_type: 'variant',
    target_ref: 'ct_bale_wrapped' }]]]);
  const result = compareExpectations(expectation, [], records);
  assert.equal(result.mismatches.length, 0);
  assert.equal(result.equivalent.size, 1);
});

test('ledger type and inclusion result identify current clothing entities and variants', () => {
  const expectations = [
    { archive_id: 'OMI00311', expected_action: 'entity', expected_target_group: 'clothing-appearance',
      review_source: 'round2-bicw.md:22', source_rank: 'round2', superseded_by: '' },
    { archive_id: 'OMI01228', expected_action: 'variant', expected_target_ref: 'ad_new_glass_bracelet',
      expected_target_group: 'clothing-appearance', review_source: 'round2-crafts.md:27', source_rank: 'round2', superseded_by: '' },
  ];
  const records = new Map([
    ['OMI00311', [{ _group: 'clothing-appearance', type: 'new', inclusion_result: 'entity',
      game_base_ref: 'n1230:material_item:omi00311' }]],
    ['OMI01228', [{ _group: 'clothing-appearance', type: 'variant', inclusion_result: 'variant',
      game_base_ref: 'clothing-appearance/adornment_appearance/adornment.csv#ad_new_glass_bracelet' }]],
  ]);
  const result = compareExpectations(expectations, [], records);
  assert.equal(result.mismatches.length, 0);
  assert.equal(result.direct.size, 2);
});

test('local target group falls back to the ledger owner group', () => {
  const expectation = [{ archive_id: 'MIL0026', expected_action: 'variant', expected_target_ref: 'wp_sword_belt',
    expected_target_group: 'items-weapons-armour', review_source: 'round2-bicw.md:25',
    source_rank: 'round2', superseded_by: '' }];
  const records = new Map([['MIL0026', [{ _group: 'items-weapons-armour', match_type: 'variant',
    selected_action: 'include_d39', game_base_ref: 'items/weapons_armour.csv#wp_sword_belt' }]]]);
  assert.equal(compareExpectations(expectation, [], records).direct.size, 1);
});

test('canonical material entity IDs satisfy exact entity targets when ledger target is blank', () => {
  for (const archiveId of ['MIL0014', 'MIL0028']) {
    const target = `n1230:material_item:${archiveId.toLowerCase()}`;
    const expectation = [{ archive_id: archiveId, expected_action: 'entity', expected_target_ref: target,
      expected_target_group: 'buildings-interiors-containers', review_source: 'answers.md:A-imp-crafts-03',
      source_rank: 'amend', superseded_by: '' }];
    const records = new Map([[archiveId, [{ _group: 'buildings-interiors-containers', type: 'new',
      inclusion_result: 'entity', game_base_ref: '' }]]]);
    const result = compareExpectations(expectation, [], records, (group, ref) =>
      group === 'buildings-interiors-containers' && ref === target);
    assert.equal(result.direct.size, 1, archiveId);
    assert.equal(result.mismatches.length, 0, archiveId);

    const wrongExpectation = [{ ...expectation[0], expected_target_ref: 'n1230:material_item:wrong' }];
    const wrong = compareExpectations(wrongExpectation, [], records, () => true);
    assert.equal(wrong.direct.size, 0, `${archiveId} wrong target`);
    assert.equal(wrong.mismatches.length, 1, `${archiveId} wrong target`);
  }
});

test('a foreign route cannot mask a mismatching owner variant target', () => {
  const expectation = [{ archive_id: 'OMI02249', expected_action: 'variant', expected_target_ref: 'omi00214',
    expected_target_group: 'crafts-tools-processes', review_source: 'round2-crafts.md:19',
    source_rank: 'round2', superseded_by: '' }];
  const records = new Map([['OMI02249', [
    { _group: 'crafts-tools-processes', match_type: 'variant', target_ref: 'mt_wood_generic' },
    { _group: 'buildings-interiors-containers', status: 'routed', target_group: 'crafts-tools-processes',
      target_ref: 'n1230:material_item:omi00214' },
  ]]]);
  const result = compareExpectations(expectation, [], records, (group, target) => group === 'crafts-tools-processes' && target === 'omi00214');
  assert.equal(result.mismatches.length, 1);
  assert.equal(result.equivalent.size, 0);
  assert.match(result.mismatches[0].issue, /^$/);
});

test('reference and rejection rows do not create multiple entity owners', () => {
  const referenceExpectation = [{ archive_id: 'REF0001', expected_action: 'ref', expected_target_ref: 'target_a',
    review_source: 'round2-crafts.md:1', source_rank: 'round2', superseded_by: '' }];
  const references = new Map([['REF0001', [
    { _group: 'crafts-tools-processes', game_base_ref: 'target_a' },
    { _group: 'buildings-interiors-containers', game_base_ref: 'target_b' },
  ]]]);
  const refResult = compareExpectations(referenceExpectation, [], references);
  assert.equal(refResult.direct.size, 1);
  assert.equal(refResult.mismatches.length, 0);

  const rejectExpectation = [{ archive_id: 'CRF0057', expected_action: 'reject', review_source: 'round2-bicw.md:4',
    source_rank: 'round2', superseded_by: '' }];
  const rejects = new Map([['CRF0057', [
    { _group: 'crafts-tools-processes', disposition: 'rejected' },
    { _group: 'buildings-interiors-containers', disposition: 'rejected' },
  ]]]);
  const rejectResult = compareExpectations(rejectExpectation, [], rejects);
  assert.equal(rejectResult.direct.size, 1);
  assert.equal(rejectResult.mismatches.length, 0);
});

test('variant and ref expectations resolve through intermediate targets to the same stable target', () => {
  const cases = [
    { id: 'OMI00587', expectedTarget: 'omi00586', aliasId: 'OMI00586', aliasTarget: 'omi00588', actualTarget: 'omi00588' },
    { id: 'OMI02267', expectedTarget: 'omi00251', aliasId: 'OMI00251', aliasTarget: 'mt_wool', actualTarget: 'mt_wool' },
    { id: 'OMI02268', expectedTarget: 'n1230:material_item:omi00225', aliasId: 'OMI00225', aliasTarget: 'mt_flax', actualTarget: 'mt_flax' },
  ];
  for (const item of cases) {
    const expectations = [{ archive_id: item.id, expected_action: 'variant', expected_target_ref: item.expectedTarget,
      expected_target_group: 'crafts-tools-processes', review_source: 'round2-crafts.md:35',
      source_rank: 'round2', superseded_by: '' }];
    const records = new Map([
      [item.aliasId, [{ _group: 'crafts-tools-processes', match_type: 'variant', target_ref: item.aliasTarget }]],
      [item.id, [{ _group: 'crafts-tools-processes', match_type: 'variant', target_ref: item.actualTarget }]],
    ]);
    const result = compareExpectations(expectations, [], records);
    assert.equal(result.mismatches.length, 0, item.id);
    assert.equal(result.equivalent.has(item.id), true, item.id);
  }
});

test('wrong current target labels for CON0014 and CON0045 are not expected targets', () => {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../authoring/review_expectations.csv');
  const rows = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(1)
    .map(line => line.split(',')).filter(row => ['CON0014', 'CON0045'].includes(row[0]));
  assert.deepEqual(rows.map(row => [row[0], row[1], row[2]]), [
    ['CON0014', 'variant', ''], ['CON0045', 'variant', ''],
  ]);
  const expectations = rows.map(row => ({ archive_id: row[0], expected_action: row[1], expected_target_ref: row[2],
    expected_target_group: row[3], review_source: row[4], source_rank: row[5], superseded_by: row[6] }));
  const records = new Map(rows.map(row => [row[0], [{ _group: 'buildings-interiors-containers',
    match_type: 'variant', target_ref: `correct_target_${row[0].toLowerCase()}` }]]));
  const result = compareExpectations(expectations, [], records);
  assert.equal(result.direct.size, 2);
  assert.equal(result.mismatches.length, 0);
});

test('D9 expectations treat CON0019 as entity and STA0045 as its variant', () => {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../authoring/review_expectations.csv');
  const rows = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(1)
    .map(line => line.split(',')).filter(row => ['CON0019', 'STA0045'].includes(row[0]));
  assert.deepEqual(rows.map(row => [row[0], row[1], row[2], row[3]]), [
    ['CON0019', 'entity', '', 'buildings-interiors-containers'],
    ['STA0045', 'variant', 'n1230:material_item:con0019', 'buildings-interiors-containers'],
  ]);
});

test('A03 receiving-BIC decisions supersede scene routes and WTR0019 routes to crafts', () => {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../authoring/review_expectations.csv');
  const rows = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(1)
    .map(line => line.split(','));
  const activeById = id => rows.filter(row => row[0] === id && !row[6]);
  const supersededById = id => rows.filter(row => row[0] === id && row[6]);
  const amendments = [
    ['MIL0006', 'variant', 'bp_hearth_open'],
    ['MIL0014', 'entity', 'n1230:material_item:mil0014'],
    ['MIL0028', 'entity', 'n1230:material_item:mil0028'],
    ['MIL0032', 'variant', 'bp_awning'],
  ];
  for (const [id, action, target] of amendments) {
    assert.equal(supersededById(id).length, 1, `${id} old route`);
    assert.equal(supersededById(id)[0][6], 'A-imp-crafts-03: receiving BIC entity/variant replaces scene-only route');
    assert.deepEqual(activeById(id).map(row => [row[1], row[2], row[3], row[4], row[5]]), [[
      action, target, 'buildings-interiors-containers', 'answers.md:A-imp-crafts-03', 'amend',
    ]]);
  }
  assert.equal(supersededById('WTR0019').length, 1);
  assert.deepEqual(activeById('WTR0019').map(row => [row[1], row[2], row[3], row[4], row[5]]), [[
    'routed', 'mt_pine_pitch', 'crafts-tools-processes', 'answers.md:A-imp-crafts-03', 'amend',
  ]]);
});
