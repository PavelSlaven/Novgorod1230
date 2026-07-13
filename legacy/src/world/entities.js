import { normalizeAccessValue, normalizePlacementValue } from './item-access.js';
import { enrichNpcProfile, enrichPlayerProfile, inferItemPlausibility, normalizeDiscoverabilityValue, normalizeItemList } from './profile-v2.js';
import { allowsProceduralSemantics } from './semantic-gate.js';

function proceduralValue(provided, deriveFn, ...args) {
  if (provided !== undefined && provided !== null) return provided;
  return allowsProceduralSemantics() ? deriveFn(...args) : null;
}

function proceduralArray(provided, deriveFn, ...args) {
  if (Array.isArray(provided)) return provided.slice();
  return allowsProceduralSemantics() ? deriveFn(...args) : [];
}

function semanticTextOrNull(value) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

export function buildPlayerProfile(player = {}, context = {}) {
  const items = resolveItemBundle(player);
  const memory = resolvePlayerMemory(player);
  const knowledge = resolvePlayerKnowledge(player);
  const fears = resolvePlayerFears(player);
  const goals = resolvePlayerGoals(player);
  const obligations = resolvePlayerObligations(player);
  const resolvedPlayer = {
    ...player,
    position: player.position ?? context.current_position ?? player.current_position ?? null,
    current_position: player.current_position ?? context.current_position ?? null,
    items,
    memory,
    knowledge,
    fears,
    goals,
    obligations
  };
  const coreVitals = resolveCoreVitals(resolvedPlayer);
  const actorProfile = buildActorProfile(resolvedPlayer, 'player', 0, null, resolvedPlayer);
  const profile = {
    id: semanticTextOrNull(resolvedPlayer.id) ?? 'player',
    name: semanticTextOrNull(resolvedPlayer.name) ?? 'безымянный человек',
    role: semanticTextOrNull(resolvedPlayer.role),
    status: semanticTextOrNull(resolvedPlayer.status),
    socialClass: semanticTextOrNull(resolvedPlayer.socialClass),
    ageRange: resolvedPlayer.ageRange ?? null,
    origin: resolvedPlayer.origin ?? null,
    visibleStatus: semanticTextOrNull(resolvedPlayer.visibleStatus ?? resolvedPlayer.status),
    trueStatus: semanticTextOrNull(resolvedPlayer.trueStatus ?? resolvedPlayer.status),
    reasonHere: semanticTextOrNull(resolvedPlayer.reasonHere),
    profileSource: resolvedPlayer.profileSource ?? null,
    states: resolvedPlayer.states ?? null,
    activeStates: Array.isArray(resolvedPlayer.activeStates) ? resolvedPlayer.activeStates.slice() : [],
    attributes: resolvedPlayer.attributes ?? null,
    skill_bonuses: resolvedPlayer.skill_bonuses ?? null,
    items: resolvedPlayer.items ?? null,
    knowledge_map: resolvedPlayer.knowledge_map ?? null,
    memory_profile: resolvedPlayer.memory_profile ?? null,
    goals_profile: resolvedPlayer.goals_profile ?? null,
    property_and_access: resolvedPlayer.property_and_access ?? null,
    relations: resolvedPlayer.relations ?? null,
    position: resolvedPlayer.position ?? null,
    current_position: resolvedPlayer.current_position ?? null,
    start_scene: resolvedPlayer.start_scene ?? null,
    body: resolvedPlayer.body ?? null,
    health: coreVitals.health,
    satiety: coreVitals.satiety,
    vigor: coreVitals.vigor,
    thirst: Number.isFinite(Number(resolvedPlayer.thirst)) ? Number(resolvedPlayer.thirst) : 0,
    bleeding: resolvedPlayer.bleeding ?? 0,
    injuries: Array.isArray(resolvedPlayer.injuries) ? resolvedPlayer.injuries.slice() : [],
    fear: Number.isFinite(Number(resolvedPlayer.fear)) ? Number(resolvedPlayer.fear) : 0,
    claims: Array.isArray(resolvedPlayer.claims) ? resolvedPlayer.claims.slice() : [],
    family: Array.isArray(resolvedPlayer.family) ? resolvedPlayer.family.slice() : [],
    socialLinks: Array.isArray(resolvedPlayer.socialLinks) ? resolvedPlayer.socialLinks.slice() : [],
    household: resolvedPlayer.household ?? null,
    language: semanticTextOrNull(resolvedPlayer.language),
    literacy: semanticTextOrNull(resolvedPlayer.literacy),
    clothing: semanticTextOrNull(resolvedPlayer.clothing),
    occupation: semanticTextOrNull(resolvedPlayer.occupation ?? actorProfile.work.occupation),
    skills: Array.isArray(resolvedPlayer.skills) && resolvedPlayer.skills.length > 0 ? resolvedPlayer.skills.slice() : actorProfile.work.skills.slice(),
    memory,
    knowledge,
    fears,
    goals,
    obligations,
    bodyState: semanticTextOrNull(resolvedPlayer.bodyState),
    actorProfile,
    needs: {
      satiety: coreVitals.satiety,
      vigor: coreVitals.vigor,
      health: resolvedPlayer.needs?.health ?? coreVitals.health,
      bleeding: resolvedPlayer.needs?.bleeding ?? resolvedPlayer.bleeding ?? 0,
      safety: resolvedPlayer.needs?.safety ?? 10,
      status: resolvedPlayer.needs?.status ?? 10,
      belonging: resolvedPlayer.needs?.belonging ?? 10
    }
  };

  return enrichPlayerProfile(profile, {
    ...context,
    actorId: profile.id
  });
}

function resolvePlayerMemory(player = {}) {
  const canonical = uniqueTextValues(collectTextValues([
    player.memory_profile?.key_memories,
    player.memory_profile?.debts,
    player.memory_profile?.obligations
  ]));
  if (canonical.length > 0) return canonical;
  return Array.isArray(player.memory) ? player.memory.slice() : [];
}

function resolvePlayerKnowledge(player = {}) {
  const canonical = uniqueTextValues(collectTextValues([
    player.knowledge_map?.known_facts,
    player.knowledge_map?.rumors,
    player.knowledge_map?.known_places,
    player.knowledge_map?.known_routes,
    player.knowledge_map?.known_people
  ]));
  if (canonical.length > 0) return canonical;
  return Array.isArray(player.knowledge) ? player.knowledge.slice() : [];
}

function resolvePlayerFears(player = {}) {
  const canonical = uniqueTextValues(collectTextValues([
    player.memory_profile?.fears,
    player.goals_profile?.fear
  ]));
  if (canonical.length > 0) return canonical;
  return Array.isArray(player.fears) ? player.fears.slice() : [];
}

function resolvePlayerGoals(player = {}) {
  const canonical = uniqueTextValues(collectTextValues([
    player.goals_profile?.immediate_need,
    player.goals_profile?.long_term_desire,
    player.goals_profile?.reason_to_act
  ]));
  if (canonical.length > 0) return canonical;
  return Array.isArray(player.goals) ? player.goals.slice() : [];
}

function resolvePlayerObligations(player = {}) {
  const canonical = uniqueTextValues(collectTextValues([
    player.memory_profile?.obligations,
    player.goals_profile?.obligation,
    player.property_and_access?.return_obligations
  ]));
  if (canonical.length > 0) return canonical;
  return Array.isArray(player.obligations) ? player.obligations.slice() : [];
}

function collectTextValues(values = []) {
  const collected = [];
  for (const value of Array.isArray(values) ? values : [values]) {
    if (Array.isArray(value)) {
      collected.push(...value);
      continue;
    }
    if (value !== null && value !== undefined) {
      collected.push(value);
    }
  }
  return collected;
}

function uniqueTextValues(values = []) {
  const next = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value ?? '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    next.push(text);
  }
  return next;
}

function resolveNpcInventory(npc = {}) {
  const items = resolveItemBundle(npc);
  return resolveCarriedItemsFromBundle(items);
}

function resolveNpcProperty(npc = {}) {
  const items = resolveItemBundle(npc);
  return resolvePropertyItemsFromBundle(items);
}

function resolveItemRecordsFromBlocks(blocks = []) {
  const items = [];
  const seen = new Set();

  for (const block of Array.isArray(blocks) ? blocks : []) {
    const normalized = normalizeItemList(block);
    for (const item of normalized) {
      const key = String(item?.id ?? item?.label ?? '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }

  return items;
}

function resolveItemBundle(source = {}) {
  if (source.items && typeof source.items === 'object' && !Array.isArray(source.items)) {
    return normalizeCanonicalItemBundle(source.items);
  }

  return adaptLegacyItemBundle(source);
}

function normalizeCanonicalItemBundle(items = {}) {
  const carried_items = resolveItemRecordsFromBlocks([
    items.carried_items,
    items.carried,
    items.equipment,
    items.weapons,
    items.armor
  ]);
  const property_not_carried = resolveItemRecordsFromBlocks([
    items.property_not_carried,
    items.borrowed_items,
    items.foreign_items_with_character
  ]);

  return {
    ...items,
    carried_items,
    equipment: normalizeItemList(items.equipment),
    weapons: normalizeItemList(items.weapons),
    armor: normalizeItemList(items.armor),
    property_not_carried,
    borrowed_items: normalizeItemList(items.borrowed_items),
    foreign_items_with_character: normalizeItemList(items.foreign_items_with_character)
  };
}

function adaptLegacyItemBundle(source = {}) {
  return {
    carried_items: normalizeItemList(source.inventory, {
      ownerId: source.id ?? null,
      holderId: source.id ?? null,
      placement: 'carried'
    }),
    equipment: [],
    weapons: [],
    armor: [],
    property_not_carried: normalizeItemList(source.property, {
      ownerId: source.id ?? null,
      holderId: null,
      placement: 'property'
    }),
    borrowed_items: [],
    foreign_items_with_character: []
  };
}

function resolveCarriedItemsFromBundle(items = {}) {
  return resolveItemRecordsFromBlocks([
    items.carried_items,
    items.equipment,
    items.weapons,
    items.armor
  ]);
}

function resolvePropertyItemsFromBundle(items = {}) {
  return resolveItemRecordsFromBlocks([
    items.property_not_carried,
    items.borrowed_items,
    items.foreign_items_with_character
  ]);
}

function describeItemFacts(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      return String(item.label ?? item.name ?? item.title ?? item.id ?? '').trim();
    })
    .filter(Boolean);
}

const NPC_PROFILE_LEVELS = new Set(['background', 'scene', 'key']);

export function normalizeNpcProfileLevel(value, fallback = 'background') {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized) {
    if (NPC_PROFILE_LEVELS.has(normalized)) return normalized;
    if (/^(фон|фоновый|фоновый npc|bg)$/i.test(normalized)) return 'background';
    if (/^(сцена|сценический|сценический npc|scene|scenic)$/i.test(normalized)) return 'scene';
    if (/^(ключ|ключевой|ключевой npc|key|важный|основной)$/i.test(normalized)) return 'key';
    if (/фонов/i.test(normalized)) return 'background';
    if (/сцен/i.test(normalized)) return 'scene';
    if (/ключ/i.test(normalized)) return 'key';
  }

  const fallbackLevel = String(fallback ?? '').trim().toLowerCase();
  if (NPC_PROFILE_LEVELS.has(fallbackLevel)) return fallbackLevel;
  return fallback === null || fallback === undefined ? null : 'background';
}

