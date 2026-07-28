import { concern, isPlainObject, text } from './shared.js';
import { createHash } from 'node:crypto';

export const TRACE_PLAYER_PROFILE_POLICY_ID = 'lower_dvina_trace_player_profile_v1';
export const TRACE_PLAYER_PROFILE_POLICY_SCHEMA = 'rus.trace_player_profile_policy.v1';
export const TRACE_PLAYER_PROFILE_POLICY_REVISION = 1;
export const TRACE_PLAYER_PROFILE_POLICY_DIGEST = 'ade28c63f076f8d64801df2110bcaef900f9e0cf36038765907cfc9eca02cce2';
export const TRACE_DEFINITION_REF = Object.freeze({ id: 'lower_dvina_trace_v1', revision: 1, digest: '3ed251d4ef1c7538da754b70f319bb213e4422b1d5e4e1dcd20c02753995c03b' });
export const TRACE_ATTRIBUTE_IDS = Object.freeze(['strength', 'dexterity', 'endurance', 'reason', 'attention', 'influence']);
export const TRACE_SKILL_IDS = Object.freeze(['athletics', 'stealth', 'melee', 'ranged_combat', 'craft', 'household', 'survival', 'riding', 'healing', 'observation', 'communication', 'custom_and_law']);

function entryValue(entry) {
  return typeof entry === 'number' ? { value: entry } : entry;
}

function traceRefMatches(actual, expected) {
  return isPlainObject(actual)
    && actual.id === expected.id
    && actual.revision === expected.revision
    && actual.digest === expected.digest;
}

