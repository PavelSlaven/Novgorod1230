import { pickStartMicroLocation } from './cluster.js';
import { normalizeAccessValue, normalizePlacementValue } from './item-access.js';
import { allowsProceduralSemantics } from './semantic-gate.js';
import { migrateSkillKeys } from './social-generation-gate.js';

const ATTRIBUTE_KEYS = ['strength', 'agility', 'endurance', 'reason', 'attention', 'influence'];
const SKILL_KEYS = ['athletics', 'stealth', 'melee_combat', 'ranged_combat', 'craft', 'household', 'survival', 'travel_transport', 'healing', 'observation', 'communication_trade', 'custom_law_literacy'];
const PLAYER_SEED_SOURCE = 'player_seed';
const SKILL_PATTERNS = {
  athletics: [/(бег|нести|тащ|борь|сила|лаз|перенос)/i],
  stealth: [/(скрыт|крад|тих|незамет|тайн)/i],
  melee_combat: [/(меч|копь|нож|топор|дубин|щит|драка|воин|служ|страж|дружин|рат|охот)/i],
  ranged_combat: [/(лук|арбал|пращ|метан|стрел|охот|лучник)/i],
  craft: [/(ремесл|плотн|столяр|кузн|портн|шве|гонч|тесл|долото|инструм|почин|мастер)/i],
  household: [/(хозяйств|очаг|скот|зерн|еда|дом|быт|припас|пахар|земледел|крестьяни)/i],
  survival: [/(дорог|лес|след|погод|вода|брод|болот|зимник|тракт|охот|рыб)/i],
  travel_transport: [/(лошад|конь|седло|повод|упряж|всад)/i],
  healing: [/(леч|рана|кров|знах|трав|болен|перевяз|лекар|повив|мед)/i],
  observation: [/(наблюд|смотр|слух|замет|видел|след|караул)/i],
  communication_trade: [/(говор|прос|убежд|торг|объясн|спор|догов|купец|посол|старост)/i],
  custom_law_literacy: [/(обыч|закон|прав|статус|поручител|собствен|пошлин|суд|княз|тиун|дьяк)/i]
};
const COMBAT_SKILL_KEYS = ['athletics', 'stealth', 'melee_combat', 'ranged_combat'];

export function enrichPlayerProfile(player = {}, context = {}) {
  return enrichActorProfile(player, { ...context, kind: 'player' });
}

export function enrichNpcProfile(npc = {}, context = {}) {
  return enrichActorProfile(npc, { ...context, kind: 'npc' });
}

export function buildCurrentPosition(world = {}, overrides = {}) {
  const previousPosition = world?.current_position && typeof world.current_position === 'object' ? world.current_position : {};
  const hasOverride = (key) => Object.prototype.hasOwnProperty.call(overrides, key);
  const preferredLocationId = hasOverride('location_id')
    ? stringOrNull(overrides.location_id)
    : stringOrNull(previousPosition.location_id ?? null);
  const currentLocation = world?.locations?.[preferredLocationId] ?? null;
  const preferredMicroLocationId = hasOverride('minilocation_id')
    ? stringOrNull(overrides.minilocation_id)
    : (hasOverride('minilocationId')
      ? stringOrNull(overrides.minilocationId)
      : stringOrNull(previousPosition.minilocation_id ?? null));
  const currentMicroLocation = resolveMicroLocation(world, currentLocation, preferredMicroLocationId);
  const startPosition = world?.cluster?.startPosition ?? null;
  const canonicalPlaceId = hasOverride('place_id')
    ? stringOrNull(overrides.place_id)
    : stringOrNull(world?.placeSeed?.id ?? previousPosition.place_id ?? null);
  const derivedAnchorId = currentLocation
    ? (currentMicroLocation?.entryPoints?.[0]?.id ?? currentMicroLocation?.doors?.[0]?.id ?? null)
    : (startPosition?.entryPointId ?? null);
  return normalizePosition({
    region_id: overrides.region_id ?? previousPosition.region_id ?? resolveRegionId(world),
    place_id: canonicalPlaceId ?? currentLocation?.id ?? world?.place?.id ?? null,
    location_id: preferredLocationId ?? currentLocation?.id ?? null,
    minilocation_id: currentLocation
      ? currentMicroLocation?.id ?? preferredMicroLocationId ?? null
      : preferredMicroLocationId ?? null,
    anchor_id: hasOverride('anchor_id')
      ? stringOrNull(overrides.anchor_id)
      : derivedAnchorId,
    last_route_id: overrides.last_route_id ?? previousPosition.last_route_id ?? startPosition?.routeId ?? null
  });
}

export function syncCurrentPosition(world = {}, overrides = {}) {
  if (!world || typeof world !== 'object') return null;
  const previousPosition = world.current_position && typeof world.current_position === 'object' ? world.current_position : {};
  const currentPosition = buildCurrentPosition(world, overrides);
  const minilocationId = currentPosition.minilocation_id ?? null;
  const anchorId = currentPosition.anchor_id ?? null;
  const lastRouteId = currentPosition.last_route_id ?? previousPosition.last_route_id ?? null;
  world.current_position = {
    ...currentPosition,
    region_id: currentPosition.region_id ?? previousPosition.region_id ?? null,
    place_id: currentPosition.place_id ?? previousPosition.place_id ?? null,
    location_id: currentPosition.location_id ?? previousPosition.location_id ?? null,
    minilocation_id: minilocationId,
    anchor_id: anchorId,
    last_route_id: lastRouteId
  };
  world.currentLocationId = world.current_position.location_id ?? world.currentLocationId ?? previousPosition.location_id ?? null;
  world.currentMicroLocationId = minilocationId;
  if (world.player && typeof world.player === 'object') {
    world.player.position = structuredClone(world.current_position);
  }
  return world.current_position;
}

export function syncActorInventoryProfile(actor = {}, context = {}) {
  if (!actor || typeof actor !== 'object') return actor;

  const next = { ...actor };
  if ('items' in next) {
    delete next.items;
  }

  const kind = context.kind ?? (next.id === 'player' ? 'player' : 'npc');
  return kind === 'player'
    ? enrichPlayerProfile(next, context)
    : enrichNpcProfile(next, context);
}

export function syncActorStateProfile(actor = {}, context = {}) {
  if (!actor || typeof actor !== 'object') return actor;

  const next = { ...actor };
  const hasCanonicalItems = next.items && typeof next.items === 'object' && !Array.isArray(next.items);
  const hasInventory = Array.isArray(next.inventory);
  const hasProperty = Array.isArray(next.property);
  if ((hasInventory || hasProperty) && !hasCanonicalItems) {
    delete next.items;
  }
  delete next.needs;

  const kind = context.kind ?? (next.id === 'player' ? 'player' : 'npc');
  return kind === 'player'
    ? enrichPlayerProfile(next, context)
    : enrichNpcProfile(next, context);
}

function enrichActorProfile(source = {}, context = {}) {
  if (!source || typeof source !== 'object') return source;

  const next = { ...source };
  const legacyStates = buildLegacyStates(next);
  const activeStates = buildActiveStates(next, legacyStates);
  const position = buildPositionProfile(next, context);

  next.identity = buildIdentityProfile(next);
  next.body = buildBodyProfile(next, legacyStates, activeStates);
  next.states = legacyStates;
  next.activeStates = activeStates;
  next.attributes = buildAttributesProfile(next);
  next.skill_bonuses = buildSkillBonusesProfile(next);
  next.items = buildItemsProfile(next, next.id ?? context.actorId ?? null);
  delete next.inventory;
  delete next.property;
  delete next.load_category;
  next.knowledge_map = buildKnowledgeMapProfile(next);
  next.memory_profile = buildMemoryProfile(next);
  next.goals_profile = buildGoalsProfile(next);
  next.property_and_access = buildPropertyAccessProfile(next, next.id ?? context.actorId ?? null);
  next.relations = buildRelationsProfile(next);
  next.position = position;
  next.needs = buildNeedsProfile(next, legacyStates);
  mirrorBodyStateFields(next);
  return next;
}

