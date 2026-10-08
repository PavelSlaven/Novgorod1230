import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import {
  ACTOR_BASE_APPEARANCE_VOCABULARY,
  completeActorBaseAppearance,
  normalizeActor,
  projectActorIdentity,
  validateActor,
  validateActorBaseAppearance
} from '@rus/actors';
import {
  compileApprovedActorAppearanceEntries,
  createRandomSource,
  MaterializationError,
  materializeActorBaseAppearance
} from '@rus/materialization';
import {
  assertPortraitSpecV1,
  PORTRAIT_SPEC_V1_JSON_SCHEMA,
  validatePortraitSpecV1
} from '@rus/contracts/portrait-spec-v1';
import { projectActorPortraitSpecV1 } from '@rus/visibility-knowledge-memory';
import { buildPortraitScene, renderPortrait } from '../../apps/game-web/src/portrait-lab/renderer.js';
import { SAMPLE_PORTRAIT_SPEC } from '../../apps/game-web/src/portrait-lab/sample.js';
import { validateJsonSchemaRecords } from '../../tools/world-catalog-workflow/src/materialization-readiness.js';

// D102 acceptance, D152 / issue #536. Expected red before implementation.
// Base: 2247b43be7229f874e4d4c4e78030e9e00453fb1. The pinned v4 rows below
// supply source-shaped test inputs. The explicit D152 overlay is a normative
// fixture, not an approval or a claim about live catalog membership.
const BASE_DIRECTORY = 'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v4/datasets/';
const CANDIDATE_DIRECTORY = 'data/world-catalogs/novgorod/character-appearance-v2/candidate/';
const SOURCE_SHA256 = Object.freeze({
  region_appearance_profile_entries: '61230c341f418e386f9213b93cf1f7d43c0bf3751a7aab62300cfadec7fa66b5',
  region_appearance_profiles: 'b1d2f8a5129de7f2a7e71cc3f3d4dc33e702eaf301398b6b8df059e302ac5cd1',
  region_category_options: '777eab954536900c981bc84f5f496a0e7a5ffcd6ad5a34abc9c166433753862d',
  region_demographic_profile_entries: 'a5c5a1e24d24222eda9a77bdc0659533b2cd7aea82db9a36fa34b2e82170e5af',
  region_demographic_profiles: '9a7fffa8f4e00db21363b2b67c227ca81b460f5803322e32da0a0709bf21c0cd',
  universal_categories: 'a48cc78b57789967622776863999fa475703766a11edfcd39d3fdf52fff81006'
});
const ROOT = new URL('../../', import.meta.url);
const PROFILE_REF = 'novgorod_1200_1250_appearance_profile_v1';
const LENGTHS = Object.freeze(['short', 'medium', 'long']);
const SEXES = Object.freeze(['male', 'female']);
const AGES = Object.freeze(['young_adult', 'adult', 'middle_aged', 'old']);
const SEED_COUNT = 10000;
const NORMAL_HAIR = Object.freeze({ color: 'dark_brown', length: 'short', style: 'straight', facial_hair: 'short_beard' });
const BALD_HAIR = Object.freeze({ length: 'bald', facial_hair: 'short_beard' });
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function readPinnedRecords() {
  return Object.fromEntries(Object.entries(SOURCE_SHA256).map(([table, hash]) => {
    const bytes = readFileSync(new URL(`${BASE_DIRECTORY}${table}.json`, ROOT));
    assert.equal(sha256(bytes), hash, `${table}: immutable source pin`);
    return [table, JSON.parse(bytes)];
  }));
}

