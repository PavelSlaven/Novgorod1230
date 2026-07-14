import { getCurrentLocation } from './location.js';
import { normalizeNpcProfileLevel, syncActorProfileFromNpc } from './entities.js';
import { recordWorldEvent } from './event-log.js';
import { allowsProceduralSemantics, queueSemanticPending } from './semantic-gate.js';
import { assessLegalPressure } from './law.js';

export function createSocialState() {
  return {
    reputation: 0,
    suspicion: 0,
    favors: 0,
    debts: 0,
    knownBy: [],
    recentWitnesses: [],
    lastConsequence: null,
    socialMemory: []
  };
}

export function ensureSocialState(world) {
  if (!world.social) world.social = createSocialState();
  if (!Array.isArray(world.social.knownBy)) world.social.knownBy = [];
  if (!Array.isArray(world.social.recentWitnesses)) world.social.recentWitnesses = [];
  if (!Array.isArray(world.social.socialMemory)) world.social.socialMemory = [];
  if (typeof world.social.reputation !== 'number') world.social.reputation = 0;
  if (typeof world.social.suspicion !== 'number') world.social.suspicion = 0;
  if (typeof world.social.favors !== 'number') world.social.favors = 0;
  if (typeof world.social.debts !== 'number') world.social.debts = 0;
  return world.social;
}

export function assessActionSocialRisk(world, frame, intent) {
  const social = ensureSocialState(world);
  const witnesses = Array.isArray(frame?.world?.social?.witnesses)
    ? frame.world.social.witnesses.length
    : (Array.isArray(social.recentWitnesses) ? social.recentWitnesses.length : 0);
  const legal = assessLegalPressure(world, intent, null);
  let score = legal.severity;
  const factors = [];

  if ((social.suspicion ?? 0) > 5) {
    score += 2;
    factors.push('suspicion');
  }
  if (witnesses > 0) {
    score += witnesses;
    factors.push('witnesses');
  }
  if ((social.knownBy?.length ?? 0) > 0) {
    score += 1;
    factors.push('known_by');
  }
  if (intent?.type === 'attack') {
    score += 3;
    factors.push('violence');
  }
  if (intent?.type === 'steal') {
    score += 4;
    factors.push('theft');
  }

  return {
    social_risk_score: score,
    factors,
    visible_witnesses: witnesses,
    rumor_risk: score >= 6 ? 'high' : (score >= 3 ? 'medium' : 'low'),
    legal_risk: legal.severity >= 3 ? 'high' : (legal.severity >= 1 ? 'medium' : 'low'),
    legal
  };
}

export function applySocialConsequence(world, intent, resolutionText, aftermath = null) {
  const social = ensureSocialState(world);
  const location = getCurrentLocation(world);
  const witnesses = collectWitnesses(world);
  const witnessNpcs = collectWitnessNpcs(world);
  const audience = collectSocialAudience(world, witnessNpcs);
  const recognizedItems = collectRecognizedPlayerItems(world, audience);
  const memories = [];

  social.recentWitnesses = witnesses.slice(0, 6);
  if (witnesses.length > 0 && !social.knownBy.includes(location?.name ?? world.place.name)) {
    social.knownBy.push(location?.name ?? world.place.name);
  }

  const baseEffect = buildSocialEffect(intent, witnesses.length > 0, resolutionText, aftermath);
  social.lastConsequence = baseEffect.label;
  social.suspicion = clamp(social.suspicion + baseEffect.suspicion, 0, 20);
  social.favors = clamp(social.favors + baseEffect.favors, 0, 20);
  social.debts = clamp(social.debts + baseEffect.debts, 0, 20);
  if (recognizedItems.length > 0) {
    social.suspicion = clamp(social.suspicion + Math.min(3, recognizedItems.length), 0, 20);
    social.lastConsequence = 'узнавание вещи';
  }

  for (const npc of audience) {
    const perception = buildNpcPerception(world, npc, intent, location, witnesses, resolutionText, recognizedItems);
    if (!perception) continue;
    memories.push(perception);
    recordNpcSocialMemory(npc, perception);
  }

  const propagated = propagateSocialMemory(world, memories, audience);
  if (propagated.length > 0) {
    memories.push(...propagated);
  }

  if (memories.length > 0) {
    social.socialMemory.unshift(...memories.slice(0, 8));
    social.socialMemory = social.socialMemory.slice(0, 20);
    if (allowsProceduralSemantics(world)) {
      addRumorsFromMemories(world, memories);
    } else {
      queueSemanticPending(world, 'social_rumors', { count: memories.length, intent: intent?.type ?? null });
    }
  }

  if (resolutionText && /не принимает заявление за факт/i.test(resolutionText)) {
    social.suspicion += 1;
  }

  updateNpcAttitudes(world, intent, witnesses.length > 0);
  promoteNpcProfiles(world, intent, witnesses.length > 0, audience);
  refreshWorldReputationFromMemory(world, audience, baseEffect, aftermath);

  social.reputation = clamp(social.reputation, -10, 10);
  social.suspicion = clamp(social.suspicion, 0, 20);
  social.favors = clamp(social.favors, 0, 20);
  social.debts = clamp(social.debts, 0, 20);

  return social;
}

