import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  buildM2cNpcWaveDatasets,
  starterPrimaryPlaceFamilies,
  STARTER_G3_SUBSTR,
  mapPresenceRule,
  mapNpcRelationshipRule,
  mapSpeechAddressForm,
  parseCsv,
  parseRequiredNonNegInt,
  parseSlotWeight,
  parseTextArray,
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

test('mapPresenceRule clears allowed_times for people subject kinds', () => {
  const row = {
    pr_id: 'pr_people',
    scope_kind: 'place_family',
    scope_ref: 'pf_x',
    region_id: '',
    category_ref: '',
    subject_kind: 'social_role',
    subject_ref: 'nov_role_x',
    item_ref: '',
    variants: '[]',
    probability_ppm: '1000',
    count_limit: '1',
    allowed_seasons: 'all',
    allowed_times: '["day"]',
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
  assert.deepEqual(mapped.allowed_times, []);
  assert.equal('allowed_times_source' in mapped.authoring_payload, false);
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

test('parseTextArray throws on malformed JSON', () => {
  assert.throws(() => parseTextArray('[not-json'), /invalid text array JSON/u);
});

test('parseRequiredNonNegInt throws on empty or negative values', () => {
  assert.throws(() => parseRequiredNonNegInt('', 'probability_ppm'), /missing required integer/u);
  assert.throws(() => parseRequiredNonNegInt('-1', 'count_limit'), /invalid required integer/u);
  assert.equal(parseRequiredNonNegInt('0', 'count_limit'), 0);
});

test('parseVariants fail-closed on malformed CSV JSON', () => {
  assert.throws(() => parseVariants('{not-json'), /invalid variants JSON/u);
  assert.throws(() => parseVariants('{"x":1}'), /expected JSON array/u);
  assert.throws(() => parseVariants('["it_str"]'), /string elements are forbidden/u);
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
    spatialClosure: {
      revisionRows: [{
        id: 'rev-fixture',
        catalog_digest: 'a'.repeat(64),
        status: 'approved',
        provenance_ref: 'src-fixture',
      }],
      closureNodes: [{
        entity_kind: 'spatial_node',
        id: 'node-1',
        version: 1,
        world_revision_id: 'rev-fixture',
        spatial_level: 'G4',
        stable_label_id: null,
        primary_class_id: 'spatial.g4.test',
        evidence_status: 'reviewed',
        traversal_model: null,
        status: 'approved',
        provenance_ref: 'src-fixture',
        canonical_digest: 'b'.repeat(64),
      }],
    },
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

test('starter territory place families each have a primary binding on pin 3ab1c890', async () => {
  const commit = '3ab1c890c1caee2c1247ee144bf66bd35de705ec';
  const gitShow = (path) => execSync(`git show ${commit}:${path}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const parent = await mkdtemp(join(tmpdir(), 'm2c-starter-'));
  const outRoot = join(parent, 'v1');
  const result = await buildM2cNpcWaveDatasets({ sourceCommit: commit, gitShow, outRoot });
  assert.equal(result.starterPlaceFamilies, 16, `starter PF count ${result.starterPlaceFamilies}`);
  const bindings = JSON.parse(await readFile(join(outRoot, 'datasets/spatial_node_place_family_bindings.json'), 'utf8'));
  const starterPf = starterPrimaryPlaceFamilies(bindings);
  assert.ok(starterPf.size >= 16);
  for (const pfId of starterPf) {
    assert.ok(
      bindings.some((row) => row.place_family_id === pfId && row.binding_role === 'primary'
        && String(row.node_id).includes(STARTER_G3_SUBSTR)),
      pfId,
    );
  }
  const manifest = JSON.parse(await readFile(join(outRoot, 'manifest.json'), 'utf8'));
  assert.equal(manifest.bundle_kind, 'dependency_closure');
  assert.deepEqual(manifest.data_gaps, []);
  assert.equal(manifest.source_commit, undefined);
  await rm(parent, { recursive: true, force: true });
});

test('schedule routine rules count matches schedules CSV rows on approval pin', async () => {
  const approval = JSON.parse(await readFile('data/world-catalogs/novgorod/m2c-npc-wave/v1/approval.json', 'utf8'));
  const commit = approval.source_commit;
  const gitShow = (path) => execSync(`git show ${commit}:${path}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const csvRows = parseCsv(gitShow('data/world-catalogs/novgorod/game-base-v1/time-calendar-church/time/schedules_routines.csv'));
  const parent = await mkdtemp(join(tmpdir(), 'm2c-sched-count-'));
  const outRoot = join(parent, 'v1');
  await buildM2cNpcWaveDatasets({ sourceCommit: commit, gitShow, outRoot });
  const rules = JSON.parse(await readFile(join(outRoot, 'datasets/npc_schedule_routine_rules.json'), 'utf8'));
  assert.equal(rules.length, csvRows.length, 'one routine rule per schedules.csv row');
  assert.equal(csvRows.length, 167);
  await rm(parent, { recursive: true, force: true });
});

test('committed m2c-npc-wave dataset files match generator output on approval pin', async (t) => {
  const approval = JSON.parse(await readFile('data/world-catalogs/novgorod/m2c-npc-wave/v1/approval.json', 'utf8'));
  const commit = approval.source_commit;
  const parent = await mkdtemp(join(tmpdir(), 'm2c-byte-parity-'));
  const outRoot = join(parent, 'v1');
  t.after(() => rm(parent, { recursive: true, force: true }));
  const gitShow = (path) => execSync(`git show ${commit}:${path}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  await buildM2cNpcWaveDatasets({ sourceCommit: commit, gitShow, outRoot });
  const manifest = JSON.parse(await readFile('data/world-catalogs/novgorod/m2c-npc-wave/v1/manifest.json', 'utf8'));
  for (const dataset of manifest.datasets) {
    const committed = await readFile(join(process.cwd(), 'data/world-catalogs/novgorod/m2c-npc-wave/v1', dataset.file));
    const generated = await readFile(join(outRoot, dataset.file));
    assert.equal(
      createHash('sha256').update(committed).digest('hex'),
      createHash('sha256').update(generated).digest('hex'),
      dataset.table,
    );
  }
});

// game-base lw-env (#176) added subject_kind='environment' presence rules that neither §3A.1, DDL
// world_base.presence_rules nor the R-2a engine know: the generator excludes them and counts them.
const ENVIRONMENT_PIN = '27bd6134cf61200b8da5ffe76ef8ab777ad5a5fd';

test('generator excludes subject_kind=environment presence rules with a typed counter', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'm2c-env-exclusion-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const outRoot = join(parent, 'v1');
  const gitShow = (path) => execSync(`git show ${ENVIRONMENT_PIN}:${path}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const csvRows = parseCsv(gitShow('data/world-catalogs/novgorod/game-base-v1/places-binding/presence/presence_rules.csv'));
  const result = await buildM2cNpcWaveDatasets({ sourceCommit: ENVIRONMENT_PIN, gitShow, outRoot });
  const rules = JSON.parse(await readFile(join(outRoot, 'datasets/presence_rules.json'), 'utf8'));
  assert.equal(result.excludedEnvironmentPresenceRules, 1236);
  assert.equal(rules.length + result.excludedEnvironmentPresenceRules, csvRows.length);
  assert.deepEqual([...new Set(rules.map((rule) => rule.subject_kind))].sort(),
    ['category', 'occupation', 'social_role']);
});

test('generator refuses a presence subject_kind it neither imports nor explicitly excludes', async () => {
  const gitShow = (path) => {
    const text = fixtureGitShow(path);
    if (!path.endsWith('places-binding/presence/presence_rules.csv')) return text;
    const [header, first, ...rest] = text.split('\n');
    const index = header.split(',').indexOf('subject_kind');
    assert.ok(index >= 0);
    const cells = first.split(',');
    cells[index] = 'mystery_kind';
    return [header, cells.join(','), ...rest].join('\n');
  };
  await assert.rejects(buildM2cNpcWaveDatasets({ sourceCommit: 'f'.repeat(40), gitShow,
    outRoot: join(tmpdir(), 'm2c-unsupported-kind-out') }), /M2C_WAVE_PRESENCE_SUBJECT_KIND_UNSUPPORTED/u);
});