const BASE_RECORDS = readPinnedRecords();
const D152_RECORDS = structuredClone(BASE_RECORDS);
for (const row of D152_RECORDS.region_appearance_profile_entries) {
  if (row.facet === 'hair_length') {
    const value = row.option_id.slice('nov_1200_1250_hair_length_'.length);
    assert.ok(value === 'bald' || LENGTHS.includes(value), 'fixture hair length belongs to the pinned vocabulary');
    row.weight = value === 'bald' ? 9 : 17;
    row.applicability = value === 'bald'
      ? { sex_category: ['male'], age_category: ['middle_aged', 'old'] }
      : {};
  }
  if (row.facet === 'hair_color' || row.option_id === 'nov_1200_1250_hair_style_straight') {
    row.applicability = { 'appearance.hair.length': [...LENGTHS] };
  }
}
const APPROVED_ENTRIES = compileApprovedActorAppearanceEntries({
  records: D152_RECORDS,
  demographic_profile_ref: D152_RECORDS.region_demographic_profiles[0].id,
  appearance_profile_ref: PROFILE_REF
});

function identity(hair = NORMAL_HAIR) {
  return {
    canonical_name: 'Ратша', sex_category: 'male', age_category: 'middle_aged',
    appearance: {
      build: 'stocky', skin_tone: 'light', face_shape: 'broad',
      hair: structuredClone(hair), eyes: { color: 'gray' }
    }
  };
}

function generate(authored, seed, entries = APPROVED_ENTRIES) {
  return materializeActorBaseAppearance({
    identity: authored, approved_entries: entries,
    random: createRandomSource({ seed }), choice_key_prefix: 'npc:d152:acceptance'
  });
}

function assertNoHeadHairMetadata(hair) {
  assert.equal(Object.hasOwn(hair, 'color'), false, 'bald must not have its own color property');
  assert.equal(Object.hasOwn(hair, 'style'), false, 'bald must not have its own style property');
}

for (const sex of SEXES) for (const age of AGES) {
  test(`D102/D152: ${sex}/${age}, seeds 0..9999, fixed frequency and physical fields`, () => {
    const counts = { sex, age, attempted: SEED_COUNT, generated: 0, generation_errors: 0,
      bald: 0, non_bald: 0, inconsistent_bald: 0, incomplete_non_bald: 0 };
    let firstError = null;
    const before = structuredClone(APPROVED_ENTRIES);
    for (let seed = 0; seed < SEED_COUNT; seed += 1) {
      let result;
      try {
        result = generate({ sex_category: sex, age_category: age }, seed);
      } catch (error) {
        counts.generation_errors += 1;
        firstError ??= { seed, code: error.code ?? error.name, path: error.details?.path ?? null };
        continue;
      }
      counts.generated += 1;
      const hair = result.identity.appearance.hair;
      if (hair.length === 'bald') {
        counts.bald += 1;
        if (Object.hasOwn(hair, 'color') || Object.hasOwn(hair, 'style')) counts.inconsistent_bald += 1;
      } else {
        counts.non_bald += 1;
        if (!Object.hasOwn(hair, 'color') || !Object.hasOwn(hair, 'style')
          || !ACTOR_BASE_APPEARANCE_VOCABULARY.hair_color.includes(hair.color)
          || !ACTOR_BASE_APPEARANCE_VOCABULARY.hair_style.includes(hair.style)) counts.incomplete_non_bald += 1;
      }
      assert.equal(result.identity.sex_category, sex);
      assert.equal(result.identity.age_category, age);
      if (seed < 3 || seed === SEED_COUNT - 1) {
        assert.deepEqual(result, generate({ sex_category: sex, age_category: age }, seed), 'same inputs must replay identity and choices');
      }
    }
    console.log(`D102_COUNTS ${JSON.stringify({ ...counts, first_error: firstError })}`);
    assert.equal(counts.generation_errors, 0, `${sex}/${age}: generation must succeed; ${JSON.stringify(firstError)}`);
    assert.equal(counts.generated, SEED_COUNT);
    assert.equal(counts.inconsistent_bald, 0);
    assert.equal(counts.incomplete_non_bald, 0);
    assert.ok(counts.non_bald > 0, 'positive non-bald control must occur');
    if (sex === 'male' && ['middle_aged', 'old'].includes(age)) {
      assert.ok(counts.bald >= 1350 && counts.bald <= 1650,
        `${sex}/${age}: ${counts.bald}/10000 must be inside the predeclared 13.5..16.5% interval`);
    } else {
      assert.equal(counts.bald, 0, `${sex}/${age}: bald is inapplicable`);
    }
    assert.deepEqual(APPROVED_ENTRIES, before, 'materializer must not mutate its source menu');
  });
}

