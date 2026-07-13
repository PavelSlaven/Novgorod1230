import { STAGE11_DOSSIER_SCHEMA, STAGE12_CODE_PRECHECK_SCHEMA } from './constants.js';
import { concern, collectInventoryItems, collectItemProfileIds, collectNpcCandidateIds, collectOccupationIds, collectPropertyRuleIds, collectRefs, collectRelationObjects, collectSkillObjects, collectSocialRoleIds, extractNumericNamedValues, findForbiddenDossierFields, firstText, hasAny, hasNullOccupationReason, inRange, isPlainObject, nonEmptyArray, text } from './shared.js';

export function buildStage12CodePrecheck(input = {}) {
  const checks = {
    schema_valid: true,
    required_fields_present: true,
    start_place_audit_passed: true,
    social_role_id_allowed: true,
    occupation_id_allowed: true,
    item_profile_ids_allowed: true,
    property_rule_ids_allowed: true,
    npc_candidate_refs_allowed: true,
    state_ranges_valid: true,
    attributes_valid: true,
    skills_valid: true,
    source_trace_present: true,
    no_downstream_entities: true
  };
  const concerns = [];
  const dossier = input.player_character_dossier;

  if (!isPlainObject(dossier) || dossier.schema !== STAGE11_DOSSIER_SCHEMA || dossier.version !== 1) {
    checks.schema_valid = false;
    concerns.push(concern('PLAYER_AUDIT_DOSSIER_SCHEMA_MISMATCH', 'player_character_dossier must have schema=player_character_dossier and version=1.', { field: 'player_character_dossier.schema', severity: 'hard_block' }));
  }

  const requiredDossierFields = [
    'identity',
    'social_status',
    'origin',
    'body',
    'attributes',
    'skills',
    'knowledge',
    'goals',
    'inventory',
    'property_and_access',
    'relations',
    'start_place_connection',
    'selected_candidate_refs',
    'source_trace',
    'audit_self_check'
  ];
  for (const field of requiredDossierFields) {
    if (dossier?.[field] === undefined) {
      checks.required_fields_present = false;
      concerns.push(concern('PLAYER_AUDIT_MISSING_REQUIRED_FIELD', `player_character_dossier.${field} is required.`, { field: `player_character_dossier.${field}`, severity: 'hard_block' }));
    }
  }

  if (input.start_place_audit?.pass !== true) {
    checks.start_place_audit_passed = false;
    concerns.push(concern('PLAYER_AUDIT_START_PLACE_AUDIT_NOT_PASSED', 'Stage 12 requires start_place_audit.pass=true.', { field: 'start_place_audit.pass', severity: 'hard_block' }));
  }

  const socialRoleId = firstText(dossier?.selected_candidate_refs?.social_role_id, dossier?.social_status?.social_role_id, dossier?.social_status?.role_id, dossier?.social_role_id);
  const socialRoleIds = collectSocialRoleIds(input.regional_context_package?.social_context ?? input.regional_context_package);
  if (!text(socialRoleId) || (socialRoleIds.size > 0 && !socialRoleIds.has(socialRoleId))) {
    checks.social_role_id_allowed = false;
    concerns.push(concern('PLAYER_AUDIT_SOCIAL_ROLE_NOT_ALLOWED', 'social_role_id must exist in regional social roles.', { field: 'player_character_dossier.selected_candidate_refs.social_role_id', severity: 'hard_block' }));
  }

  const occupationId = firstText(dossier?.selected_candidate_refs?.occupation_id, dossier?.social_status?.occupation_id, dossier?.occupation?.occupation_id, dossier?.occupation_id);
  const occupationIds = collectOccupationIds(input.regional_context_package?.occupation_context ?? input.regional_context_package);
  const explicitNullOccupation = dossier?.selected_candidate_refs?.occupation_id === null || dossier?.social_status?.occupation_id === null;
  if (text(occupationId)) {
    if (occupationIds.size > 0 && !occupationIds.has(occupationId)) {
      checks.occupation_id_allowed = false;
      concerns.push(concern('PLAYER_AUDIT_OCCUPATION_NOT_ALLOWED', 'occupation_id must exist in regional occupations.', { field: 'player_character_dossier.selected_candidate_refs.occupation_id', severity: 'hard_block' }));
    }
  } else if (explicitNullOccupation) {
    if (!hasNullOccupationReason(dossier)) {
      checks.occupation_id_allowed = false;
      concerns.push(concern('PLAYER_AUDIT_OCCUPATION_NULL_REASON_MISSING', 'occupation_id may be null only with explicit reason.', { field: 'player_character_dossier.selected_candidate_refs.occupation_id', severity: 'hard_block' }));
    }
  } else {
    checks.occupation_id_allowed = false;
    concerns.push(concern('PLAYER_AUDIT_OCCUPATION_NOT_ALLOWED', 'occupation_id is required unless explicitly null with reason.', { field: 'player_character_dossier.selected_candidate_refs.occupation_id', severity: 'hard_block' }));
  }

  const itemProfileIds = collectItemProfileIds(input.item_profile_candidate_set);
  for (const item of collectInventoryItems(dossier?.inventory)) {
    const itemProfileId = firstText(item.item_profile_candidate_id, item.item_profile_id, item.profile_id);
    if (!itemProfileId || (itemProfileIds.size > 0 && !itemProfileIds.has(itemProfileId))) {
      checks.item_profile_ids_allowed = false;
      concerns.push(concern('PLAYER_AUDIT_ITEM_PROFILE_NOT_ALLOWED', 'Inventory item must reference item_profile_candidate_set.', { field: `${item.__path}.item_profile_candidate_id`, severity: 'hard_block' }));
    }
    if (!hasAny(item, ['owner', 'owner_id', 'owner_type']) || !hasAny(item, ['holder', 'holder_id', 'holder_type']) || !hasAny(item, ['access', 'access_status']) || !hasAny(item, ['weight', 'weight_kg']) || !hasAny(item, ['condition', 'state']) || !hasAny(item, ['risk', 'loss_risk', 'social_risk'])) {
      checks.property_rule_ids_allowed = false;
      concerns.push(concern('PLAYER_AUDIT_PROPERTY_ACCESS_INVALID', 'Inventory item must include owner/holder/access/weight/condition/risk.', { field: item.__path, severity: 'hard_block' }));
    }
  }

  const propertyRuleIds = collectPropertyRuleIds(input.item_profile_candidate_set);
  for (const ref of collectRefs(dossier?.property_and_access, ['property_rule_candidate_id', 'property_rule_id'])) {
    if (propertyRuleIds.size > 0 && !propertyRuleIds.has(ref.value)) {
      checks.property_rule_ids_allowed = false;
      concerns.push(concern('PLAYER_AUDIT_PROPERTY_RULE_NOT_ALLOWED', 'property_rule_id must come from item_profile_candidate_set/property candidates.', { field: ref.path, severity: 'hard_block' }));
    }
  }

  const npcCandidateIds = collectNpcCandidateIds(input.npc_candidate_set);
  for (const relation of collectRelationObjects(dossier?.relations)) {
    const mode = relation.relation_mode ?? relation.relation_type;
    const npcId = firstText(relation.npc_candidate_id, relation.npc_id);
    const isAbstract = mode === 'abstract_background_relation' || relation.is_materialized_npc === false;
    if (npcId && npcCandidateIds.size > 0 && !npcCandidateIds.has(npcId)) {
      checks.npc_candidate_refs_allowed = false;
      concerns.push(concern('PLAYER_AUDIT_NPC_REF_NOT_ALLOWED', 'npc_candidate_id must exist in npc_candidate_set.', { field: `${relation.__path}.npc_candidate_id`, severity: 'hard_block' }));
    } else if (!npcId && !isAbstract) {
      checks.npc_candidate_refs_allowed = false;
      concerns.push(concern('PLAYER_AUDIT_NPC_REF_NOT_ALLOWED', 'Relation must reference npc_candidate_id or be explicit abstract_background_relation.', { field: relation.__path, severity: 'hard_block' }));
    }
  }

  for (const value of extractNumericNamedValues(dossier?.body, ['health', 'satiety', 'vigor'])) {
    if (!inRange(value.value, 0, 100)) {
      checks.state_ranges_valid = false;
      concerns.push(concern('PLAYER_AUDIT_STATE_RANGE_INVALID', 'health/satiety/vigor must be 0..100.', { field: value.path, severity: 'hard_block' }));
    }
  }

  for (const value of extractNumericNamedValues(dossier?.attributes, [])) {
    if (!inRange(value.value, 3, 18)) {
      checks.attributes_valid = false;
      concerns.push(concern('PLAYER_AUDIT_ATTRIBUTE_RANGE_INVALID', 'attributes must be 3..18.', { field: value.path, severity: 'hard_block' }));
    }
  }

  for (const skill of collectSkillObjects(dossier?.skills)) {
    if (!inRange(skill.bonus, 0, 4)) {
      checks.skills_valid = false;
      concerns.push(concern('PLAYER_AUDIT_SKILL_RANGE_INVALID', 'skills must be 0..4.', { field: skill.path, severity: 'hard_block' }));
    }
    if (Number(skill.bonus) >= 3 && !text(skill.basis)) {
      checks.skills_valid = false;
      concerns.push(concern('PLAYER_AUDIT_SKILL_BASIS_MISSING', 'High skills require basis.', { field: skill.path, severity: 'hard_block' }));
    }
  }

  if (!nonEmptyArray(dossier?.source_trace)) {
    checks.source_trace_present = false;
    concerns.push(concern('PLAYER_AUDIT_SOURCE_TRACE_MISSING', 'player_character_dossier.source_trace must not be empty.', { field: 'player_character_dossier.source_trace', severity: 'hard_block' }));
  }

  const leaks = findForbiddenDossierFields(dossier);
  if (leaks.length > 0) {
    checks.no_downstream_entities = false;
    for (const leak of leaks) {
      concerns.push(concern('PLAYER_AUDIT_DOWNSTREAM_ENTITY_LEAK', `player_character_dossier must not contain downstream field ${leak.key}.`, { field: leak.path, severity: 'hard_block' }));
    }
  }

  return {
    version: 1,
    schema: STAGE12_CODE_PRECHECK_SCHEMA,
    request_id: input.request_id ?? null,
    pass: concerns.length === 0,
    checks,
    concerns,
    evidence: concerns.length === 0
      ? ['code_precheck passed: schema, candidate refs, numeric ranges, source_trace and downstream field checks']
      : concerns.map((item) => `${item.code}:${item.field ?? 'root'}`)
  };
}
