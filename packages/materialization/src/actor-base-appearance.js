import {
  ACTOR_BASE_APPEARANCE_PATHS,
  completeActorBaseAppearance,
  validateActorBaseAppearance
} from '@rus/actors';
import { canonicalDigest, MaterializationError } from './core.js';
import { approvedWeight, weightedCandidate } from './world-validation.js';

const FACET_BY_PATH = Object.freeze({
  sex_category: 'sex_category',
  age_category: 'age_category',
  'appearance.build': 'build',
  'appearance.skin_tone': 'skin_tone',
  'appearance.face_shape': 'face_shape',
  'appearance.hair.color': 'hair_color',
  'appearance.hair.length': 'hair_length',
  'appearance.hair.style': 'hair_style',
  'appearance.hair.facial_hair': 'facial_hair',
  'appearance.eyes.color': 'eye_color'
});

export function materializeActorBaseAppearance({
  identity = {},
  approved_entries: approvedEntries,
  random,
  choice_key_prefix: choiceKeyPrefix,
  rule_id: ruleId = 'actor_base_appearance',
  choice_ordinal_offset: choiceOrdinalOffset = 0
} = {}) {
  const partialValidation = validateActorBaseAppearance(identity, { requireComplete: false });
  if (!partialValidation.ok) {
    throw new MaterializationError('ACTOR_APPEARANCE_AUTHORED_INVALID', 'Authored actor appearance is invalid.', { errors: partialValidation.errors });
  }
  if (!Array.isArray(approvedEntries)) {
    throw new MaterializationError('ACTOR_APPEARANCE_CANDIDATES_MISSING', 'Actor appearance requires a pinned approved component set.');
  }
  if (!String(choiceKeyPrefix ?? '').trim()) {
    throw new MaterializationError('ACTOR_APPEARANCE_TRACE_INVALID', 'Actor appearance requires a stable choice key prefix.');
  }

  const authoredRequirements = collectAuthoredRequirements(
    identity, approvedEntries);
  assertAuthoredCompletionPossible(
    identity, approvedEntries, authoredRequirements);
  const completion = {};
  const choices = [];
  for (const path of ACTOR_BASE_APPEARANCE_PATHS) {
    const facet = FACET_BY_PATH[path];
    const workingIdentity = mergeIdentity(identity, completion);
    const suppliedForFacet = approvedEntries.filter((entry) => entry?.facet === facet);
    const eligible = suppliedForFacet
      .filter((entry) => entry.status === 'approved'
        && entry.applicable !== false
        && appliesTo(entry.applicability, workingIdentity)
        && preservesAuthoredRequirements(
          entry, path, workingIdentity, authoredRequirements))
      .map(normalizeEntry)
      .sort((left, right) => left.entry_id.localeCompare(right.entry_id));
    assertUniqueEntryIds(eligible, facet);
    const candidateIds = eligible.map((entry) => entry.entry_id);
    const candidateSetDigest = canonicalDigest(candidateIds);
    const authoredValue = readPath(identity, path);
    let selected;
    let draw = 0;
    let selectionMode = 'authored';

    if (authoredValue != null && authoredValue !== '') {
      selected = eligible.find((entry) => entry.option_value === authoredValue);
      if (!selected) {
        throw new MaterializationError('ACTOR_APPEARANCE_VALUE_NOT_APPROVED', `Authored ${path} is outside the approved applicable component set.`, { path, facet, authored_value: authoredValue });
      }
    } else {
      if (eligible.length === 0) {
        throw new MaterializationError('ACTOR_APPEARANCE_DATA_GAP', `Required actor appearance candidate set is empty for ${path}.`, { path, facet });
      }
      assertRandomSource(random);
      draw = random.nextUint32();
      selected = weightedCandidate(eligible, draw);
      selectionMode = 'weighted_draw';
      writePath(completion, path, selected.option_value);
    }

    choices.push({
      choice_ordinal: choiceOrdinalOffset + choices.length,
      choice_key: `${choiceKeyPrefix}:${facet}`,
      rule_id: ruleId,
      slot_key: facet,
      candidate_digest: candidateSetDigest,
      candidate_set_digest: candidateSetDigest,
      candidate_ids: candidateIds,
      selected_id: selected.entry_id,
      selected_weight: approvedWeight(selected),
      selection_mode: selectionMode,
      rng_draw: draw,
      rng_counter: random?.drawCount ?? 0,
      rejection_summary: {
        rejected_count: suppliedForFacet.length - eligible.length,
        unapproved_count: suppliedForFacet.filter((entry) => entry?.status !== 'approved').length,
        inapplicable_count: suppliedForFacet.filter((entry) =>
          entry?.status === 'approved'
          && (entry.applicable === false
            || !appliesTo(entry.applicability, workingIdentity)
            || !preservesAuthoredRequirements(
              entry, path, workingIdentity, authoredRequirements))).length
      }
    });
  }

  return Object.freeze({
    identity: completeActorBaseAppearance(identity, completion),
    choices: Object.freeze(choices.map((choice) => Object.freeze(choice)))
  });
}

