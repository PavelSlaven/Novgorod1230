import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildM2cNpcWaveDatasets,
  mapPresenceRule,
  parseCsv,
  parseVariants,
} from '../../scripts/generate-m2c-npc-wave-datasets.mjs';

test('parseCsv reads quoted commas', () => {
  const rows = parseCsv('a,b\n"1,2",3\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].a, '1,2');
  assert.equal(rows[0].b, '3');
});

test('mapPresenceRule maps item_ref and variants', () => {
  const row = {
    pr_id: 'pr_abc',
    scope_kind: 'place_family',
    scope_ref: 'pf_x',
    region_id: '',
    category_ref: 'cat_a',
    subject_kind: 'category',
    subject_ref: 'cat_a',
    item_ref: 'it_one',
    variants: '["it_two","it_three"]',
    probability_ppm: '1000',
    count_limit: '2',
    allowed_seasons: 'all',
    allowed_times: '',
    guards: '',
    entry_visible_if: '',
    search_only_if: '',
    entry_exposed_weight: '',
    search_concealed_weight: '',
    wild_arrival_cause_required: '',
    refresh_class: 'none',
    confidence: 'C',
    status: 'candidate',
  };
  const mapped = mapPresenceRule(row, 'rev-1', 'src-1');
  assert.equal(mapped.rule_id, 'pr_abc');
  assert.equal(mapped.rule_version, 1);
  assert.equal(mapped.item_ref, 'it_one');
  assert.deepEqual(mapped.variants, ['it_two', 'it_three']);
  assert.equal(mapped.category_id, 'cat_a');
});

test('parseVariants empty array', () => {
  assert.deepEqual(parseVariants('[]'), []);
});

test('buildM2cNpcWaveDatasets reads b1f249de via git show', async (t) => {
  try {
    const result = await buildM2cNpcWaveDatasets();
    assert.ok(result.presenceRules > 0);
    assert.ok(result.bindings > 0);
  } catch (error) {
    if (String(error.message).includes('bad object') || String(error.message).includes('fatal:')) {
      t.skip(`git object missing: ${error.message}`);
      return;
    }
    throw error;
  }
});