export function describeSocialState(world) {
  const social = ensureSocialState(world);
  const mood = describeLocalMood(social);
  const witnessText = social.recentWitnesses.length
    ? `Свидетели: ${social.recentWitnesses.join(', ')}.`
    : 'Свидетелей вокруг немного.';
  const memoryText = social.socialMemory.length
    ? `Память: ${social.socialMemory.slice(0, 3).map((item) => item.perception).join(' / ')}.`
    : 'Память NPC пока пуста.';
  return `${mood} ${witnessText} ${memoryText} Долги: ${social.debts}, услуги: ${social.favors}, подозрение: ${social.suspicion}.`;
}

function collectWitnesses(world) {
  return collectWitnessNpcs(world).map((npc) => npc.name).filter(Boolean);
}

function collectWitnessNpcs(world) {
  const location = getCurrentLocation(world);
  if (!location) return [];
  return (world.npcs ?? []).filter((npc) => isNpcNearby(world, npc));
}

function collectSocialAudience(world, witnessNpcs) {
  const audience = new Map();
  for (const npc of witnessNpcs) {
    if (npc?.id) audience.set(npc.id, npc);
  }
  return [...audience.values()];
}

function isSociallyConnected(world, npc, witnessIds) {
  if (!npc) return false;
  if (witnessIds.has(npc.id)) return true;
  const family = Array.isArray(npc.family) ? npc.family : [];
  if (family.some((item) => witnessIds.has(item?.targetNpcId))) return true;
  const location = getCurrentLocation(world);
  if (!location) return false;
  if ((npc.homeLocation ?? npc.locationId) === location.id && (location.occupants ?? []).includes(npc.name)) return true;
  return false;
}

function buildSocialEffect(intent, witnessed, resolutionText, aftermath = null) {
  const effect = { label: 'неясность', suspicion: 1, favors: 0, debts: 0 };
  if (intent.type === 'claim') {
    effect.label = 'претензия';
    effect.suspicion = witnessed ? 2 : 1;
    effect.debts = 0;
  } else if (intent.type === 'attack') {
    effect.label = 'насилие';
    effect.suspicion = 4;
    effect.debts = 1;
    effect.suspicion += Number(aftermath?.suspicion ?? 0);
    effect.debts += Number(aftermath?.debts ?? 0);
  } else if (intent.type === 'trade') {
    effect.label = 'торг';
    effect.suspicion = 0;
    effect.favors = witnessed ? 1 : 0;
  } else if (intent.type === 'defend') {
    effect.label = 'оборона';
    effect.suspicion = witnessed ? 1 : 0;
  } else if (intent.type === 'flee') {
    effect.label = 'бегство';
    effect.suspicion = 1;
  } else if (intent.type === 'talk') {
    effect.label = 'разговор';
    effect.suspicion = 0;
    effect.favors = witnessed ? 1 : 0;
  } else if (intent.type === 'move') {
    effect.label = 'переход';
    effect.suspicion = 0;
  } else if (intent.type === 'rest' || intent.type === 'wait') {
    effect.label = 'ожидание';
    effect.suspicion = 0;
  }

  if (resolutionText && /не принимает заявление за факт/i.test(resolutionText)) {
    effect.suspicion += 1;
  }

  if (Number(aftermath?.fear ?? 0) > 0) {
    effect.suspicion += 1;
  }

  return effect;
}

