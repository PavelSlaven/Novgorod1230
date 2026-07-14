import { concern } from '../llm-stage.js';

export const STAGE11_INPUT_SCHEMA = 'player_character_generator_input';
export const STAGE11_OUTPUT_SCHEMA = 'player_character_dossier';
export const STAGE11_GAME_PROFILE_SCHEMA = 'player_character_game_profile';

export function buildStage11PlayerCharacterInput(context, options = {}) {
  return {
    version: 1,
    schema: STAGE11_INPUT_SCHEMA,
    request_id: context.requestId,
    normalized_request: options.normalized_request ?? context.requireStageOutput(2, 'normalized request'),
    historical_frame: options.historical_frame ?? context.requireStageOutput(3, 'historical frame'),
    regional_context_package: options.regional_context_package ?? context.requireStageOutput(4, 'regional context package'),
    selected_start_node: options.selected_start_node ?? context.requireStageOutput(9, 'selected start node'),
    start_place_audit: options.start_place_audit ?? context.requireStageOutput(10, 'start place audit'),
    npc_candidate_set: options.npc_candidate_set ?? context.requireStageOutput(7, 'NPC candidate set'),
    item_profile_candidate_set: options.item_profile_candidate_set ?? context.requireStageOutput(8, 'item profile candidate set'),
    character_generation_policy: normalizeCharacterGenerationPolicy(options.character_generation_policy ?? options.policy ?? {})
  };
}

export function normalizeCharacterGenerationPolicy(policy = {}) {
  return {
    allow_random_if_unspecified: policy.allow_random_if_unspecified ?? true,
    preserve_player_intent_core: policy.preserve_player_intent_core ?? true,
    adapt_impossible_request_to_historical_frame: policy.adapt_impossible_request_to_historical_frame ?? true,
    require_social_role_from_candidate_set: policy.require_social_role_from_candidate_set ?? true,
    require_occupation_from_candidate_set: policy.require_occupation_from_candidate_set ?? true,
    require_inventory_from_item_profile_candidates: policy.require_inventory_from_item_profile_candidates ?? true,
    require_property_rules_for_inventory: policy.require_property_rules_for_inventory ?? true,
    require_reason_for_start_place: policy.require_reason_for_start_place ?? true,
    require_body_state: policy.require_body_state ?? true,
    require_character_knowledge_limits: policy.require_character_knowledge_limits ?? true,
    require_sources: policy.require_sources ?? true,
    do_not_create_intro_prose: policy.do_not_create_intro_prose ?? true,
    do_not_materialize_g5: policy.do_not_materialize_g5 ?? true,
    do_not_commit_to_party_db_yet: policy.do_not_commit_to_party_db_yet ?? true,
    allow_empty_or_minimal_inventory: policy.allow_empty_or_minimal_inventory ?? true,
    allow_abstract_background_relations: policy.allow_abstract_background_relations ?? true,
    temporary_source_trace_refs_allowed: policy.temporary_source_trace_refs_allowed ?? true,
    repair_required_for_missing_critical_item_profile: policy.repair_required_for_missing_critical_item_profile ?? true
  };
}

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

  if (output.generation_status === 'requires_repair' && (output.repair_request == null && emptyArray(output.audit_self_check?.concerns))) {
    concerns.push(concern('PLAYER_CHARACTER_REPAIR_REASON_MISSING', 'requires_repair output must explain repair_request or audit_self_check.concerns.', { field: 'generation_status' }));
  }

  return concerns;
}

