import { deepFreeze } from '@rus/kernel';

export const ACTOR_KINDS = deepFreeze(['player', 'npc']);

export const ACTOR_BASE_APPEARANCE_VOCABULARY = deepFreeze({
  sex_category: ['male', 'female'],
  age_category: ['young_adult', 'adult', 'middle_aged', 'old'],
  build: ['slim', 'average', 'stocky'],
  skin_tone: ['pale', 'light', 'warm', 'brown'],
  face_shape: ['oval', 'round', 'broad', 'angular', 'long'],
  hair_color: ['blond', 'light_brown', 'dark_brown', 'black', 'auburn', 'gray', 'white'],
  hair_length: ['bald', 'short', 'medium', 'long'],
  hair_style: ['straight', 'wavy', 'loose', 'braided'],
  facial_hair: ['none', 'moustache', 'short_beard', 'full_beard'],
  eye_color: ['blue', 'gray', 'green', 'brown', 'dark']
});

export const ACTOR_BASE_APPEARANCE_PATHS = deepFreeze([
  'sex_category',
  'age_category',
  'appearance.build',
  'appearance.skin_tone',
  'appearance.face_shape',
  'appearance.hair.color',
  'appearance.hair.length',
  'appearance.hair.style',
  'appearance.hair.facial_hair',
  'appearance.eyes.color'
]);

const PROFILE_LEVELS = new Set(['background', 'scene', 'key']);

export function validateActor(actor = {}, options = {}) {
  const errors = [];
  if (!actor || typeof actor !== 'object' || Array.isArray(actor)) return { ok: false, errors: ['actor must be an object'] };
  if (!text(actor.id)) errors.push('actor.id is required');
  if (!ACTOR_KINDS.includes(text(actor.kind))) errors.push('actor.kind must be player or npc');
  if (!text(actor.name ?? actor.identity?.name)) errors.push('actor name is required');
  if (actor.profile_level != null && !PROFILE_LEVELS.has(text(actor.profile_level))) errors.push('actor.profile_level is invalid');
  if (actor.skills != null && !isPlainObject(actor.skills)) errors.push('actor.skills must be an object');
  if (actor.social_bindings != null && !Array.isArray(actor.social_bindings)) errors.push('actor.social_bindings must be an array');
  if (actor.biography != null && !isPlainObject(actor.biography)) errors.push('actor.biography must be an object');
  if (options.requireCompleteAppearance === true) {
    errors.push(...validateActorBaseAppearance(actor.identity, {
      requireComplete: true,
      body: actor.body
    }).errors);
  }
  return { ok: errors.length === 0, errors };
}

export function validateActorBaseAppearance(identity = {}, { requireComplete = true, body = null } = {}) {
  const errors = [];
  if (!isPlainObject(identity)) return { ok: false, errors: ['actor.identity must be an object'] };

  rejectDuplicateOwnerKeys(identity, 'actor.identity', errors, { allowCanonicalIdentityKeys: true });

  const appearance = identity.appearance;
  if (appearance != null && !isPlainObject(appearance)) errors.push('actor.identity.appearance must be an object');
  if (isPlainObject(appearance)) {
    rejectUnknownKeys(appearance, new Set(['build', 'skin_tone', 'face_shape', 'hair', 'eyes']), 'actor.identity.appearance', errors);
    rejectPortraitAndClothingKeys(appearance, 'actor.identity.appearance', errors);
    if (appearance.hair != null && !isPlainObject(appearance.hair)) errors.push('actor.identity.appearance.hair must be an object');
    if (isPlainObject(appearance.hair)) {
      rejectUnknownKeys(appearance.hair, new Set(['color', 'length', 'style', 'facial_hair']), 'actor.identity.appearance.hair', errors);
      rejectPortraitAndClothingKeys(appearance.hair, 'actor.identity.appearance.hair', errors);
    }
    if (appearance.eyes != null && !isPlainObject(appearance.eyes)) errors.push('actor.identity.appearance.eyes must be an object');
    if (isPlainObject(appearance.eyes)) {
      rejectUnknownKeys(appearance.eyes, new Set(['color']), 'actor.identity.appearance.eyes', errors);
      rejectPortraitAndClothingKeys(appearance.eyes, 'actor.identity.appearance.eyes', errors);
    }
  }

  validateVocabularyValue(identity.sex_category, ACTOR_BASE_APPEARANCE_VOCABULARY.sex_category, 'actor.identity.sex_category', requireComplete, errors);
  validateVocabularyValue(identity.age_category, ACTOR_BASE_APPEARANCE_VOCABULARY.age_category, 'actor.identity.age_category', requireComplete, errors);
  validateVocabularyValue(appearance?.build, ACTOR_BASE_APPEARANCE_VOCABULARY.build, 'actor.identity.appearance.build', requireComplete, errors);
  validateVocabularyValue(appearance?.skin_tone, ACTOR_BASE_APPEARANCE_VOCABULARY.skin_tone, 'actor.identity.appearance.skin_tone', requireComplete, errors);
  validateVocabularyValue(appearance?.face_shape, ACTOR_BASE_APPEARANCE_VOCABULARY.face_shape, 'actor.identity.appearance.face_shape', requireComplete, errors);
  validateVocabularyValue(appearance?.hair?.color, ACTOR_BASE_APPEARANCE_VOCABULARY.hair_color, 'actor.identity.appearance.hair.color', requireComplete, errors);
  validateVocabularyValue(appearance?.hair?.length, ACTOR_BASE_APPEARANCE_VOCABULARY.hair_length, 'actor.identity.appearance.hair.length', requireComplete, errors);
  validateVocabularyValue(appearance?.hair?.style, ACTOR_BASE_APPEARANCE_VOCABULARY.hair_style, 'actor.identity.appearance.hair.style', requireComplete, errors);
  validateVocabularyValue(appearance?.hair?.facial_hair, ACTOR_BASE_APPEARANCE_VOCABULARY.facial_hair, 'actor.identity.appearance.hair.facial_hair', requireComplete, errors);
  validateVocabularyValue(appearance?.eyes?.color, ACTOR_BASE_APPEARANCE_VOCABULARY.eye_color, 'actor.identity.appearance.eyes.color', requireComplete, errors);

  if (isPlainObject(identity.body)) rejectDuplicateOwnerKeys(identity.body, 'actor.identity.body', errors);
  if (isPlainObject(body)) rejectDuplicateOwnerKeys(body, 'actor.body', errors);

  return { ok: errors.length === 0, errors };
}