function buildNpcPerception(world, npc, intent, location, witnesses, resolutionText, recognizedItems = []) {
  if (!npc) return null;
  const role = String(npc.role ?? '').toLowerCase();
  const direct = isNpcNearby(world, npc);
  const relationTone = role.includes('старост') || role.includes('чин') || role.includes('сторож')
    ? 'через закон и обычай'
    : Array.isArray(npc.family) && npc.family.length > 0
      ? 'через родню и долг'
      : 'через слух и пересказ';
  const itemRecognition = describeRecognizedItemsForNpc(npc, recognizedItems);
  const actionText = itemRecognition
    ? `${buildActionMemoryText(intent, resolutionText)}; ${itemRecognition}`
    : buildActionMemoryText(intent, resolutionText);
  const perception = direct
    ? `Видел сам: ${actionText} в ${location?.name ?? 'месте'}`
    : `Слышал: ${actionText} в ${location?.name ?? 'месте'} (${relationTone})`;

  return {
    id: `social:${world.worldId}:${world.clock.day}:${world.clock.hour}:${slugify(npc.id ?? npc.name ?? 'npc')}:${slugify(intent.type)}`,
    at: { ...world.clock },
    action: intent.type,
    actor: world.player?.name ?? 'игрок',
    place: location?.name ?? world.place?.name ?? 'неизвестно',
    perception,
    source: direct ? 'видел' : 'слышал',
    witnesses: witnesses.slice(0, 6),
    confidence: direct ? 0.8 : 0.45,
    recipientNpcId: npc.id ?? null,
    recipientNpcName: npc.name ?? null,
    spreadDepth: 0,
    heardFrom: direct ? null : 'слух',
    tone: deriveMemoryTone(intent),
    effect: intent.type
  };
}

function collectRecognizedPlayerItems(world, audience) {
  const playerId = world.player?.id ?? 'player';
  const items = collectPlayerHeldItems(world.player);
  if (!items.length || !Array.isArray(audience) || !audience.length) return [];

  const recognized = [];
  for (const npc of audience) {
    const npcId = String(npc?.id ?? '').trim();
    if (!npcId) continue;
    for (const item of items) {
      const ownerId = String(item?.owner_id ?? item?.ownerId ?? '').trim();
      const holderId = String(item?.holder_id ?? item?.holderId ?? playerId).trim();
      if (ownerId !== npcId || holderId !== playerId) continue;
      if (!isRecognizableMarkedItem(item)) continue;
      recognized.push({
        npcId,
        npcName: npc.name ?? null,
        label: item.label ?? item.name ?? item.id ?? 'вещь',
        marks: Array.isArray(item.marks ?? item.traces) ? (item.marks ?? item.traces).slice(0, 3) : []
      });
    }
  }
  return recognized.slice(0, 6);
}

function collectPlayerHeldItems(player) {
  const items = player?.items && typeof player.items === 'object' ? player.items : {};
  return [
    ...(Array.isArray(items.carried_items) ? items.carried_items : []),
    ...(Array.isArray(items.weapons) ? items.weapons : []),
    ...(Array.isArray(items.armor) ? items.armor : []),
    ...(Array.isArray(items.equipment) ? items.equipment : []),
    ...(Array.isArray(items.borrowed_items) ? items.borrowed_items : []),
    ...(Array.isArray(items.foreign_items_with_character) ? items.foreign_items_with_character : [])
  ];
}

function isRecognizableMarkedItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.visible === false) return false;
  const marks = Array.isArray(item.marks ?? item.traces) ? (item.marks ?? item.traces) : [];
  if (marks.length === 0) return false;
  const discoverability = normalizeDiscoverability(item.discoverability);
  return discoverability >= 4;
}