function takeLimitedList(values, limit = Infinity) {
  if (!Array.isArray(values)) return [];
  if (!Number.isFinite(limit) || limit < 0) return values.slice();
  return values.slice(0, limit);
}

export function selectNpcActorProfileDepth(profile = {}, level = null) {
  if (!profile || typeof profile !== 'object') return profile;
  if (profile.kind === 'player') return structuredClone(profile);

  const profileLevel = normalizeNpcProfileLevel(level ?? profile.profileLevel ?? null);
  const next = structuredClone(profile);
  next.profileLevel = profileLevel;
  next.identity ??= {};
  next.kinship ??= {};
  next.property ??= {};
  next.work ??= {};
  next.body ??= {};
  next.mind ??= {};

  if (profileLevel === 'key') {
    return next;
  }

  if (profileLevel === 'background') {
    next.identity.origin = null;
    next.identity.originDetail = null;
    next.identity.socialPosition = null;
    next.identity.trueStatus = null;
    next.kinship.familyFacts = [];
    next.kinship.obligations = [];
    next.kinship.household = null;
    next.kinship.responsibleFor = [];
    next.property.carried = takeLimitedList(next.property.carried, 1);
    next.property.outsideAccess = [];
    next.property.rights = [];
    next.property.ownershipFacts = [];
    next.property.access = [];
    next.work.nextTask = null;
    next.work.dutyWindow = null;
    next.work.interruptionRule = null;
    next.work.skills = takeLimitedList(next.work.skills, 1);
    next.work.routine = [];
    next.work.dutyTo = null;
    next.work.answerableTo = null;
    next.work.responsibleFor = [];
    next.mind.memory = [];
    next.mind.knowledge = [];
    next.mind.seen = [];
    next.mind.heard = [];
    next.mind.misunderstood = [];
    next.mind.hidden = [];
    next.mind.fears = [];
    next.mind.goals = [];
    next.mind.manner = takeLimitedList(next.mind.manner, 1);
    next.mind.speech = takeLimitedList(next.mind.speech, 1);
    return next;
  }

  next.identity.originDetail = null;
  next.identity.trueStatus = null;
  next.kinship.familyFacts = takeLimitedList(next.kinship.familyFacts, 1);
  next.kinship.obligations = takeLimitedList(next.kinship.obligations, 2);
  next.kinship.responsibleFor = takeLimitedList(next.kinship.responsibleFor, 2);
  next.property.carried = takeLimitedList(next.property.carried, 4);
  next.property.outsideAccess = takeLimitedList(next.property.outsideAccess, 2);
  next.property.rights = takeLimitedList(next.property.rights, 2);
  next.property.ownershipFacts = takeLimitedList(next.property.ownershipFacts, 1);
  next.property.access = takeLimitedList(next.property.access, 2);
  next.work.skills = takeLimitedList(next.work.skills, 4);
  next.work.routine = takeLimitedList(next.work.routine, 2);
  next.work.responsibleFor = takeLimitedList(next.work.responsibleFor, 2);
  next.mind.memory = takeLimitedList(next.mind.memory, 2);
  next.mind.knowledge = takeLimitedList(next.mind.knowledge, 2);
  next.mind.seen = takeLimitedList(next.mind.seen, 2);
  next.mind.heard = takeLimitedList(next.mind.heard, 2);
  next.mind.misunderstood = takeLimitedList(next.mind.misunderstood, 1);
  next.mind.hidden = [];
  next.mind.fears = takeLimitedList(next.mind.fears, 2);
  next.mind.goals = takeLimitedList(next.mind.goals, 2);
  next.mind.manner = takeLimitedList(next.mind.manner, 2);
  next.mind.speech = takeLimitedList(next.mind.speech, 2);
  return next;
}

export function applyNpcProfileDepth(npc = {}, level = null) {
  if (!npc || typeof npc !== 'object') return npc;

  const sourceActorProfile = npc.actorProfile && typeof npc.actorProfile === 'object' ? npc.actorProfile : {};
  const profileLevel = normalizeNpcProfileLevel(level ?? npc.profileLevel ?? npc.actorProfile?.profileLevel ?? null, 'background');
  const actorProfile = selectNpcActorProfileDepth(sourceActorProfile, profileLevel);
  const currentActivity = npc.currentActivity ?? actorProfile?.work?.currentActivity ?? npc.location ?? null;
  const routine = profileLevel === 'background'
    ? []
    : takeLimitedList(npc.routine ?? actorProfile?.work?.routine, profileLevel === 'scene' ? 2 : 3);
  const visibleMarks = uniqueTextValues(collectTextValues([
    npc.visibleMarks,
    npc.visible_marks,
    npc.body?.visible_marks,
    npc.body?.visibleMarks,
    sourceActorProfile.body?.visible_marks,
    sourceActorProfile.body?.visibleMarks
  ]));
  const activeConditions = uniqueTextValues(collectTextValues([
    npc.activeConditions,
    npc.active_conditions,
    npc.body?.active_conditions,
    npc.body?.activeConditions,
    sourceActorProfile.body?.active_conditions,
    sourceActorProfile.body?.activeConditions
  ]));
  const availabilityWindow = npc.availabilityWindow
    ?? npc.scheduleWindow
    ?? sourceActorProfile.work?.dutyWindow
    ?? sourceActorProfile.work?.interruptionRule
    ?? null;
  const movementWindow = npc.movementWindow
    ?? sourceActorProfile.work?.nextTask
    ?? currentActivity
    ?? null;

  const clipByLevel = (values, backgroundLimit = 0, sceneLimit = 2, keyLimit = 8) => {
    if (profileLevel === 'background') return takeLimitedList(values, backgroundLimit);
    if (profileLevel === 'scene') return takeLimitedList(values, sceneLimit);
    return takeLimitedList(values, keyLimit);
  };

  return {
    ...npc,
    profileLevel,
    currentActivity,
    routine,
    items: npc.items ?? null,
    family: profileLevel === 'background' ? [] : clipByLevel(npc.family, 0, 2, 8),
    neighbors: profileLevel === 'background' ? [] : clipByLevel(npc.neighbors, 0, 2, 8),
    enemies: profileLevel === 'background' ? [] : clipByLevel(npc.enemies, 0, 1, 8),
    debtors: profileLevel === 'background' ? [] : clipByLevel(npc.debtors, 0, 1, 8),
    patrons: profileLevel === 'background' ? [] : clipByLevel(npc.patrons, 0, 1, 8),
    property: profileLevel === 'background' ? [] : clipByLevel(resolveNpcProperty(npc), 0, 2, 8),
    access: profileLevel === 'background' ? [] : clipByLevel(npc.access ?? actorProfile?.property?.access, 0, 2, 8),
    inventory: clipByLevel(resolveNpcInventory(npc), 1, 4, 8),
    notes: profileLevel === 'background' ? [] : clipByLevel(npc.notes, 0, 2, 8),
    schedule: profileLevel === 'background' ? [] : clipByLevel(npc.schedule ?? actorProfile?.work?.routine, 0, 2, 8),
    relations: profileLevel === 'background' ? [] : clipByLevel(npc.relations, 0, 2, 8),
    medicalNotes: profileLevel === 'background' ? [] : clipByLevel(npc.medicalNotes, 0, 1, 8),
    socialMemory: profileLevel === 'background' ? [] : clipByLevel(npc.socialMemory, 0, 1, 8),
    motivation: profileLevel === 'background' ? null : npc.motivation ?? actorProfile?.mind?.goals?.[0] ?? null,
    manner: profileLevel === 'background' ? null : npc.manner ?? actorProfile?.mind?.manner?.[0] ?? null,
    speech: profileLevel === 'background' ? null : npc.speech ?? actorProfile?.mind?.speech?.[0] ?? null,
    courage: npc.courage ?? actorProfile?.mind?.courage ?? 0,
    greed: npc.greed ?? actorProfile?.mind?.greed ?? 0,
    caution: npc.caution ?? actorProfile?.mind?.caution ?? 0,
    honesty: npc.honesty ?? actorProfile?.mind?.honesty ?? 0,
    superstition: npc.superstition ?? actorProfile?.mind?.superstition ?? 0,
    temper: npc.temper ?? actorProfile?.mind?.temper ?? 0,
    ageRange: profileLevel === 'background' ? null : (npc.ageRange ?? actorProfile?.identity?.ageRange ?? null),
    origin: profileLevel === 'background' ? null : (npc.origin ?? actorProfile?.identity?.origin ?? null),
    visibleStatus: npc.visibleStatus ?? actorProfile?.identity?.visibleStatus ?? null,
    trueStatus: profileLevel === 'key' ? (npc.trueStatus ?? actorProfile?.identity?.trueStatus ?? null) : null,
    reasonHere: npc.reasonHere ?? actorProfile?.identity?.reasonHere ?? null,
    language: npc.language ?? actorProfile?.body?.language ?? null,
    literacy: npc.literacy ?? actorProfile?.body?.literacy ?? null,
    clothing: npc.clothing ?? actorProfile?.body?.clothing ?? null,
    bodyState: npc.bodyState ?? actorProfile?.body?.bodyState ?? null,
    visibleMarks,
    activeConditions,
    occupation: npc.occupation ?? actorProfile?.work?.occupation ?? null,
    skills: profileLevel === 'background' ? [] : clipByLevel(npc.skills ?? actorProfile?.work?.skills, 1, 3, 8),
    obligations: profileLevel === 'background' ? [] : clipByLevel(npc.obligations ?? actorProfile?.kinship?.obligations, 0, 2, 8),
    dutyTo: npc.dutyTo ?? actorProfile?.work?.dutyTo ?? null,
    answerableTo: npc.answerableTo ?? actorProfile?.work?.answerableTo ?? null,
    responsibleFor: profileLevel === 'background' ? [] : clipByLevel(npc.responsibleFor ?? actorProfile?.work?.responsibleFor, 0, 2, 8),
    goals: profileLevel === 'background' ? [] : clipByLevel(npc.goals ?? actorProfile?.mind?.goals, 0, 2, 8),
    fears: profileLevel === 'background' ? [] : clipByLevel(npc.fears ?? actorProfile?.mind?.fears, 0, 2, 8),
    memory: profileLevel === 'background' ? [] : clipByLevel(npc.memory ?? actorProfile?.mind?.memory, 0, 2, 8),
    knowledge: profileLevel === 'background' ? [] : clipByLevel(npc.knowledge ?? actorProfile?.mind?.knowledge, 0, 2, 8),
    knowledgeSeen: profileLevel === 'background' ? [] : clipByLevel(npc.knowledgeSeen ?? actorProfile?.mind?.seen, 0, 2, 8),
    knowledgeHeard: profileLevel === 'background' ? [] : clipByLevel(npc.knowledgeHeard ?? actorProfile?.mind?.heard, 0, 2, 8),
    knowledgeMisread: profileLevel === 'background' ? [] : clipByLevel(npc.knowledgeMisread ?? actorProfile?.mind?.misunderstood, 0, 1, 8),
    knowledgeHidden: profileLevel === 'key' ? clipByLevel(npc.knowledgeHidden ?? actorProfile?.mind?.hidden, 0, 0, 8) : [],
    availabilityWindow,
    movementWindow,
    actorProfile
  };
}