export function completeActorBaseAppearance(identity = {}, completion = {}) {
  if (!isPlainObject(identity)) throw new TypeError('actor.identity must be an object');
  if (!isPlainObject(completion)) throw new TypeError('actor appearance completion must be an object');
  const authoredValidation = validateActorBaseAppearance(identity, { requireComplete: false });
  if (!authoredValidation.ok) throw new TypeError(authoredValidation.errors.join('; '));

  const completed = structuredClone(identity);
  for (const path of ACTOR_BASE_APPEARANCE_PATHS) {
    if (readPath(completed, path) == null && readPath(completion, path) != null) writePath(completed, path, readPath(completion, path));
  }
  const validation = validateActorBaseAppearance(completed, { requireComplete: true });
  if (!validation.ok) throw new TypeError(validation.errors.join('; '));
  return deepFreeze(completed);
}

export function normalizeActor(actor = {}) {
  const normalized = {
    id: text(actor.id) || null,
    kind: text(actor.kind) || null,
    name: text(actor.name ?? actor.identity?.name) || null,
    profile_level: text(actor.profile_level) || null,
    identity: cleanObject(actor.identity),
    biography: cleanObject(actor.biography),
    social_bindings: cleanArray(actor.social_bindings),
    skills: cleanObject(actor.skills),
    state: cleanObject(actor.state),
    metadata: cleanObject(actor.metadata)
  };
  return deepFreeze(normalized);
}

export function projectActorIdentity(actor = {}) {
  return deepFreeze({
    id: text(actor.id) || null,
    kind: text(actor.kind) || null,
    name: text(actor.name ?? actor.identity?.name) || null,
    identity: cleanObject(actor.identity),
    biography: cleanObject(actor.biography),
    social_bindings: cleanArray(actor.social_bindings),
    skills: cleanObject(actor.skills)
  });
}

export function projectActorState(actor = {}) {
  return deepFreeze({
    actor_id: text(actor.id) || null,
    profile_level: text(actor.profile_level) || null,
    state: cleanObject(actor.state)
  });
}

function text(value) { return String(value ?? '').trim(); }
function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function cleanObject(value) { return isPlainObject(value) ? structuredClone(value) : {}; }
function cleanArray(value) { return Array.isArray(value) ? structuredClone(value) : []; }

function validateVocabularyValue(value, vocabulary, path, required, errors) {
  if (value == null || value === '') {
    if (required) errors.push(`${path} is required`);
    return;
  }
  if (!vocabulary.includes(text(value))) errors.push(`${path} is invalid`);
}

function rejectUnknownKeys(value, allowed, path, errors) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${path}.${key} is not allowed`);
}

function rejectPortraitAndClothingKeys(value, path, errors) {
  for (const key of Object.keys(value)) {
    if (['sex', 'age', 'sex_category', 'age_category', 'clothing', 'headwear'].includes(key) || key.startsWith('portrait_')) {
      errors.push(`${path}.${key} is not allowed`);
    }
  }
}

function rejectDuplicateOwnerKeys(value, path, errors, { allowCanonicalIdentityKeys = false } = {}) {
  for (const key of Object.keys(value)) {
    const duplicateKeys = allowCanonicalIdentityKeys
      ? ['sex', 'gender', 'age', 'age_range', 'clothing', 'clothing_summary', 'clothes', 'outfit', 'headwear']
      : [
          'sex', 'gender', 'age', 'age_range', 'sex_category',
          'age_category', 'appearance', 'build', 'body_build',
          'skin_tone', 'complexion', 'face_shape', 'hair', 'hair_color',
          'hair_length', 'hair_style', 'facial_hair', 'eyes', 'eye_color',
          'clothing', 'clothing_summary', 'clothes', 'outfit', 'headwear'
        ];
    if (duplicateKeys.includes(key) || key.startsWith('portrait_')) {
      errors.push(`${path}.${key} duplicates actor identity or item-owned state`);
    }
  }
}

function readPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}

function writePath(value, path, nextValue) {
  const segments = path.split('.');
  let current = value;
  for (const segment of segments.slice(0, -1)) {
    if (!isPlainObject(current[segment])) current[segment] = {};
    current = current[segment];
  }
  current[segments.at(-1)] = nextValue;
}