function normalizeDiscoverability(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'obvious' || text === 'visible' || text === 'documented') return 5;
  if (text === 'partial') return 3;
  if (text === 'hidden' || text === 'secret') return 1;
  return 0;
}

function describeRecognizedItemsForNpc(npc, recognizedItems) {
  const npcId = String(npc?.id ?? '').trim();
  const matches = (Array.isArray(recognizedItems) ? recognizedItems : [])
    .filter((item) => item.npcId === npcId)
    .slice(0, 2);
  if (!matches.length) return '';
  return matches
    .map((item) => {
      const marks = item.marks.length ? ` по меткам: ${item.marks.join(', ')}` : '';
      return `узнал свою вещь ${item.label}${marks}`;
    })
    .join('; ');
}

function buildActionMemoryText(intent, resolutionText) {
  if (intent.type === 'attack') return 'насилие';
  if (intent.type === 'claim') return 'сомнительную претензию';
  if (intent.type === 'steal') return 'кражу или попытку кражи';
  if (intent.type === 'trade') return 'торг';
  if (intent.type === 'talk') return 'разговор';
  if (intent.type === 'flee') return 'спешный уход';
  if (intent.type === 'move') return 'переход';
  if (intent.type === 'heal') return 'лечение';
  if (intent.type === 'defend') return 'оборону';
  if (resolutionText) return resolutionText.slice(0, 80);
  return intent.raw ?? 'действие';
}

function deriveMemoryTone(intent) {
  if (intent.type === 'attack' || intent.type === 'steal') return 'опасение';
  if (intent.type === 'claim') return 'подозрение';
  if (intent.type === 'trade' || intent.type === 'talk') return 'осторожный интерес';
  if (intent.type === 'heal') return 'сдержанное одобрение';
  return 'нейтрально';
}