test('D102: actor owner accepts complete bald without color/style and keeps non-bald requirements', () => {
  const bald = identity(BALD_HAIR);
  assert.deepEqual(validateActorBaseAppearance(bald), { ok: true, errors: [] });
  assert.deepEqual(completeActorBaseAppearance(bald), bald);
  assertNoHeadHairMetadata(bald.appearance.hair);
  assert.equal(validateActor({ id: 'ratsha', kind: 'npc', name: 'Ратша', identity: bald },
    { requireCompleteAppearance: true }).ok, true);
  for (const field of ['color', 'style']) {
    const ordinary = identity();
    delete ordinary.appearance.hair[field];
    const result = validateActorBaseAppearance(ordinary);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((message) => message.includes(`hair.${field} is required`)));
  }
});

test('D102: contradictory authored bald metadata is rejected before any draw', () => {
  for (const extra of [{ color: 'gray' }, { style: 'straight' }]) {
    const random = createRandomSource({ seed: 17 });
    assert.throws(() => materializeActorBaseAppearance({
      identity: identity({ ...BALD_HAIR, ...extra }), approved_entries: APPROVED_ENTRIES,
      random, choice_key_prefix: 'npc:d152:contradictory'
    }), (error) => error instanceof MaterializationError && error.code === 'ACTOR_APPEARANCE_AUTHORED_INVALID');
    assert.equal(random.drawCount, 0);
  }
});

test('D102: fully authored ordinary and bald identities survive completion without RNG', () => {
  for (const hair of [NORMAL_HAIR, BALD_HAIR]) {
    const authored = identity(hair);
    const before = structuredClone(authored);
    const result = materializeActorBaseAppearance({ identity: authored,
      approved_entries: APPROVED_ENTRIES, choice_key_prefix: 'npc:d152:authored' });
    assert.deepEqual(result.identity, before);
    assert.deepEqual(authored, before);
    assert.equal(result.identity.appearance.hair.facial_hair, 'short_beard');
    assert.ok(result.choices.every((choice) => choice.selection_mode === 'authored'
      && choice.rng_draw === 0 && choice.rng_counter === 0));
    if (hair.length === 'bald') {
      assertNoHeadHairMetadata(result.identity.appearance.hair);
      assert.equal(result.choices.some((choice) => ['hair_color', 'hair_style'].includes(choice.slot_key)), false);
    }
  }
});

test('D102: a bald length draw happens first and consumes no color/style draws or choices', () => {
  const authored = identity(BALD_HAIR);
  delete authored.appearance.hair.length;
  const entries = APPROVED_ENTRIES.filter((entry) => entry.facet !== 'hair_length' || entry.option_value === 'bald');
  const random = createRandomSource({ seed: 19 });
  const expectedFirstDraw = createRandomSource({ seed: 19 }).nextUint32();
  const result = materializeActorBaseAppearance({ identity: authored, approved_entries: entries,
    random, choice_key_prefix: 'npc:d152:one-length-draw' });
  assert.equal(result.identity.appearance.hair.length, 'bald');
  assertNoHeadHairMetadata(result.identity.appearance.hair);
  assert.equal(result.identity.appearance.hair.facial_hair, 'short_beard');
  const weighted = result.choices.filter((choice) => choice.selection_mode === 'weighted_draw');
  assert.equal(weighted.length, 1);
  assert.equal(weighted[0].slot_key, 'hair_length');
  assert.equal(weighted[0].rng_draw, expectedFirstDraw);
  assert.equal(weighted[0].rng_counter, 1);
  assert.equal(random.drawCount, 1);
  assert.equal(result.choices.some((choice) => ['hair_color', 'hair_style'].includes(choice.slot_key)), false);
});

