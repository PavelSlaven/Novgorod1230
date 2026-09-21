import { canonicalDigest, MaterializationError } from './core.js';

export const ACTOR_BASE_ATTRIBUTE_KEYS = Object.freeze([
  'strength', 'dexterity', 'endurance', 'reason', 'attention', 'influence'
]);
const ORDINARY_ARRAY = Object.freeze([13, 12, 11, 10, 9, 8]);

/** Code-owned completion of a pinned, data-owned NPC attribute profile. */
export function materializeActorBaseAttributes({ profile, occupation_archetype_id,
  random, choice_key_prefix: choiceKeyPrefix, seed_basis } = {}) {
  if (!text(occupation_archetype_id) || !text(choiceKeyPrefix)
      || !random || typeof random.nextUint32 !== 'function') gap('INPUT');
  const normalized = validateProfile(profile);
  const mapping = normalized.occupation_archetype_priorities.find((entry) =>
    entry.occupation_archetype_id === occupation_archetype_id)
    ?? normalized.occupation_archetype_priorities.find((entry) =>
      entry.occupation_archetype_id === '*');
  if (mapping == null) gap('ARCHETYPE_MAPPING');
  const draw = random.nextUint32();
  const priorities = rotate(mapping.priority, draw % ACTOR_BASE_ATTRIBUTE_KEYS.length);
  const values = Object.fromEntries(priorities.map((attribute, index) =>
    [attribute, normalized.ordinary_array[index]]));
  validateValues(values, normalized);
  const profile_digest = canonicalDigest(normalized);
  return Object.freeze({ contract_version: 'actor_base_attributes_v1', values,
    profile_ref: { id: normalized.profile_id, version: normalized.version,
      digest: profile_digest }, generation: {
      algorithm_version: normalized.algorithm_version,
      rng_version: normalized.rng_version,
      seed_basis: structuredClone(seed_basis ?? {}), rng_draw: draw,
      occupation_archetype_id, priority_mapping_id: mapping.mapping_id
    }, trace: { choice_key: `${choiceKeyPrefix}:actor_base_attributes_v1`,
      attribute_values: structuredClone(values), profile_ref: {
        id: normalized.profile_id, version: normalized.version,
        digest: profile_digest }, algorithm_version: normalized.algorithm_version,
      rng_version: normalized.rng_version, seed_basis: structuredClone(seed_basis ?? {}),
      rng_draw: draw, occupation_archetype_id,
      priority_mapping_id: mapping.mapping_id } });
}

export function validateActorBaseAttributes(value) {
  if (value?.contract_version !== 'actor_base_attributes_v1'
      || !plain(value.values) || !plain(value.profile_ref)
      || !plain(value.generation)) return false;
  return ACTOR_BASE_ATTRIBUTE_KEYS.every((key) => Number.isInteger(value.values[key])
    && value.values[key] >= 3 && value.values[key] <= 18)
    && Object.keys(value.values).length === ACTOR_BASE_ATTRIBUTE_KEYS.length
    && text(value.profile_ref.id) && Number.isInteger(value.profile_ref.version)
    && /^[a-f0-9]{64}$/u.test(String(value.profile_ref.digest ?? ''))
    && text(value.generation.algorithm_version) && text(value.generation.rng_version)
    && plain(value.generation.seed_basis);
}

function validateProfile(profile) {
  if (!plain(profile) || profile.schema !== 'rus.actor_base_attributes_profile.v1'
      || profile.version !== 1 || !text(profile.profile_id)
      || profile.algorithm_version !== 'actor_base_attributes_v1'
      || !text(profile.rng_version)
      || JSON.stringify(profile.ordinary_array) !== JSON.stringify(ORDINARY_ARRAY)
      || !Array.isArray(profile.occupation_archetype_priorities)) gap('PROFILE');
  const mappings = profile.occupation_archetype_priorities.map((entry) => {
    if (!text(entry?.mapping_id) || !text(entry.occupation_archetype_id)
        || !Array.isArray(entry.priority)
        || entry.priority.length !== ACTOR_BASE_ATTRIBUTE_KEYS.length
        || new Set(entry.priority).size !== ACTOR_BASE_ATTRIBUTE_KEYS.length
        || !entry.priority.every((key) => ACTOR_BASE_ATTRIBUTE_KEYS.includes(key))) {
      gap('PROFILE');
    }
    return { mapping_id: entry.mapping_id,
      occupation_archetype_id: entry.occupation_archetype_id,
      priority: [...entry.priority] };
  });
  if (new Set(mappings.map(({ occupation_archetype_id }) => occupation_archetype_id)).size
      !== mappings.length) gap('PROFILE');
  return { profile_id: profile.profile_id, version: profile.version,
    algorithm_version: profile.algorithm_version, rng_version: profile.rng_version,
    ordinary_array: [...profile.ordinary_array],
    occupation_archetype_priorities: mappings };
}

function validateValues(values, profile) {
  const ordered = ACTOR_BASE_ATTRIBUTE_KEYS.map((key) => values[key]).sort((a, b) => b - a);
  if (JSON.stringify(ordered) !== JSON.stringify(profile.ordinary_array)
      || ordered.some((value) => value > 15)) gap('ORDINARY_BALANCE');
}

function rotate(values, shift) { return values.map((_, index) =>
  values[(index + shift) % values.length]); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function plain(value) { return value != null && typeof value === 'object' && !Array.isArray(value); }
function gap(kind) { throw new MaterializationError(`ACTOR_BASE_ATTRIBUTES_${kind}_DATA_GAP`,
  `Actor base attributes require exact ${kind.toLowerCase()} data.`); }