function recordNpcSocialMemory(npc, entry) {
  if (!npc) return;
  if (!Array.isArray(npc.socialMemory)) npc.socialMemory = [];
  npc.socialMemory.unshift(entry);
  npc.socialMemory = npc.socialMemory.slice(0, 12);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateNpcAttitudes(world, intent, witnessed) {
  for (const npc of world.npcs ?? []) {
    if (!npc.attitudeToPlayer) {
      npc.attitudeToPlayer = { trust: 0, fear: 0, respect: 0, hostility: 0 };
    }

    const isNearby = isNpcNearby(world, npc);
    const memoryScore = scoreNpcMemory(npc.socialMemory ?? []);
    const directEffect = isNearby || witnessed ? memoryImpact(intent) : 0;
    if (!isNearby && !witnessed && memoryScore === 0 && directEffect === 0) continue;

    if (intent.type === 'attack' || intent.type === 'steal') {
      npc.attitudeToPlayer.hostility = clamp((npc.attitudeToPlayer.hostility ?? 0) + 2 + Math.max(0, -memoryScore), 0, 10);
      npc.attitudeToPlayer.fear = clamp((npc.attitudeToPlayer.fear ?? 0) + 1, 0, 10);
      npc.attitudeToPlayer.trust = clamp((npc.attitudeToPlayer.trust ?? 0) - 2 + memoryScore, -10, 10);
      continue;
    }

    if (intent.type === 'claim') {
      npc.attitudeToPlayer.trust = clamp((npc.attitudeToPlayer.trust ?? 0) - 1 + memoryScore, -10, 10);
      npc.attitudeToPlayer.respect = clamp((npc.attitudeToPlayer.respect ?? 0) - 1, -10, 10);
      npc.attitudeToPlayer.fear = clamp((npc.attitudeToPlayer.fear ?? 0) + (memoryScore < 0 ? 1 : 0), 0, 10);
      continue;
    }

    if (intent.type === 'talk' || intent.type === 'trade') {
      npc.attitudeToPlayer.trust = clamp((npc.attitudeToPlayer.trust ?? 0) + 1 + memoryScore, -10, 10);
      npc.attitudeToPlayer.respect = clamp((npc.attitudeToPlayer.respect ?? 0) + 1, -10, 10);
      continue;
    }

    if (intent.type === 'heal') {
      npc.attitudeToPlayer.trust = clamp((npc.attitudeToPlayer.trust ?? 0) + 1 + Math.max(0, memoryScore), -10, 10);
      npc.attitudeToPlayer.respect = clamp((npc.attitudeToPlayer.respect ?? 0) + 1, -10, 10);
    }
  }
}

function promoteNpcProfiles(world, intent, witnessed, audience) {
  for (const npc of Array.isArray(audience) ? audience : []) {
    if (!npc || typeof npc !== 'object') continue;

    const currentLevel = normalizeNpcProfileLevel(npc.profileLevel ?? npc.actorProfile?.profileLevel ?? null, 'background');
    const nextLevel = determineNpcProfileLevel(npc, intent, witnessed, currentLevel);
    if (nextLevel === currentLevel) continue;

    npc.profileLevel = nextLevel;
    if (npc.actorProfile && typeof npc.actorProfile === 'object') {
      npc.actorProfile.profileLevel = nextLevel;
    }
    syncActorProfileFromNpc(npc);
  }
}

function determineNpcProfileLevel(npc, intent, witnessed, currentLevel) {
  const memoryCount = Array.isArray(npc.socialMemory) ? npc.socialMemory.length : 0;
  const obligations = Array.isArray(npc.obligations) ? npc.obligations.length : 0;
  const debtors = Array.isArray(npc.debtors) ? npc.debtors.length : 0;
  const patrons = Array.isArray(npc.patrons) ? npc.patrons.length : 0;
  const socialLinks = Array.isArray(npc.socialLinks) ? npc.socialLinks.length : 0;
  const attitude = npc.attitudeToPlayer ?? {};
  const attitudePressure = Math.abs(attitude.trust ?? 0) + Math.abs(attitude.respect ?? 0) + Math.abs(attitude.hostility ?? 0) + Math.abs(attitude.fear ?? 0);
  const directContact = witnessed || memoryCount > 0 || attitudePressure > 0;

  if (currentLevel === 'background') {
    if (directContact && intent.type !== 'wait' && intent.type !== 'rest') {
      return 'scene';
    }
    if (memoryCount >= 2 || obligations > 0) {
      return 'scene';
    }
    return currentLevel;
  }

  if (currentLevel === 'scene') {
    const seriousAction = intent.type === 'claim' || intent.type === 'attack' || intent.type === 'trade' || intent.type === 'heal';
    const anchored = obligations > 0;
    const connected = debtors > 0 || patrons > 0 || socialLinks > 2 || attitudePressure >= 5;
    if (seriousAction && witnessed && anchored && connected) {
      return 'key';
    }
  }

  return currentLevel;
}

function isNpcNearby(world, npc) {
  const location = getCurrentLocation(world);
  if (!location) return false;
  if ((npc.locationId ?? npc.homeLocation) !== location.id) return false;
  const currentMicroLocationId = world.current_position?.minilocation_id ?? world.currentMicroLocationId ?? null;
  if (!currentMicroLocationId) return true;
  if (!npc.microLocationId) return true;
  return npc.microLocationId === currentMicroLocationId;
}

function scoreNpcMemory(memories) {
  if (!Array.isArray(memories) || memories.length === 0) return 0;
  return memories.slice(0, 6).reduce((sum, item) => {
    if (!item || typeof item !== 'object') return sum;
    const confidence = clamp(Number(item.confidence ?? 0.4), 0.15, 1);
    if (item.source === 'видел') return sum + memoryWeight(item.action, true) * confidence;
    return sum + memoryWeight(item.action, false) * confidence;
  }, 0);
}

function memoryImpact(intent) {
  return memoryWeight(intent.type, true);
}

function memoryWeight(action, direct) {
  const base = direct ? 1 : 0;
  if (action === 'attack' || action === 'steal') return -3 - base;
  if (action === 'claim') return -2 - base;
  if (action === 'trade') return 1 + base;
  if (action === 'talk') return 1;
  if (action === 'heal') return 2;
  if (action === 'move') return 0;
  if (action === 'flee') return -1;
  return 0;
}

function propagateSocialMemory(world, sourceMemories, audience) {
  if (!Array.isArray(sourceMemories) || sourceMemories.length === 0) return [];
  const propagated = [];
  const frontier = sourceMemories
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      memory: item,
      sourceNpcId: item.recipientNpcId ?? null,
      depth: 0
    }))
    .filter((item) => item.sourceNpcId);

  const maxDepth = 2;
  while (frontier.length > 0) {
    const current = frontier.shift();
    if (!current || current.depth >= maxDepth) continue;
    const sourceNpc = findNpcById(world, current.sourceNpcId);
    if (!sourceNpc) continue;

    const relayTargets = collectRelayTargets(world, sourceNpc);
    for (const target of relayTargets) {
      const entry = buildRelayMemory(world, current.memory, target, current.depth + 1, sourceNpc);
      if (!entry) continue;
      propagated.push(entry);
      recordNpcSocialMemory(target, entry);
      frontier.push({
        memory: entry,
        sourceNpcId: target.id,
        depth: current.depth + 1
      });
    }
  }

  return propagated;
}