export function shapePlayerCharacterGameProfile(dossier = {}, audit = {}, options = {}) {
  if (!isPlainObject(dossier)) {
    throw new Error('shapePlayerCharacterGameProfile requires player_character_dossier object.');
  }
  if (dossier.schema !== STAGE11_OUTPUT_SCHEMA) {
    throw new Error(`shapePlayerCharacterGameProfile expected ${STAGE11_OUTPUT_SCHEMA}.`);
  }
  if (audit?.pass !== true && audit?.approval_status !== 'approved_to_persist') {
    throw new Error('shapePlayerCharacterGameProfile requires successful player character audit.');
  }
  const characterId = firstText(
    dossier.identity?.character_id,
    dossier.character_id,
    dossier.player_character_id,
    'player_character_001'
  );
  return {
    version: 1,
    schema: STAGE11_GAME_PROFILE_SCHEMA,
    request_id: dossier.request_id ?? options.request_id ?? null,
    player_character_id: characterId,
    character_id: characterId,
    dossier_ref: {
      schema: STAGE11_OUTPUT_SCHEMA,
      character_id: characterId,
      source_trace: structuredClone(dossier.source_trace ?? [])
    },
    identity: structuredClone(dossier.identity ?? {}),
    social_status: structuredClone(dossier.social_status ?? {}),
    origin: structuredClone(dossier.origin ?? {}),
    body: structuredClone(dossier.body ?? {}),
    attributes: structuredClone(dossier.attributes ?? {}),
    skills: structuredClone(dossier.skills ?? {}),
    knowledge: structuredClone(dossier.knowledge ?? {}),
    memory: structuredClone(dossier.memory ?? {}),
    goals: structuredClone(dossier.goals ?? {}),
    inventory: structuredClone(dossier.inventory ?? {}),
    property_and_access: structuredClone(dossier.property_and_access ?? {}),
    relations: structuredClone(dossier.relations ?? {}),
    start_place_connection: structuredClone(dossier.start_place_connection ?? {}),
    constraints_and_risks: structuredClone(dossier.constraints_and_risks ?? {}),
    selected_candidate_refs: structuredClone(dossier.selected_candidate_refs ?? {}),
    source_trace: structuredClone(dossier.source_trace ?? []),
    approved_by_audit: structuredClone(audit),
    shaping_policy: {
      code_only: true,
      no_new_semantic_facts: true,
      no_inventory_creation: true,
      no_npc_creation: true,
      no_g5_materialization: true
    }
  };
}

export async function runStage11PlayerCharacterBlock({ input, executor }) {
  const inputConcerns = validateStage11PlayerCharacterInput(input);
  if (inputConcerns.length > 0) {
    return {
      version: 1,
      schema: STAGE11_OUTPUT_SCHEMA,
      request_id: input?.request_id ?? null,
      generation_status: 'blocked',
      audit_self_check: { pass: false, concerns: inputConcerns, evidence: [] }
    };
  }
  if (typeof executor !== 'function') {
    throw new Error('runStage11PlayerCharacterBlock requires executor.');
  }
  return executor({ input, stage: { id: 11, slug: 'player_character', output_schema: STAGE11_OUTPUT_SCHEMA } });
}