function buildIdentityProfile(source = {}) {
  const actorProfile = source.actorProfile && typeof source.actorProfile === 'object' ? source.actorProfile : {};
  return {
    name: stringOrNull(source.name ?? actorProfile.identity?.name),
    age_range: stringOrNull(source.ageRange ?? actorProfile.identity?.ageRange),
    origin: stringOrNull(source.origin ?? actorProfile.identity?.origin),
    social_status: stringOrNull(source.socialClass ?? source.status ?? actorProfile.identity?.socialPosition ?? actorProfile.identity?.visibleStatus),
    occupation_or_role: stringOrNull(source.occupation ?? source.role ?? actorProfile.work?.occupation),
    visible_status: stringOrNull(source.visibleStatus ?? source.status ?? actorProfile.identity?.visibleStatus),
    true_status: stringOrNull(source.trueStatus ?? source.status ?? actorProfile.identity?.trueStatus),
    reason_here: stringOrNull(source.reasonHere ?? actorProfile.identity?.reasonHere)
  };
}

function buildBodyProfile(source = {}, states = {}, activeStates = []) {
  const actorProfile = source.actorProfile && typeof source.actorProfile === 'object' ? source.actorProfile : {};
  const injuries = Array.isArray(source.injuries) ? source.injuries : [];
  const bodyBlock = source.body && typeof source.body === 'object' ? source.body : {};
  const explicitMarks = uniqueStrings([
    ...(Array.isArray(bodyBlock.visible_marks) ? bodyBlock.visible_marks : []),
    ...(Array.isArray(bodyBlock.visibleMarks) ? bodyBlock.visibleMarks : []),
    ...(Array.isArray(source.visible_marks) ? source.visible_marks : []),
    ...(injuries.map((item) => item?.label ?? item?.text ?? item?.name).filter(Boolean))
  ], 6);
  const legacyBodyText = String(source.bodyState ?? actorProfile.body?.bodyState ?? '').trim();
  const visibleMarks = isPlayerSeedSource(source)
    ? explicitMarks
    : uniqueStrings([...explicitMarks, ...(legacyBodyText ? [legacyBodyText] : [])], 6);

  return {
    description: stringOrNull(source.bodyState ?? actorProfile.body?.bodyState ?? bodyBlock.description),
    visible_marks: visibleMarks,
    clothing: stringOrNull(source.clothing ?? actorProfile.body?.clothing ?? bodyBlock.clothing),
    health: states.health ?? 100,
    satiety: states.satiety ?? 100,
    vigor: states.vigor ?? 100,
    active_conditions: activeStates.length > 0
      ? activeStates.map((state) => state.label).filter(Boolean)
      : uniqueStrings(bodyBlock.active_conditions ?? actorProfile.body?.active_conditions ?? [])
  };
}

function buildLegacyStates(source = {}) {
  const actorProfile = source.actorProfile && typeof source.actorProfile === 'object' ? source.actorProfile : {};
  const body = source.body && typeof source.body === 'object' ? source.body : {};
  const health = clampState(pickNumeric(
    source.states?.health,
    body.health,
    source.health,
    actorProfile.body?.health,
    100
  ));
  const satietySource = pickNumeric(
    source.states?.satiety,
    body.satiety,
    source.satiety,
    source.needs?.satiety,
    100 - 20
  );
  const vigorSource = pickNumeric(
    source.states?.vigor,
    body.vigor,
    source.vigor,
    source.needs?.vigor,
    100 - 20
  );
  return {
    health,
    satiety: clampState(satietySource),
    vigor: clampState(vigorSource)
  };
}

function buildActiveStates(source = {}, states = {}) {
  const list = [];

  if (Array.isArray(source.activeStates)) {
    for (const state of source.activeStates) {
      const normalized = normalizeActiveState(state);
      if (normalized) list.push(normalized);
    }
  }

  const bleeding = Number(source.bleeding ?? source.actorProfile?.body?.bleeding ?? 0);
  const pain = Number(source.pain ?? source.actorProfile?.body?.pain ?? 0);
  const intoxication = Number(source.intoxication ?? source.actorProfile?.body?.intoxication ?? 0);

  if (!list.some((item) => item.id === 'bleeding') && bleeding > 0) {
    list.push(makeActiveState('bleeding', 'кровотечение', bleeding, 'derived'));
  }
  if (!list.some((item) => item.id === 'pain') && pain > 0) {
    list.push(makeActiveState('pain', 'боль', pain, 'derived'));
  }
  if (!list.some((item) => item.id === 'intoxication') && intoxication > 0) {
    list.push(makeActiveState('intoxication', 'опьянение', intoxication, 'derived'));
  }

  if ((Array.isArray(source.injuries) ? source.injuries.length : 0) > 0 && !list.some((item) => item.id === 'injury')) {
    list.push(makeActiveState('injury', 'рана', Math.min(100, 20 + (source.injuries.length * 10)), 'derived'));
  }

  return list;
}

function buildAttributesProfile(source = {}) {
  if (source.attributes && typeof source.attributes === 'object') {
    const next = {};
    for (const key of ATTRIBUTE_KEYS) {
      next[key] = clampAttribute(source.attributes[key], key);
    }
    return next;
  }

  if (isPlayerSeedSource(source) && !allowsProceduralSemantics(source)) {
    return Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, 10]));
  }

  const text = [
    source.role,
    source.occupation,
    source.status,
    source.socialClass,
    source.bodyState,
    source.visibleStatus,
    source.trueStatus,
    source.actorProfile?.work?.occupation,
    ...(Array.isArray(source.skills) ? source.skills : [])
  ].map((item) => String(item ?? '').toLowerCase()).join(' ');

  let strength = 10;
  let agility = 10;
  let endurance = 10;
  let reason = 10;
  let attention = 10;
  let influence = 10;

  if (/(крест|земледел|пахар|лес|охот|рыб)/i.test(text)) {
    strength += 1;
    endurance += 1;
  }
  if (/(торг|купец|менял|счёт|пошлин|чужезем|посол)/i.test(text)) {
    reason += 1;
    attention += 1;
    influence += 2;
  }
  if (/(монах|письм|книж|чинов|старост|тиун|дьяк)/i.test(text)) {
    reason += 2;
    attention += 1;
    influence += 1;
  }
  if (/(служ|воин|дружин|сторож|охран|погон|копь|меч|лук)/i.test(text)) {
    strength += 1;
    agility += 1;
    endurance += 1;
    attention += 1;
  }
  if (/(знах|леч|повив|трав|мед)/i.test(text)) {
    reason += 1;
    attention += 1;
    influence += 1;
  }
  if (/(хром|слаб|болен|истощ|устал|калек|стар)/i.test(text)) {
    strength -= 1;
    agility -= 1;
    endurance -= 1;
  }

  const next = {
    strength: clampAttribute(strength),
    agility: clampAttribute(agility),
    endurance: clampAttribute(endurance),
    reason: clampAttribute(reason),
    attention: clampAttribute(attention),
    influence: clampAttribute(influence)
  };
  return isPlayerSeedSource(source) && allowsProceduralSemantics(source) ? balanceStartAttributes(next) : next;
}