function profileSkillEntries(skills) {
  if (!isPlainObject(skills)) return [];
  return Object.entries(skills).map(([key, value]) => ({ id: value?.skill_id ?? key, value }));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

function policyDigest(policy) {
  return createHash('sha256').update(JSON.stringify(canonicalize(policy))).digest('hex');
}

export function validateTracePlayerProfilePolicy(dossier = {}, policy = {}, { severity } = {}) {
  const concerns = [];
  const add = (code, message, field) => concerns.push(concern(code, message, { field, ...(severity ? { severity } : {}) }));
  const approved = policy.trace_player_profile_policy;
  if (approved === undefined || approved === null) return concerns;

  if (!isPlainObject(approved)
    || approved.schema !== TRACE_PLAYER_PROFILE_POLICY_SCHEMA
    || approved.revision !== TRACE_PLAYER_PROFILE_POLICY_REVISION
    || approved.publication_status !== 'unpublished'
    || approved.policy_id !== TRACE_PLAYER_PROFILE_POLICY_ID
    || !isPlainObject(approved.profile_ref)
    || policyDigest(approved) !== TRACE_PLAYER_PROFILE_POLICY_DIGEST) {
    add('TRACE_PLAYER_PROFILE_POLICY_INVALID', 'Trace player profile policy must be the exact unpublished versioned policy contract.', 'trace_player_profile_policy');
    return concerns;
  }
  if (!Array.isArray(approved.name_candidate_ids) || approved.name_candidate_ids.length === 0) {
    add('TRACE_PLAYER_PROFILE_CANDIDATE_SET_EMPTY', 'Trace player profile name candidate set must not be empty.', 'trace_player_profile_policy.name_candidate_ids');
  }
  const refs = dossier.selected_candidate_refs ?? {};
  if (refs.social_role_id !== 'nov_role_merchant_clerk') add('TRACE_PLAYER_PROFILE_ROLE_MISMATCH', 'Trace profile requires nov_role_merchant_clerk.', 'selected_candidate_refs.social_role_id');
  if (dossier.social_status?.social_role_id !== 'nov_role_merchant_clerk') add('TRACE_PLAYER_PROFILE_ROLE_MISMATCH', 'Trace dossier social role must be nov_role_merchant_clerk.', 'social_status.social_role_id');
  if (refs.occupation_id !== approved.occupation_id) add('TRACE_PLAYER_PROFILE_OCCUPATION_MISMATCH', `Trace profile requires ${approved.occupation_id}.`, 'selected_candidate_refs.occupation_id');
  if (dossier.social_status?.occupation_id !== approved.occupation_id) add('TRACE_PLAYER_PROFILE_OCCUPATION_MISMATCH', `Trace dossier occupation must be ${approved.occupation_id}.`, 'social_status.occupation_id');
  if (!traceRefMatches(refs.trace_definition_ref, TRACE_DEFINITION_REF)) add('TRACE_PLAYER_PROFILE_DEFINITION_REF_MISMATCH', 'Trace definition ref must match the approved exact version and digest.', 'selected_candidate_refs.trace_definition_ref');
  if (!traceRefMatches(refs.trace_player_profile_ref, approved.profile_ref)) add('TRACE_PLAYER_PROFILE_REF_MISMATCH', 'Trace player profile ref must match the approved exact version and digest.', 'selected_candidate_refs.trace_player_profile_ref');
  if (!approved.name_candidate_ids.includes(refs.name_candidate_id)) add('TRACE_PLAYER_PROFILE_NAME_NOT_APPROVED', 'Trace player name must come from the approved candidate set.', 'selected_candidate_refs.name_candidate_id');

  const attributes = dossier.attributes;
  if (!isPlainObject(attributes) || Object.keys(attributes).length !== TRACE_ATTRIBUTE_IDS.length || !TRACE_ATTRIBUTE_IDS.every((id) => Object.hasOwn(attributes, id))) {
    add('TRACE_PLAYER_PROFILE_ATTRIBUTES_NOT_EXACT', 'Trace profile requires exactly the canonical six attributes.', 'attributes');
  } else {
    for (const id of TRACE_ATTRIBUTE_IDS) {
      const expected = approved.attributes?.[id];
      const actual = entryValue(attributes[id]);
      if (!isPlainObject(expected) || actual?.value !== expected.value || actual?.bonus !== expected.bonus) add('TRACE_PLAYER_PROFILE_ATTRIBUTE_MISMATCH', `Trace attribute ${id} must match approved value and bonus.`, `attributes.${id}`);
    }
  }

  const actualSkills = profileSkillEntries(dossier.skills);
  const ids = actualSkills.map((item) => item.id);
  if (ids.length !== TRACE_SKILL_IDS.length || new Set(ids).size !== TRACE_SKILL_IDS.length || !TRACE_SKILL_IDS.every((id) => ids.includes(id))) {
    add('TRACE_PLAYER_PROFILE_SKILLS_NOT_EXACT', 'Trace profile requires each canonical skill exactly once and no others.', 'skills');
  }
  for (const { id, value } of actualSkills) {
    const expected = approved.skills?.[id];
    if (!expected) continue;
    if (value?.level !== expected.level || value?.bonus !== expected.bonus) add('TRACE_PLAYER_PROFILE_SKILL_MISMATCH', `Trace skill ${id} must match approved level and bonus.`, `skills.${id}`);
    if (expected.level === 'no_experience') {
      if (Object.hasOwn(value ?? {}, 'basis')) add('TRACE_PLAYER_PROFILE_BASIS_FIELD_INVALID', `Trace skill ${id} must not use basis for no_experience.`, `skills.${id}.basis`);
      if (!text(value?.absence_basis)) {
        add('TRACE_PLAYER_PROFILE_ABSENCE_BASIS_MISSING', `Trace skill ${id} requires absence_basis.`, `skills.${id}.absence_basis`);
      } else if (value.absence_basis !== expected.absence_basis) {
        add('TRACE_PLAYER_PROFILE_ABSENCE_BASIS_MISMATCH', `Trace skill ${id} absence_basis must match the approved canonical profile.`, `skills.${id}.absence_basis`);
      }
    } else {
      if (Object.hasOwn(value ?? {}, 'absence_basis')) add('TRACE_PLAYER_PROFILE_BASIS_FIELD_INVALID', `Trace skill ${id} must not use absence_basis outside no_experience.`, `skills.${id}.absence_basis`);
      if (!text(value?.basis)) {
        add('TRACE_PLAYER_PROFILE_SKILL_BASIS_MISSING', `Trace skill ${id} requires basis.`, `skills.${id}.basis`);
      } else if (value.basis !== expected.basis) {
        add('TRACE_PLAYER_PROFILE_SKILL_BASIS_MISMATCH', `Trace skill ${id} basis must match the approved canonical profile.`, `skills.${id}.basis`);
      }
    }
  }
  return concerns;
}