test('D102: skipping bald facets does not conceal a genuinely missing required eye facet', () => {
  const authored = identity(BALD_HAIR);
  delete authored.appearance.eyes.color;
  assert.throws(() => generate(authored, 5, APPROVED_ENTRIES.filter((entry) => entry.facet !== 'eye_color')),
    (error) => error instanceof MaterializationError && error.code === 'ACTOR_APPEARANCE_DATA_GAP'
      && error.details.path === 'appearance.eyes.color');
});

const SHIRT = Object.freeze({
  item_id: 'shirt', physical_position: 'equipped', equipment_slot_category_id: 'base_garment',
  visual_profile_snapshot: {
    schema: 'item_visual_profile_snapshot_v1', version: 1, equipment_slot: 'base_garment',
    neckline: 'slit_round', sleeve_form: 'narrow', outer_form: 'none', visible_fabric: 'light_linen',
    trim: 'none', main_visible_color: 'undyed_linen', secondary_visible_color: null, headwear_kind: 'none'
  }
});

test('D102: portrait schema and validator admit bald omission and retain ordinary requirements', () => {
  const spec = structuredClone(SAMPLE_PORTRAIT_SPEC);
  spec.hair = { length: 'bald', facial_hair: 'full_beard' };
  const schemaErrors = (value) => validateJsonSchemaRecords('portrait_spec_v1', [value],
    { type: 'array', items: PORTRAIT_SPEC_V1_JSON_SCHEMA });
  // The existing independent schema checker supports object/required/enum/const
  // and oneOf/not. Exercise the exported grammar as well as its runtime reader.
  assert.deepEqual(schemaErrors(spec), []);
  assert.deepEqual(validatePortraitSpecV1(spec), []);
  assert.equal(assertPortraitSpecV1(spec), spec);
  assert.deepEqual(schemaErrors(SAMPLE_PORTRAIT_SPEC), []);
  assert.deepEqual(validatePortraitSpecV1(SAMPLE_PORTRAIT_SPEC), []);
  for (const field of ['color', 'style']) {
    const ordinary = structuredClone(SAMPLE_PORTRAIT_SPEC);
    delete ordinary.hair[field];
    assert.ok(schemaErrors(ordinary).length > 0, `published schema must require hair.${field} for non-bald`);
    assert.ok(validatePortraitSpecV1(ordinary).length > 0, `runtime validator must require hair.${field} for non-bald`);
  }
  const invalid = structuredClone(spec);
  invalid.hair.facial_hair = 'invented';
  assert.ok(schemaErrors(invalid).length > 0, 'published schema must retain the closed vocabulary');
  assert.ok(validatePortraitSpecV1(invalid).length > 0, 'bald must retain the closed vocabulary validator');
});

test('D102: bald and ordinary portraits project and render while preserving beard and source identity', () => {
  for (const hair of [NORMAL_HAIR, BALD_HAIR]) {
    const authored = identity(hair);
    const before = structuredClone(authored);
    const spec = projectActorPortraitSpecV1({ identity: authored, visible_equipment: [SHIRT] });
    assert.ok(spec, 'complete physical identity must produce a portrait');
    assert.deepEqual(validatePortraitSpecV1(spec), []);
    assert.equal(spec.hair.facial_hair, hair.facial_hair);
    if (hair.length === 'bald') assertNoHeadHairMetadata(spec.hair);
    else {
      assert.equal(spec.hair.color, hair.color);
      assert.equal(spec.hair.style, hair.style);
    }
    const canvas = recordingCanvas();
    const model = renderPortrait(canvas, spec);
    const scene = buildPortraitScene(model);
    assert.equal(scene.geometry.beard.present, true);
    assert.equal(scene.geometry.hair.present, hair.length !== 'bald');
    assert.ok(canvas.operations.length > 0);
    assert.ok(canvas.operations.every((operation) => operation.every((value) => typeof value !== 'number' || Number.isFinite(value))));
    assert.deepEqual(authored, before);
    assert.deepEqual(model.spec, spec, 'renderer must not insert a pigment or hairstyle into the spec');
  }
});