function collectRelayTargets(world, sourceNpc) {
  const targets = [];
  const added = new Set();
  const addTarget = (npc, priority = 0) => {
    if (!npc?.id || added.has(npc.id)) return;
    added.add(npc.id);
    targets.push({ ...npc, _priority: priority });
  };

  for (const relation of Array.isArray(sourceNpc.family) ? sourceNpc.family : []) {
    const target = findNpcById(world, relation?.targetNpcId);
    if (!target) continue;
    const priority = relationPriority(relation?.relation, true);
    addTarget(target, priority);
  }

  for (const npc of world.npcs ?? []) {
    if (!npc?.id || npc.id === sourceNpc.id) continue;
    const family = Array.isArray(npc.family) ? npc.family : [];
    if (family.some((item) => item?.targetNpcId === sourceNpc.id)) {
      addTarget(npc, relationPriority('household', true));
    }
  }

  for (const link of Array.isArray(sourceNpc.socialLinks) ? sourceNpc.socialLinks : []) {
    const target = findNpcById(world, link?.targetNpcId);
    if (!target) continue;
    const priority = relationPriority(link?.relation, false);
    if (priority > 0) addTarget(target, priority);
  }

  return targets
    .sort((a, b) => (b._priority ?? 0) - (a._priority ?? 0))
    .slice(0, 4);
}

function buildRelayMemory(world, sourceMemory, targetNpc, depth, sourceNpc) {
  if (!sourceMemory || !targetNpc) return null;
  const relayText = sourceMemory.perception ?? buildActionMemoryText({ type: sourceMemory.action ?? 'unknown' }, null);
  const chain = Array.isArray(sourceMemory.chain) ? sourceMemory.chain.slice(0, 3) : [];
  const relationLabel = describeRelayRelation(sourceNpc, targetNpc, depth);
  return {
    id: `social:${world.worldId}:${world.clock.day}:${world.clock.hour}:${slugify(targetNpc.id)}:${slugify(sourceMemory.action)}:${depth}`,
    at: { ...world.clock },
    action: sourceMemory.action ?? 'rumor',
    actor: sourceMemory.actor ?? world.player?.name ?? 'игрок',
    place: sourceMemory.place ?? world.place?.name ?? 'неизвестно',
    perception: `Слух: ${relayText} (${relationLabel})`,
    source: 'слышал',
    witnesses: Array.isArray(sourceMemory.witnesses) ? sourceMemory.witnesses.slice(0, 6) : [],
    confidence: clamp((Number(sourceMemory.confidence ?? 0.4) * 0.65) - (depth - 1) * 0.1, 0.15, 0.5),
    recipientNpcId: targetNpc.id,
    recipientNpcName: targetNpc.name ?? null,
    spreadDepth: depth,
    heardFrom: sourceNpc?.name ?? 'слух',
    chain: [...chain, sourceNpc?.name ?? 'слух'],
    tone: sourceMemory.tone ?? 'нейтрально',
    effect: sourceMemory.effect ?? sourceMemory.action ?? 'rumor'
  };
}

