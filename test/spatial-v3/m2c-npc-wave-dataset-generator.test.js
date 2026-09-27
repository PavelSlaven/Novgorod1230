import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  buildM2cNpcWaveDatasets,
  mapPresenceRule,
  mapNpcRelationshipRule,
  mapSpeechAddressForm,
  parseCsv,
  parseSlotWeight,
  parseVariants,
} from '../../scripts/generate-m2c-npc-wave-datasets.mjs';

const fixtureBase = fileURLToPath(
  new URL('../fixtures/m2c-npc-wave-game-base/', import.meta.url)
);
const fixtureGitShow = (path) => readFileSync(resolve(fixtureBase, path), 'utf8');

test('parseCsv reads quoted commas', () => {
  const rows = parseCsv('a,b\n"1,2",3\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].a, '1,2');
  assert.equal(rows[0].b, '3');
});

test('parseVariants preserves object entries from CSV JSON', () => {
  const raw = '[{"item_ref":"it_two","source_pool":"pool.csv","source_row_id":"row-1"}]';
  assert.deepEqual(parseVariants(raw), [{
    item_ref: 'it_two',
    source_pool: 'pool.csv',
    source_row_id: 'row-1',
  }]);
});

test('mapPresenceRule maps item_ref and variant objects', () => {
  const row = {
    pr_id: 'pr_abc',
    scope_kind: 'place_family',
    scope_ref: 'pf_x',
    region_id: '',
    category_ref: 'cat_a',
    subject_kind: 'category',
    subject_ref: 'cat_a',
    item_ref: 'it_one',
    variants: '[{"item_ref":"it_two","source_row_id":"row-1"}]',
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
  assert.equal(mapped.confidence, 'low');
  assert.equal(mapped.item_ref, 'it_one');
  assert.deepEqual(mapped.variants, [{ item_ref: 'it_two', source_row_id: 'row-1' }]);
});

test('parseSlotWeight empty to 1; zero and negative throw', () => {
  assert.equal(parseSlotWeight(''), 1);
  assert.equal(parseSlotWeight(undefined), 1);
  assert.throws(() => parseSlotWeight('0'), /invalid slot weight/u);
  assert.throws(() => parseSlotWeight('-3'), /invalid slot weight/u);
});

test('mapNpcRelationshipRule and mapSpeechAddressForm confidence C6', () => {
  const rel = mapNpcRelationshipRule({
    rel_rule_id: 'rel_test',
    scope_kind: 'role_pair',
    scope_ref: '',
    subject_role_ref: 'nov_role_a',
    object_role_ref: 'nov_role_b',
    relationship_kind: 'unspecified',
    direction: 'symmetric',
    materialization_guard: 'g',
    confidence: 'B',
    status: 'candidate',
  }, 'rev-1', 'src-1');
  assert.equal(rel.rule_id, 'rel_test');
  assert.equal(rel.confidence, 'medium');

  const form = mapSpeechAddressForm({
    sp_id: 'form_test',
    channel: 'oral',
    form_ru: 'Господин',
    confidence: 'A',
    status: 'candidate',
  }, 'rev-1', 'src-1');
  assert.equal(form.form_id, 'form_test');
  assert.equal(form.confidence, 'high');
});

test('parseVariants empty array', () => {
  assert.deepEqual(parseVariants('[]'), []);
});

test('buildM2cNpcWaveDatasets fixture is deterministic in tmpdir', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'm2c-gen-'));
  const outA = join(parent, 'a');
  const outB = join(parent, 'b');
  const opts = {
    sourceCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    worldRevisionId: 'rev-fixture',
    provenanceRef: 'src-fixture',
    gitShow: fixtureGitShow,
  };
  const resultA = await buildM2cNpcWaveDatasets({ ...opts, outRoot: outA });
  const resultB = await buildM2cNpcWaveDatasets({ ...opts, outRoot: outB });
  assert.equal(resultA.presenceRules, 1);
  assert.equal(resultA.rulesWithVariants, 1);
  assert.equal(resultA.variantElementCount, 1);
  assert.equal(resultA.npcRelationshipRules, 1);
  assert.equal(resultA.speechAddressForms, 1);
  assert.match(resultA.sourceCommit, /^a{40}$/u);

  const manifestA = await readFile(join(outA, 'manifest.json'), 'utf8');
  const manifestB = await readFile(join(outB, 'manifest.json'), 'utf8');
  assert.equal(manifestA, manifestB);

  const presenceA = await readFile(join(outA, 'datasets/presence_rules.json'), 'utf8');
  const presenceB = await readFile(join(outB, 'datasets/presence_rules.json'), 'utf8');
  assert.equal(presenceA, presenceB);
  assert.match(presenceA, /"item_ref": "it_two"/u);

  const slots = JSON.parse(await readFile(join(outA, 'datasets/slot_instance_variants.json'), 'utf8'));
  assert.deepEqual(slots.map((row) => row.weight), [1, 2]);

  await rm(parent, { recursive: true, force: true });
});