export function materializeNpcInstanceAppearances({
  instances,
  random,
  choices
}) {
  const npcs = instances.filter(({ domain }) => domain === 'npc')
    .sort((left, right) => String(left.slot_key).localeCompare(
      String(right.slot_key)
    ) || String(left.instance_id).localeCompare(String(right.instance_id)));
  for (const instance of npcs) {
    const attributes = instance.attributes;
    const demographic = attributes.demographic_profile_entries;
    const appearance = attributes.appearance_profile_entries;
    const approvedEntries = Array.isArray(demographic)
      || Array.isArray(appearance)
      ? [...(demographic ?? []), ...(appearance ?? [])]
      : attributes.actor_appearance_profile_entries;
    if (!Array.isArray(approvedEntries)
        && attributes.require_complete_actor_appearance !== true) continue;
    const materialized = materializeActorBaseAppearance({
      identity: attributes.identity_state,
      approved_entries: approvedEntries,
      random,
      choice_key_prefix:
        `npc:${instance.slot_key}:${instance.instance_id}`,
      rule_id: instance.profile_id ?? instance.rule_id,
      choice_ordinal_offset: choices.length
    });
    attributes.identity_state = structuredClone(materialized.identity);
    attributes.appearance_contract_version = 'actor_base_appearance_v1';
    choices.push(...materialized.choices.map((choice) =>
      structuredClone(choice)));
  }
}

function assertRandomSource(random) {
  if (!random || typeof random.nextUint32 !== 'function'
    || !Number.isInteger(random.drawCount)) {
    throw new MaterializationError(
      'ACTOR_APPEARANCE_RANDOM_SOURCE_INVALID',
      'Missing actor appearance fields require the existing versioned RandomSource.'
    );
  }
}

function normalizeEntry(entry) {
  const entryId = String(entry.entry_id ?? entry.candidate_id ?? entry.option_id ?? '').trim();
  const optionValue = String(entry.option_value ?? entry.value ?? '').trim();
  if (!entryId || !optionValue) {
    throw new MaterializationError('ACTOR_APPEARANCE_CANDIDATE_INVALID', 'Appearance entries require a stable ID and option value.');
  }
  return { ...structuredClone(entry), entry_id: entryId, option_value: optionValue };
}

function assertUniqueEntryIds(entries, facet) {
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.entry_id)) throw new MaterializationError('ACTOR_APPEARANCE_CANDIDATE_INVALID', `Duplicate appearance entry ID in ${facet}.`, { entry_id: entry.entry_id });
    seen.add(entry.entry_id);
  }
}

