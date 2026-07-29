import { STAGE11_INPUT_SCHEMA, STAGE11_OUTPUT_SCHEMA } from './constants.js';
import { concern, collectArrayLike, collectCandidateIdSet, collectInventoryItems, collectItemProfileIds, collectNpcCandidateIds, collectOccupationIds, collectRelationObjects, collectSkillObjects, collectSocialRoleIds, emptyArray, extractNumericNamedValues, firstText, hasAny, hasAnyNested, hasAnyNestedText, hasAnyText, hasConsequenceOfInaction, hasImmediateNeed, hasMilitaryOrHunterBasis, hasNullOccupationReason, hasPropertyInventoryConfusion, hasStartPlaceReason, inRange, isCombatSkill, isPlainObject, nonEmptyArray, text } from './shared.js';
import { validateTracePlayerProfilePolicy } from './trace-policy.js';

export function validateStage11PlayerCharacterInput(input = {}) {
  const concerns = [];
  if (!isPlainObject(input)) {
    return [concern('PLAYER_CHARACTER_INPUT_NOT_OBJECT', 'Stage 11 input must be an object.', { field: 'root' })];
  }
  if (input.version !== 1) {
    concerns.push(concern('PLAYER_CHARACTER_INPUT_VERSION_MISMATCH', 'Stage 11 input.version must be 1.', { field: 'version' }));
  }
  if (input.schema !== STAGE11_INPUT_SCHEMA) {
    concerns.push(concern('PLAYER_CHARACTER_INPUT_SCHEMA_MISMATCH', `Stage 11 input.schema must be ${STAGE11_INPUT_SCHEMA}.`, { field: 'schema' }));
  }
  for (const field of [
    'normalized_request',
    'historical_frame',
    'regional_context_package',
    'selected_start_node',
    'start_place_audit',
    'npc_candidate_set',
    'item_profile_candidate_set',
    'character_generation_policy'
  ]) {
    if (!isPlainObject(input[field])) {
      concerns.push(concern('PLAYER_CHARACTER_INPUT_MISSING_BLOCK', `Stage 11 input.${field} must be an object.`, { field }));
    }
  }
  if (input.start_place_audit?.pass !== true) {
    concerns.push(concern(
      'PLAYER_CHARACTER_START_PLACE_AUDIT_NOT_PASSED',
      'Stage 11 may run only after start_place_audit.pass=true.',
      { field: 'start_place_audit.pass' }
    ));
  }
  return concerns;
}