test('D102: legacy bald metadata remains readable without rewriting its canonical identity', () => {
  const legacy = identity({ ...NORMAL_HAIR, length: 'bald' });
  const before = structuredClone(legacy);
  const actor = { id: 'legacy', kind: 'npc', name: 'Ратша', identity: legacy };
  assert.equal(validateActor(actor).ok, true);
  assert.deepEqual(normalizeActor(actor).identity, before);
  assert.deepEqual(projectActorIdentity(actor).identity, before);
  const spec = projectActorPortraitSpecV1({ identity: legacy, visible_equipment: [SHIRT] });
  assert.ok(spec, 'legacy complete appearance remains usable through a physical projection');
  assertNoHeadHairMetadata(spec.hair);
  assert.equal(spec.hair.facial_hair, legacy.appearance.hair.facial_hair);
  renderPortrait(recordingCanvas(), spec);
  const legacySpec = structuredClone(SAMPLE_PORTRAIT_SPEC);
  legacySpec.hair.length = 'bald';
  legacySpec.hair.style = 'straight';
  assert.deepEqual(validatePortraitSpecV1(legacySpec), []);
  renderPortrait(recordingCanvas(), legacySpec);
  assert.deepEqual(legacy, before);

  const partial = { ...actor, identity: { canonical_name: 'Ратша' } };
  assert.equal(validateActor(partial).ok, true);
  assert.deepEqual(normalizeActor(partial).identity, partial.identity);
  assert.equal(projectActorPortraitSpecV1({ identity: partial.identity, visible_equipment: [SHIRT] }), null);
});

test('D102: the v2 candidate matches the fixed fixture and explicitly forbids import and activation', () => {
  const manifestPath = new URL(`${CANDIDATE_DIRECTORY}manifest.json`, ROOT);
  assert.equal(existsSync(manifestPath), true, 'issue #536: v2 candidate has not been authored yet');
  const manifest = JSON.parse(readFileSync(manifestPath));
  assert.equal(manifest.import_authorized, false);
  assert.equal(manifest.production_activation, false);
  assert.equal(manifest.runtime_selectable_in_canonical_production, false);
  for (const table of ['region_appearance_profiles', 'region_appearance_profile_entries']) {
    const file = `datasets/${table}.json`;
    const bytes = readFileSync(new URL(`${CANDIDATE_DIRECTORY}${file}`, ROOT));
    assert.deepEqual(JSON.parse(bytes), D152_RECORDS[table], `${table}: D152 rows must match the immutable normative input`);
    const entry = manifest.datasets.find((dataset) => dataset.table === table);
    assert.ok(entry, `${table}: manifest must identify the dataset`);
    assert.equal(entry.file, file);
    assert.equal(entry.sha256, sha256(bytes));
  }
});

function recordingCanvas() {
  const operations = [];
  const target = {};
  for (const method of ['save', 'restore', 'translate', 'rotate', 'clearRect', 'scale', 'fillRect',
    'beginPath', 'arc', 'stroke', 'moveTo', 'bezierCurveTo', 'quadraticCurveTo', 'closePath', 'fill', 'clip', 'ellipse', 'lineTo']) {
    target[method] = (...args) => operations.push([method, ...args]);
  }
  for (const method of ['createLinearGradient', 'createRadialGradient']) {
    target[method] = (...args) => {
      operations.push([method, ...args]);
      return { addColorStop: (...values) => operations.push(['addColorStop', ...values]) };
    };
  }
  const context = new Proxy(target, {
    set(object, property, value) {
      operations.push(['set', String(property), typeof value === 'object' ? 'object' : value]);
      object[property] = value;
      return true;
    }
  });
  return { width: 768, height: 768, operations, getContext: (kind) => kind === '2d' ? context : null };
}
