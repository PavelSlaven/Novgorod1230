import { canonicalDigest, createRandomSource, deriveSeed, MaterializationError,
  RNG_VERSION } from './core.js';

export const ACTOR_BASE_ATTRIBUTE_KEYS = Object.freeze(['strength', 'dexterity',
  'endurance', 'reason', 'attention', 'influence']);
export const ORDINARY_ACTOR_BASE_ARRAY = Object.freeze([13, 12, 11, 10, 9, 8]);
export const ORDINARY_OCCUPATION_ARCHETYPES = Object.freeze(['agriculture',
  'animal_husbandry', 'craft_production', 'domestic_service', 'fishing_water',
  'forest_hunting', 'illicit_marginal', 'military_security', 'religious_literate',
  'trade_exchange', 'transport_guiding']);

export function materializeActorBaseAttributes({ runtime_profile: runtimeProfile,
  occupation_archetype_id: occupation, actor_slot_ref: actorSlot,
  seed_basis: suppliedSeed } = {}) {
  const profile = profileFromVerifiedRuntimeRecord(runtimeProfile);
  if (!text(occupation) || !text(actorSlot) || !plain(suppliedSeed)
      || !text(suppliedSeed.world_revision_id) || !digest(suppliedSeed.world_catalog_digest)
      || !digest(suppliedSeed.parent_seed_digest)) gap('SEED_BASIS');
  const mapping = profile.occupation_archetype_priorities.find((entry) =>
    entry.occupation_archetype_id === occupation);
  if (mapping == null) gap('ARCHETYPE_MAPPING');
  const profileDigest = canonicalDigest(profile);
  const seed_basis = { world_revision_id: suppliedSeed.world_revision_id,
    world_catalog_digest: suppliedSeed.world_catalog_digest,
    parent_seed_digest: suppliedSeed.parent_seed_digest,
    actor_slot_ref: actorSlot, profile_digest: profileDigest };
  const seed = deriveSeed({ domain: 'actor_base_attributes_v1', ...seed_basis });
  const random = createRandomSource({ seed: seed.uint32, version: RNG_VERSION });
  const values = {}, choices = [];
  let index = 0;
  for (const tier of mapping.priority_tiers) {
    const selected_order = [...tier];
    const rng_draw = selected_order.length > 1 ? random.nextUint32() : 0;
    if (selected_order.length > 1) selected_order.sort((a, b) =>
      (((hash(a) ^ rng_draw) >>> 0) - ((hash(b) ^ rng_draw) >>> 0)));
    for (const attribute of selected_order) values[attribute] = profile.ordinary_array[index++];
    choices.push({ tier: [...tier], selected_order, rng_draw });
  }
  const result = { contract_version: 'actor_base_attributes_v1', values,
    profile_ref: { id: profile.profile_id, version: profile.version, digest: profileDigest },
    generation: { algorithm_version: profile.algorithm_version, rng_version: RNG_VERSION,
      seed_basis, seed_digest: seed.digest, occupation_archetype_id: occupation,
      priority_mapping_id: mapping.mapping_id, choices }, trace: { attribute_values:
      structuredClone(values), profile_ref: { id: profile.profile_id, version: profile.version,
        digest: profileDigest }, algorithm_version: profile.algorithm_version,
      rng_version: RNG_VERSION, seed_basis: structuredClone(seed_basis),
      seed_digest: seed.digest, occupation_archetype_id: occupation,
      priority_mapping_id: mapping.mapping_id, choices: structuredClone(choices) } };
  if (!validateActorBaseAttributes(result)) gap('RESULT');
  return Object.freeze(result);
}

// Existing actors carry their original snapshot through profile-level promotion.
// New actors alone consume the pinned materialization seed.
export function materializeOrPreserveActorBaseAttributes({ existing_attributes: existing,
  ...input } = {}) {
  if (existing != null) {
    if (!validateActorBaseAttributes(existing)) gap('SNAPSHOT');
    const profile = profileFromVerifiedRuntimeRecord(input.runtime_profile);
    const basis = existing.generation.seed_basis;
    if (basis.actor_slot_ref !== input.actor_slot_ref
        || existing.generation.occupation_archetype_id
          !== input.occupation_archetype_id
        || basis.world_revision_id !== input.seed_basis?.world_revision_id
        || basis.world_catalog_digest !== input.seed_basis?.world_catalog_digest
        || existing.profile_ref.id !== profile.profile_id
        || existing.profile_ref.version !== profile.version
        || existing.profile_ref.digest !== canonicalDigest(profile)
        || existing.generation.algorithm_version !== profile.algorithm_version
        || existing.generation.rng_version !== profile.rng_version) gap('SNAPSHOT');
    return Object.freeze(structuredClone(existing));
  }
  return materializeActorBaseAttributes(input);
}