function validateHistoricalFrameCompatibility(output, historicalFrame = {}) {
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

function validateStartNodeCompatibility(output, selectedStartNode = {}) {
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

function validateBodyStates(output) {
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

function validateAttributes(output) {
  const concerns = [];
  const attributes = output.attributes ?? {};
  const values = extractNumericNamedValues(attributes, ['strength', 'dexterity', 'endurance', 'reason', 'attention', 'influence', 'сила', 'ловкость', 'выносливость', 'разум', 'внимание', 'влияние']);
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

function validateSkills(output) {
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

function validateInventory(output, input) {
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

function validateRelations(output, input) {
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

function validateKnowledgeBoundaries(output) {
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

function validateForbiddenStage11Fields(output) {
  const concerns = [];
  if (output.visible_scene !== undefined || output.visible_context !== undefined) concerns.push(concern('PLAYER_CHARACTER_CREATED_VISIBLE_SCENE', 'Stage 11 must not create visible_scene/visible_context.', { field: 'visible_scene' }));
  if (output.intro_prose !== undefined || output.narrator_prose !== undefined || output.prose !== undefined) concerns.push(concern('PLAYER_CHARACTER_CREATED_INTRO_PROSE', 'Stage 11 must not create intro/narrator prose.', { field: 'intro_prose' }));
  for (const field of ['g5_scene', 'g5_scene_graph_draft', 'g5_anchor_id', 'anchor_id', 'minilocation_id', 'current_position']) {
    if (output[field] !== undefined) concerns.push(concern('PLAYER_CHARACTER_CREATED_G5', `Stage 11 must not create ${field}.`, { field }));
  }
  return concerns;
}

function validateSourceTrace(output, input) {
  const concerns = [];
  if (input.character_generation_policy?.require_sources !== false && !nonEmptyArray(output.source_trace)) {
    concerns.push(concern('PLAYER_CHARACTER_SOURCE_MISSING', 'source_trace must not be empty.', { field: 'source_trace' }));
  }
  return concerns;
}

function validateAuditSelfCheck(output) {
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

function hasNullOccupationReason(output) {
  return hasAnyText(output, ['occupation_null_reason', 'why_occupation_is_null', 'occupation_reason'])
    || hasAnyText(output.social_status, ['occupation_null_reason', 'why_occupation_is_null'])
    || hasAnyText(output.selected_candidate_refs, ['occupation_null_reason', 'why_occupation_is_null']);
}

function hasStartPlaceReason(output) {
  return hasAnyText(output.start_place_connection, ['reason', 'why_here', 'why_now', 'basis'])
    || hasAnyText(output, ['reason_for_start_place', 'why_here', 'why_now']);
}

function hasImmediateNeed(output) {
  return hasAnyText(output.goals, ['immediate_need', 'need_now', 'current_need'])
    || hasAnyText(output, ['immediate_need']);
}

function hasConsequenceOfInaction(output) {
  return hasAnyText(output.goals, ['consequence_of_inaction', 'inaction_consequence'])
    || hasAnyText(output.constraints_and_risks, ['consequence_of_inaction', 'inaction_consequence'])
    || hasAnyText(output, ['consequence_of_inaction']);
}

function collectSocialRoleIds(root) {
  return collectCandidateIdsDeep(root, ['social_role_id', 'role_id', 'id', 'candidate_id'], (path) => /social|role|roles/u.test(path));
}

function collectOccupationIds(root) {
  return collectCandidateIdsDeep(root, ['occupation_id', 'id', 'candidate_id'], (path) => /occupation|occupations|заняти/u.test(path));
}

function collectItemProfileIds(root) {
  const direct = collectCandidateIdSet(root?.item_profile_candidates ?? []);
  if (direct.size > 0) return direct;
  return collectCandidateIdsDeep(root, ['item_profile_candidate_id', 'item_profile_id', 'profile_id', 'id', 'candidate_id'], (path) => /item_profile|item_profiles|item/u.test(path));
}

function collectNpcCandidateIds(root) {
  const direct = collectCandidateIdSet(root?.npc_candidates ?? []);
  if (direct.size > 0) return direct;
  return collectCandidateIdsDeep(root, ['npc_candidate_id', 'npc_id', 'id', 'candidate_id'], (path) => /npc|candidate/u.test(path));
}

function collectCandidateIdSet(value) {
  const ids = new Set();
  for (const item of collectArrayLike(value)) {
    const id = firstText(item?.id, item?.candidate_id, item?.item_profile_candidate_id, item?.container_profile_candidate_id, item?.property_rule_candidate_id, item?.npc_candidate_id, item?.social_role_id, item?.occupation_id);
    if (id) ids.add(id);
  }
  return ids;
}

function collectCandidateIdsDeep(root, idKeys, pathPredicate = () => true) {
  const ids = new Set();
  walk(root, (value, path) => {
    if (!isPlainObject(value) || !pathPredicate(path)) return;
    for (const key of idKeys) {
      if (text(value[key])) ids.add(value[key]);
    }
  });
  return ids;
}

function collectInventoryItems(inventory) {
  const items = [];
  walk(inventory, (value, path) => {
    if (!isPlainObject(value)) return;
    const meaningful = hasAny(value, ['item_profile_candidate_id', 'item_profile_id', 'profile_id', 'item_id', 'name', 'title', 'label'])
      && !/summary|total|load|occupied_hands|policy/u.test(path);
    if (meaningful) items.push({ ...value, __path: path });
  });
  return dedupeObjects(items);
}

function collectRelationObjects(relations) {
  const relationObjects = [];
  walk(relations, (value, path) => {
    if (!isPlainObject(value)) return;
    const looksLikeRelation = hasAny(value, ['relation_mode', 'npc_candidate_id', 'npc_id', 'person_label', 'relationship', 'relation_type'])
      && !/summary|policy/u.test(path);
    if (looksLikeRelation) relationObjects.push({ ...value, __path: path });
  });
  return dedupeObjects(relationObjects);
}

function collectSkillObjects(skills) {
  const out = [];
  walk(skills, (value, path) => {
    if (isPlainObject(value)) {
      const bonus = value.bonus ?? value.skill_bonus ?? value.value;
      if (bonus !== undefined && path !== 'root') {
        out.push({
          name: value.name ?? value.skill_id ?? path.split('.').at(-1),
          bonus,
          basis: value.basis ?? value.reason ?? value.biographical_basis ?? value.why,
          category: value.category ?? value.skill_group ?? '',
          path
        });
      }
    } else if (typeof value === 'number' && path !== 'root') {
      out.push({ name: path.split('.').at(-1), bonus: value, basis: readSiblingBasis(skills, path), category: '', path });
    }
  });
  return out;
}

function extractNumericNamedValues(root, names = []) {
  const out = [];
  walk(root, (value, path) => {
    if (typeof value !== 'number') return;
    const lower = path.toLowerCase();
    if (names.some((name) => lower.endsWith(`.${name}`) || lower.includes(`.${name}.`) || lower.endsWith(String(name).toLowerCase()))) {
      out.push({ path, value });
    }
  });
  if (out.length === 0 && isPlainObject(root)) {
    for (const [key, value] of Object.entries(root)) {
      if (typeof value === 'number') out.push({ path: `attributes.${key}`, value });
      if (isPlainObject(value) && typeof value.value === 'number') out.push({ path: `attributes.${key}.value`, value: value.value });
    }
  }
  return out;
}

function hasPropertyInventoryConfusion(output) {
  const inventoryText = JSON.stringify(output.inventory ?? {}).toLowerCase();
  return /not[_ -]?carried|не при персонаже|outside physical access|имущество вне доступа/u.test(inventoryText);
}

function hasMilitaryOrHunterBasis(output) {
  const textValue = JSON.stringify({ origin: output.origin, social_status: output.social_status, skills: output.skills }).toLowerCase();
  return /warrior|military|guard|retainer|hunter|охот|воин|дружин|сторож|ратн/u.test(textValue);
}

function isCombatSkill(skill) {
  const textValue = `${skill.name ?? ''} ${skill.category ?? ''}`.toLowerCase();
  return /combat|melee|ranged|bow|weapon|бой|ближ|дальн|оруж|лук|копь|меч/u.test(textValue);
}

function readSiblingBasis(root, path) {
  const parentPath = path.split('.').slice(1, -1);
  let current = root;
  for (const key of parentPath) current = current?.[key];
  return current?.basis ?? current?.reason ?? null;
}

function walk(value, visitor, path = 'root', seen = new Set()) {
  if (value && typeof value === 'object') {
    if (seen.has(value)) return;
    seen.add(value);
  }
  visitor(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, `${path}[${index}]`, seen));
  } else if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key === '__path') continue;
      walk(child, visitor, `${path}.${key}`, seen);
    }
  }
}

function collectArrayLike(value) {
  if (Array.isArray(value)) return value;
  if (isPlainObject(value)) return Object.values(value).filter((item) => isPlainObject(item));
  return [];
}

function dedupeObjects(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.__path ?? JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasAny(object, keys) {
  if (!isPlainObject(object)) return false;
  return keys.some((key) => object[key] !== undefined && object[key] !== null && object[key] !== '');
}

function hasAnyNested(object, keys) {
  let found = false;
  walk(object, (value, path) => {
    if (found) return;
    const last = path.split('.').at(-1)?.replace(/\[\d+\]$/u, '');
    if (keys.includes(last) && value !== undefined && value !== null && value !== '') found = true;
  });
  return found;
}

function hasAnyNestedText(object, keys) {
  let found = false;
  walk(object, (value, path) => {
    if (found) return;
    const last = path.split('.').at(-1)?.replace(/\[\d+\]$/u, '');
    if (keys.includes(last) && text(value)) found = true;
    if (keys.includes(last) && isPlainObject(value) && Object.keys(value).length > 0) found = true;
  });
  return found;
}

function hasAnyText(object, keys) {
  if (!isPlainObject(object)) return false;
  return keys.some((key) => text(object[key]) || (Array.isArray(object[key]) && object[key].some(text)));
}

function firstText(...values) {
  for (const value of values) {
    if (text(value)) return String(value).trim();
  }
  return null;
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function emptyArray(value) {
  return Array.isArray(value) && value.length === 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function inRange(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}