function buildSkillBonusesProfile(source = {}) {
  if (source.skill_bonuses && typeof source.skill_bonuses === 'object') {
    return normalizeSkillMap(source.skill_bonuses);
  }
  if (source.skillsProfile && typeof source.skillsProfile === 'object') {
    return normalizeSkillMap(source.skillsProfile);
  }

  if (isPlayerSeedSource(source) && !allowsProceduralSemantics(source)) {
    return Object.fromEntries(SKILL_KEYS.map((key) => [key, 0]));
  }

  const text = [
    source.role,
    source.occupation,
    source.status,
    source.socialClass,
    source.bodyState,
    source.actorProfile?.work?.occupation,
    ...(Array.isArray(source.skills) ? source.skills : []),
    ...(Array.isArray(source.knowledge) ? source.knowledge : []),
    ...(Array.isArray(source.memory) ? source.memory : [])
  ].map((item) => String(item ?? '').toLowerCase()).join(' ');

  const skills = Object.fromEntries(SKILL_KEYS.map((key) => [key, 0]));
  boostSkill(skills, 'athletics', text, SKILL_PATTERNS.athletics, 1);
  boostSkill(skills, 'stealth', text, SKILL_PATTERNS.stealth, 2);
  boostSkill(skills, 'melee_combat', text, SKILL_PATTERNS.melee_combat, 1);
  boostSkill(skills, 'ranged_combat', text, SKILL_PATTERNS.ranged_combat, 1);
  boostSkill(skills, 'craft', text, SKILL_PATTERNS.craft, 2);
  boostSkill(skills, 'household', text, SKILL_PATTERNS.household, 2);
  boostSkill(skills, 'survival', text, SKILL_PATTERNS.survival, 2);
  boostSkill(skills, 'travel_transport', text, SKILL_PATTERNS.travel_transport, 2);
  boostSkill(skills, 'healing', text, SKILL_PATTERNS.healing, 2);
  boostSkill(skills, 'observation', text, SKILL_PATTERNS.observation, 2);
  boostSkill(skills, 'communication_trade', text, SKILL_PATTERNS.communication_trade, 2);
  boostSkill(skills, 'custom_law_literacy', text, SKILL_PATTERNS.custom_law_literacy, 2);

  return isPlayerSeedSource(source) && allowsProceduralSemantics(source) ? balanceStartSkillBonuses(skills, source) : skills;
}

function buildItemsProfile(source = {}, actorId = null) {
  const actorName = String(source.name ?? source.actorProfile?.identity?.name ?? '').trim() || null;
  const itemDefaults = {
    ownerId: actorId,
    holderId: actorId,
    ownerName: actorName,
    holderName: actorName,
    profileSource: source.profileSource ?? null,
    strictSemantic: isPlayerSeedSource(source) && !allowsProceduralSemantics(source)
  };
  if (source.items && typeof source.items === 'object' && !Array.isArray(source.items)) {
    const carried = normalizeItemList(source.items.carried_items ?? source.items.carried ?? (itemDefaults.strictSemantic ? [] : source.inventory), {
      ...itemDefaults,
      placement: 'carried'
    });
    const equipment = normalizeItemList(source.items.equipment, {
      ...itemDefaults,
      placement: 'equipped'
    });
    const weapons = normalizeItemList(source.items.weapons, {
      ...itemDefaults,
      placement: 'equipped'
    });
    const armor = normalizeItemList(source.items.armor, {
      ...itemDefaults,
      placement: 'equipped'
    });
    const property = normalizeItemList(source.items.property_not_carried ?? (itemDefaults.strictSemantic ? [] : source.property), {
      ...itemDefaults,
      holderId: null,
      holderName: null,
      placement: 'property'
    });
    const borrowed = normalizeItemList(source.items.borrowed_items, {
      ...itemDefaults,
      ownerId: source.items.borrowedOwnerId ?? source.borrowedOwnerId ?? null,
      ownerName: source.items.borrowedOwnerName ?? source.borrowedOwnerName ?? null,
      placement: 'borrowed'
    });
    const foreignItems = normalizeItemList(source.items.foreign_items_with_character, {
      ...itemDefaults,
      ownerId: null,
      ownerName: null,
      placement: 'held_for_others'
    });
    const totalWeight = sumWeights(uniqueItemRecords([carried, equipment, weapons, armor, borrowed, foreignItems]));
    const loadRatio = deriveLoadRatio(totalWeight, source.attributes?.strength ?? null);
    return {
      carried_items: carried,
      equipment: equipment.length ? equipment : carried.filter((item) => isEquipmentType(item.type)),
      weapons: weapons.length ? weapons : carried.filter((item) => item.type === 'weapon'),
      armor: armor.length ? armor : carried.filter((item) => item.type === 'armor'),
      total_weight: totalWeight,
      load_ratio: loadRatio,
      load_category: deriveLoadCategory(totalWeight, source.attributes?.strength ?? null),
      property_not_carried: property,
      borrowed_items: borrowed,
      foreign_items_with_character: foreignItems
    };
  }

  const carried = normalizeItemList(itemDefaults.strictSemantic ? [] : source.inventory, {
    ...itemDefaults,
    placement: 'carried'
  });
  const property = normalizeItemList(itemDefaults.strictSemantic ? [] : source.property, {
    ...itemDefaults,
    holderId: null,
    holderName: null,
    placement: 'property'
  });
  const borrowed = normalizeItemList(source.items?.borrowed_items, {
    ...itemDefaults,
    ownerId: source.borrowedOwnerId ?? null,
    ownerName: source.borrowedOwnerName ?? null,
    placement: 'borrowed'
  });
  const foreignItems = normalizeItemList(source.items?.foreign_items_with_character, {
    ...itemDefaults,
    ownerId: null,
    ownerName: null,
    placement: 'held_for_others'
  });
  const totalWeight = sumWeights(uniqueItemRecords([carried, borrowed, foreignItems]));
  const loadRatio = deriveLoadRatio(totalWeight, source.attributes?.strength ?? null);
  return {
    carried_items: carried,
    equipment: carried.filter((item) => isEquipmentType(item.type)),
    weapons: carried.filter((item) => item.type === 'weapon'),
    armor: carried.filter((item) => item.type === 'armor'),
    total_weight: totalWeight,
    load_ratio: loadRatio,
    load_category: deriveLoadCategory(totalWeight, source.attributes?.strength ?? null),
    property_not_carried: property,
    borrowed_items: borrowed,
    foreign_items_with_character: foreignItems
  };
}

function buildKnowledgeMapProfile(source = {}) {
  if (source.knowledge_map && typeof source.knowledge_map === 'object') {
    return {
      known_facts: uniqueStrings(source.knowledge_map.known_facts ?? []),
      rumors: uniqueStrings(source.knowledge_map.rumors ?? []),
      mistakes: uniqueStrings(source.knowledge_map.mistakes ?? []),
      unavailable_knowledge: uniqueStrings(source.knowledge_map.unavailable_knowledge ?? []),
      known_places: uniqueStrings(source.knowledge_map.known_places ?? []),
      known_routes: uniqueStrings(source.knowledge_map.known_routes ?? []),
      known_people: uniqueStrings(source.knowledge_map.known_people ?? [])
    };
  }
  const actorProfile = source.actorProfile && typeof source.actorProfile === 'object' ? source.actorProfile : {};
  return {
    known_facts: uniqueStrings(source.knowledge ?? actorProfile.mind?.knowledge ?? []),
    rumors: uniqueStrings(source.knowledgeHeard ?? actorProfile.mind?.heard ?? []),
    mistakes: uniqueStrings(source.knowledgeMisread ?? actorProfile.mind?.misunderstood ?? []),
    unavailable_knowledge: uniqueStrings(source.knowledgeHidden ?? actorProfile.mind?.hidden ?? []),
    known_places: uniqueStrings(source.knownPlaces ?? []),
    known_routes: uniqueStrings(source.knownRoutes ?? []),
    known_people: uniqueStrings([
      ...(Array.isArray(source.family) ? source.family : []),
      ...(Array.isArray(source.socialLinks) ? source.socialLinks.map((item) => item?.targetName ?? item?.name ?? item?.label).filter(Boolean) : [])
    ])
  };
}