export function validateStage11PlayerCharacterOutput(output = {}, input = {}) {
  const concerns = [];
  concerns.push(...validateStage11PlayerCharacterInput(input));

  if (!isPlainObject(output)) {
    return concerns.concat(concern('PLAYER_CHARACTER_INVALID_JSON', 'player_character_dossier must be a JSON object.', { field: 'root' }));
  }
  if (output.schema !== STAGE11_OUTPUT_SCHEMA) {
    concerns.push(concern('PLAYER_CHARACTER_SCHEMA_MISMATCH', `Stage 11 output schema must be ${STAGE11_OUTPUT_SCHEMA}.`, { field: 'schema' }));
  }
  if (output.version !== 1) {
    concerns.push(concern('PLAYER_CHARACTER_SCHEMA_MISMATCH', 'Stage 11 output version must be 1.', { field: 'version' }));
  }

  const generationStatus = output.generation_status;
  if (!['generated', 'blocked', 'requires_repair'].includes(generationStatus)) {
    concerns.push(concern('PLAYER_CHARACTER_SCHEMA_MISMATCH', 'generation_status must be generated, blocked, or requires_repair.', { field: 'generation_status' }));
  }

  const selectedRefs = isPlainObject(output.selected_candidate_refs) ? output.selected_candidate_refs : {};
  const socialRoleId = firstText(
    selectedRefs.social_role_id,
    output.social_status?.social_role_id,
    output.social_status?.role_id,
    output.social_role_id
  );
  const occupationId = firstText(
    selectedRefs.occupation_id,
    output.social_status?.occupation_id,
    output.occupation?.occupation_id,
    output.occupation_id
  );

  const socialRoleIds = collectSocialRoleIds(input.regional_context_package?.social_context ?? input.regional_context_package);
  if (!text(socialRoleId)) {
    concerns.push(concern('PLAYER_CHARACTER_SOCIAL_ROLE_NOT_ALLOWED', 'social_role_id is required and must come from regional social roles.', { field: 'selected_candidate_refs.social_role_id' }));
  } else if (socialRoleIds.size > 0 && !socialRoleIds.has(socialRoleId)) {
    concerns.push(concern('PLAYER_CHARACTER_SOCIAL_ROLE_NOT_ALLOWED', 'social_role_id must exist in regional social roles.', { field: 'selected_candidate_refs.social_role_id', value: socialRoleId }));
  }

  const occupationIds = collectOccupationIds(input.regional_context_package?.occupation_context ?? input.regional_context_package);
  if (text(occupationId)) {
    if (occupationIds.size > 0 && !occupationIds.has(occupationId)) {
      concerns.push(concern('PLAYER_CHARACTER_OCCUPATION_NOT_ALLOWED', 'occupation_id must exist in regional occupations.', { field: 'selected_candidate_refs.occupation_id', value: occupationId }));
    }
  } else if (occupationId === null || selectedRefs.occupation_id === null || output.social_status?.occupation_id === null) {
    if (!hasNullOccupationReason(output)) {
      concerns.push(concern('PLAYER_CHARACTER_OCCUPATION_NOT_ALLOWED', 'occupation_id may be null only with an explicit reason.', { field: 'selected_candidate_refs.occupation_id' }));
    }
  } else {
    concerns.push(concern('PLAYER_CHARACTER_OCCUPATION_NOT_ALLOWED', 'occupation_id is required, or null must be explicitly justified.', { field: 'selected_candidate_refs.occupation_id' }));
  }

  if (!hasStartPlaceReason(output)) {
    concerns.push(concern('PLAYER_CHARACTER_NO_REASON_HERE', 'Character must have a reason to be in selected_start_node now.', { field: 'start_place_connection' }));
  }
  if (!hasImmediateNeed(output)) {
    concerns.push(concern('PLAYER_CHARACTER_NO_IMMEDIATE_NEED', 'Character must have immediate_need.', { field: 'goals.immediate_need' }));
  }
  if (!hasConsequenceOfInaction(output)) {
    concerns.push(concern('PLAYER_CHARACTER_NO_IMMEDIATE_NEED', 'Character must have consequence_of_inaction.', { field: 'goals.consequence_of_inaction' }));
  }

  concerns.push(...validateHistoricalFrameCompatibility(output, input.historical_frame));
  concerns.push(...validateStartNodeCompatibility(output, input.selected_start_node));
  concerns.push(...validateBodyStates(output));
  concerns.push(...validateAttributes(output));
  concerns.push(...validateSkills(output));
  concerns.push(...validateInventory(output, input));
  concerns.push(...validateRelations(output, input));
  concerns.push(...validateKnowledgeBoundaries(output));
  concerns.push(...validateForbiddenStage11Fields(output));
  concerns.push(...validateSourceTrace(output, input));
  concerns.push(...validateAuditSelfCheck(output));
  concerns.push(...validateTracePlayerProfilePolicy(output, input.character_generation_policy));

  if (output.generation_status === 'requires_repair' && (output.repair_request == null && emptyArray(output.audit_self_check?.concerns))) {
    concerns.push(concern('PLAYER_CHARACTER_REPAIR_REASON_MISSING', 'requires_repair output must explain repair_request or audit_self_check.concerns.', { field: 'generation_status' }));
  }

  return concerns;
}