export function buildNpcProfiles(npcs = [], currentLocationId, player = null, currentPosition = null, world = null) {
  const base = npcs.map((npc, index) => {
    const explicitLevel = normalizeNpcProfileLevel(
      npc?.profileLevel ?? npc?.actorProfile?.profileLevel ?? null,
      null
    );
    const derivedLevel = explicitLevel ?? (currentLocationId && (npc?.locationId ?? npc?.homeLocation ?? npc?.location ?? null) === currentLocationId ? 'scene' : 'background');
    return buildNpcProfile({
      ...(npc && typeof npc === 'object' ? npc : {}),
      profileLevel: derivedLevel
    }, currentLocationId, index, player, currentPosition);
  });
  const byHome = groupBy(base, (npc) => npc.homeLocation ?? npc.locationId ?? currentLocationId);

  for (const group of Object.values(byHome)) {
    const head = group.find((npc) => /хозяин|староста|чиновник/i.test(npc.role)) ?? group[0];
    for (const npc of group) {
      if (!Array.isArray(npc.family)) npc.family = [];
      if (head && npc.id !== head.id) {
        npc.family.push({ relation: 'household', targetNpcId: head.id, targetName: head.name });
      }
    }
  }

  const relations = buildNpcRelations(base);
  for (const npc of base) {
    npc.socialLinks = relations
      .filter((rel) => rel.sourceNpcId === npc.id || rel.targetNpcId === npc.id)
      .slice(0, 6)
      .map((rel) => ({
        relation: rel.kind,
        targetNpcId: rel.sourceNpcId === npc.id ? rel.targetNpcId : rel.sourceNpcId,
        strength: rel.strength
      }));
  }

  for (const npc of base) {
    syncActorProfileFromNpc(npc);
  }

  return { npcs: base, relations, propertyLedger: buildPropertyLedger(base, player, currentPosition, world) };
}

export function buildNpcProfile(npc = {}, currentLocationId, index = 0, player = null, currentPosition = null) {
  const role = String(npc.role ?? 'житель').toLowerCase();
  const locationId = npc.locationId ?? currentLocationId;
  const items = resolveItemBundle(npc);
  const resolvedNpc = {
    ...npc,
    items,
    position: npc.position ?? currentPosition ?? npc.position ?? null,
    current_position: npc.current_position ?? currentPosition ?? null
  };
  const actorProfile = buildActorProfile(resolvedNpc, 'npc', index, currentLocationId, player);
  const npcLocationId = npc.locationId ?? npc.homeLocation ?? npc.location ?? null;
  const profileLevel = normalizeNpcProfileLevel(
    npc.profileLevel ?? npc.actorProfile?.profileLevel ?? null,
    'background'
  );
  actorProfile.profileLevel = profileLevel;
  const coreVitals = resolveCoreVitals(npc);
  const profile = {
    id: npc.id ?? npc.name ?? `npc:${currentLocationId}:${index}`,
    name: npc.name ?? `NPC ${index + 1}`,
    role: npc.role ?? 'житель',
    profileLevel,
    worldPosition: npc.worldPosition ?? (allowsProceduralSemantics() ? deriveWorldPosition(role, index, player) : null),
    position: resolvedNpc.position ?? null,
    current_position: resolvedNpc.current_position ?? null,
    items: resolvedNpc.items ?? null,
    location: npc.location ?? locationId,
    locationId,
    microLocationId: npc.microLocationId ?? null,
    homeLocation: npc.homeLocation ?? locationId,
    body: npc.body ?? null,
    states: npc.states ?? null,
    activeStates: Array.isArray(npc.activeStates) ? npc.activeStates.slice() : [],
    health: coreVitals.health,
    satiety: coreVitals.satiety,
    vigor: coreVitals.vigor,
    bleeding: npc.bleeding ?? 0,
    thirst: npc.thirst ?? 18,
    fear: npc.fear ?? 10,
    pain: npc.pain ?? 0,
    intoxication: npc.intoxication ?? 0,
    injuries: Array.isArray(npc.injuries) ? npc.injuries.slice() : [],
    mood: npc.mood ?? (allowsProceduralSemantics() ? deriveMood(role, index) : null),
    character: npc.character ?? (allowsProceduralSemantics() ? deriveCharacter(role, index) : null),
    motivation: npc.motivation ?? (allowsProceduralSemantics() ? deriveMotivation(role, index) : null),
    medicalSkill: proceduralValue(npc.medicalSkill, deriveMedicalSkill, role, index),
    knowledge: Array.isArray(npc.knowledge) ? npc.knowledge.slice() : [],
    knowledgeSeen: proceduralArray(npc.knowledgeSeen, deriveKnowledgeSeen, role, index),
    knowledgeHeard: proceduralArray(npc.knowledgeHeard, deriveKnowledgeHeard, role, index),
    knowledgeMisread: proceduralArray(npc.knowledgeMisread, deriveKnowledgeMisread, role, index),
    knowledgeHidden: profileLevel === 'key'
      ? proceduralArray(npc.knowledgeHidden, deriveKnowledgeHidden, role, index)
      : [],
    family: Array.isArray(npc.family) ? npc.family.slice() : [],
    neighbors: proceduralArray(npc.neighbors, deriveNeighbors, role, index),
    enemies: proceduralArray(npc.enemies, deriveEnemies, role, index),
    debtors: proceduralArray(npc.debtors, deriveDebtors, role, index),
    patrons: proceduralArray(npc.patrons, derivePatrons, role, index),
    authorityFear: proceduralValue(npc.authorityFear, deriveAuthorityFear, role, index),
    communityFear: proceduralValue(npc.communityFear, deriveCommunityFear, role, index),
    access: proceduralArray(npc.access, deriveAccess, role, index),
    notes: Array.isArray(npc.notes) ? npc.notes.slice() : [],
    schedule: Array.isArray(npc.schedule) ? npc.schedule.slice() : [],
    status: npc.status ?? 'местный',
    attitudeToPlayer: npc.attitudeToPlayer ?? deriveAttitudeToPlayer(role, player),
    relations: Array.isArray(npc.relations) ? npc.relations.slice() : [],
    medicalNotes: Array.isArray(npc.medicalNotes) ? npc.medicalNotes.slice() : [],
    socialMemory: Array.isArray(npc.socialMemory) ? npc.socialMemory.slice() : [],
    manner: proceduralValue(npc.manner, deriveManner, role, index),
    speech: proceduralValue(npc.speech, deriveSpeech, role, index),
    courage: proceduralValue(npc.courage, deriveCourage, role, index),
    greed: proceduralValue(npc.greed, deriveGreed, role, index),
    caution: proceduralValue(npc.caution, deriveCaution, role, index),
    honesty: proceduralValue(npc.honesty, deriveHonesty, role, index),
    superstition: proceduralValue(npc.superstition, deriveSuperstition, role, index),
    temper: proceduralValue(npc.temper, deriveTemper, role, index),
    ageRange: npc.ageRange ?? actorProfile.identity.ageRange,
    origin: npc.origin ?? actorProfile.identity.origin,
    visibleStatus: npc.visibleStatus ?? actorProfile.identity.visibleStatus,
    trueStatus: npc.trueStatus ?? actorProfile.identity.trueStatus,
    reasonHere: npc.reasonHere ?? actorProfile.identity.reasonHere,
    language: npc.language ?? actorProfile.body.language,
    literacy: npc.literacy ?? actorProfile.body.literacy,
    clothing: npc.clothing ?? actorProfile.body.clothing,
    bodyState: npc.bodyState ?? actorProfile.body.bodyState,
    visibleMarks: uniqueTextValues(collectTextValues([
      npc.visibleMarks,
      npc.visible_marks,
      actorProfile.body.visible_marks,
      actorProfile.body.visibleMarks
    ])),
    activeConditions: uniqueTextValues(collectTextValues([
      npc.activeConditions,
      npc.active_conditions,
      actorProfile.body.active_conditions,
      actorProfile.body.activeConditions
    ])),
    availabilityWindow: npc.availabilityWindow ?? actorProfile.work.dutyWindow ?? actorProfile.work.interruptionRule ?? null,
    movementWindow: npc.movementWindow ?? actorProfile.work.nextTask ?? null,
    occupation: npc.occupation ?? actorProfile.work.occupation,
    skills: Array.isArray(npc.skills) && npc.skills.length > 0 ? npc.skills.slice() : actorProfile.work.skills.slice(),
    obligations: Array.isArray(npc.obligations) ? npc.obligations.slice() : actorProfile.kinship.obligations.slice(),
    dutyTo: proceduralValue(npc.dutyTo, deriveDutyTo, role, index),
    answerableTo: proceduralValue(npc.answerableTo, deriveAnswerableTo, role, index),
    responsibleFor: proceduralArray(npc.responsibleFor, deriveResponsibleFor, role, index),
    needs: npc.needs ?? null,
    goals: Array.isArray(npc.goals) ? npc.goals.slice() : actorProfile.mind.goals.slice(),
    fears: Array.isArray(npc.fears) ? npc.fears.slice() : actorProfile.mind.fears.slice(),
    memory: Array.isArray(npc.memory) ? npc.memory.slice() : actorProfile.mind.memory.slice(),
    actorProfile
  };

  return enrichNpcProfile(profile, {
    currentLocationId,
    currentMicroLocationId: profile.microLocationId ?? null,
    current_position: resolvedNpc.current_position ?? null,
    actorId: profile.id
  });
}

function resolveCoreVitals(source = {}) {
  const states = source.states && typeof source.states === 'object' ? source.states : {};
  const health = pickCoreVital(
    states.health,
    source.body?.health,
    100
  );
  const satiety = pickCoreVital(
    states.satiety,
    source.body?.satiety,
    100 - 20
  );
  const vigor = pickCoreVital(
    states.vigor,
    source.body?.vigor,
    100 - 20
  );
  return {
    health: clampToRange(health),
    satiety: clampToRange(satiety),
    vigor: clampToRange(vigor)
  };
}

function pickCoreVital(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 100;
}