export function attachActorBaseAttributesToNpcs({ npcs, runtime_profile: runtimeProfile,
  occupation_records: occupationRecords, world_revision_id: worldRevisionId,
  world_catalog_digest: worldCatalogDigest, parent_seed_digest: parentSeedDigest } = {}) {
  if (!Array.isArray(npcs) || !Array.isArray(occupationRecords)) gap('OCCUPATION_RECORDS');
  const occupations = new Map();
  for (const row of occupationRecords) {
    const occupationId = row?.occupation_id ?? row?.id;
    if (!['approved', 'usable_with_caution'].includes(row?.status)
        || !['approved', 'accepted_with_caution'].includes(
          row?.mapping_review_status)) continue;
    if (!text(occupationId) || !text(row.occupation_archetype_id)
        || occupations.has(occupationId)) gap('OCCUPATION_RECORDS');
    occupations.set(occupationId, row.occupation_archetype_id);
  }
  return npcs.map((npc) => {
    const occupation = occupations.get(npc?.occupation_ref?.id);
    if (!occupation || !text(npc?.participant_slot_ref)) gap('ARCHETYPE_MAPPING');
    return {
      ...structuredClone(npc),
      base_attributes: structuredClone(materializeOrPreserveActorBaseAttributes({
        existing_attributes: npc.base_attributes,
        runtime_profile: runtimeProfile,
        occupation_archetype_id: occupation,
        actor_slot_ref: npc.participant_slot_ref,
        seed_basis: { world_revision_id: worldRevisionId,
          world_catalog_digest: worldCatalogDigest,
          parent_seed_digest: parentSeedDigest }
      })),
      attribute_generation_gate: 'active'
    };
  });
}

export function validateActorBaseAttributes(value) {
  const generation = value?.generation;
  const values = ACTOR_BASE_ATTRIBUTE_KEYS.map((key) => value?.values?.[key]);
  return value?.contract_version === 'actor_base_attributes_v1'
    && Object.keys(value.values ?? {}).length === ACTOR_BASE_ATTRIBUTE_KEYS.length
    && values.every((number) => Number.isInteger(number) && number >= 3 && number <= 18)
    && same(values.sort((a, b) => b - a), ORDINARY_ACTOR_BASE_ARRAY)
    && text(value.profile_ref?.id) && value.profile_ref?.version === 1
    && digest(value.profile_ref?.digest)
    && generation?.algorithm_version === 'actor_base_attributes_v1'
    && generation?.rng_version === RNG_VERSION && plain(generation.seed_basis)
    && digest(generation.seed_digest) && text(generation.occupation_archetype_id)
    && text(generation.priority_mapping_id) && Array.isArray(generation.choices)
    && same(value.trace?.attribute_values, value.values)
    && same(value.trace?.profile_ref, value.profile_ref)
    && value.trace?.algorithm_version === generation.algorithm_version
    && value.trace?.rng_version === generation.rng_version
    && same(value.trace?.seed_basis, generation.seed_basis)
    && value.trace?.seed_digest === generation.seed_digest
    && same(value.trace?.choices, generation.choices);
}

export function profileFromVerifiedRuntimeRecord(runtimeProfile) {
  const profile = runtimeProfile?.profile;
  if (!exact(runtimeProfile, ['schema','catalog_scope','catalog_revision_id',
    'catalog_digest','activation_event_id','import_id','import_audit_digest',
    'record_registry_digest','runtime_contract_digest','profile_id',
    'profile_digest','profile'])
      || runtimeProfile.schema !==
        'rus.actor_base_attributes_runtime_profile.v1'
      || runtimeProfile.catalog_scope !== 'actor_base_attributes_v1'
      || !text(runtimeProfile.catalog_revision_id)
      || !digest(runtimeProfile.catalog_digest)
      || !text(runtimeProfile.activation_event_id)
      || !text(runtimeProfile.import_id)
      || !digest(runtimeProfile.import_audit_digest)
      || !digest(runtimeProfile.record_registry_digest)
      || !digest(runtimeProfile.runtime_contract_digest)
      || runtimeProfile.profile_id !== profile?.profile_id
      || runtimeProfile.profile_digest !== canonicalDigest(profile)) {
    gap('RUNTIME_PROFILE');
  }
  return validateProfile(profile);
}