function buildMemoryProfile(source = {}) {
  if (source.memory_profile && typeof source.memory_profile === 'object') {
    return {
      key_memories: uniqueStrings(source.memory_profile.key_memories ?? []),
      debts: uniqueStrings(source.memory_profile.debts ?? []),
      fears: uniqueStrings(source.memory_profile.fears ?? []),
      obligations: uniqueStrings(source.memory_profile.obligations ?? []),
      unresolved_unknowns: uniqueStrings(source.memory_profile.unresolved_unknowns ?? [])
    };
  }
  return {
    key_memories: uniqueStrings(source.memory ?? []),
    debts: uniqueStrings(source.obligations ?? []),
    fears: uniqueStrings(source.fears ?? []),
    obligations: uniqueStrings(source.obligations ?? []),
    unresolved_unknowns: uniqueStrings(source.unknowns ?? source.knowledgeHidden ?? [])
  };
}

function buildGoalsProfile(source = {}) {
  if (source.goals_profile && typeof source.goals_profile === 'object') {
    return {
      immediate_need: stringOrNull(source.goals_profile.immediate_need),
      long_term_desire: stringOrNull(source.goals_profile.long_term_desire),
      fear: stringOrNull(source.goals_profile.fear),
      obligation: stringOrNull(source.goals_profile.obligation),
      reason_to_act: stringOrNull(source.goals_profile.reason_to_act),
      consequence_of_inaction: stringOrNull(source.goals_profile.consequence_of_inaction)
    };
  }
  return {
    immediate_need: firstString(source.goals ?? []),
    long_term_desire: secondString(source.goals ?? []),
    fear: firstString(source.fears ?? []),
    obligation: firstString(source.obligations ?? []),
    reason_to_act: stringOrNull(source.reasonHere ?? source.bodyState),
    consequence_of_inaction: firstString(source.memory ?? [])
  };
}

function buildPropertyAccessProfile(source = {}, actorId = null) {
  const property = normalizeItemList(source.items?.property_not_carried ?? source.property, {
    ownerId: actorId,
    holderId: null,
    ownerName: String(source.name ?? source.actorProfile?.identity?.name ?? '').trim() || null,
    holderName: null,
    placement: 'property'
  });
  const borrowed = normalizeItemList(source.items?.borrowed_items ?? (source.borrowedItems ?? source.borrowed ?? []), {
    ownerId: source.borrowedOwnerId ?? null,
    holderId: actorId,
    ownerName: source.borrowedOwnerName ?? null,
    holderName: String(source.name ?? source.actorProfile?.identity?.name ?? '').trim() || null,
    placement: 'borrowed'
  });
  const foreignItems = normalizeItemList(source.items?.foreign_items_with_character ?? (source.foreignItemsWithCharacter ?? []), {
    ownerId: null,
    holderId: actorId,
    ownerName: null,
    holderName: String(source.name ?? source.actorProfile?.identity?.name ?? '').trim() || null,
    placement: 'held_for_others'
  });
  return {
    property_not_carried: property,
    borrowed_items: borrowed,
    foreign_items_with_character: foreignItems,
    accessible_resources: uniqueStrings(source.access ?? source.actorProfile?.property?.access ?? []),
    return_obligations: uniqueStrings(source.returnObligations ?? source.obligations ?? [])
  };
}

function buildRelationsProfile(source = {}) {
  if (source.relations && typeof source.relations === 'object') {
    return {
      known_npcs: uniqueStrings(source.relations.known_npcs ?? []),
      patrons: uniqueStrings(source.relations.patrons ?? []),
      debtors: uniqueStrings(source.relations.debtors ?? []),
      creditors: uniqueStrings(source.relations.creditors ?? []),
      enemies: uniqueStrings(source.relations.enemies ?? []),
      witnesses: uniqueStrings(source.relations.witnesses ?? []),
      helpers: uniqueStrings(source.relations.helpers ?? []),
      blockers: uniqueStrings(source.relations.blockers ?? [])
    };
  }
  const actorProfile = source.actorProfile && typeof source.actorProfile === 'object' ? source.actorProfile : {};
  return {
    known_npcs: uniqueStrings([
      ...(Array.isArray(source.family) ? source.family : []),
      ...(Array.isArray(source.socialLinks) ? source.socialLinks.map((item) => item?.targetName ?? item?.name ?? item?.label).filter(Boolean) : [])
    ]),
    patrons: uniqueStrings([
      ...(Array.isArray(source.patrons) ? source.patrons : (source.patrons ? [source.patrons] : [])),
      ...(actorProfile.kinship?.answerableTo ? [actorProfile.kinship.answerableTo] : [])
    ]),
    debtors: uniqueStrings(source.debtors ?? []),
    creditors: uniqueStrings(source.creditors ?? []),
    enemies: uniqueStrings(source.enemies ?? []),
    witnesses: uniqueStrings(source.witnesses ?? []),
    helpers: uniqueStrings([
      ...(Array.isArray(source.family) ? source.family : []),
      ...(Array.isArray(source.helpers) ? source.helpers : [])
    ]),
    blockers: uniqueStrings(source.blockers ?? [])
  };
}

function buildPositionProfile(source = {}, context = {}) {
  return normalizePosition(source.position ?? source.current_position ?? {
    // Legacy adapter: used only when canonical position is absent.
    region_id: context.region_id ?? null,
    place_id: context.currentLocationId ?? source.locationId ?? source.homeLocation ?? null,
    location_id: context.currentLocationId ?? source.locationId ?? source.homeLocation ?? null,
    minilocation_id: context.currentMicroLocationId ?? source.microLocationId ?? null,
    anchor_id: context.anchor_id ?? null,
    last_route_id: context.last_route_id ?? null
  });
}

function buildNeedsProfile(source = {}, states = {}) {
  return {
    health: clampState(states.health ?? 100),
    bleeding: clampState(source.bleeding ?? 0),
    satiety: clampState(states.satiety ?? 100),
    vigor: clampState(states.vigor ?? 100),
    safety: clampState(source.needs?.safety ?? 10),
    status: clampState(source.needs?.status ?? 10),
    belonging: clampState(source.needs?.belonging ?? 10)
  };
}

export function mirrorBodyStateFields(profile = {}) {
  if (!profile || typeof profile !== 'object') return profile;

  const states = profile.states && typeof profile.states === 'object' ? profile.states : {};
  const body = profile.body && typeof profile.body === 'object' ? profile.body : {};
  const health = clampState(states.health ?? body.health ?? 100);
  const satiety = clampState(states.satiety ?? body.satiety ?? 100);
  const vigor = clampState(states.vigor ?? body.vigor ?? 100);
  const hunger = clampState(100 - satiety);
  const fatigue = clampState(100 - vigor);
  const fear = getActiveStateValue(profile, 'fear');
  const thirst = getActiveStateValue(profile, 'thirst');

  profile.states = {
    health,
    satiety,
    vigor
  };
  profile.health = health;
  profile.satiety = satiety;
  profile.vigor = vigor;
  delete profile.hunger;
  delete profile.fatigue;
  delete profile.sleep;
  // Legacy root fields are kept only as derived adapters for compatibility.
  profile.fear = Number.isFinite(fear) ? fear : clampState(profile.fear ?? 0);
  profile.thirst = Number.isFinite(thirst) ? thirst : clampState(profile.thirst ?? 0);

  if (profile.body && typeof profile.body === 'object') {
    profile.body.health = health;
    profile.body.satiety = satiety;
    profile.body.vigor = vigor;
    profile.body.active_conditions = Array.isArray(profile.activeStates) && profile.activeStates.length > 0
      ? profile.activeStates.map((state) => state?.label ?? state?.name ?? state).filter(Boolean)
      : profile.body.active_conditions;
  }

  if (profile.needs && typeof profile.needs === 'object') {
    profile.needs.health = health;
    profile.needs.satiety = satiety;
    profile.needs.vigor = vigor;
    if (!Number.isFinite(profile.needs.bleeding)) {
      profile.needs.bleeding = clampState(profile.bleeding ?? 0);
    }
  }
  delete profile.legacy_needs;
  delete profile.legacy_vitals;

  return profile;
}