export function validateHistoricalFrameCompatibility(output, historicalFrame = {}) {
  const concerns = [];
  const frameRegionId = historicalFrame?.region?.region_id;
  const characterRegionId = firstText(output.start_place_connection?.region_id, output.knowledge?.region_id, output.origin?.current_region_id);
  if (text(frameRegionId) && text(characterRegionId) && frameRegionId !== characterRegionId) {
    concerns.push(concern('PLAYER_CHARACTER_HISTORICAL_FRAME_CONFLICT', 'Character region conflicts with historical_frame.region.region_id.', { field: 'start_place_connection.region_id' }));
  }
  const frameYear = historicalFrame?.year?.value;
  const yearRefs = [output.start_place_connection?.year, output.origin?.year, output.knowledge?.current_year].filter((value) => value !== undefined && value !== null);
  if (Number.isFinite(Number(frameYear))) {
    for (const value of yearRefs) {
      if (Number.isFinite(Number(value)) && Number(value) !== Number(frameYear)) {
        concerns.push(concern('PLAYER_CHARACTER_HISTORICAL_FRAME_CONFLICT', 'Character year conflicts with historical_frame.year.value.', { field: 'historical_frame.year' }));
      }
    }
  }
  return concerns;
}

export function validateStartNodeCompatibility(output, selectedStartNode = {}) {
  const concerns = [];
  const selectedCandidateId = firstText(selectedStartNode.selected_candidate_id, selectedStartNode.id, selectedStartNode.start_node_id);
  const dossierCandidateId = firstText(
    output.start_place_connection?.selected_candidate_id,
    output.start_place_connection?.start_node_id,
    output.selected_start_node_id,
    output.selected_candidate_id
  );
  if (text(selectedCandidateId) && text(dossierCandidateId) && selectedCandidateId !== dossierCandidateId) {
    concerns.push(concern('PLAYER_CHARACTER_START_PLACE_CONFLICT', 'Character selected start node reference conflicts with selected_start_node.', { field: 'start_place_connection.selected_candidate_id' }));
  }
  return concerns;
}

export function validateBodyStates(output) {
  const concerns = [];
  const body = output.body ?? {};
  const stateCandidates = [
    ['body.health', body.health],
    ['body.satiety', body.satiety],
    ['body.vigor', body.vigor],
    ['body.states.health', body.states?.health],
    ['body.states.satiety', body.states?.satiety],
    ['body.states.vigor', body.states?.vigor],
    ['body.condition.health', body.condition?.health],
    ['body.condition.satiety', body.condition?.satiety],
    ['body.condition.vigor', body.condition?.vigor]
  ];
  for (const [field, value] of stateCandidates) {
    if (value === undefined || value === null) continue;
    if (!inRange(value, 0, 100)) {
      concerns.push(concern('PLAYER_CHARACTER_STATE_OUT_OF_RANGE', `${field} must be in 0..100.`, { field }));
    }
  }
  for (const activeState of collectArrayLike(body.active_states ?? body.conditions ?? body.status_effects)) {
    if (isPlainObject(activeState) && !hasAnyText(activeState, ['cause', 'reason', 'source', 'why', 'basis'])) {
      concerns.push(concern('PLAYER_CHARACTER_STATE_WITHOUT_CAUSE', 'Active state must have cause/reason/source.', { field: 'body.active_states' }));
    }
  }
  return concerns;
}

export function validateAttributes(output) {
  const concerns = [];
  const attributes = output.attributes ?? {};
  const values = extractNumericNamedValues(attributes, ['strength', 'dexterity', 'endurance', 'reason', 'attention', 'influence', 'сила', 'ловкость', 'выносливость', 'разум', 'внимание', 'влияние'])
    .filter((item) => !item.path.endsWith('.bonus'));
  for (const item of values) {
    if (!inRange(item.value, 3, 18)) {
      concerns.push(concern('PLAYER_CHARACTER_ATTRIBUTE_OUT_OF_RANGE', `${item.path} must be in 3..18.`, { field: item.path }));
    }
  }
  const numericValues = values.map((item) => Number(item.value)).filter(Number.isFinite);
  const high14 = numericValues.filter((value) => value >= 14).length;
  const high15 = numericValues.filter((value) => value >= 15).length;
  const low8 = numericValues.filter((value) => value <= 8).length;
  const high17 = numericValues.filter((value) => value >= 17).length;
  if (high14 > 2) concerns.push(concern('PLAYER_CHARACTER_ATTRIBUTE_BALANCE_VIOLATION', 'Start character cannot have more than two attributes 14+.', { field: 'attributes' }));
  if (high15 > 0 && low8 < 1) concerns.push(concern('PLAYER_CHARACTER_ATTRIBUTE_BALANCE_VIOLATION', 'Attribute 15+ requires at least one attribute 8 or lower.', { field: 'attributes' }));
  if (high14 >= 2 && low8 < 1) concerns.push(concern('PLAYER_CHARACTER_ATTRIBUTE_BALANCE_VIOLATION', 'Two attributes 14+ require at least one attribute 8 or lower.', { field: 'attributes' }));
  if (high17 > 0) concerns.push(concern('PLAYER_CHARACTER_ATTRIBUTE_BALANCE_VIOLATION', 'Values 17-18 are not allowed in ordinary start generation.', { field: 'attributes' }));
  return concerns;
}

