import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandomSource, materializeActorBaseAppearance, MaterializationError } from '../src/index.js';

const values = {
  sex_category: ['male', 'female'], age_category: ['adult'], build: ['average', 'stocky'], skin_tone: ['light'], face_shape: ['broad'],
  hair_color: ['dark_brown'], hair_length: ['short', 'long'], hair_style: ['straight', 'braided'], facial_hair: ['none', 'short_beard'], eye_color: ['gray']
};

function entries() {
  return Object.entries(values).flatMap(([facet, options]) => options.map((option, index) => ({
    entry_id: `${facet}_${String(index).padStart(2, '0')}`,
    facet,
    option_value: option,
    weight: 1,
    status: 'approved',
    applicability: facet === 'facial_hair' && option === 'short_beard'
      ? { sex_category: ['male'], age_category: ['adult'] }
      : facet === 'hair_style' && option === 'braided'
        ? { 'appearance.hair.length': ['long'] }
        : {}
  })));
}

test('appearance materialization preserves authored values and draws missing fields deterministically', () => {
  const input = {
    identity: { canonical_name: 'Ратша', sex_category: 'male', age_category: 'adult' },
    approved_entries: entries(),
    choice_key_prefix: 'npc:ratsha',
    rule_id: 'profile-ratsha'
  };
  const left = materializeActorBaseAppearance({ ...input, random: createRandomSource({ seed: 17 }) });
  const right = materializeActorBaseAppearance({ ...input, random: createRandomSource({ seed: 17 }) });
  assert.deepEqual(left, right);
  assert.equal(left.identity.sex_category, 'male');
  assert.equal(left.choices[0].selection_mode, 'authored');
  assert.equal(left.choices[0].rng_draw, 0);
  assert.equal(left.choices[2].selection_mode, 'weighted_draw');
  assert.equal(left.choices.filter((choice) => choice.selection_mode === 'weighted_draw').length, 8);
  assert.equal(left.choices.at(-1).rng_counter, 8);
});

test('complete authored appearance is validated and traced without an RNG', () => {
  const identity = {
    sex_category: 'male',
    age_category: 'adult',
    appearance: {
      build: 'average',
      skin_tone: 'light',
      face_shape: 'broad',
      hair: {
        color: 'dark_brown',
        length: 'short',
        style: 'straight',
        facial_hair: 'none'
      },
      eyes: { color: 'gray' }
    }
  };
  const result = materializeActorBaseAppearance({
    identity,
    approved_entries: entries(),
    choice_key_prefix: 'npc:authored'
  });

  assert.deepEqual(result.identity, identity);
  assert.ok(result.choices.every((choice) =>
    choice.selection_mode === 'authored'
      && choice.rng_draw === 0
      && choice.rng_counter === 0));
});

test('appearance materialization filters unapproved and inapplicable entries before a stable weighted draw', () => {
  const approvedEntries = entries();
  approvedEntries.push({ entry_id: 'build_zz', facet: 'build', option_value: 'slim', weight: 1000, status: 'draft', applicability: {} });
  approvedEntries.push({ entry_id: 'facial_hair_zz', facet: 'facial_hair', option_value: 'full_beard', weight: 1000, status: 'approved', applicability: { sex_category: ['female'] } });
  const result = materializeActorBaseAppearance({ identity: { sex_category: 'male' }, approved_entries: approvedEntries, random: createRandomSource({ seed: 9 }), choice_key_prefix: 'npc:test' });
  assert.notEqual(result.identity.appearance.build, 'slim');
  assert.notEqual(result.identity.appearance.hair.facial_hair, 'full_beard');
  assert.ok(result.choices.every((choice, index) => choice.choice_ordinal === index));
});

test('appearance materialization rejects an empty mandatory candidate set and never uses Math.random', () => {
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('Math.random must not be called'); };
  try {
    assert.throws(
      () => materializeActorBaseAppearance({ identity: { sex_category: 'male' }, approved_entries: entries().filter((entry) => entry.facet !== 'eye_color'), random: createRandomSource({ seed: 1 }), choice_key_prefix: 'npc:gap' }),
      (error) => error instanceof MaterializationError && error.code === 'ACTOR_APPEARANCE_DATA_GAP'
    );
  } finally {
    Math.random = originalRandom;
  }
});

test('authored dependent values constrain prerequisite draws before RNG selection', () => {
  const braided = materializeActorBaseAppearance({
    identity: {
      sex_category: 'female', age_category: 'adult',
      appearance: { hair: { style: 'braided', facial_hair: 'none' } }
    },
    approved_entries: entries(),
    random: createRandomSource({ seed: 3 }),
    choice_key_prefix: 'npc:braided'
  });
  assert.equal(braided.identity.appearance.hair.length, 'long');
  assert.equal(braided.identity.appearance.hair.style, 'braided');

  const bearded = materializeActorBaseAppearance({
    identity: {
      age_category: 'adult',
      appearance: { hair: { facial_hair: 'short_beard' } }
    },
    approved_entries: entries(),
    random: createRandomSource({ seed: 5 }),
    choice_key_prefix: 'npc:bearded'
  });
  assert.equal(bearded.identity.sex_category, 'male');
  assert.equal(bearded.identity.appearance.hair.facial_hair, 'short_beard');
});

test('contradictory authored prerequisites fail before any RNG draw', () => {
  const random = createRandomSource({ seed: 7 });
  assert.throws(() => materializeActorBaseAppearance({
    identity: {
      sex_category: 'female', age_category: 'adult',
      appearance: {
        hair: { length: 'short', style: 'braided', facial_hair: 'none' }
      }
    },
    approved_entries: entries(),
    random,
    choice_key_prefix: 'npc:conflict'
  }), (error) => error instanceof MaterializationError
    && error.code === 'ACTOR_APPEARANCE_VALUE_NOT_APPROVED');
  assert.equal(random.drawCount, 0);
});