function clampToRange(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

export function buildActorProfile(source = {}, kind = 'npc', index = 0, currentLocationId = null, player = null) {
  const role = String(source.role ?? (kind === 'player' ? 'путник' : 'житель')).toLowerCase();
  const sourceProfile = source.actorProfile && typeof source.actorProfile === 'object' ? source.actorProfile : {};
  const explicitProfileLevel = normalizeNpcProfileLevel(source.profileLevel ?? sourceProfile.profileLevel ?? null, null);
  const sourceItems = source.items && typeof source.items === 'object' && !Array.isArray(source.items) ? source.items : null;
  const playerSeedFacts = kind === 'player' && String(source.profileSource ?? '').trim().toLowerCase() === 'player_seed'
    ? { allowEmpty: true }
    : {};
  const familyFacts = normalizeFacts(
    sourceProfile.kinship?.familyFacts ?? source.family,
    kind === 'player'
      ? 'Родня не указана: это факт, а не пропуск.'
      : 'Родня не указана или неизвестна: это факт, а не пропуск.',
    playerSeedFacts
  );
  const carriedProperty = normalizeFacts(
    sourceItems ? describeItemFacts(resolveCarriedItemsFromBundle(sourceItems)) : source.inventory,
    'При себе ничего не указано.',
    playerSeedFacts
  );
  const outsideProperty = normalizeFacts(
    sourceItems ? describeItemFacts(resolvePropertyItemsFromBundle(sourceItems)) : source.property,
    'Вне доступа имущества не указано.',
    playerSeedFacts
  );
  const obligations = normalizeFacts(sourceProfile.kinship?.obligations ?? source.obligations, 'Обязательства не указаны.', playerSeedFacts);
  const goals = normalizeFacts(sourceProfile.mind?.goals ?? source.goals, 'Цели неизвестны.', playerSeedFacts);
  const fears = normalizeFacts(sourceProfile.mind?.fears ?? source.fears, 'Страхи неизвестны.', playerSeedFacts);
  const knowledge = normalizeFacts(sourceProfile.mind?.knowledge ?? source.knowledge, 'Знания не перечислены.', playerSeedFacts);
  const memory = normalizeFacts(sourceProfile.mind?.memory ?? source.memory, 'Память не заполнена.', playerSeedFacts);
  const skills = normalizeFacts(
    sourceProfile.work?.skills ?? source.skills,
    allowsProceduralSemantics() ? deriveSkills(role, kind, index) : 'Навыки не указаны.',
    playerSeedFacts
  );

  const actorProfile = {
    version: 1,
    kind,
    source: sourceProfile.source ?? source.profileSource ?? (allowsProceduralSemantics() ? 'derived' : 'pending_semantic_materialization'),
    identity: {
      id: source.id ?? sourceProfile.identity?.id ?? (kind === 'player' ? 'player' : `npc:${currentLocationId}:${index}`),
      name: source.name ?? sourceProfile.identity?.name ?? (allowsProceduralSemantics() ? (kind === 'player' ? 'безымянный человек' : `NPC ${index + 1}`) : null),
      ageRange: sourceProfile.identity?.ageRange ?? source.ageRange ?? proceduralValue(null, deriveAgeRange, role, kind, index),
      origin: sourceProfile.identity?.origin ?? source.origin ?? proceduralValue(null, deriveOrigin, role, kind, currentLocationId, index),
      originDetail: sourceProfile.identity?.originDetail ?? source.originDetail ?? (allowsProceduralSemantics() ? 'неизвестно' : null),
      socialPosition: sourceProfile.identity?.socialPosition ?? source.socialClass ?? proceduralValue(null, deriveSocialPosition, role, kind, player),
      visibleStatus: sourceProfile.identity?.visibleStatus ?? source.visibleStatus ?? source.status ?? (allowsProceduralSemantics() ? 'неизвестно' : null),
      trueStatus: sourceProfile.identity?.trueStatus ?? source.trueStatus ?? source.status ?? (allowsProceduralSemantics() ? 'неизвестно' : null),
      reasonHere: sourceProfile.identity?.reasonHere ?? source.reasonHere ?? proceduralValue(null, deriveReasonHere, role, kind, currentLocationId),
      worldPosition: sourceProfile.identity?.worldPosition ?? source.worldPosition ?? proceduralValue(null, deriveWorldPosition, role, kind === 'player' ? 'player' : 'npc', player)
    },
    kinship: {
      familyFacts,
      noFamilyReason: sourceProfile.kinship?.noFamilyReason ?? source.noFamilyReason ?? (allowsProceduralSemantics() ? deriveNoFamilyReason(source, kind) : null),
      obligations,
      household: sourceProfile.kinship?.household ?? source.household ?? (allowsProceduralSemantics() ? 'неизвестно' : null),
      answerableTo: sourceProfile.kinship?.answerableTo ?? source.answerableTo ?? proceduralValue(null, deriveAnswerableTo, role, kind === 'player' ? 0 : index),
      responsibleFor: normalizeFacts(sourceProfile.kinship?.responsibleFor ?? source.responsibleFor, 'Ответственность не указана.', playerSeedFacts)
    },
    property: {
      carried: carriedProperty,
      outsideAccess: outsideProperty,
      rights: normalizeFacts(sourceProfile.property?.rights, 'Права собственности не перечислены.', playerSeedFacts),
      ownershipFacts: normalizeFacts(sourceProfile.property?.ownershipFacts, 'Сведения о праве владения не указаны.', playerSeedFacts),
      access: normalizeFacts(source.access ?? sourceProfile.property?.access, 'Доступ не указан.', playerSeedFacts)
    },
    work: {
      occupation: sourceProfile.work?.occupation ?? source.occupation ?? proceduralValue(null, deriveOccupation, role, kind),
      currentActivity: sourceProfile.work?.currentActivity ?? source.currentActivity ?? proceduralValue(null, deriveCurrentActivity, role, kind),
      nextTask: sourceProfile.work?.nextTask ?? source.nextTask ?? proceduralValue(null, deriveNextTask, role, kind),
      dutyWindow: sourceProfile.work?.dutyWindow ?? source.dutyWindow ?? proceduralValue(null, deriveDutyWindow, role, kind),
      interruptionRule: sourceProfile.work?.interruptionRule ?? source.interruptionRule ?? proceduralValue(null, deriveInterruptionRule, role, kind),
      skills,
      routine: normalizeFacts(sourceProfile.work?.routine ?? source.routine, 'Рутина не указана.', playerSeedFacts),
      dutyTo: sourceProfile.work?.dutyTo ?? source.dutyTo ?? proceduralValue(null, deriveDutyTo, role, kind === 'player' ? 0 : index),
      answerableTo: sourceProfile.work?.answerableTo ?? source.answerableTo ?? proceduralValue(null, deriveAnswerableTo, role, kind === 'player' ? 0 : index),
      responsibleFor: normalizeFacts(sourceProfile.work?.responsibleFor ?? source.responsibleFor, 'Ни за кого не отвечает.', playerSeedFacts)
    },
    body: {
      bodyState: sourceProfile.body?.bodyState ?? source.bodyState ?? proceduralValue(null, deriveBodyState, role, kind),
      health: source.health ?? sourceProfile.body?.health ?? 100,
      bleeding: source.bleeding ?? sourceProfile.body?.bleeding ?? 0,
      pain: source.pain ?? sourceProfile.body?.pain ?? 0,
      intoxication: source.intoxication ?? sourceProfile.body?.intoxication ?? 0,
      visible_marks: uniqueTextValues(collectTextValues([
        sourceProfile.body?.visible_marks,
        source.visibleMarks,
        source.visible_marks
      ])),
      active_conditions: uniqueTextValues(collectTextValues([
        sourceProfile.body?.active_conditions,
        source.activeConditions,
        source.active_conditions
      ])),
      clothing: sourceProfile.body?.clothing ?? source.clothing ?? proceduralValue(null, deriveClothing, role, kind),
      language: sourceProfile.body?.language ?? source.language ?? proceduralValue(null, deriveLanguage, role, kind),
      literacy: sourceProfile.body?.literacy ?? source.literacy ?? proceduralValue(null, deriveLiteracy, role, kind)
    },
    mind: {
      memory,
      knowledge,
      seen: normalizeFacts(sourceProfile.mind?.seen ?? source.knowledgeSeen, 'Наблюдения не указаны.', playerSeedFacts),
      heard: normalizeFacts(sourceProfile.mind?.heard ?? source.knowledgeHeard, 'Слухи не указаны.', playerSeedFacts),
      misunderstood: normalizeFacts(sourceProfile.mind?.misunderstood ?? source.knowledgeMisread, 'Ошибки понимания не указаны.', playerSeedFacts),
      hidden: explicitProfileLevel === 'key'
        ? normalizeFacts(sourceProfile.mind?.hidden ?? source.knowledgeHidden, 'Скрываемое не указано.', playerSeedFacts)
        : [],
      fears,
      goals,
      manner: normalizeFacts(sourceProfile.mind?.manner ?? source.manner, allowsProceduralSemantics() ? 'Манера не указана.' : null, playerSeedFacts),
      speech: normalizeFacts(sourceProfile.mind?.speech ?? source.speech, allowsProceduralSemantics() ? 'Манера речи не указана.' : null, playerSeedFacts),
      courage: sourceProfile.mind?.courage ?? source.courage ?? proceduralValue(null, deriveCourage, role, kind === 'player' ? 0 : index),
      greed: sourceProfile.mind?.greed ?? source.greed ?? proceduralValue(null, deriveGreed, role, kind === 'player' ? 0 : index),
      caution: sourceProfile.mind?.caution ?? source.caution ?? proceduralValue(null, deriveCaution, role, kind === 'player' ? 0 : index),
      honesty: sourceProfile.mind?.honesty ?? source.honesty ?? proceduralValue(null, deriveHonesty, role, kind === 'player' ? 0 : index),
      superstition: sourceProfile.mind?.superstition ?? source.superstition ?? proceduralValue(null, deriveSuperstition, role, kind === 'player' ? 0 : index),
      temper: sourceProfile.mind?.temper ?? source.temper ?? proceduralValue(null, deriveTemper, role, kind === 'player' ? 0 : index)
    }
  };

  return mergeActorProfile(actorProfile, sourceProfile);
}

export function buildPropertyLedger(npcs = [], player = null, currentPosition = null, world = null) {
  const ledger = [];

  const actors = [
    ...(Array.isArray(npcs) ? npcs : []),
    player ? { ...player, id: player.id ?? 'player', name: player.name ?? 'игрок' } : null
  ].filter(Boolean);
  const namesById = new Map(actors.map((actor) => [String(actor.id ?? '').trim(), actor.name ?? 'неизвестно']));

  for (const actor of actors) {
    const actorId = String(actor.id ?? '').trim();
    const ownerType = actorId === 'player' ? 'player' : 'npc';
    const locationId = actor.current_position?.location_id
      ?? currentPosition?.location_id
      ?? actor.locationId
      ?? actor.homeLocation
      ?? (ownerType === 'player' ? 'player' : null);
    const carriedItems = Array.isArray(actor.items?.carried_items) ? actor.items.carried_items : [];
    const propertyItems = Array.isArray(actor.items?.property_not_carried) ? actor.items.property_not_carried : [];
    const borrowedItems = Array.isArray(actor.items?.borrowed_items) ? actor.items.borrowed_items : [];
    const foreignItems = Array.isArray(actor.items?.foreign_items_with_character) ? actor.items.foreign_items_with_character : [];

    ledger.push(
      ...collectLedgerItems(carriedItems, {
        ownerId: actorId,
        holderId: actorId,
        ownerType,
        ownerName: actor.name ?? namesById.get(actorId) ?? 'неизвестно',
        locationId,
        placement: 'carried',
        sourceKind: 'inventory',
        namesById,
        world
      })
    );
    ledger.push(
      ...collectLedgerItems(propertyItems, {
        ownerId: actorId,
        holderId: null,
        ownerType,
        ownerName: actor.name ?? namesById.get(actorId) ?? 'неизвестно',
        locationId,
        placement: 'property',
        sourceKind: 'property',
        namesById,
        world
      })
    );
    ledger.push(
      ...collectLedgerItems(borrowedItems, {
        ownerId: null,
        holderId: actorId,
        ownerType,
        ownerName: actor.name ?? namesById.get(actorId) ?? 'неизвестно',
        locationId,
        placement: 'borrowed',
        sourceKind: 'access',
        namesById,
        world
      })
    );
    ledger.push(
      ...collectLedgerItems(foreignItems, {
        ownerId: null,
        holderId: actorId,
        ownerType,
        ownerName: actor.name ?? namesById.get(actorId) ?? 'неизвестно',
        locationId,
        placement: 'held_for_others',
        sourceKind: 'access',
        namesById,
        world
      })
    );
  }

  return ledger;
}

function collectLedgerItems(items = [], context = {}, parent = null) {
  const ledger = [];
  const list = Array.isArray(items) ? items : [];
  for (const [index, item] of list.entries()) {
    const normalized = normalizeLedgerItem(item, context, index, parent);
    if (!normalized) continue;
    ledger.push(normalized);
    if (Array.isArray(normalized.contents) && normalized.contents.length > 0) {
      const nestedDefaults = buildLedgerContainedDefaults(normalized, context);
      ledger.push(...collectLedgerItems(normalized.contents, {
        ...context,
        ownerId: nestedDefaults.ownerId,
        holderId: nestedDefaults.holderId,
        placement: nestedDefaults.placement,
        access: nestedDefaults.access,
        visible: nestedDefaults.visible,
        locationId: context.locationId ?? null,
        sourceKind: context.sourceKind ?? 'inventory'
      }, normalized));
    }
  }
  return ledger;
}

function normalizeLedgerItem(item, context = {}, index = 0, parent = null) {
  if (item === null || item === undefined) return null;
  if (typeof item === 'object' && !Array.isArray(item)) {
    const label = String(item.label ?? item.name ?? item.title ?? '').trim();
    if (!label) return null;
    const ownerId = String(item.owner_id ?? item.ownerId ?? context.ownerId ?? '').trim() || null;
    const holderId = String(item.holder_id ?? item.holderId ?? context.holderId ?? '').trim() || null;
    const placement = normalizePlacementValue(String(item.placement ?? context.placement ?? 'carried').trim() || 'carried');
    const access = normalizeAccessValue(String(item.access ?? context.access ?? '').trim() || inferLedgerAccess(placement, ownerId, holderId));
    const visible = resolveLedgerVisibleFlag(item, context);
    const normalized = {
      id: String(item.id ?? `property:${context.ownerType ?? 'unknown'}:${slugify(label)}:${index + 1}`).trim(),
      label,
      type: String(item.type ?? item.kind ?? inferLedgerType(label)).trim() || 'item',
      material: item.material ?? null,
      condition: item.condition ?? item.state ?? 'unknown',
      weight: Number.isFinite(Number(item.weight)) ? Number(item.weight) : null,
      size: item.size ?? null,
      placement,
      holderId,
      ownerId,
      ownerType: ownerId ? ownerTypeFor(ownerId, context.ownerType) : 'unknown',
      ownerName: ownerId ? resolveActorName(context.namesById, ownerId, context.ownerName) : String(item.ownerName ?? item.owner ?? 'неизвестно'),
      holderName: resolveActorName(context.namesById, holderId, holderId ? context.ownerName : null),
      locationId: context.locationId ?? null,
      containerId: item.container_id ?? item.containerId ?? parent?.id ?? null,
      access,
      function: item.function ?? item.purpose ?? null,
      legalStatus: item.legal_status ?? item.legalStatus ?? (allowsProceduralSemantics(context.world) ? inferLedgerLegalStatus(placement, ownerId, holderId, access) : null),
      discoverability: normalizeDiscoverabilityValue(
        item.discoverability,
        allowsProceduralSemantics(context.world)
          ? inferLedgerDiscoverability(visible, placement, ownerId, holderId, access, item.marks ?? item.traces ?? [])
          : null
      ),
      visibility: item.visibility ?? (allowsProceduralSemantics(context.world) ? inferLedgerVisibility(visible, placement, access) : null),
      plausibility: Number.isFinite(Number(item.plausibility))
        ? Number(item.plausibility)
        : inferItemPlausibility(
          String(item.type ?? item.kind ?? inferLedgerType(label)).trim() || 'item',
          label,
          item.material ?? null,
          item.condition ?? item.state ?? 'unknown',
          placement,
          access,
          visible,
          ownerId,
          holderId,
          item.marks ?? item.traces ?? [],
          item.container_id ?? item.containerId ?? parent?.id ?? null
        ),
      value: item.value ?? item.value_profile ?? null,
      risk: Number.isFinite(Number(item.risk)) ? Number(item.risk) : (allowsProceduralSemantics(context.world) ? inferLedgerRisk(placement, ownerId, holderId, access, visible, item.marks ?? item.traces ?? []) : null),
      visible,
      marks: Array.isArray(item.marks ?? item.traces) ? (item.marks ?? item.traces).slice() : [],
      rights: deriveLedgerRights(placement, ownerId, holderId),
      sourceKind: context.sourceKind ?? 'inventory',
      contents: Array.isArray(item.contents) ? item.contents.slice() : []
    };
    const explicitTotalWeight = Number.isFinite(Number(item.total_weight ?? item.totalWeight))
      ? Number(item.total_weight ?? item.totalWeight)
      : null;
    const contentsWeight = normalized.contents.length > 0
      ? normalizeLedgerWeight(sumLedgerWeight({ contents: normalized.contents }))
      : null;
    const computedTotalWeight = normalizeLedgerWeight((normalized.weight ?? 0) + (contentsWeight ?? 0));
    normalized.contentsWeight = contentsWeight;
    normalized.totalWeight = explicitTotalWeight ?? (normalized.weight === null && contentsWeight === null ? null : computedTotalWeight);
    normalized.plausibility = inferLedgerScenePlausibility(normalized, normalized.plausibility, context.world);
    return normalized;
  }

  const label = String(item).trim();
  if (!label) return null;
  const ownerId = String(context.ownerId ?? '').trim() || null;
  const holderId = String(context.holderId ?? '').trim() || null;
  const placement = normalizePlacementValue(String(context.placement ?? 'carried').trim() || 'carried');
  const access = normalizeAccessValue(context.access ?? inferLedgerAccess(placement, ownerId, holderId));
  const visible = context.visible !== false;
  const normalized = {
    id: `property:${context.ownerType ?? 'unknown'}:${slugify(label)}:${index + 1}`,
    label,
    type: inferLedgerType(label),
    material: null,
    condition: 'unknown',
    weight: null,
    size: null,
    placement,
    holderId,
    ownerId,
    ownerType: ownerId ? ownerTypeFor(ownerId, context.ownerType) : 'unknown',
    ownerName: ownerId ? resolveActorName(context.namesById, ownerId, context.ownerName) : 'неизвестно',
    holderName: resolveActorName(context.namesById, holderId, holderId ? context.ownerName : null),
    locationId: context.locationId ?? null,
    containerId: parent?.id ?? null,
    access,
    function: inferItemFunction(inferLedgerType(label), label),
    legalStatus: inferLedgerLegalStatus(placement, ownerId, holderId, access),
    discoverability: inferLedgerDiscoverability(visible, placement, ownerId, holderId, access, []),
    visibility: inferLedgerVisibility(visible, placement, access),
    plausibility: inferItemPlausibility(
      inferLedgerType(label),
      label,
      null,
      'unknown',
      placement,
      access,
      visible,
      ownerId,
      holderId,
      []
    ),
    value: null,
    risk: inferLedgerRisk(placement, ownerId, holderId, access, visible, []),
    visible,
    marks: [],
    rights: deriveLedgerRights(placement, ownerId, holderId),
    sourceKind: context.sourceKind ?? 'inventory',
    contents: [],
    contentsWeight: null,
    totalWeight: null
  };
  normalized.plausibility = inferLedgerScenePlausibility(normalized, normalized.plausibility, context.world);
  return normalized;
}

function inferLedgerScenePlausibility(item, baseScore, world = null) {
  const numericBase = Number(baseScore);
  if (!Number.isFinite(numericBase) || !world || typeof world !== 'object') return baseScore;

  const sceneLocationId = world.current_position?.location_id ?? null;
  const itemLocationId = item?.locationId ?? null;
  if (sceneLocationId && itemLocationId && sceneLocationId !== itemLocationId) return baseScore;

  const location = world.locations?.[sceneLocationId ?? itemLocationId ?? ''] ?? null;
  const locationProfile = location?.profile ?? null;
  const contextText = [
    location?.name,
    location?.kind,
    locationProfile?.purpose,
    locationProfile?.materialScene,
    locationProfile?.ownership,
    locationProfile?.access,
    ...(Array.isArray(locationProfile?.economy) ? locationProfile.economy : []),
    ...(Array.isArray(locationProfile?.authority) ? locationProfile.authority : []),
    ...(Array.isArray(locationProfile?.hazards) ? locationProfile.hazards : []),
    world.scene?.ownership,
    world.scene?.access,
    world.scene?.purpose,
    world.scene?.rhythm,
    world.scene?.memory,
    world.scene?.currentPeriod?.impact,
    world.scene?.currentPeriod?.resolution,
    ...(Array.isArray(world.scene?.hazards) ? world.scene.hazards : []),
    ...(Array.isArray(world.region?.economy) ? world.region.economy : [])
  ].filter(Boolean).join(' ').toLowerCase();

  if (!contextText) return baseScore;

  let score = numericBase;
  const itemType = String(item?.type ?? '').trim().toLowerCase();
  const label = String(item?.label ?? '').trim().toLowerCase();
  const access = String(item?.access ?? '').trim().toLowerCase();
  const legalStatus = String(item?.legalStatus ?? '').trim().toLowerCase();
  const hasStrongReason = access === 'borrowed'
    || access === 'restricted'
    || legalStatus === 'disputed'
    || legalStatus === 'restricted'
    || /(долг|служб|страж|караул|торг|подар|троф|краж|залог|охот|войн|облав|обыск|бегств|пожар|празд|болезн|ярмарк|дорог|брод|перевоз)/.test(contextText);

  if ((itemType === 'weapon' || itemType === 'armor') && !hasStrongReason) {
    if (/(двор|изб|дом|хлев|огород|пашн|деревн|сел|крестьян|хозяйств)/.test(contextText)) score -= 1;
  }

  if (itemType === 'travel' && !hasStrongReason) {
    if (!/(дорог|брод|перевоз|конюш|двор|рынок|ярмарк|тракт|путь|торг)/.test(contextText)) score -= 1;
  }

  if ((itemType === 'food' || itemType === 'tool') && /(рынок|торг|двор|изб|мастер|ремесл|хозяйств|склад|амбар)/.test(contextText)) {
    score += 0.5;
  }

  return Math.max(0, Math.min(5, Math.round(score)));
}

function resolveLedgerVisibleFlag(item = {}, context = {}) {
  if (item.visible !== undefined) return item.visible !== false;
  const visibility = String(item.visibility ?? '').trim().toLowerCase();
  if (['hidden', 'secret', 'unknown'].includes(visibility)) return false;
  if (context.visible !== undefined) return context.visible !== false;
  return true;
}

function buildLedgerContainedDefaults(parent, context = {}) {
  const closed = parent.access === 'closed_container' || parent.visible === false;
  return {
    ownerId: parent.ownerId ?? context.ownerId ?? null,
    holderId: parent.holderId ?? context.holderId ?? null,
    placement: 'contained',
    access: closed ? 'closed_container' : 'contained',
    visible: closed ? false : true
  };
}

function deriveLedgerRights(placement, ownerId, holderId) {
  const rights = new Set(['notice']);
  if (placement === 'property') {
    rights.add('own');
    rights.add('lend');
    rights.add('recover');
  } else {
    rights.add('carry');
    rights.add('use');
  }
  if (placement === 'borrowed') rights.add('return');
  if (placement === 'held_for_others') rights.add('guard');
  if (ownerId && holderId && ownerId !== holderId) rights.add('disputed');
  return [...rights];
}

function inferLedgerType(label) {
  const text = String(label ?? '').toLowerCase();
  if (/(меч|нож|копь|кинжал|топор|лук|арбал|дубин|пращ|стрел)/i.test(text)) return 'weapon';
  if (/(кольчуг|шлем|брон|доспех|щит)/i.test(text)) return 'armor';
  if (/(мешок|сумк|кошел|узелок|корзин|чехол|футляр|ларец|сундук)/i.test(text)) return 'container';
  if (/(рубах|плащ|одежд|лапт|сапог|колпак|пояс)/i.test(text)) return 'clothing';
  if (/(хлеб|сухар|сало|мяс|мёд|зерн|круп|еда|вода|пить|масл)/i.test(text)) return 'food';
  if (/(кресало|трут|игл|ножн|верёв|тесл|пила|игол|шило|молот|серп|коса|инструм)/i.test(text)) return 'tool';
  if (/(лошад|конь|сани|повоз|телег|упряж)/i.test(text)) return 'travel';
  return 'item';
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

function inferLedgerAccess(placement = 'carried', ownerId = null, holderId = null) {
  if (placement === 'property') return 'not_carried';
  if (placement === 'borrowed') return 'borrowed';
  if (placement === 'held_for_others') return 'held_for_others';
  if (placement === 'contained') return 'contained';
  if (ownerId && holderId && ownerId !== holderId) return 'restricted';
  return 'immediate';
}

function inferLedgerVisibility(visible, placement = 'carried', access = 'immediate') {
  if (!visible) return 'hidden';
  if (placement === 'property' || access === 'not_carried') return 'documented';
  if (access && access !== 'immediate') return 'restricted';
  return 'visible';
}

function inferLedgerDiscoverability(visible, placement = 'carried', ownerId = null, holderId = null, access = 'immediate', marks = []) {
  let value = visible ? 4 : 1;
  if (placement === 'property' || access === 'not_carried') value -= 1;
  if (access && access !== 'immediate') value -= 1;
  if (ownerId && holderId && ownerId === holderId) value += 1;
  if (ownerId && holderId && ownerId !== holderId) value -= 1;
  if (Array.isArray(marks) && marks.length > 0) value += 1;
  if (Array.isArray(marks) && marks.length > 2) value += 1;
  return Math.max(0, Math.min(5, value));
}

function inferLedgerLegalStatus(placement, ownerId, holderId, access = 'immediate') {
  if (placement === 'property') return 'ordinary';
  if (placement === 'borrowed' || placement === 'held_for_others') return 'ordinary';
  if (ownerId && holderId && ownerId !== holderId) return 'disputed';
  if (access && ['restricted', 'closed_container'].includes(access)) return 'restricted';
  return 'ordinary';
}

function inferLedgerRisk(placement, ownerId, holderId, access = 'immediate', visible = true, marks = []) {
  let risk = 0;
  if (ownerId && holderId && ownerId !== holderId) risk += 2;
  if (placement === 'property' || access === 'not_carried') risk += 1;
  if (access && access !== 'immediate') risk += 1;
  if (!visible) risk += 1;
  if (Array.isArray(marks) && marks.length > 0) risk += 1;
  return Math.max(0, Math.min(5, risk));
}

function sumLedgerWeight(item) {
  if (item === null || item === undefined || typeof item !== 'object') return 0;

  const ownWeight = Number.isFinite(Number(item.weight)) ? Number(item.weight) : 0;
  const nestedWeight = Array.isArray(item.contents)
    ? item.contents.reduce((total, nestedItem) => total + sumLedgerWeight(nestedItem), 0)
    : 0;

  return ownWeight + nestedWeight;
}

function normalizeLedgerWeight(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 1000) / 1000;
}

function ownerTypeFor(ownerId, fallback = 'unknown') {
  if (!ownerId) return fallback ?? 'unknown';
  if (ownerId === 'player') return 'player';
  return 'npc';
}

function resolveActorName(namesById, actorId, fallback = 'неизвестно') {
  const key = String(actorId ?? '').trim();
  if (!key) return fallback ?? 'неизвестно';
  return namesById?.get?.(key) ?? fallback ?? 'неизвестно';
}

export function buildNpcRelations(npcs = []) {
  const relations = [];
  for (let i = 0; i < npcs.length; i += 1) {
    for (let j = i + 1; j < npcs.length; j += 1) {
      const a = npcs[i];
      const b = npcs[j];
      const kind = deriveRelationKind(a, b);
      const strength = deriveRelationStrength(a, b, kind);
      relations.push({
        id: `rel:${a.id}:${b.id}:${kind}`,
        sourceNpcId: a.id,
        targetNpcId: b.id,
        kind,
        strength
      });
    }
  }
  return relations;
}

function deriveMood(role, index) {
  if (role.includes('хозяин') || role.includes('староста')) return 'насторожен';
  if (role.includes('служ')) return 'занят';
  if (role.includes('торгов')) return 'взвешивает';
  if (role.includes('мальчик') || role.includes('подмаст')) return 'любопытен';
  return ['сдержан', 'чуть резок', 'внимателен', 'устал'][index % 4];
}

function deriveCharacter(role, index) {
  if (role.includes('хозяин') || role.includes('староста')) return ['прагматичный', 'осторожный', 'ценит порядок'];
  if (role.includes('служ')) return ['быстрый', 'памятливый', 'не любит наказаний'];
  if (role.includes('торгов')) return ['расчётливый', 'говорливый', 'чувствует цену риска'];
  return [['замкнутый', 'наблюдательный', 'считает чужой долг'], ['острый на язык', 'бережливый', 'любит порядок'], ['спокойный', 'помнит обиды', 'ждёт выгоды']][index % 3];
}

function deriveMotivation(role, index) {
  if (role.includes('хозяин') || role.includes('староста')) return 'сохранить контроль над двором и не допустить убытка';
  if (role.includes('служ')) return 'не потерять место и не попасть под наказание';
  if (role.includes('торгов')) return 'сохранить товар, имя и шанс на выгодный обмен';
  return ['прожить день без потерь', 'получить пользу из чужой слабости', 'понять, кому здесь можно верить'][index % 3];
}

function deriveAttitudeToPlayer(role, player) {
  const status = String(player?.status ?? 'чужой').toLowerCase();
  if (role.includes('хозяин') || role.includes('староста')) {
    return {
      trust: status.includes('свой') ? 2 : 0,
      fear: status.includes('чуж') ? 1 : 0,
      respect: 1,
      hostility: status.includes('чуж') ? 1 : 0
    };
  }
  if (role.includes('служ')) {
    return {
      trust: 0,
      fear: 1,
      respect: 0,
      hostility: status.includes('чуж') ? 1 : 0
    };
  }
  return {
    trust: status.includes('торгов') ? 1 : 0,
    fear: 0,
    respect: 0,
    hostility: status.includes('чуж') ? 1 : 0
  };
}

function deriveProperty(role, index) {
  if (role.includes('хозяин') || role.includes('староста')) return ['ключ', 'связка ремней', 'печатка'];
  if (role.includes('служ')) return ['связка верёвок', 'ковш', 'нож'];
  if (role.includes('торгов')) return ['кошель', 'образцы товара', 'весы'];
  return [['мешок', 'ложка'], ['верёвка', 'корзина'], ['нож', 'заплатанная сумка']][index % 3];
}

function deriveInventory(role, index) {
  if (role.includes('знах') || role.includes('леч') || role.includes('монах') || role.includes('повив')) {
    return ['чистая ткань', 'травы', 'мёд', 'вода', 'игла и нить'];
  }
  if (role.includes('старост') || role.includes('хозяин')) {
    return ['лен', 'вода', 'вино', 'полотно'];
  }
  if (role.includes('служ')) {
    return ['кусок ткани', 'вода', 'ремень'];
  }
  if (role.includes('торгов')) {
    return ['лен', 'вино', 'воск', 'полотно'];
  }
  return [['тряпка', 'вода'], ['лен', 'сало'], ['верёвка', 'ткань']][index % 3];
}

function deriveMedicalSkill(role, index) {
  if (role.includes('знах') || role.includes('леч') || role.includes('монах') || role.includes('повив')) return 3;
  if (role.includes('хозяин') || role.includes('староста')) return 1;
  if (role.includes('служ')) return 1;
  if (role.includes('торгов')) return 1;
  return index % 2;
}

function deriveAgeRange(role, kind, index) {
  if (kind === 'player') return 'неизвестно';
  if (role.includes('староста') || role.includes('хозяин')) return '35-55';
  if (role.includes('подмаст') || role.includes('мальчик') || role.includes('служ')) return '12-30';
  if (role.includes('знах') || role.includes('монах')) return '25-60';
  return ['15-25', '20-35', '25-45'][index % 3];
}

function deriveOrigin(role, kind, currentLocationId, index) {
  if (kind === 'player') return 'неизвестно';
  if (role.includes('торгов')) return 'пригород или торговый путь';
  if (role.includes('служ')) return 'местный двор или зависимое хозяйство';
  if (role.includes('знах') || role.includes('монах')) return 'местная община';
  if (role.includes('староста') || role.includes('хозяин')) return 'текущая община';
  return `окрестность ${currentLocationId ?? index}`;
}

function deriveSocialPosition(role, kind, player) {
  if (kind === 'player') return player?.socialClass ?? 'неизвестно';
  if (role.includes('хозяин') || role.includes('староста')) return 'местный старший';
  if (role.includes('торгов')) return 'торговый человек';
  if (role.includes('служ')) return 'зависимый';
  if (role.includes('монах') || role.includes('знах')) return 'специалист';
  return 'обычный человек';
}

function deriveWorldPosition(role, kind, player) {
  if (kind === 'player') {
    return player?.worldPosition ?? player?.socialClass ?? 'неизвестно';
  }
  if (role.includes('староста') || role.includes('хозяин')) return 'местный распорядитель';
  if (role.includes('торгов')) return 'человек дороги и обмена';
  if (role.includes('служ')) return 'подчинённый человек';
  if (role.includes('монах') || role.includes('знах')) return 'служитель знания и помощи';
  return 'обычный человек места';
}

function deriveAnswerableTo(role, index) {
  if (role.includes('хозяин') || role.includes('староста')) return 'община или верхняя власть';
  if (role.includes('торгов')) return 'свой двор, старшие или партнёры по сделке';
  if (role.includes('служ')) return 'хозяин или старший';
  if (role.includes('монах') || role.includes('знах')) return 'настоятель, община или нужда';
  return ['хозяину', 'семье', 'старшему', 'общине'][index % 4];
}

function deriveDutyTo(role, index) {
  if (role.includes('хозяин') || role.includes('староста')) return 'община или власть';
  if (role.includes('торгов')) return 'покупатель, хозяин дела или сам торг';
  if (role.includes('служ')) return 'хозяин или старший';
  if (role.includes('монах') || role.includes('знах')) return 'нуждающиеся и община';
  return ['семье', 'старшему', 'дому', 'общине'][index % 4];
}

function deriveResponsibleFor(role, index) {
  if (role.includes('хозяин') || role.includes('староста')) return ['двор', 'домочадцев', 'порядок'];
  if (role.includes('торгов')) return ['товар', 'сделку'];
  if (role.includes('служ')) return ['поручение', 'переданное дело'];
  if (role.includes('монах') || role.includes('знах')) return ['помощь', 'лечение'];
  return [index % 2 === 0 ? 'младших' : 'своё дело'];
}

function deriveReasonHere(role, kind, currentLocationId) {
  if (kind === 'player') return 'неизвестно';
  if (role.includes('хозяин') || role.includes('староста')) return 'следит за двором и порядком';
  if (role.includes('торгов')) return 'торгует или ожидает обмена';
  if (role.includes('служ')) return 'исполняет поручения';
  if (role.includes('знах') || role.includes('леч') || role.includes('монах')) return 'здесь ради помощи и нужных дел';
  return `оказался в месте ${currentLocationId ?? 'неизвестно'} по своим делам`;
}

function deriveNoFamilyReason(source, kind) {
  if (Array.isArray(source.family) && source.family.length > 0) return 'семья указана';
  if (kind === 'player') return 'игрок не сообщил родню';
  return 'родня не известна или не названа';
}

function deriveOccupation(role, kind) {
  if (role.includes('торгов')) return 'торговля';
  if (role.includes('служ')) return 'служба';
  if (role.includes('знах') || role.includes('монах')) return 'лечение или помощь';
  if (role.includes('староста') || role.includes('хозяин')) return 'управление двором';
  if (kind === 'player') return 'неизвестно';
  return 'повседневный труд';
}

function deriveSkills(role, kind, index) {
  if (role.includes('торгов')) return ['считать меру', 'торговаться', 'оценивать товар'];
  if (role.includes('служ')) return ['носить поручения', 'держать порядок', 'открывать и запирать'];
  if (role.includes('знах') || role.includes('монах')) return ['перевязывать раны', 'знать молитвы', 'готовить травы'];
  if (role.includes('староста') || role.includes('хозяин')) return ['считать припасы', 'разбирать споры', 'следить за порядком'];
  if (kind === 'player') return ['наблюдать', 'слушать людей', 'держать свои вещи'];
  return [
    ['работать руками', 'помнить дорогу'],
    ['следить за вещами', 'не привлекать лишнего внимания'],
    ['разговаривать с людьми', 'собирать слухи']
  ][index % 3];
}

function deriveCurrentActivity(role, kind) {
  if (kind === 'player') return 'ожидает первого действия';
  if (role.includes('торгов')) return 'считает цену и присматривается';
  if (role.includes('служ')) return 'выполняет поручение';
  if (role.includes('знах') || role.includes('монах')) return 'осматривает нуждающихся';
  return 'занят повседневным делом';
}

function deriveNextTask(role, kind) {
  if (kind === 'player') return 'неизвестно';
  if (role.includes('торгов')) return 'следующая сделка или проверка товара';
  if (role.includes('служ')) return 'следующее поручение';
  if (role.includes('знах') || role.includes('монах')) return 'следующая помощь или перевязка';
  return 'следующее хозяйственное дело';
}

function deriveDutyWindow(role, kind) {
  if (kind === 'player') return 'неизвестно';
  if (role.includes('служ')) return 'в течение дня';
  if (role.includes('торгов')) return 'пока открыт торг';
  if (role.includes('знах') || role.includes('монах')) return 'по вызову и по нужде';
  return 'по ходу дня';
}

function deriveInterruptionRule(role, kind) {
  if (kind === 'player') return 'неизвестно';
  if (role.includes('служ')) return 'прерывается, если зовёт старший';
  if (role.includes('торгов')) return 'прерывается, если появился выгодный покупатель или угроза';
  if (role.includes('знах') || role.includes('монах')) return 'прерывается только по срочной нужде или власти';
  return 'прерывается, если это требует хозяин или опасность';
}

function deriveBodyState(role, kind) {
  if (kind === 'player') return 'неизвестно';
  if (role.includes('монах') || role.includes('знах')) return 'трудовой, но осторожный';
  if (role.includes('служ')) return 'рабочий, уставший';
  return 'обычное телесное состояние';
}

function deriveClothing(role, kind) {
  if (kind === 'player') return 'неизвестно';
  if (role.includes('торгов')) return 'плотная дорожная одежда';
  if (role.includes('служ')) return 'простая рабочая одежда';
  if (role.includes('знах') || role.includes('монах')) return 'скромная одежда';
  return 'обычная повседневная одежда';
}

function deriveLanguage(role, kind) {
  if (kind === 'player') return 'неизвестно';
  if (role.includes('торгов')) return 'местный говор с торговыми словами';
  if (role.includes('монах')) return 'книжный и местный говор';
  return 'местный говор';
}

function deriveLiteracy(role, kind) {
  if (kind === 'player') return 'неизвестно';
  if (role.includes('монах') || role.includes('чинов')) return 'грамотен';
  if (role.includes('торгов')) return 'частично грамотен';
  return 'неизвестно';
}

function deriveManner(role, index) {
  if (role.includes('староста') || role.includes('хозяин')) return ['сдержан', 'рассудителен'][index % 2];
  if (role.includes('торгов')) return ['внимателен', 'торгуется', 'прикидывает выгоду'][index % 3];
  if (role.includes('служ')) return ['осторожен', 'почтителен'][index % 2];
  if (role.includes('знах') || role.includes('монах')) return ['тих', 'собран'][index % 2];
  return ['прямолинеен', 'насторожен', 'деловит'][index % 3];
}

function deriveSpeech(role, index) {
  if (role.includes('староста') || role.includes('хозяин')) return ['говорит коротко', 'говорит веско'][index % 2];
  if (role.includes('торгов')) return ['торгуется словами', 'говорит быстро и с оглядкой'][index % 2];
  if (role.includes('служ')) return ['говорит по уставу', 'говорит с оглядкой'][index % 2];
  if (role.includes('знах') || role.includes('монах')) return ['говорит тихо', 'говорит размеренно'][index % 2];
  return ['говорит просто', 'говорит с опаской', 'говорит прямым словом'][index % 3];
}

function deriveCourage(role, index) {
  if (role.includes('староста') || role.includes('хозяин')) return 4 + (index % 3);
  if (role.includes('торгов')) return 3 + (index % 3);
  if (role.includes('служ')) return 5 + (index % 2);
  if (role.includes('знах') || role.includes('монах')) return 2 + (index % 3);
  return 2 + (index % 5);
}

function deriveGreed(role, index) {
  if (role.includes('торгов')) return 6 + (index % 3);
  if (role.includes('хозяин')) return 4 + (index % 2);
  return 2 + (index % 4);
}

function deriveCaution(role, index) {
  if (role.includes('служ') || role.includes('знах') || role.includes('монах')) return 6 + (index % 3);
  if (role.includes('торгов')) return 5 + (index % 2);
  return 4 + (index % 4);
}

function deriveHonesty(role, index) {
  if (role.includes('монах') || role.includes('знах')) return 7 + (index % 2);
  if (role.includes('староста')) return 5 + (index % 2);
  return 3 + (index % 4);
}

function deriveSuperstition(role, index) {
  if (role.includes('монах')) return 1 + (index % 2);
  if (role.includes('знах')) return 4 + (index % 3);
  return 3 + (index % 4);
}

function deriveTemper(role, index) {
  if (role.includes('служ')) return 6 + (index % 3);
  if (role.includes('торгов')) return 5 + (index % 3);
  if (role.includes('староста')) return 4 + (index % 2);
  return 5 + (index % 4);
}

function deriveKnowledgeSeen(role, index) {
  const base = ['видел здешние порядки', 'знает местных людей'];
  if (role.includes('торгов')) base.push('видел дороги и торг');
  if (role.includes('служ')) base.push('видел поручения и наказания');
  if (role.includes('монах') || role.includes('знах')) base.push('видел больных и нужды');
  return base.slice(0, 2 + (index % 2));
}

function deriveKnowledgeHeard(role, index) {
  const base = ['слышал местные слухи', 'слышал о соседях'];
  if (role.includes('торгов')) base.push('слышал о ценах и дороге');
  if (role.includes('служ')) base.push('слышал о власти и наказаниях');
  if (role.includes('монах') || role.includes('знах')) base.push('слышал о болезнях и помощи');
  return base.slice(0, 2 + (index % 2));
}

function deriveKnowledgeMisread(role, index) {
  const base = ['ошибается в чужих намерениях'];
  if (role.includes('торгов')) base.push('неверно судит о чужой цене');
  if (role.includes('служ')) base.push('неверно понимает приказ');
  if (role.includes('монах') || role.includes('знах')) base.push('может путать слух и факт');
  return base.slice(0, 1 + (index % 2));
}

function deriveKnowledgeHidden(role, index) {
  const base = ['что-то скрывает о себе'];
  if (role.includes('торгов')) base.push('прячет выгоду или потери');
  if (role.includes('служ')) base.push('скрывает промах или страх');
  if (role.includes('монах') || role.includes('знах')) base.push('не всё говорит о больных');
  return base.slice(0, 1 + (index % 2));
}

function deriveNeighbors(role, index) {
  const base = ['сосед по месту', 'знакомый человек'];
  if (role.includes('торгов')) base.push('люди с дороги');
  if (role.includes('служ')) base.push('люди двора');
  return base.slice(0, 2 + (index % 2));
}

function deriveEnemies(role, index) {
  const base = ['потенциальный недруг'];
  if (role.includes('служ')) base.push('тот, кто может наказать');
  if (role.includes('торгов')) base.push('конкурент или должник');
  return base.slice(0, 1 + (index % 2));
}

function deriveDebtors(role, index) {
  const base = ['должников не названо'];
  if (role.includes('торгов')) base.push('кто-то должен за товар');
  if (role.includes('хозяин')) base.push('зависимые люди');
  return base.slice(0, 1 + (index % 2));
}

function derivePatrons(role, index) {
  const base = ['покровитель не назван'];
  if (role.includes('служ')) base.push('хозяин или старший');
  if (role.includes('монах') || role.includes('знах')) base.push('община или церковная власть');
  return base.slice(0, 1 + (index % 2));
}

function deriveAuthorityFear(role, index) {
  if (role.includes('служ')) return 6 + (index % 3);
  if (role.includes('торгов')) return 4 + (index % 3);
  return 3 + (index % 4);
}

function deriveCommunityFear(role, index) {
  if (role.includes('хозяин') || role.includes('староста')) return 4 + (index % 3);
  if (role.includes('служ')) return 5 + (index % 2);
  return 3 + (index % 4);
}

function deriveAccess(role, index) {
  const base = ['двор', 'место работы'];
  if (role.includes('торгов')) base.push('торговый путь');
  if (role.includes('служ')) base.push('приказ или порученный проход');
  if (role.includes('монах') || role.includes('знах')) base.push('лечебное или молитвенное место');
  return base.slice(0, 2 + (index % 2));
}

function normalizeFacts(values, fallback, options = {}) {
  const list = Array.isArray(values)
    ? values
        .flatMap((item) => formatFactValue(item))
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
    : [];
  if (list.length > 0) return list;
  if (options.allowEmpty) return [];
  const fallbackList = Array.isArray(fallback)
    ? fallback.flatMap((item) => formatFactValue(item))
    : formatFactValue(fallback);
  const normalizedFallback = fallbackList
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
  return normalizedFallback.length > 0 ? normalizedFallback : (options.allowEmpty ? [] : ['неизвестно']);
}

function mergeActorProfile(base, extra) {
  if (!extra || typeof extra !== 'object') return base;
  return {
    ...base,
    ...extra,
    identity: { ...base.identity, ...extra.identity },
    kinship: {
      ...base.kinship,
      ...extra.kinship,
      familyFacts: mergeArray(base.kinship.familyFacts, extra.kinship?.familyFacts),
      obligations: mergeArray(base.kinship.obligations, extra.kinship?.obligations)
    },
    property: {
      ...base.property,
      ...extra.property,
      carried: mergeArray(base.property.carried, extra.property?.carried),
      outsideAccess: mergeArray(base.property.outsideAccess, extra.property?.outsideAccess),
      rights: mergeArray(base.property.rights, extra.property?.rights),
      ownershipFacts: mergeArray(base.property.ownershipFacts, extra.property?.ownershipFacts)
    },
    work: {
      ...base.work,
      ...extra.work,
      skills: mergeArray(base.work.skills, extra.work?.skills)
    },
    body: { ...base.body, ...extra.body },
    mind: {
      ...base.mind,
      ...extra.mind,
      memory: mergeArray(base.mind.memory, extra.mind?.memory),
      knowledge: mergeArray(base.mind.knowledge, extra.mind?.knowledge),
      fears: mergeArray(base.mind.fears, extra.mind?.fears),
      goals: mergeArray(base.mind.goals, extra.mind?.goals)
    }
  };
}

function mergeArray(base, extra) {
  const next = Array.isArray(extra)
    ? extra.flatMap((item) => formatFactValue(item)).map((item) => String(item ?? '').trim()).filter(Boolean)
    : [];
  return next.length > 0 ? next : base;
}

function formatFactValue(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => formatFactValue(item));
  if (typeof value === 'string') {
    const text = value.trim();
    return text ? [text] : [];
  }
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (typeof value === 'object') {
    const parts = [
      value.relation ? String(value.relation) : '',
      value.targetName ? String(value.targetName) : '',
      value.name ? String(value.name) : '',
      value.label ? String(value.label) : '',
      value.text ? String(value.text) : '',
      value.detail ? String(value.detail) : '',
      value.value ? String(value.value) : ''
    ].map((item) => item.trim()).filter(Boolean);
    if (parts.length > 0) return [parts.join(': ')];
    try {
      const serialized = JSON.stringify(value);
      return serialized && serialized !== '{}' ? [serialized] : [];
    } catch {
      return [];
    }
  }
  const text = String(value).trim();
  return text ? [text] : [];
}