function describeRelayRelation(sourceNpc, targetNpc, depth) {
  const sourceFamily = Array.isArray(sourceNpc?.family) ? sourceNpc.family : [];
  const directFamily = sourceFamily.find((item) => item?.targetNpcId === targetNpc?.id);
  const targetFamily = Array.isArray(targetNpc?.family) ? targetNpc.family : [];
  const reverseFamily = targetFamily.find((item) => item?.targetNpcId === sourceNpc?.id);
  const relation = directFamily?.relation ?? reverseFamily?.relation ?? '';
  if (/household|сем/i.test(relation)) return depth === 1 ? 'через родню' : 'по родне';
  if (/patronage|старш|хозя/i.test(relation)) return 'через зависимость';
  if (/trade|торг/i.test(relation)) return 'через торговый круг';
  return depth === 1 ? 'через слух' : 'по цепочке слухов';
}

function relationPriority(relation, familyFirst) {
  if (relation && /household|сем/i.test(relation)) return familyFirst ? 4 : 3;
  if (relation && /patronage|старш|хозя/i.test(relation)) return 3;
  if (relation && /trade|торг/i.test(relation)) return 2;
  return familyFirst ? 2 : 1;
}

function findNpcById(world, npcId) {
  if (!npcId) return null;
  return (world.npcs ?? []).find((npc) => npc.id === npcId) ?? null;
}

function addRumorsFromMemories(world, memories) {
  if (!world.memory) world.memory = {};
  if (!Array.isArray(world.memory.heardRumors)) world.memory.heardRumors = [];
  const entries = memories
    .filter((item) => item && typeof item === 'object')
    .map((item) => buildRumorText(item))
    .filter(Boolean);

  if (entries.length === 0) return;
  for (const rumor of entries.slice(0, 4)) {
    world.memory.heardRumors.unshift(rumor);
    recordWorldEvent(world, {
      kind: 'rumor',
      source: 'social',
      visibility: 'public',
      status: 'heard',
      at: { ...world.clock },
      result: rumor
    });
  }
  world.memory.heardRumors = world.memory.heardRumors.slice(0, 12);
}

function buildRumorText(memory) {
  const text = String(memory.perception ?? '').trim();
  if (!text) return null;
  const trimmed = text.length > 120 ? `${text.slice(0, 117)}…` : text;
  return trimmed.startsWith('Слух:') ? trimmed : `Слух: ${trimmed}`;
}

function describeLocalMood(social) {
  if (!allowsProceduralSemantics()) return '';
  const memories = Array.isArray(social.socialMemory) ? social.socialMemory : [];
  const recent = memories.slice(0, 4);
  const hostile = recent.filter((item) => /насилие|кражу|сомнительную претензию/i.test(item.perception ?? '')).length;
  const helpful = recent.filter((item) => /торг|разговор|лечение/i.test(item.perception ?? '')).length;
  if (hostile > helpful + 1) return 'о тебе помнят настороженно';
  if (helpful > hostile + 1) return 'о тебе помнят с пользой';
  if ((social.suspicion ?? 0) > 12) return 'о тебе говорят с опаской';
  return 'о тебе судят по последним поступкам';
}

function refreshWorldReputationFromMemory(world, audience, baseEffect, aftermath = null) {
  if (!world.social) return;
  const scores = (audience ?? []).map((npc) => {
    const memoryScore = scoreNpcMemory(npc.socialMemory ?? []);
    const attitude = npc.attitudeToPlayer ?? {};
    return memoryScore + (attitude.trust ?? 0) + (attitude.respect ?? 0) - (attitude.hostility ?? 0) - Math.floor((attitude.fear ?? 0) / 2);
  });
  if (scores.length === 0) {
    world.social.reputation = clamp((world.social.reputation ?? 0) + baseEffect.suspicion - baseEffect.debts - Number(aftermath?.debts ?? 0), -10, 10);
    return;
  }
  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  world.social.reputation = clamp(Math.round(average), -10, 10);
}

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}
