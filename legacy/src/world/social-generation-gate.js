/** Generation gate for regional social roles and occupations. */

export const ACTIVE_ROLE_STATUSES = new Set(['approved', 'usable_with_caution']);
export const ACTIVE_MAPPING_STATUSES = new Set(['approved', 'accepted_with_caution']);

export function isGenerationEligibleSocialRole(row = {}) {
  if (!ACTIVE_ROLE_STATUSES.has(String(row.status ?? ''))) return false;
  if (!row.social_position_archetype_id) return false;
  if (!row.social_class_id) return false;
  if (!row.role_archetype_id) return false;
  if (!ACTIVE_MAPPING_STATUSES.has(String(row.mapping_review_status ?? ''))) return false;
  return true;
}

export function isGenerationEligibleOccupation(row = {}) {
  if (!ACTIVE_ROLE_STATUSES.has(String(row.status ?? ''))) return false;
  if (!row.occupation_archetype_id) return false;
  if (!ACTIVE_MAPPING_STATUSES.has(String(row.mapping_review_status ?? ''))) return false;
  return true;
}

export function socialRoleGenerationGateSql(alias = 'rsr') {
  const a = alias;
  return `
    ${a}.status IN ('approved', 'usable_with_caution')
    AND ${a}.social_position_archetype_id IS NOT NULL
    AND ${a}.social_class_id IS NOT NULL
    AND ${a}.role_archetype_id IS NOT NULL
    AND ${a}.mapping_review_status IN ('approved', 'accepted_with_caution')
  `;
}

export function occupationGenerationGateSql(alias = 'ro') {
  const a = alias;
  return `
    ${a}.status IN ('approved', 'usable_with_caution')
    AND ${a}.occupation_archetype_id IS NOT NULL
    AND ${a}.mapping_review_status IN ('approved', 'accepted_with_caution')
  `;
}

/** Compare universal social essence only; ignore regional title/historical_term. */
export function sameSocialEssence(roleA = {}, roleB = {}) {
  const a = roleA.social_position_archetype_id ?? null;
  const b = roleB.social_position_archetype_id ?? null;
  if (!a || !b) return false;
  return a === b;
}

/** ponytail: map legacy skill keys on party/profile load */
export const SKILL_KEY_LEGACY_MAP = {
  melee: 'melee_combat',
  ranged: 'ranged_combat',
  riding: 'travel_transport',
  communication: 'communication_trade',
  custom_and_law: 'custom_law_literacy'
};

export function migrateSkillKeys(skills = {}) {
  if (!skills || typeof skills !== 'object' || Array.isArray(skills)) return skills;
  const out = { ...skills };
  for (const [oldKey, newKey] of Object.entries(SKILL_KEY_LEGACY_MAP)) {
    if (!(oldKey in out)) continue;
    if (!(newKey in out) || Number(out[newKey]) === 0) {
      out[newKey] = out[oldKey];
    }
    delete out[oldKey];
  }
  return out;
}