export function getActiveStateValue(profile = {}, stateId = null) {
  const normalizedId = String(stateId ?? '').trim().toLowerCase();
  if (!normalizedId || !Array.isArray(profile?.activeStates)) return null;
  const match = profile.activeStates.find((state) => String(state?.id ?? state?.label ?? '').trim().toLowerCase() === normalizedId);
  if (!match) return null;
  const value = Number(match.value ?? match.intensity ?? 0);
  return Number.isFinite(value) ? clampState(value) : null;
}

export function upsertActiveState(profile = {}, stateId, label, value, source = 'derived') {
  if (!profile || typeof profile !== 'object') return profile;
  const normalizedId = String(stateId ?? '').trim().toLowerCase();
  if (!normalizedId) return profile;
  const activeStates = Array.isArray(profile.activeStates) ? profile.activeStates.slice() : [];
  const nextValue = clampState(value);
  const nextLabel = String(label ?? normalizedId).trim() || normalizedId;
  const index = activeStates.findIndex((state) => String(state?.id ?? state?.label ?? '').trim().toLowerCase() === normalizedId);
  if (nextValue <= 0) {
    if (index >= 0) activeStates.splice(index, 1);
  } else {
    const nextState = {
      id: normalizedId,
      label: nextLabel,
      value: nextValue,
      severity: describeSeverity(nextValue),
      source
    };
    if (index >= 0) {
      activeStates[index] = nextState;
    } else {
      activeStates.push(nextState);
    }
  }
  profile.activeStates = activeStates;
  return profile;
}

export function normalizeItemList(items = [], defaults = {}) {
  const list = Array.isArray(items) ? items : (items ? [items] : []);
  return list.map((item, index) => normalizeItemRecord(item, defaults, index)).filter(Boolean);
}

export function normalizeItemRecord(item, defaults = {}, index = 0) {
  if (item === null || item === undefined) return null;
  const strictSemantic = Boolean(defaults.strictSemantic);
  const procedural = allowsProceduralSemantics(defaults.world);
  if (typeof item === 'string' && strictSemantic) return null;
  if (typeof item === 'object' && !Array.isArray(item)) {
    const label = stringOrNull(item.label ?? item.name ?? item.title ?? defaults.label);
    const type = stringOrNull(item.type ?? item.kind ?? ((strictSemantic || !procedural) ? null : inferItemType(label)));
    const material = stringOrNull(item.material ?? ((strictSemantic || !procedural) ? null : inferItemMaterial(type, label)));
    const condition = stringOrNull(item.condition ?? item.state ?? ((strictSemantic || !procedural) ? null : 'unknown'));
    const weight = clampMaybeNumber(item.weight ?? item.mass ?? ((strictSemantic || !procedural) ? null : estimateItemWeight(label, type)));
    const ownerId = item.owner_id ?? item.ownerId ?? defaults.ownerId ?? null;
    const holderId = item.holder_id ?? item.holderId ?? defaults.holderId ?? null;
    const ownerName = stringOrNull(item.ownerName ?? defaults.ownerName ?? null);
    const holderName = stringOrNull(item.holderName ?? defaults.holderName ?? null);
    const placement = stringOrNull(normalizePlacementValue(item.placement ?? defaults.placement ?? 'carried'));
    const containerId = stringOrNull(item.container_id ?? item.containerId ?? defaults.containerId ?? null);
    const visible = resolveItemVisibilityFlag(item, defaults);
    const access = stringOrNull(normalizeAccessValue(item.access ?? defaults.access ?? ((strictSemantic || !procedural) ? null : inferItemAccess(placement, ownerId, holderId))));
    const marks = uniqueStrings(item.marks ?? item.traces ?? []);
    const discoverability = normalizeDiscoverabilityValue(
      item.discoverability,
      procedural ? inferItemDiscoverability(visible, placement, access, marks) : null
    );
    const nestedDefaults = buildContainedItemDefaults(item, {
      ownerId,
      holderId,
      access,
      visible,
      containerId: stringOrNull(item.id) ?? buildItemId(ownerId, label, index, containerId)
    });
    const contents = normalizeItemList(item.contents ?? item.contained_items ?? item.items ?? [], {
      ownerId: nestedDefaults.ownerId,
      holderId: nestedDefaults.holderId,
      placement: nestedDefaults.placement,
      containerId: nestedDefaults.containerId,
      access: nestedDefaults.access,
      visible: nestedDefaults.visible
    });
    const id = stringOrNull(item.id) ?? buildItemId(ownerId, label, index, containerId);
    if (strictSemantic && (!label || !type || !material || !condition || weight === null || !access)) {
      return null;
    }
    return {
      id,
      label: label ?? `item-${index + 1}`,
      type: type ?? (strictSemantic ? 'item' : inferItemType(label)),
      material,
      condition,
      weight,
      size: stringOrNull(item.size ?? (strictSemantic ? null : inferItemSize(type ?? inferItemType(label)))),
      placement,
      holder_id: holderId,
      owner_id: ownerId,
      holderName,
      ownerName,
      container_id: containerId,
      access,
      function: stringOrNull(item.function ?? item.purpose ?? item.use ?? ((strictSemantic || !procedural) ? null : inferItemFunction(type ?? inferItemType(label), label))),
      discoverability,
      visibility: stringOrNull(item.visibility ?? (procedural ? inferItemVisibility(visible, placement, access) : null)),
      legal_status: stringOrNull(item.legal_status ?? item.legalStatus ?? (procedural ? inferItemLegalStatus(ownerId, holderId, placement, access) : null)),
      plausibility: clampMaybeNumber(item.plausibility ?? ((strictSemantic || !procedural) ? null : inferItemPlausibility(type ?? inferItemType(label), label, material, condition, placement, access, visible, ownerId, holderId, marks, containerId))),
      value: normalizeValueProfile(item.value ?? item.value_profile, procedural ? buildItemValueProfile(type ?? inferItemType(label), label, ownerId, holderId, placement, visible, marks, access) : null),
      risk: clampMaybeNumber(item.risk ?? (procedural ? inferItemRisk(type ?? inferItemType(label), ownerId, holderId, placement, access, visible, marks) : null)),
      visible,
      marks,
      ownership_status: stringOrNull(item.ownership_status ?? item.ownershipStatus ?? (procedural ? inferOwnershipStatus(ownerId, holderId, placement, access, item.legal_status ?? item.legalStatus) : null)),
      holder_status: stringOrNull(item.holder_status ?? item.holderStatus ?? inferHolderStatus(placement, access)),
      contents
    };
  }

  if (strictSemantic) return null;

  const label = String(item).trim();
  if (!label) return null;
  const type = inferItemType(label);
  const weight = estimateItemWeight(label, type);
  const placement = stringOrNull(normalizePlacementValue(defaults.placement ?? 'carried'));
  const access = normalizeAccessValue(defaults.access ?? inferItemAccess(defaults.placement ?? 'carried', defaults.ownerId ?? null, defaults.holderId ?? null));
  const visible = defaults.visible !== false;
  return {
    id: buildItemId(defaults.ownerId ?? defaults.holderId ?? null, label, index, defaults.containerId ?? null),
    label,
    type,
    material: inferItemMaterial(type, label),
    condition: 'unknown',
    weight,
    size: inferItemSize(type),
    placement,
    holder_id: defaults.holderId ?? null,
    owner_id: defaults.ownerId ?? null,
    holderName: stringOrNull(defaults.holderName ?? null),
    ownerName: stringOrNull(defaults.ownerName ?? null),
    container_id: defaults.containerId ?? null,
    access,
    function: inferItemFunction(type, label),
    discoverability: inferItemDiscoverability(visible, placement, access, []),
    visibility: inferItemVisibility(visible, placement, access),
    legal_status: inferItemLegalStatus(defaults.ownerId ?? null, defaults.holderId ?? null, placement, access),
    plausibility: inferItemPlausibility(type, label, null, 'unknown', placement, access, visible, defaults.ownerId ?? null, defaults.holderId ?? null, [], defaults.containerId ?? null),
    value: buildItemValueProfile(type, label, defaults.ownerId ?? null, defaults.holderId ?? null, placement, visible, [], access),
    risk: inferItemRisk(type, defaults.ownerId ?? null, defaults.holderId ?? null, placement, access, visible, []),
    visible,
    marks: [],
    contents: []
  };
}