export function syncActorProfileFromNpc(npc) {
  if (!npc?.actorProfile || typeof npc.actorProfile !== 'object') return;
  if (npc.actorProfile.source === 'llm') return;

  const familyFacts = normalizeFacts(
    npc.family,
    npc.actorProfile.kinship?.noFamilyReason ?? 'Родня не указана или неизвестна.'
  );
  npc.actorProfile.kinship.familyFacts = familyFacts;
  npc.actorProfile.kinship.obligations = normalizeFacts(
    npc.obligations ?? npc.actorProfile.kinship.obligations,
    'Обязательства не указаны.'
  );
  npc.actorProfile.property.carried = normalizeFacts(
    resolveNpcInventory(npc),
    npc.actorProfile.property?.carried?.[0] ?? 'При себе ничего не указано.'
  );
  npc.actorProfile.property.outsideAccess = normalizeFacts(
    resolveNpcProperty(npc),
    npc.actorProfile.property?.outsideAccess?.[0] ?? 'Вне доступа имущества не указано.'
  );
  npc.actorProfile.property.access = normalizeFacts(
    npc.access,
    npc.actorProfile.property?.access?.[0] ?? 'Доступ не указан.'
  );
  npc.actorProfile.work.routine = normalizeFacts(
    npc.routine,
    npc.actorProfile.work?.routine?.[0] ?? 'Рутина не указана.'
  );
  npc.actorProfile.work.dutyTo = npc.dutyTo ?? npc.actorProfile.work?.dutyTo ?? 'неизвестно';
  npc.actorProfile.work.answerableTo = npc.answerableTo ?? npc.actorProfile.work?.answerableTo ?? 'неизвестно';
  npc.actorProfile.work.responsibleFor = normalizeFacts(
    npc.responsibleFor,
    npc.actorProfile.work?.responsibleFor?.[0] ?? 'Ни за кого не отвечает.'
  );
  npc.actorProfile.body.pain = npc.pain ?? npc.actorProfile.body?.pain ?? 0;
  npc.actorProfile.body.intoxication = npc.intoxication ?? npc.actorProfile.body?.intoxication ?? 0;
  npc.actorProfile.mind.seen = normalizeFacts(npc.knowledgeSeen, npc.actorProfile.mind?.seen?.[0] ?? 'Наблюдения не указаны.');
  npc.actorProfile.mind.heard = normalizeFacts(npc.knowledgeHeard, npc.actorProfile.mind?.heard?.[0] ?? 'Слухи не указаны.');
  npc.actorProfile.mind.misunderstood = normalizeFacts(npc.knowledgeMisread, npc.actorProfile.mind?.misunderstood?.[0] ?? 'Ошибки понимания не указаны.');
  npc.actorProfile.mind.hidden = npc.profileLevel === 'key'
    ? normalizeFacts(npc.knowledgeHidden, npc.actorProfile.mind?.hidden?.[0] ?? 'Скрываемое не указано.')
    : [];
  npc.actorProfile.mind.manner = normalizeFacts(npc.manner, npc.actorProfile.mind?.manner?.[0] ?? 'Манера не указана.');
  npc.actorProfile.mind.speech = normalizeFacts(npc.speech, npc.actorProfile.mind?.speech?.[0] ?? 'Манера речи не указана.');
  npc.actorProfile.mind.courage = npc.courage ?? npc.actorProfile.mind?.courage ?? 0;
  npc.actorProfile.mind.greed = npc.greed ?? npc.actorProfile.mind?.greed ?? 0;
  npc.actorProfile.mind.caution = npc.caution ?? npc.actorProfile.mind?.caution ?? 0;
  npc.actorProfile.mind.honesty = npc.honesty ?? npc.actorProfile.mind?.honesty ?? 0;
  npc.actorProfile.mind.superstition = npc.superstition ?? npc.actorProfile.mind?.superstition ?? 0;
  npc.actorProfile.mind.temper = npc.temper ?? npc.actorProfile.mind?.temper ?? 0;
  npc.actorProfile.mind.goals = normalizeFacts(npc.goals, npc.actorProfile.mind?.goals?.[0] ?? 'Цели неизвестны.');
  npc.actorProfile.mind.fears = normalizeFacts(npc.fears, npc.actorProfile.mind?.fears?.[0] ?? 'Страхи неизвестны.');
  npc.actorProfile.mind.memory = normalizeFacts(npc.memory, npc.actorProfile.mind?.memory?.[0] ?? 'Память не заполнена.');
  npc.occupation = npc.actorProfile.work?.occupation ?? npc.occupation ?? 'неизвестно';
  npc.skills = normalizeFacts(
    Array.isArray(npc.skills) && npc.skills.length > 0 ? npc.skills : npc.actorProfile.work?.skills,
    npc.actorProfile.work?.skills ?? 'Навыки не указаны.'
  );
  npc.actorProfile.profileLevel = normalizeNpcProfileLevel(
    npc.profileLevel ?? npc.actorProfile.profileLevel ?? null
  );

  const profileLevel = normalizeNpcProfileLevel(npc.profileLevel ?? npc.actorProfile.profileLevel ?? null);
  const clippedNpc = applyNpcProfileDepth(npc, profileLevel);
  clippedNpc.actorProfile = selectNpcActorProfileDepth(clippedNpc.actorProfile ?? npc.actorProfile, profileLevel);
  Object.assign(npc, clippedNpc);
}

function deriveRelationKind(a, b) {
  if (a.homeLocation === b.homeLocation) return 'household';
  if (a.role.includes('торгов') || b.role.includes('торгов')) return 'trade';
  if (/хозяин|староста/.test(a.role) && /служ|подмаст/.test(b.role)) return 'patronage';
  if (/хозяин|староста/.test(b.role) && /служ|подмаст/.test(a.role)) return 'patronage';
  return 'acquaintance';
}

function deriveRelationStrength(a, b, kind) {
  if (kind === 'household') return 3;
  if (kind === 'patronage') return 2;
  if (kind === 'trade') return 1;
  return a.homeLocation === b.homeLocation ? 2 : 1;
}

function groupBy(values, keyFn) {
  return values.reduce((acc, value) => {
    const key = keyFn(value);
    if (!acc[key]) acc[key] = [];
    acc[key].push(value);
    return acc;
  }, {});
}

function slugify(text) {
  return String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
}
