import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completeActorBaseAppearance,
  normalizeActor,
  projectActorIdentity,
  validateActor,
  validateActorBaseAppearance
} from '../src/index.js';

test('actors validates and projects identity without inventing fields', () => {
  const source = { id:'npc_1', kind:'npc', name:'Иван', biography:{ origin:'Новгород' }, skills:{ craft:2 } };
  assert.deepEqual(validateActor(source), { ok:true, errors:[] });
  const actor = normalizeActor(source);
  assert.equal(actor.id, 'npc_1');
  assert.equal(actor.social_bindings.length, 0);
  assert.equal(Object.isFrozen(actor), true);
  assert.equal(projectActorIdentity(actor).biography.origin, 'Новгород');
  assert.equal(validateActor({ kind:'npc' }).ok, false);
});

const completeIdentity = {
  canonical_name: 'Ратша',
  sex_category: 'male',
  age_category: 'young_adult',
  appearance: {
    build: 'stocky',
    skin_tone: 'light',
    face_shape: 'broad',
    hair: { color: 'dark_brown', length: 'short', style: 'straight', facial_hair: 'short_beard' },
    eyes: { color: 'gray' }
  }
};

test('actor base appearance has one strict owner and historical validation stays permissive', () => {
  assert.deepEqual(validateActorBaseAppearance(completeIdentity), { ok: true, errors: [] });
  assert.equal(validateActor({ id: 'ratsha', kind: 'npc', name: 'Ратша', identity: { canonical_name: 'Ратша' } }).ok, true);
  assert.equal(validateActor({ id: 'ratsha', kind: 'npc', name: 'Ратша', identity: { canonical_name: 'Ратша' } }, { requireCompleteAppearance: true }).ok, false);
  assert.equal(validateActor({ id: 'ratsha', kind: 'npc', name: 'Ратша', identity: completeIdentity }, { requireCompleteAppearance: true }).ok, true);

  const duplicated = structuredClone(completeIdentity);
  duplicated.appearance.clothing = 'caftan';
  duplicated.body = { age_category: 'young_adult' };
  const result = validateActorBaseAppearance(duplicated);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /clothing is not allowed/);
  assert.match(result.errors.join('\n'), /body\.age_category duplicates/);

  const duplicateOwners = validateActorBaseAppearance({
    ...completeIdentity,
    sex: 'male',
    portrait_seed: 'forbidden'
  }, { body: { age: 24, clothing: ['caftan'] } });
  assert.equal(duplicateOwners.ok, false);
  assert.match(duplicateOwners.errors.join('\n'), /identity\.sex duplicates/);
  assert.match(duplicateOwners.errors.join('\n'), /identity\.portrait_seed duplicates/);
  assert.match(duplicateOwners.errors.join('\n'), /actor\.body\.age duplicates/);
  assert.match(duplicateOwners.errors.join('\n'), /actor\.body\.clothing duplicates/);

  const summaryOwners = validateActorBaseAppearance(completeIdentity, {
    body: {
      age_range: 'adult', clothing_summary: 'wool caftan', build: 'slim',
      hair_color: 'black'
    }
  });
  assert.equal(summaryOwners.ok, false);
  assert.match(summaryOwners.errors.join('\n'), /actor\.body\.age_range duplicates/);
  assert.match(summaryOwners.errors.join('\n'), /actor\.body\.clothing_summary duplicates/);
  assert.match(summaryOwners.errors.join('\n'), /actor\.body\.build duplicates/);
  assert.match(summaryOwners.errors.join('\n'), /actor\.body\.hair_color duplicates/);
});

test('actor appearance completion preserves authored values and fills only missing fields', () => {
  const partial = structuredClone(completeIdentity);
  delete partial.appearance.hair.style;
  partial.appearance.eyes.color = 'green';
  const completed = completeActorBaseAppearance(partial, completeIdentity);
  assert.equal(completed.appearance.hair.style, 'straight');
  assert.equal(completed.appearance.eyes.color, 'green');
  assert.throws(() => completeActorBaseAppearance(partial, { ...completeIdentity, appearance: {} }), /hair\.style is required/);
});