export function canonicalCandidateDigest(candidate) {
  const value = structuredClone(candidate ?? {});
  delete value.candidate_digest;
  return canonicalDigest(value);
}
export function canonicalRequestDigest(request) {
  const value = structuredClone(request ?? {});
  delete value.request_digest;
  return canonicalDigest(value);
}

export function validateActorBaseAttributesCandidate(candidate) {
  if (!exact(candidate, ['schema','version','status','runtime_authorized',
    'import_authorized','activation_authorized','subject_commit','profile',
    'profile_digest','candidate_digest','source_provenance'])
      || candidate.schema !== 'rus.actor_base_attributes_candidate.v1'
      || candidate.version !== 1 || candidate.status !== 'candidate_approval_pending'
      || candidate.runtime_authorized !== false || candidate.import_authorized !== false
      || candidate.activation_authorized !== false || !text(candidate.subject_commit)
      || candidate.profile_digest !== canonicalDigest(candidate.profile)
      || candidate.candidate_digest !== canonicalCandidateDigest(candidate)
      || !plain(candidate.source_provenance)) return false;
  try { validateProfile(candidate.profile); } catch { return false; }
  const provenance = candidate.source_provenance;
  return Array.isArray(provenance.standard_array?.sources)
    && Array.isArray(provenance.invariant?.sources)
    && provenance.standard_array.sources.length === 2
    && provenance.invariant.sources.length === 2
    && provenance.priority_mappings?.length === ORDINARY_OCCUPATION_ARCHETYPES.length
    && same(provenance.priority_mappings.map(({ occupation_archetype_id: id }) =>
      id).sort(), [...ORDINARY_OCCUPATION_ARCHETYPES].sort())
    && provenance.priority_mappings.every((mapping) =>
      ORDINARY_OCCUPATION_ARCHETYPES.includes(mapping?.occupation_archetype_id)
      && mapping.directness === 'editorial_inference'
      && mapping.confidence === 'medium'
      && Array.isArray(mapping.occupation_ids) && mapping.occupation_ids.length > 0
      && text(mapping.occupation_tsv_digest) && text(mapping.applicability)
      && text(mapping.limits));
}

function validateProfile(profile) {
  if (!plain(profile) || profile.schema !== 'rus.actor_base_attributes_profile.v1'
      || profile.version !== 1 || !text(profile.profile_id)
      || profile.algorithm_version !== 'actor_base_attributes_v1'
      || profile.rng_version !== RNG_VERSION
      || !same(profile.ordinary_array, ORDINARY_ACTOR_BASE_ARRAY)
      || !Array.isArray(profile.occupation_archetype_priorities)
      || profile.occupation_archetype_priorities.length !== ORDINARY_OCCUPATION_ARCHETYPES.length) gap('PROFILE');
  const mappings = profile.occupation_archetype_priorities.map((entry) => {
    const flat = entry?.priority_tiers?.flat();
    if (!text(entry?.mapping_id) || !ORDINARY_OCCUPATION_ARCHETYPES.includes(entry.occupation_archetype_id)
        || !Array.isArray(entry.priority_tiers) || !same(flat?.sort(), [...ACTOR_BASE_ATTRIBUTE_KEYS].sort())
        || entry.priority_tiers.some((tier) => !Array.isArray(tier) || tier.length === 0)) gap('PROFILE');
    return { mapping_id: entry.mapping_id, occupation_archetype_id: entry.occupation_archetype_id,
      priority_tiers: entry.priority_tiers.map((tier) => [...tier]) };
  });
  if (!same(mappings.map(({ occupation_archetype_id: id }) => id).sort(),
    [...ORDINARY_OCCUPATION_ARCHETYPES].sort())) gap('PROFILE');
  return { schema: profile.schema, version: profile.version, profile_id: profile.profile_id,
    algorithm_version: profile.algorithm_version, rng_version: profile.rng_version,
    ordinary_array: [...profile.ordinary_array], occupation_archetype_priorities: mappings };
}

function hash(value) { return [...value].reduce((sum, char) =>
  Math.imul(sum ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function exact(value, keys) { return plain(value) && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key)); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function plain(value) { return value != null && typeof value === 'object' && !Array.isArray(value); }
function digest(value) { return /^[a-f0-9]{64}$/u.test(String(value ?? '')); }
function gap(kind) { throw new MaterializationError(`ACTOR_BASE_ATTRIBUTES_${kind}_DATA_GAP`,
  `Actor base attributes require exact ${kind.toLowerCase()} data.`); }