function resolveItemVisibilityFlag(item = {}, defaults = {}) {
  if (item.visible !== undefined) return item.visible !== false;
  const visibility = String(item.visibility ?? '').trim().toLowerCase();
  if (['hidden', 'secret', 'unknown'].includes(visibility)) return false;
  if (defaults.visible !== undefined) return defaults.visible !== false;
  return true;
}

function buildContainedItemDefaults(item = {}, context = {}) {
  const access = String(context.access ?? '').trim();
  const closed = access === 'closed_container' || context.visible === false || item.visible === false;
  return {
    ownerId: context.ownerId,
    holderId: context.holderId,
    placement: 'contained',
    containerId: context.containerId,
    access: closed ? 'closed_container' : 'contained',
    visible: closed ? false : true
  };
}

function inferItemType(label = '') {
  const text = String(label ?? '').toLowerCase();
  if (/(меч|нож|копь|кинжал|топор|лук|арбал|дубин|пращ|стрел)/i.test(text)) return 'weapon';
  if (/(кольчуг|шлем|брон|доспех|щит|кожаная броня)/i.test(text)) return 'armor';
  if (/(мешок|сумк|кошел|узелок|корзин|чехол|футляр|ларец|сундук)/i.test(text)) return 'container';
  if (/(рубах|плащ|одежд|лапт|сапог|колпак|пояс|поясок)/i.test(text)) return 'clothing';
  if (/(хлеб|сухар|сало|мяс|мёд|зерн|круп|еда|вода|пить|масл)/i.test(text)) return 'food';
  if (/(кресало|трут|игл|ножн|верёв|тесл|топор|пила|игол|шило|молот|серп|коса|инструм)/i.test(text)) return 'tool';
  if (/(лошад|конь|сани|повоз|телег|упряж)/i.test(text)) return 'travel';
  return 'item';
}

function inferItemSize(type) {
  switch (type) {
    case 'weapon':
    case 'armor':
      return 'medium';
    case 'container':
      return 'medium';
    case 'clothing':
      return 'small';
    case 'food':
    case 'tool':
      return 'small';
    default:
      return 'small';
  }
}

function inferItemMaterial(type, label = '') {
  const text = String(label ?? '').toLowerCase();
  if (/(желез|сталь|меч|нож|копь|кинжал|топор|шлем|брон|доспех|щит|замок|ключ)/i.test(text)) return 'железо';
  if (/(дерев|сундук|ящик|посох|копь|лук|арбал|повоз|телег|сан|мост)/i.test(text)) return 'дерево';
  if (/(лен|ткан|рубах|плащ|сумк|мешок|кошел|узелок|корзин|чехол|футляр)/i.test(text)) return 'ткань';
  if (/(кожа|сапог|пояс|ремен|щит)/i.test(text)) return 'кожа';
  if (type === 'food') return 'пища';
  return 'неизвестно';
}

function estimateItemWeight(label = '', type = 'item') {
  if (/(шлем|кольчуг|доспех|брон)/i.test(label)) return 6;
  if (/(щит|меч|копь|топор|лук|арбал)/i.test(label)) return 3;
  if (/(сумк|мешок|корзин|узелок|футляр|чехол)/i.test(label)) return 1;
  if (/(кресало|трут|нож|ложк|игл|шило|ключ)/i.test(label)) return 0.2;
  if (/(хлеб|сухар|сало|мяс|мёд|зерн|круп)/i.test(label)) return 0.5;
  if (/(рубах|плащ|лапт|колпак|пояс)/i.test(label)) return 1;
  if (type === 'container') return 1;
  if (type === 'clothing') return 1;
  if (type === 'food') return 0.5;
  if (type === 'tool') return 1;
  return 0.5;
}

function inferItemFunction(type = 'item', label = '') {
  switch (type) {
    case 'weapon':
      return 'атака и защита';
    case 'armor':
      return 'защита тела';
    case 'container':
      return 'хранение и перенос';
    case 'clothing':
      return 'ношение и тепло';
    case 'food':
      return 'питание';
    case 'tool':
      return 'работа и починка';
    case 'travel':
      return 'путь и перевозка';
    default:
      return /(ключ|печат|знак|оберег|икон)/i.test(label) ? 'доступ и знак' : 'неизвестно';
  }
}

function inferItemAccess(placement = 'carried', ownerId = null, holderId = null) {
  if (placement === 'property') return 'not_carried';
  if (placement === 'borrowed') return 'borrowed';
  if (placement === 'held_for_others') return 'held_for_others';
  if (placement === 'contained') return 'contained';
  if (ownerId && holderId && ownerId !== holderId) return 'restricted';
  return 'immediate';
}

function inferItemVisibility(visible, placement = 'carried', access = 'immediate') {
  if (!visible) return 'hidden';
  if (placement === 'property' || access === 'not_carried') return 'documented';
  if (access && access !== 'immediate') return 'restricted';
  return 'visible';
}

function inferItemDiscoverability(visible, placement = 'carried', access = 'immediate', marks = []) {
  let value = visible ? 4 : 1;
  if (placement === 'property' || access === 'not_carried') value -= 1;
  if (access && access !== 'immediate') value -= 1;
  if (Array.isArray(marks) && marks.length > 0) value += 1;
  return Math.max(0, Math.min(5, value));
}

function inferItemLegalStatus(ownerId, holderId, placement = 'carried', access = 'immediate') {
  if (placement === 'property') return 'ordinary';
  if (placement === 'borrowed' || placement === 'held_for_others') return 'ordinary';
  if (ownerId && holderId && ownerId !== holderId) return 'disputed';
  if (access && ['restricted', 'closed_container'].includes(access)) return 'restricted';
  return 'ordinary';
}

function inferOwnershipStatus(ownerId, holderId, placement = 'carried', access = 'immediate', legalStatus = null) {
  if (ownerId === null && holderId === null) return 'unknown';
  const legal = String(legalStatus ?? '').toLowerCase();
  if (legal === 'stolen') return 'stolen';
  if (placement === 'borrowed' || access === 'borrowed') return 'borrowed';
  if (ownerId && holderId && ownerId !== holderId) return 'disputed';
  return 'owned';
}

function inferHolderStatus(placement = 'carried', access = 'immediate') {
  const normalizedPlacement = String(placement ?? '').toLowerCase();
  if (normalizedPlacement === 'property') return 'stored';
  if (normalizedPlacement === 'equipped') return 'worn';
  if (access === 'closed_container') return 'inaccessible';
  return 'carried';
}