function appliesTo(applicability, identity) {
  if (applicability == null) return true;
  if (!plainObject(applicability)) return false;
  return Object.entries(applicability).every(([path, allowed]) => {
    if (allowed === 'all') return true;
    if (!Array.isArray(allowed) || allowed.length === 0) return false;
    return allowed.includes(readPath(identity, path));
  });
}

function collectAuthoredRequirements(identity, approvedEntries) {
  const requirements = [];
  for (const path of ACTOR_BASE_APPEARANCE_PATHS) {
    const authoredValue = readPath(identity, path);
    if (authoredValue == null || authoredValue === '') continue;
    const facet = FACET_BY_PATH[path];
    const alternatives = approvedEntries
      .filter((entry) => entry?.facet === facet
        && entry.status === 'approved'
        && entry.applicable !== false)
      .map(normalizeEntry)
      .filter((entry) => entry.option_value === authoredValue
        && applicabilityCompatible(entry.applicability, identity))
      .sort((left, right) => left.entry_id.localeCompare(right.entry_id));
    assertUniqueEntryIds(alternatives, facet);
    if (alternatives.length === 0) {
      throw new MaterializationError(
        'ACTOR_APPEARANCE_VALUE_NOT_APPROVED',
        `Authored ${path} is outside the approved applicable component set.`,
        { path, facet, authored_value: authoredValue }
      );
    }
    requirements.push({ path, alternatives });
  }
  return requirements;
}

function assertAuthoredCompletionPossible(
  identity, approvedEntries, authoredRequirements
) {
  for (const path of ACTOR_BASE_APPEARANCE_PATHS) {
    if (readPath(identity, path) != null
        && readPath(identity, path) !== '') continue;
    const facet = FACET_BY_PATH[path];
    const supplied = approvedEntries.filter((entry) =>
      entry?.facet === facet
      && entry.status === 'approved'
      && entry.applicable !== false);
    if (supplied.length === 0) {
      throw new MaterializationError(
        'ACTOR_APPEARANCE_DATA_GAP',
        `Required actor appearance candidate set is empty for ${path}.`,
        { path, facet }
      );
    }
    const possible = supplied.some((entry) =>
      applicabilityCompatible(entry.applicability, identity)
      && preservesAuthoredRequirements(
        entry, path, identity, authoredRequirements));
    if (!possible) {
      throw new MaterializationError(
        'ACTOR_APPEARANCE_AUTHORED_CONFLICT',
        `Authored actor appearance has no compatible completion for ${path}.`,
        { path, facet }
      );
    }
  }
}

function preservesAuthoredRequirements(
  entry, path, identity, authoredRequirements
) {
  const prospectiveIdentity = structuredClone(identity);
  writePath(prospectiveIdentity, path,
    String(entry?.option_value ?? entry?.value ?? '').trim());
  return authoredRequirements.every(({ alternatives }) =>
    alternatives.some((alternative) =>
      applicabilityCompatible(
        alternative.applicability, prospectiveIdentity)));
}

function applicabilityCompatible(applicability, identity) {
  if (applicability == null) return true;
  if (!plainObject(applicability)) return false;
  return Object.entries(applicability).every(([path, allowed]) => {
    if (allowed === 'all') return true;
    if (!Array.isArray(allowed) || allowed.length === 0) return false;
    const actual = readPath(identity, path);
    return actual == null || actual === '' || allowed.includes(actual);
  });
}

function mergeIdentity(identity, completion) {
  const merged = structuredClone(identity);
  for (const path of ACTOR_BASE_APPEARANCE_PATHS) {
    if (readPath(merged, path) == null && readPath(completion, path) != null) writePath(merged, path, readPath(completion, path));
  }
  return merged;
}

function readPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}

function writePath(value, path, nextValue) {
  const segments = path.split('.');
  let current = value;
  for (const segment of segments.slice(0, -1)) {
    if (!plainObject(current[segment])) current[segment] = {};
    current = current[segment];
  }
  current[segments.at(-1)] = nextValue;
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