export function validateSkills(output) {
  const concerns = [];
  const skills = collectSkillObjects(output.skills);
  const high4 = skills.filter((skill) => Number(skill.bonus) === 4).length;
  const combatHigh = skills.filter((skill) => isCombatSkill(skill) && Number(skill.bonus) > 1).length;
  for (const skill of skills) {
    if (!inRange(skill.bonus, 0, 4)) {
      concerns.push(concern('PLAYER_CHARACTER_SKILL_OUT_OF_RANGE', `${skill.path} bonus must be in 0..4.`, { field: skill.path }));
    }
    if (Number(skill.bonus) >= 3 && !text(skill.basis)) {
      concerns.push(concern('PLAYER_CHARACTER_SKILL_WITHOUT_BASIS', `${skill.path} high skill must have basis.`, { field: skill.path }));
    }
  }
  if (high4 > 1) concerns.push(concern('PLAYER_CHARACTER_TOO_MANY_HIGH_SKILLS', 'Start character cannot have more than one skill +4.', { field: 'skills' }));
  if (combatHigh > 2 && !hasMilitaryOrHunterBasis(output)) {
    concerns.push(concern('PLAYER_CHARACTER_TOO_MANY_HIGH_SKILLS', 'More than two combat skills above +1 require military or hunting biography.', { field: 'skills' }));
  }
  return concerns;
}

