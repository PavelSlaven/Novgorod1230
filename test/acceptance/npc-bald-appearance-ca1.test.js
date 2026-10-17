import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { completeActorBaseAppearance, validateActorBaseAppearance } from '@rus/actors';
import {
  compileApprovedActorAppearanceEntries,
  createRandomSource,
  MaterializationError,
  materializeActorBaseAppearance
} from '@rus/materialization';
import { readCommittedEntityExterior } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-current-visibility-inputs.js';
import { projectLowerDvinaTraceVisibleNpcDetails } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-player-safe-npc-details.js';

// Issue #536, CA536-F1/F2. Expected red before the CA1 correction.
// These are the original v4 rows, without the inactive D152/v2 overlay.
const DATASETS = new URL('../../data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v4/datasets/', import.meta.url);
const SOURCE_SHA256 = Object.freeze({
  region_appearance_profile_entries: '61230c341f418e386f9213b93cf1f7d43c0bf3751a7aab62300cfadec7fa66b5',
  region_appearance_profiles: 'b1d2f8a5129de7f2a7e71cc3f3d4dc33e702eaf301398b6b8df059e302ac5cd1',
  region_category_options: '777eab954536900c981bc84f5f496a0e7a5ffcd6ad5a34abc9c166433753862d',
  region_demographic_profile_entries: 'a5c5a1e24d24222eda9a77bdc0659533b2cd7aea82db9a36fa34b2e82170e5af',
  region_demographic_profiles: '9a7fffa8f4e00db21363b2b67c227ca81b460f5803322e32da0a0709bf21c0cd',
  universal_categories: 'a48cc78b57789967622776863999fa475703766a11edfcd39d3fdf52fff81006'
});
const records = Object.fromEntries(Object.entries(SOURCE_SHA256).map(([table, sha256]) => {
  const bytes = readFileSync(new URL(`${table}.json`, DATASETS));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256, `${table}: original v4 source pin`);
  return [table, JSON.parse(bytes)];
}));
const APPROVED_ENTRIES = compileApprovedActorAppearanceEntries({ records,
  demographic_profile_ref: records.region_demographic_profiles[0].id,
  appearance_profile_ref: records.region_appearance_profiles[0].id });
const BALD_ENTRY_ID = APPROVED_ENTRIES.find((entry) =>
  entry.facet === 'hair_length' && entry.option_value === 'bald').entry_id;

function identity(hair = { color: 'dark_brown', length: 'bald',
  style: 'straight', facial_hair: 'short_beard' }) {
  return { canonical_name: 'Ратша', sex_category: 'male', age_category: 'middle_aged',
    appearance: { build: 'stocky', skin_tone: 'light', face_shape: 'broad',
      hair: structuredClone(hair), eyes: { color: 'gray' } } };
}

function exteriorInput(authored) {
  const calls = [];
  const transaction = { async query(sql, params) {
    assert.deepEqual(params, ['synthetic-party', 'synthetic-npc']);
    if (sql.includes('FROM party_runtime.party_npcs')) {
      calls.push('identity');
      return { rows: [{ identity_state: authored }] };
    }
    if (sql.includes("p.physical_position='hands'")) {
      assert.match(sql, /FROM party_runtime\.party_items i/u);
      assert.match(sql, /JOIN party_runtime\.party_item_placements p/u);
      assert.match(sql, /p.party_id=\$1/u);
      assert.match(sql, /p.holder_npc_id=\$2/u);
      calls.push('held');
      return { rows: [] };
    }
    assert.match(sql, /FROM party_runtime\.party_item_placements p/u);
    calls.push('gear');
    return { rows: [] };
  } };
  return { calls, input: { transaction, partyId: 'synthetic-party',
    placement: { entity_kind: 'npc', entity_id: 'synthetic-npc' } } };
}

function physicalBaldAppearance(authored) {
  const appearance = structuredClone(authored.appearance);
  delete appearance.hair.color;
  delete appearance.hair.style;
  return appearance;
}

test('CA536-F1: committed v4 bald exterior remains readable without rewriting identity', async () => {
  const authored = identity();
  const before = structuredClone(authored);
  const { input, calls } = exteriorInput(authored);
  const exterior = await readCommittedEntityExterior(input);
  assert.deepEqual(exterior, { sex_category: 'male', age_category: 'middle_aged',
    appearance: physicalBaldAppearance(before), visible_equipment: [],
    held_items: [], machine_status: null, current_activity: null });
  assert.deepEqual(calls, ['identity', 'gear', 'held']);
  assert.deepEqual(authored, before);
});

test('CA536-F1: new bald exterior and ordinary exterior retain their physical fields', async () => {
  for (const hair of [{ length: 'bald', facial_hair: 'short_beard' },
    { color: 'dark_brown', length: 'short', style: 'straight', facial_hair: 'short_beard' }]) {
    const authored = identity(hair);
    const before = structuredClone(authored);
    const { input, calls } = exteriorInput(authored);
    const exterior = await readCommittedEntityExterior(input);
    assert.deepEqual(exterior.appearance, before.appearance);
    assert.deepEqual(calls, ['identity', 'gear', 'held']);
    assert.deepEqual(authored, before);
  }
});

test('CA536-F1: compatibility remains actor-owned and does not admit invalid legacy vocabulary', () => {
  const legacy = identity();
  const before = structuredClone(legacy);
  assert.deepEqual(validateActorBaseAppearance(legacy, { allowLegacyBaldMetadata: true }),
    { ok: true, errors: [] });
  legacy.appearance.hair.color = 'violet';
  assert.equal(validateActorBaseAppearance(legacy, { allowLegacyBaldMetadata: true }).ok, false);
  legacy.appearance.hair.color = before.appearance.hair.color;
  delete legacy.appearance.eyes.color;
  assert.equal(validateActorBaseAppearance(legacy, { allowLegacyBaldMetadata: true }).ok, false);
});