function inferItemRisk(type, ownerId, holderId, placement = 'carried', access = 'immediate', visible = true, marks = []) {
  let risk = 0;
  if (ownerId && holderId && ownerId !== holderId) risk += 2;
  if (placement === 'property' || access === 'not_carried') risk += 1;
  if (access && access !== 'immediate') risk += 1;
  if (!visible) risk += 1;
  if (Array.isArray(marks) && marks.length > 0) risk += 1;
  if (type === 'weapon' || type === 'armor') risk += 1;
  return Math.max(0, Math.min(5, risk));
}

export function inferItemPlausibility(type, label, material, condition, placement = 'carried', access = 'immediate', visible = true, ownerId = null, holderId = null, marks = [], containerId = null) {
  let score = 5;
  const normalizedLabel = String(label ?? '').trim();
  const normalizedType = String(type ?? '').trim().toLowerCase();
  const normalizedCondition = String(condition ?? '').trim().toLowerCase();
  const normalizedAccess = String(access ?? '').trim().toLowerCase();

  if (!normalizedLabel) return 0;
  if (!normalizedType || normalizedType === 'item') score -= 1;
  if (['weapon', 'armor', 'tool', 'travel'].includes(normalizedType) && !String(material ?? '').trim()) score -= 1;
  if (!normalizedCondition || normalizedCondition === 'unknown') score -= 1;
  if (placement === 'contained' || placement === 'borrowed' || placement === 'held_for_others') score -= 0.5;
  if (normalizedAccess === 'restricted' || normalizedAccess === 'closed_container') score -= 0.5;
  if (ownerId && holderId && ownerId !== holderId) score -= 0.5;
  if (!visible) score -= 0.5;
  if (Array.isArray(marks) && marks.length > 0) score += 0.5;
  if (containerId) score += 0.25;

  return Math.max(0, Math.min(5, Math.round(score)));
}

export function normalizeDiscoverabilityValue(value, fallback = null) {
  if (value === undefined || value === null || value === '') {
    return clampMaybeNumber(fallback);
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return clampMaybeNumber(numeric);
  }
  const text = String(value).trim().toLowerCase();
  const map = {
    obvious: 5,
    visible: 5,
    documented: 4,
    partial: 3,
    subtle: 2,
    hidden: 1,
    secret: 1,
    unknown: 0
  };
  if (Object.prototype.hasOwnProperty.call(map, text)) {
    return map[text];
  }
  return clampMaybeNumber(fallback);
}

function buildItemValueProfile(type, label, ownerId, holderId, placement = 'carried', visible = true, marks = [], access = 'immediate') {
  const base = {
    practical: 1,
    exchange: 1,
    status: 0,
    legal: 0,
    personal: 0,
    symbolic: 0,
    risk: inferItemRisk(type, ownerId, holderId, placement, access, visible, marks)
  };
  switch (type) {
    case 'food':
      base.practical = 5;
      break;
    case 'weapon':
    case 'armor':
      base.practical = 4;
      base.exchange = 2;
      base.status = 2;
      base.legal = 1;
      break;
    case 'tool':
      base.practical = 4;
      base.exchange = 2;
      break;
    case 'container':
      base.practical = 3;
      base.exchange = 1;
      break;
    case 'clothing':
      base.practical = 2;
      base.exchange = 1;
      base.status = 1;
      break;
    case 'travel':
      base.practical = 3;
      base.exchange = 1;
      base.status = 1;
      break;
    default:
      break;
  }
  if (placement === 'property' || access === 'not_carried') base.legal = Math.max(base.legal, 1);
  if (ownerId && holderId && ownerId !== holderId) base.legal = Math.max(base.legal, 2);
  if (Array.isArray(marks) && marks.length > 0) base.personal = 1;
  if (/крест|икон|печат|знак|оберег|род|семейн|клейм/i.test(label)) base.symbolic = 2;
  if (!visible) base.status = Math.max(base.status, 1);
  return base;
}

function normalizeValueProfile(value, fallback) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      practical: clampValueFacet(value.practical ?? value.utility ?? fallback.practical),
      exchange: clampValueFacet(value.exchange ?? value.trade ?? fallback.exchange),
      status: clampValueFacet(value.status ?? fallback.status),
      legal: clampValueFacet(value.legal ?? fallback.legal),
      personal: clampValueFacet(value.personal ?? fallback.personal),
      symbolic: clampValueFacet(value.symbolic ?? fallback.symbolic),
      risk: clampValueFacet(value.risk ?? fallback.risk)
    };
  }
  if (Number.isFinite(Number(value))) {
    const numeric = clampValueFacet(value);
    return {
      practical: numeric,
      exchange: numeric,
      status: 0,
      legal: 0,
      personal: 0,
      symbolic: 0,
      risk: fallback.risk
    };
  }
  return fallback;
}

function clampValueFacet(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(5, Math.round(numeric)));
}

function deriveLoadCategory(totalWeight, strength) {
  if (!Number.isFinite(totalWeight) || !Number.isFinite(Number(strength))) return 'unknown';
  const value = Number(strength);
  if (totalWeight <= value * 2) return 'light';
  if (totalWeight <= value * 4) return 'moderate';
  if (totalWeight <= value * 6) return 'heavy';
  return 'overloaded';
}

function deriveLoadRatio(totalWeight, strength) {
  const weight = Number(totalWeight);
  const numericStrength = Number(strength);
  if (!Number.isFinite(weight) || !Number.isFinite(numericStrength) || numericStrength <= 0) return null;
  return Number((weight / numericStrength).toFixed(2));
}

function sumWeights(items = []) {
  let total = 0;
  let hasKnownWeight = false;
  for (const item of Array.isArray(items) ? items : []) {
    const weight = Number(item?.weight);
    if (!Number.isFinite(weight)) continue;
    hasKnownWeight = true;
    total += weight;
    const nested = sumWeights(item?.contents ?? item?.contained_items ?? item?.items ?? []);
    if (Number.isFinite(nested)) {
      hasKnownWeight = true;
      total += nested;
    }
  }
  return hasKnownWeight ? Number(total.toFixed(2)) : null;
}