export function validateInventory(output, input) {
  const concerns = [];
  const itemProfileIds = collectItemProfileIds(input.item_profile_candidate_set);
  const containerProfileIds = collectCandidateIdSet(input.item_profile_candidate_set?.container_profile_candidates ?? []);
  const propertyRuleIds = collectCandidateIdSet(input.item_profile_candidate_set?.property_rule_candidates ?? []);
  const items = collectInventoryItems(output.inventory);
  for (const item of items) {
    const itemProfileId = firstText(item.item_profile_candidate_id, item.item_profile_id, item.profile_id, item.candidate_id);
    if (!text(itemProfileId) || (itemProfileIds.size > 0 && !itemProfileIds.has(itemProfileId))) {
      concerns.push(concern('PLAYER_CHARACTER_INVENTORY_ITEM_NOT_ALLOWED', 'Inventory item must reference item_profile_candidate_set.', { field: item.__path ?? 'inventory', value: itemProfileId ?? null }));
    }
    const containerProfileId = firstText(item.container_profile_candidate_id, item.container_profile_id);
    if (text(containerProfileId) && containerProfileIds.size > 0 && !containerProfileIds.has(containerProfileId)) {
      concerns.push(concern('PLAYER_CHARACTER_INVENTORY_ITEM_NOT_ALLOWED', 'container_profile_candidate_id must exist in container_profile_candidates.', { field: item.__path ?? 'inventory', value: containerProfileId }));
    }
    const propertyRuleId = firstText(item.property_rule_candidate_id, item.property_rule_id);
    if (text(propertyRuleId) && propertyRuleIds.size > 0 && !propertyRuleIds.has(propertyRuleId)) {
      concerns.push(concern('PLAYER_CHARACTER_INVENTORY_ITEM_NOT_ALLOWED', 'property_rule_candidate_id must exist in property_rule_candidates.', { field: item.__path ?? 'inventory', value: propertyRuleId }));
    }
    if (!hasAny(item, ['weight', 'weight_kg', 'mass', 'mass_kg'])) concerns.push(concern('PLAYER_CHARACTER_ITEM_MISSING_WEIGHT', 'Inventory item must have weight.', { field: item.__path ?? 'inventory' }));
    if (!hasAny(item, ['condition', 'state', 'physical_state'])) concerns.push(concern('PLAYER_CHARACTER_ITEM_MISSING_CONDITION', 'Inventory item must have condition/state.', { field: item.__path ?? 'inventory' }));
    if (!hasAny(item, ['carry_location', 'location', 'worn_at', 'container_id', 'where_carried'])) concerns.push(concern('PLAYER_CHARACTER_ITEM_MISSING_ACCESS', 'Inventory item must say where it is carried.', { field: item.__path ?? 'inventory' }));
    if (!hasAny(item, ['access', 'accessibility', 'quick_access', 'availability'])) concerns.push(concern('PLAYER_CHARACTER_ITEM_MISSING_ACCESS', 'Inventory item must have access/accessibility.', { field: item.__path ?? 'inventory' }));
    if (!hasAnyNestedText(item, ['owner', 'owner_id', 'ownership', 'belongs_to'])) concerns.push(concern('PLAYER_CHARACTER_ITEM_MISSING_OWNER', 'Inventory item must have owner.', { field: item.__path ?? 'inventory' }));
    if (!hasAnyNestedText(item, ['holder', 'holder_id', 'physical_holder', 'carried_by'])) concerns.push(concern('PLAYER_CHARACTER_ITEM_MISSING_OWNER', 'Inventory item must have holder.', { field: item.__path ?? 'inventory' }));
    if (!hasAny(item, ['use', 'function', 'utility', 'practical_use'])) concerns.push(concern('PLAYER_CHARACTER_ITEM_MISSING_RISK', 'Inventory item must have use/function.', { field: item.__path ?? 'inventory' }));
    if (!hasAny(item, ['risk', 'risks', 'legal_risk', 'social_risk'])) concerns.push(concern('PLAYER_CHARACTER_ITEM_MISSING_RISK', 'Inventory item must have risk.', { field: item.__path ?? 'inventory' }));
  }
  if (hasPropertyInventoryConfusion(output)) {
    concerns.push(concern('PLAYER_CHARACTER_INVENTORY_PROPERTY_CONFUSION', 'Inventory must not contain property outside physical access.', { field: 'inventory' }));
  }
  if (items.length > 0) {
    if (!hasAnyNested(output.inventory, ['total_weight', 'total_weight_kg', 'carried_weight', 'carried_weight_kg'])) concerns.push(concern('PLAYER_CHARACTER_LOAD_NOT_CALCULATED', 'Inventory must calculate total weight.', { field: 'inventory.total_weight' }));
    if (!hasAnyNested(output.inventory, ['load_category', 'encumbrance', 'load'])) concerns.push(concern('PLAYER_CHARACTER_LOAD_NOT_CALCULATED', 'Inventory must calculate load category.', { field: 'inventory.load_category' }));
    if (!hasAnyNested(output.inventory, ['occupied_hands', 'hands_occupied', 'hands'])) concerns.push(concern('PLAYER_CHARACTER_LOAD_NOT_CALCULATED', 'Inventory must calculate occupied hands.', { field: 'inventory.occupied_hands' }));
  }
  return concerns;
}