test('CA536-F1: committed reader still rejects invalid hair vocabulary and incomplete eye data', async () => {
  for (const mutate of [
    (value) => { value.appearance.hair.color = 'violet'; },
    (value) => { delete value.appearance.eyes.color; }
  ]) {
    const authored = identity();
    mutate(authored);
    const before = structuredClone(authored);
    const { input, calls } = exteriorInput(authored);
    await assert.rejects(readCommittedEntityExterior(input), (error) =>
      error.code === 'SCENE_ENTITY_PERCEPTION_DATA_GAP'
      && error.status === 409
      && error.details.reason === 'committed_entity_exterior_required');
    assert.deepEqual(calls, ['identity']);
    assert.deepEqual(authored, before);
  }
});

test('CA536-F1: new/authored bald remains strict and rejects metadata before RNG', () => {
  const authored = identity();
  const random = createRandomSource({ seed: 4 });
  assert.equal(validateActorBaseAppearance(authored).ok, false);
  assert.throws(() => completeActorBaseAppearance(authored), TypeError);
  assert.throws(() => materializeActorBaseAppearance({ identity: authored,
    approved_entries: APPROVED_ENTRIES, random, choice_key_prefix: 'ca1:strict' }),
  (error) => error instanceof MaterializationError && error.code === 'ACTOR_APPEARANCE_AUTHORED_INVALID');
  assert.equal(random.drawCount, 0);
});

for (const hair of [{ color: 'dark_brown', length: 'bald', style: 'straight', facial_hair: 'short_beard' },
  { length: 'bald', facial_hair: 'short_beard' }]) {
  test(`CA536-F1: visible ${Object.hasOwn(hair, 'color') ? 'legacy' : 'new'} bald details keep appearance without head-hair metadata`, () => {
    const authored = identity(hair);
    const before = structuredClone(authored);
    const details = projectLowerDvinaTraceVisibleNpcDetails({
      visibleContext: { visible_npc: [{ entity_ref: { entity_kind: 'npc', entity_id: 'ratsha' },
        display_label: 'Путник' }] },
      committedNpcs: [{ npc_id: 'ratsha', identity_state: authored }], committedItems: []
    });
    assert.equal(details.length, 1);
    assert.deepEqual(details[0].identity_state, { display_name: 'Путник',
      sex_category: 'male', age_category: 'middle_aged', appearance: physicalBaldAppearance(before) });
    assert.deepEqual(authored, before);
  });
}

for (const authoredFields of [['color', 'style'], ['color'], ['style']]) {
  function partialIdentity() {
    const authored = identity();
    delete authored.appearance.hair.length;
    for (const field of ['color', 'style']) {
      if (!authoredFields.includes(field)) delete authored.appearance.hair[field];
    }
    return authored;
  }

  test(`CA536-F2: original v4 ${authoredFields.join('/')} without length excludes bald before seed4 draw`, () => {
    const authored = partialIdentity();
    const before = structuredClone(authored);
    const entriesBefore = structuredClone(APPROVED_ENTRIES);
    const random = createRandomSource({ seed: 4 });
    const input = { identity: authored, approved_entries: APPROVED_ENTRIES,
      random, choice_key_prefix: 'ca1:v4-partial' };
    const result = materializeActorBaseAppearance(input);
    const hair = result.identity.appearance.hair;
    assert.ok(['short', 'medium', 'long'].includes(hair.length));
    for (const field of authoredFields) assert.equal(hair[field], before.appearance.hair[field]);
    assert.equal(hair.facial_hair, 'short_beard');
    const lengthChoice = result.choices.find((choice) => choice.slot_key === 'hair_length');
    assert.equal(lengthChoice.candidate_ids.includes(BALD_ENTRY_ID), false);
    assert.ok(lengthChoice.rejection_summary.inapplicable_count >= 1);
    assert.equal(lengthChoice.rng_draw, createRandomSource({ seed: 4 }).nextUint32());
    assert.equal(random.drawCount, 3 - authoredFields.length);
    assert.deepEqual(materializeActorBaseAppearance({ ...input, random: createRandomSource({ seed: 4 }) }), result);
    assert.deepEqual(authored, before);
    assert.deepEqual(APPROVED_ENTRIES, entriesBefore);
  });

  test(`CA536-F2: v4 only-bald menu with authored ${authoredFields.join('/')} is DATA_GAP before any draw`, () => {
    const authored = partialIdentity();
    // Also leave an earlier field missing: the conflict must precede all RNG.
    delete authored.appearance.build;
    const before = structuredClone(authored);
    const entries = APPROVED_ENTRIES.filter((entry) =>
      entry.facet !== 'hair_length' || entry.option_value === 'bald');
    const entriesBefore = structuredClone(entries);
    const random = createRandomSource({ seed: 4 });
    assert.throws(() => materializeActorBaseAppearance({ identity: authored,
      approved_entries: entries, random, choice_key_prefix: 'ca1:v4-empty' }),
    (error) => error instanceof MaterializationError
      && error.code === 'ACTOR_APPEARANCE_DATA_GAP'
      && error.details.path === 'appearance.hair.length');
    assert.equal(random.drawCount, 0);
    assert.deepEqual(authored, before);
    assert.deepEqual(entries, entriesBefore);
  });
}