function uniqueItemRecords(groups = []) {
  const items = [];
  const seen = new Set();

  for (const group of Array.isArray(groups) ? groups : []) {
    for (const item of Array.isArray(group) ? group : []) {
      if (!item || typeof item !== 'object') continue;
      const key = itemRecordKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }

  return items;
}

function itemRecordKey(item = {}) {
  if (!item || typeof item !== 'object') return String(item ?? '');
  const id = String(item.id ?? '').trim();
  if (id) return id;
  return [
    item.label ?? item.name ?? item.title ?? '',
    item.type ?? item.kind ?? '',
    item.owner_id ?? item.ownerId ?? '',
    item.holder_id ?? item.holderId ?? '',
    item.container_id ?? item.containerId ?? '',
    item.placement ?? ''
  ].map((value) => String(value ?? '').trim()).join('|');
}

function normalizeSkillMap(source = {}) {
  const migrated = migrateSkillKeys(source);
  const next = Object.fromEntries(SKILL_KEYS.map((key) => [key, 0]));
  for (const key of SKILL_KEYS) {
    const value = Number(migrated[key]);
    next[key] = Number.isFinite(value) ? clampSkill(value) : 0;
  }
  return next;
}

function boostSkill(target, key, text, patterns, bonus = 1) {
  if (!target[key]) target[key] = 0;
  if (patterns.some((pattern) => pattern.test(text))) {
    target[key] = clampSkill(target[key] + bonus);
  }
}

function isPlayerSeedSource(source = {}) {
  return String(source.profileSource ?? '').trim().toLowerCase() === PLAYER_SEED_SOURCE;
}

function balanceStartAttributes(attributes = {}) {
  const next = {};
  for (const key of ATTRIBUTE_KEYS) {
    next[key] = clampAttribute(attributes[key]);
    if (next[key] > 15) {
      next[key] = 15;
    }
  }

  const rankedKeys = ATTRIBUTE_KEYS
    .slice()
    .sort((a, b) => next[b] - next[a]);
  const highKeys = rankedKeys.filter((key) => next[key] >= 14);

  if (highKeys.length > 2) {
    for (const key of highKeys.slice(2)) {
      next[key] = Math.min(next[key], 13);
    }
  }

  const hasHigh = ATTRIBUTE_KEYS.some((key) => next[key] >= 15);
  const hasTwoFourteenPlus = ATTRIBUTE_KEYS.filter((key) => next[key] >= 14).length >= 2;
  const hasWeakSpot = ATTRIBUTE_KEYS.some((key) => next[key] <= 8);
  if ((hasHigh || hasTwoFourteenPlus) && !hasWeakSpot) {
    const weakestKey = ATTRIBUTE_KEYS.reduce((bestKey, key) => {
      if (!bestKey) return key;
      return next[key] < next[bestKey] ? key : bestKey;
    }, null);
    if (weakestKey) {
      next[weakestKey] = 8;
    }
  }

  return next;
}

function balanceStartSkillBonuses(skills = {}, source = {}) {
  const next = normalizeSkillMap(skills);
  const text = buildSkillSourceText(source);

  for (const key of SKILL_KEYS) {
    if (next[key] > 1 && !supportsSkillKey(text, key)) {
      next[key] = 1;
    }
  }

  const highFourKeys = SKILL_KEYS.filter((key) => next[key] >= 4);
  if (highFourKeys.length > 1) {
    for (const key of highFourKeys.slice(1)) {
      next[key] = 3;
    }
  }

  const highCombatKeys = COMBAT_SKILL_KEYS
    .filter((key) => next[key] > 1)
    .sort((a, b) => next[b] - next[a]);
  if (!hasMartialBasis(text) && highCombatKeys.length > 2) {
    for (const key of highCombatKeys.slice(2)) {
      next[key] = 1;
    }
  }

  return next;
}

function buildSkillSourceText(source = {}) {
  return [
    source.role,
    source.occupation,
    source.status,
    source.socialClass,
    source.bodyState,
    source.visibleStatus,
    source.trueStatus,
    source.actorProfile?.work?.occupation,
    ...(Array.isArray(source.skills) ? source.skills : []),
    ...(Array.isArray(source.knowledge) ? source.knowledge : []),
    ...(Array.isArray(source.memory) ? source.memory : [])
  ].map((item) => String(item ?? '').toLowerCase()).join(' ');
}

function supportsSkillKey(text, key) {
  return (SKILL_PATTERNS[key] ?? []).some((pattern) => pattern.test(text));
}

function hasMartialBasis(text) {
  return /воин|дружин|служ|страж|охот|рат|копь|меч|лук|арбал|стрел|щит|борь|захват/i.test(text);
}

function resolveRegionId(world = {}) {
  const regional = world?.historical?.regionalContext?.current;
  return stringOrNull(
    regional?.id
    ?? regional?.name
    ?? world?.region?.id
    ?? world?.region?.name
    ?? world?.historicalFrame?.regionName
    ?? world?.historical?.regionHint
    ?? null
  );
}

function resolveMicroLocation(world = {}, currentLocation = null, preferredMicroLocationId = null) {
  const location = currentLocation ?? world?.locations?.[world?.current_position?.location_id ?? ''] ?? null;
  const locationId = location?.id ?? world?.current_position?.location_id ?? null;
  const microLocations = world?.cluster?.microLocationsByLocationId?.[locationId ?? ''] ?? [];
  if (preferredMicroLocationId) {
    const preferred = microLocations.find((item) => item.id === preferredMicroLocationId);
    if (preferred) return preferred;
  }
  return pickStartMicroLocation(location, microLocations) ?? microLocations[0] ?? null;
}

function buildItemId(ownerId, label, index, containerId = null) {
  const owner = String(ownerId ?? 'unknown').trim() || 'unknown';
  const container = String(containerId ?? '').trim();
  return container ? `item:${owner}:${slugify(container)}:${slugify(label)}:${index + 1}` : `item:${owner}:${slugify(label)}:${index + 1}`;
}

function normalizePosition(position = {}) {
  if (!position || typeof position !== 'object') {
    return {
      region_id: null,
      place_id: null,
      location_id: null,
      minilocation_id: null,
      anchor_id: null,
      last_route_id: null
    };
  }

  return {
    region_id: stringOrNull(position.region_id ?? position.regionId ?? null),
    place_id: stringOrNull(position.place_id ?? position.placeId ?? null),
    location_id: stringOrNull(position.location_id ?? position.locationId ?? position.place_id ?? position.placeId ?? null),
    minilocation_id: stringOrNull(position.minilocation_id ?? position.minilocationId ?? null),
    anchor_id: stringOrNull(position.anchor_id ?? position.anchorId ?? null),
    last_route_id: stringOrNull(position.last_route_id ?? position.lastRouteId ?? null)
  };
}

function makeActiveState(id, label, value, source = 'legacy') {
  return {
    id,
    label,
    value: clampState(value),
    severity: describeSeverity(value),
    source
  };
}

function normalizeActiveState(state) {
  if (state === null || state === undefined) return null;
  if (typeof state === 'string') {
    const text = state.trim();
    if (!text) return null;
    return makeActiveState(normalizeActiveStateId(text), text, 50);
  }
  if (typeof state !== 'object' || Array.isArray(state)) return null;
  const label = stringOrNull(state.label ?? state.name ?? state.id);
  if (!label) return null;
  return {
    id: normalizeActiveStateId(state.id ?? label),
    label,
    value: clampState(state.value ?? state.intensity ?? 50),
    severity: stringOrNull(state.severity ?? describeSeverity(state.value ?? state.intensity ?? 50)),
    source: stringOrNull(state.source ?? 'adapter')
  };
}

function normalizeActiveStateId(value) {
  const normalized = stringOrNull(value)?.toLowerCase() ?? null;
  if (!normalized) return null;
  if (normalized === 'голод' || normalized === 'hunger') return 'hunger';
  if (normalized === 'усталость' || normalized === 'fatigue') return 'fatigue';
  if (normalized === 'сон' || normalized === 'сонливость' || normalized === 'sleep') return 'sleep';
  return slugify(normalized);
}

function describeSeverity(value) {
  const numeric = clampState(value);
  if (numeric >= 80) return 'critical';
  if (numeric >= 50) return 'high';
  if (numeric >= 20) return 'medium';
  return 'low';
}

function clampState(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function clampAttribute(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 10;
  return Math.max(3, Math.min(18, Math.round(numeric)));
}

function clampSkill(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(4, Math.round(numeric)));
}

function clampMaybeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : null;
}

function pickNumeric(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function stringOrNull(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function firstString(values = []) {
  const list = uniqueStrings(values, 1);
  return list[0] ?? null;
}

function secondString(values = []) {
  const list = uniqueStrings(values, 2);
  return list[1] ?? null;
}

function uniqueStrings(values, limit = Infinity) {
  const next = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = normalizeTextValue(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    next.push(text);
    if (next.length >= limit) break;
  }
  return next;
}

function normalizeTextValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return '';
  if (typeof value === 'object') {
    return String(value.label ?? value.name ?? value.text ?? value.detail ?? '').trim();
  }
  return String(value).trim();
}

function slugify(text) {
  return String(text ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
}

function isEquipmentType(type) {
  return type === 'weapon' || type === 'armor' || type === 'tool' || type === 'clothing' || type === 'container';
}