export function validateRelations(output, input) {
  const concerns = [];
  const npcIds = collectNpcCandidateIds(input.npc_candidate_set);
  for (const relation of collectRelationObjects(output.relations)) {
    const npcId = firstText(relation.npc_candidate_id, relation.npc_id, relation.candidate_id);
    const mode = relation.relation_mode ?? relation.mode ?? relation.type;
    const abstract = mode === 'abstract_background_relation' || relation.is_materialized_npc === false || relation.abstract_background_relation === true;
    if (text(npcId)) {
      if (npcIds.size > 0 && !npcIds.has(npcId)) {
        concerns.push(concern('PLAYER_CHARACTER_CREATED_NPC_OUTSIDE_CANDIDATES', 'Relation npc_candidate_id must exist in npc_candidate_set.', { field: relation.__path ?? 'relations', value: npcId }));
      }
    } else if (!abstract) {
      concerns.push(concern('PLAYER_CHARACTER_CREATED_NPC_OUTSIDE_CANDIDATES', 'Relation must reference npc_candidate_set or be explicit abstract_background_relation.', { field: relation.__path ?? 'relations' }));
    }
    if (abstract) {
      if (relation.scene_position || relation.current_position || relation.g5_anchor_id || relation.anchor_id || relation.hidden_motive) {
        concerns.push(concern('PLAYER_CHARACTER_CREATED_NPC_OUTSIDE_CANDIDATES', 'Abstract background relation cannot create scene position or hidden motive.', { field: relation.__path ?? 'relations' }));
      }
    }
  }
  return concerns;
}

export function validateKnowledgeBoundaries(output) {
  const concerns = [];
  const knowledgeText = JSON.stringify(output.knowledge ?? {});
  if (/\b(future|будущ|точная дата будущ|guaranteed outcome|гарантированный исход)\b/iu.test(knowledgeText)) {
    concerns.push(concern('PLAYER_CHARACTER_FUTURE_KNOWLEDGE_LEAK', 'Character knowledge must not include future historical knowledge.', { field: 'knowledge' }));
  }
  if (/\b(hidden_state|скрыт[а-я]* мотив|тайный мотив|secret motive|raw json|internal flag)\b/iu.test(knowledgeText)) {
    concerns.push(concern('PLAYER_CHARACTER_PLAYER_KNOWLEDGE_LEAK', 'Character knowledge must not include hidden/internal facts.', { field: 'knowledge' }));
  }
  return concerns;
}

export function validateForbiddenStage11Fields(output) {
  const concerns = [];
  if (output.visible_scene !== undefined || output.visible_context !== undefined) concerns.push(concern('PLAYER_CHARACTER_CREATED_VISIBLE_SCENE', 'Stage 11 must not create visible_scene/visible_context.', { field: 'visible_scene' }));
  if (output.intro_prose !== undefined || output.narrator_prose !== undefined || output.prose !== undefined) concerns.push(concern('PLAYER_CHARACTER_CREATED_INTRO_PROSE', 'Stage 11 must not create intro/narrator prose.', { field: 'intro_prose' }));
  for (const field of ['g5_scene', 'g5_scene_graph_draft', 'g5_anchor_id', 'anchor_id', 'minilocation_id', 'current_position']) {
    if (output[field] !== undefined) concerns.push(concern('PLAYER_CHARACTER_CREATED_G5', `Stage 11 must not create ${field}.`, { field }));
  }
  return concerns;
}

export function validateSourceTrace(output, input) {
  const concerns = [];
  if (input.character_generation_policy?.require_sources !== false && !nonEmptyArray(output.source_trace)) {
    concerns.push(concern('PLAYER_CHARACTER_SOURCE_MISSING', 'source_trace must not be empty.', { field: 'source_trace' }));
  }
  return concerns;
}

export function validateAuditSelfCheck(output) {
  const concerns = [];
  if (!isPlainObject(output.audit_self_check)) {
    concerns.push(concern('PLAYER_CHARACTER_EMPTY_AUDIT_EVIDENCE', 'audit_self_check must exist.', { field: 'audit_self_check' }));
    return concerns;
  }
  if (output.audit_self_check.pass !== true && emptyArray(output.audit_self_check.concerns)) {
    concerns.push(concern('PLAYER_CHARACTER_EMPTY_AUDIT_EVIDENCE', 'Failed audit_self_check must include concerns.', { field: 'audit_self_check.concerns' }));
  }
  if (!nonEmptyArray(output.audit_self_check.evidence)) {
    concerns.push(concern('PLAYER_CHARACTER_EMPTY_AUDIT_EVIDENCE', 'audit_self_check.evidence must not be empty.', { field: 'audit_self_check.evidence' }));
  }
  return concerns;
}
