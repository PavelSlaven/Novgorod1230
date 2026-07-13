import { humanizePhysicalAccess } from './world/item-access.js';
import { describeSocialState } from './world/social.js';
import { applyNpcProfileDepth } from './world/entities.js';
import { humanizeHistoricalPhaseLabel } from './world/historical-context.js';
import { buildPropertyView } from './ui/property-view.js';
import {
  assertPublicUiRootKeys,
  findForbiddenPublicKeys,
  isForbiddenPublicKey
} from './world/json-contracts.js';
import { summarizePublicDelayedEvents } from './world/visibility.js';

function sliceArray(value, limit = 20) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit);
}

function uniqueStrings(values, limit = Infinity) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value ?? '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function getItemLabel(item) {
  if (item == null) return '';
  if (typeof item === 'string') return cleanText(item);
  if (typeof item === 'object') {
    return cleanText(item.name ?? item.label ?? item.title ?? item.id ?? '');
  }
  return cleanText(item);
}

function summarizeItemLabels(items, limit = 2) {
  const labels = uniqueStrings((Array.isArray(items) ? items : []).map(getItemLabel));
  if (!labels.length) return 'пусто';
  if (labels.length <= limit) return labels.join(', ');
  return `${labels.slice(0, limit).join(', ')} и ещё ${labels.length - limit}`;
}

function formatCompactWeight(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const rounded = Math.round(number * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.0+$/, '');
}

function describeLoadCategory(value) {
  const map = {
    light: 'лёгкий',
    moderate: 'средний',
    heavy: 'тяжёлый',
    overloaded: 'сверх предела',
    unknown: 'неизвестно'
  };
  const text = cleanText(value).toLowerCase();
  return map[text] ?? (cleanText(value) || 'неизвестно');
}

function buildInventorySummary({ weapons = [], armor = [], equipment = [], clothing = null, loadCategory = null, totalWeight = null } = {}) {
  const bodyItems = [...(Array.isArray(armor) ? armor : []), ...(Array.isArray(equipment) ? equipment : [])];
  const clothingLabel = getItemLabel(clothing);
  if (clothingLabel) {
    bodyItems.push(clothingLabel);
  }

  const hands = summarizeItemLabels(weapons, 2);
  const body = summarizeItemLabels(bodyItems, 3);
  const load = describeLoadCategory(loadCategory);
  const weight = formatCompactWeight(totalWeight);

  return {
    hands,
    body,
    load,
    weight,
    weightText: weight ? `Вес: ${weight} кг` : '',
    text: `В руках: ${hands} · На теле: ${body} · Груз: ${load}`
  };
}

function describeLedgerItem(item) {
  if (item == null) return 'неизвестно';
  if (typeof item === 'string') return cleanText(item);
  if (typeof item !== 'object') return cleanText(item);

  const owner = cleanText(item.ownerName ?? item.owner_id ?? item.ownerId);
  const holder = cleanText(item.holderName ?? item.holder_id ?? item.holderId);
  const rights = Array.isArray(item.rights) ? uniqueStrings(item.rights, 4) : [];
  const marks = Array.isArray(item.marks) ? uniqueStrings(item.marks, 4) : [];
  const condition = cleanText(item.condition ?? item.state);
  const contentsCount = visibleContentsCount(item);
  const parts = [
    getItemLabel(item) || 'вещь',
    item.type ? `тип ${cleanText(item.type)}` : null,
    item.material ? `материал ${cleanText(item.material)}` : null,
    condition ? `состояние ${condition}` : null,
    item.size ? `размер ${cleanText(item.size)}` : null,
    Number.isFinite(Number(item.weight)) ? `вес ${formatCompactWeight(item.weight)} кг` : null,
    item.placement ? `размещение ${cleanText(item.placement)}` : null,
    (item.access || item.placement) ? `доступ ${humanizePhysicalAccess(item) || humanizeAccess(item.access)}` : null,
    item.visibility ? `видимость ${humanizeVisibility(item.visibility)}` : null,
    item.discoverability != null ? `обнаружимость ${humanizeDiscoverability(item.discoverability)}` : null,
    item.legalStatus ? `правовой статус ${humanizeLegalStatus(item.legalStatus)}` : null,
    item.plausibility != null ? `правдоподобие ${humanizePlausibility(item.plausibility)}` : null,
    item.function ? `функция ${cleanText(item.function)}` : null,
    item.value ? `ценность ${humanizeValue(item.value)}` : null,
    item.risk ? `риск ${humanizeRisk(item.risk)}` : null,
    marks.length ? `метки ${marks.join(', ')}` : null,
    rights.length ? `права ${rights.join(', ')}` : null,
    contentsCount > 0 ? `содержит ${contentsCount}` : null,
    owner ? `владелец ${owner}` : null,
    holder && holder !== owner ? `держит ${holder}` : null
  ];

  return parts.filter(Boolean).join(' · ');
}

function visibleContentsCount(item) {
  if (!item || typeof item !== 'object') return 0;
  if (!Array.isArray(item.contents) || item.contents.length === 0) return 0;
  const access = cleanText(item.access).toLowerCase();
  const visibility = cleanText(item.visibility).toLowerCase();
  if (access === 'closed_container' || visibility === 'hidden' || visibility === 'unknown') return 0;
  return item.contents.filter((child) => {
    const childVisibility = cleanText(child?.visibility).toLowerCase();
    return childVisibility !== 'hidden' && childVisibility !== 'unknown';
  }).length;
}

function humanizeLegalStatus(value) {
  const map = {
    ordinary: 'обычный',
    restricted: 'ограниченный',
    forbidden: 'запрещённый',
    stolen: 'краденый',
    disputed: 'оспариваемый'
  };
  return map[cleanText(value).toLowerCase()] ?? cleanText(value);
}

function humanizeRisk(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric <= 0) return 'низкий';
    if (numeric <= 2) return 'средний';
    if (numeric <= 4) return 'высокий';
    return 'крайний';
  }
  const map = {
    low: 'низкий',
    medium: 'средний',
    high: 'высокий',
    extreme: 'крайний'
  };
  return map[cleanText(value).toLowerCase()] ?? cleanText(value);
}

function humanizeAccess(value) {
  const map = {
    immediate: 'можно использовать сразу',
    borrowed: 'одолжено',
    not_carried: 'нельзя использовать сейчас',
    held_for_others: 'на хранении',
    contained: 'нужно время на поиск',
    deep_bag: 'нужно время на поиск',
    top_bag: 'нужно короткое действие',
    closed_container: 'нужно открыть контейнер',
    restricted: 'доступ ограничен',
    quick: 'можно быстро достать'
  };
  return map[cleanText(value).toLowerCase()] ?? cleanText(value);
}

function humanizeVisibility(value) {
  const map = {
    visible: 'видимый',
    hidden: 'скрытый',
    partial: 'частично видимый',
    documented: 'известен по владению',
    restricted: 'виден не полностью'
  };
  return map[cleanText(value).toLowerCase()] ?? cleanText(value);
}

function humanizeDiscoverability(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric >= 5) return 'очевидный';
    if (numeric >= 4) return 'заметный';
    if (numeric >= 3) return 'требует осмотра';
    if (numeric >= 2) return 'скрытый';
    if (numeric >= 1) return 'очень скрытый';
    return 'неизвестный';
  }
  const map = {
    obvious: 'очевидный',
    visible: 'очевидный',
    documented: 'заметный',
    partial: 'требует осмотра',
    subtle: 'скрытый',
    hidden: 'скрытый',
    secret: 'очень скрытый',
    unknown: 'неизвестный'
  };
  return map[cleanText(value).toLowerCase()] ?? cleanText(value);
}

function humanizePlausibility(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return `${Math.max(0, Math.min(5, Math.round(numeric)))}/5`;
  }
  return cleanText(value);
}

function humanizeValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const parts = [];
    const facets = [
      ['практичность', value.practical],
      ['обмен', value.exchange],
      ['статус', value.status],
      ['право', value.legal],
      ['личное', value.personal],
      ['символ', value.symbolic],
      ['риск', value.risk]
    ];
    for (const [label, facet] of facets) {
      if (facet == null) continue;
      parts.push(`${label} ${humanizePlausibility(facet)}`);
    }
    return parts.length ? parts.join(', ') : 'без оценки';
  }
  return cleanText(value);
}

function formatClock(clock, world = {}) {
  if (!clock || typeof clock !== 'object') return 'время неизвестно';
  const hour = Number.isFinite(clock.hour) ? String(clock.hour).padStart(2, '0') : '??';
  const minute = Number.isFinite(clock.minute) ? String(clock.minute).padStart(2, '0') : '??';
  const year = normalizeYearText(world.historicalFrame?.year ?? world.history?.year ?? world.historical?.year ?? null);
  const season = normalizeSeasonText(world.historicalFrame?.season ?? world.history?.season ?? world.historical?.season ?? null);
  const moment = describeDayMoment(clock.hour, clock.minute);
  const parts = [];

  if (season || Number.isFinite(year)) {
    parts.push([season, Number.isFinite(year) ? `${year} г.` : null].filter(Boolean).join(' '));
  }
  if (moment) {
    parts.push(moment);
  }
  parts.push(`${hour}:${minute}`);
  return parts.filter(Boolean).join(' · ');
}

function normalizeSeasonText(value) {
  const text = String(value ?? '').trim();
  if (!text || /неизвест|нет данных/i.test(text)) return '';
  return text.toLowerCase();
}

function normalizeYearText(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const year = Number(text);
  return Number.isFinite(year) ? year : null;
}

function describeDayMoment(hour, minute) {
  if (!Number.isFinite(hour)) return '';
  const value = hour + (Number.isFinite(minute) ? minute / 60 : 0);
  if (value < 4) return 'глубокая ночь';
  if (value < 7) return 'предрассвет';
  if (value < 10) return 'утро';
  if (value < 12) return 'перед полуднем';
  if (value < 15) return 'полдень';
  if (value < 18) return 'день';
  if (value < 21) return 'вечер';
  return 'ночь';
}

function summarizePlayer(player) {
  const states = summarizePlayerStates(player);
  const body = summarizePlayerBody(player);
  const items = summarizePlayerItems(player);
  const mechanics = summarizePlayerMechanics(player);
  const carriedItems = player?.items && typeof player.items === 'object'
    ? sliceArray(player.items.carried_items, 16)
    : [];
  const propertyItems = player?.items && typeof player.items === 'object'
    ? sliceArray(player.items.property_not_carried, 8)
    : [];
  return {
    id: player?.id ?? 'player',
    name: player?.name ?? 'Игрок',
    role: player?.role ?? 'неизвестно',
    status: player?.status ?? 'неизвестно',
    socialClass: player?.socialClass ?? null,
    ageRange: player?.ageRange ?? null,
    origin: player?.origin ?? null,
    visibleStatus: player?.visibleStatus ?? null,
    trueStatus: null,
    reasonHere: player?.reasonHere ?? null,
    occupation: player?.occupation ?? null,
    skills: sliceArray(player?.skills, 8),
    family: sliceArray(player?.family, 8),
    property: propertyItems,
    health: player?.health ?? 100,
    satiety: states.satiety,
    vigor: states.vigor,
    fear: player?.fear ?? 0,
    bleeding: player?.bleeding ?? 0,
    injuries: sliceArray(player?.injuries, 8),
    inventory: carriedItems,
    claims: sliceArray(player?.claims, 12),
    notes: sliceArray(player?.notes, 8),
    money: player?.money ?? null,
    language: player?.language ?? null,
    literacy: player?.literacy ?? null,
    clothing: player?.clothing ?? null,
    memory: sliceArray(player?.memory, 8),
    knowledge: sliceArray(player?.knowledge, 8),
    fears: sliceArray(player?.fears, 8),
    goals: sliceArray(player?.goals, 8),
    obligations: sliceArray(player?.obligations, 8),
    bodyState: player?.bodyState ?? null,
    states,
    body,
    activeStates: sliceArray(player?.activeStates, 8),
    attributes: player?.attributes ? { ...player.attributes } : null,
    skill_bonuses: player?.skill_bonuses ? { ...player.skill_bonuses } : null,
    mechanics,
    items,
    knowledge_map: player?.knowledge_map ? { ...player.knowledge_map } : null,
    memory_profile: player?.memory_profile ? { ...player.memory_profile } : null,
    goals_profile: player?.goals_profile ? { ...player.goals_profile } : null,
    property_and_access: player?.property_and_access ? { ...player.property_and_access } : null,
    relations: player?.relations ? { ...player.relations } : null,
    position: player?.position ? { ...player.position } : null,
    startScene: summarizeStartScene(player?.start_scene),
    start_scene: player?.start_scene ? { ...player.start_scene } : null,
    actorProfile: summarizePublicActorProfile(player?.actorProfile),
    observedActorProfile: summarizeObservedPlayerProfile(player)
  };
}

function summarizeStartScene(startScene) {
  if (!startScene || typeof startScene !== 'object') return null;
  const nearbyPeople = sliceArray(startScene.nearby_people ?? startScene.nearbyPeople ?? [], 8);
  const introProse = cleanText(startScene.intro_prose ?? startScene.introProse);
  const visibleSituation = cleanText(startScene.visible_situation ?? startScene.visibleSituation);
  const immediateTension = cleanText(startScene.immediate_tension ?? startScene.immediateTension);
  const reasonHere = cleanText(startScene.reason_here ?? startScene.reasonHere);

  return {
    reasonHere: reasonHere || null,
    visibleSituation: visibleSituation || null,
    nearbyPeople,
    immediateTension: immediateTension || null,
    introProse: introProse || null
  };
}

function summarizePlayerMechanics(player) {
  const attributes = formatAttributeList(player?.attributes);
  const skillBonuses = formatSkillBonusList(player?.skill_bonuses);
  const parts = [];

  if (attributes.length > 0) {
    parts.push(`Характеристики: ${attributes.map(formatAttributeSummary).join(', ')}`);
  }
  if (skillBonuses.length > 0) {
    parts.push(`Навыки: ${skillBonuses.slice(0, 4).map(formatSkillBonusSummary).join(', ')}`);
  }

  return {
    attributes,
    skillBonuses,
    summaryText: parts.join(' · ')
  };
}

function formatAttributeList(attributes) {
  const source = attributes && typeof attributes === 'object' ? attributes : {};
  return ATTRIBUTE_ORDER.map(([key, label]) => {
    const value = Number(source[key]);
    if (!Number.isFinite(value)) return null;
    return {
      key,
      label,
      value,
      bonus: attributeBonus(value)
    };
  }).filter(Boolean);
}

function formatSkillBonusList(skillBonuses) {
  const source = skillBonuses && typeof skillBonuses === 'object' ? skillBonuses : {};
  return SKILL_ORDER
    .map(([key, label]) => {
      const bonus = Number(source[key]);
      if (!Number.isFinite(bonus)) return null;
      return {
        key,
        label,
        bonus
      };
    })
    .filter((entry) => entry && entry.bonus !== 0);
}

function formatAttributeSummary(attribute) {
  return `${attribute.label} ${attribute.value} (${formatSignedBonus(attribute.bonus)})`;
}

function formatSkillBonusSummary(skill) {
  return `${skill.label} ${formatSignedBonus(skill.bonus)}`;
}

function formatSignedBonus(value) {
  return value > 0 ? `+${value}` : String(value);
}

function summarizePlayerStates(player) {
  const states = player?.states && typeof player.states === 'object' ? player.states : {};
  return {
    health: Number.isFinite(states.health) ? states.health : (player?.health ?? 100),
    satiety: Number.isFinite(states.satiety) ? states.satiety : 100,
    vigor: Number.isFinite(states.vigor) ? states.vigor : 100
  };
}

function summarizePlayerBody(player) {
  const activeConditions = sliceArray(player?.activeStates, 8)
    .map((state) => state?.label ?? state?.name ?? state)
    .filter(Boolean);

  if (player?.body && typeof player.body === 'object') {
    return {
      ...player.body,
      visible_marks: sliceArray(player.body.visible_marks, 8),
      active_conditions: activeConditions.length > 0
        ? activeConditions
        : sliceArray(player.body.active_conditions, 8)
    };
  }

  return {
    description: player?.bodyState ?? null,
    visible_marks: [],
    clothing: player?.clothing ?? null,
    health: player?.health ?? 100,
    satiety: Number.isFinite(player?.states?.satiety) ? player.states.satiety : 100,
    vigor: Number.isFinite(player?.states?.vigor) ? player.states.vigor : 100,
    active_conditions: activeConditions
  };
}

function summarizePlayerItems(player) {
  if (player?.items && typeof player.items === 'object') {
    const clothing = player?.body?.clothing ?? player?.clothing ?? null;
    const summary = buildInventorySummary({
      weapons: sliceArray(player.items.weapons, 8),
      armor: sliceArray(player.items.armor, 8),
      equipment: sliceArray(player.items.equipment, 8),
      clothing,
      loadCategory: player.items.load_category ?? null,
      totalWeight: player.items.total_weight ?? null
    });

    return {
      carried_items: sliceArray(player.items.carried_items, 16),
      equipment: sliceArray(player.items.equipment, 8),
      weapons: sliceArray(player.items.weapons, 8),
      armor: sliceArray(player.items.armor, 8),
      total_weight: player.items.total_weight ?? null,
      load_category: player.items.load_category ?? null,
      property_not_carried: sliceArray(player.items.property_not_carried, 8),
      summary,
      summaryText: summary.text,
      weightText: summary.weightText
    };
  }

  const clothing = player?.body?.clothing ?? player?.clothing ?? null;
  const summary = buildInventorySummary({
    weapons: [],
    armor: [],
    equipment: [],
    clothing,
    loadCategory: null,
    totalWeight: null
  });

  return {
    carried_items: [],
    equipment: [],
    weapons: [],
    armor: [],
    total_weight: null,
    load_category: null,
    property_not_carried: [],
    summary,
    summaryText: summary.text,
    weightText: summary.weightText
  };
}

function summarizeNpc(npc, relationship = null, property = null, propertyClues = null, options = {}) {
  const includeDebug = options.includeDebug === true;
  const visibleNpc = applyNpcProfileDepth(npc ?? {});
  const currentPosition = visibleNpc?.current_position && typeof visibleNpc.current_position === 'object'
    ? visibleNpc.current_position
    : null;
  const inventory = visibleNpc?.items && typeof visibleNpc.items === 'object'
    ? sliceArray(visibleNpc.items.carried_items.filter(isVisibleItemForPublicSummary), 12)
    : [];
  return {
    id: visibleNpc?.id ?? null,
    name: visibleNpc?.name ?? 'неизвестный',
    profileLevel: visibleNpc?.profileLevel ?? 'background',
    role: visibleNpc?.role ?? null,
    status: visibleNpc?.status ?? null,
    mood: visibleNpc?.mood ?? null,
    locationId: currentPosition?.location_id ?? visibleNpc?.locationId ?? visibleNpc?.homeLocation ?? null,
    microLocationId: currentPosition?.minilocation_id ?? visibleNpc?.microLocationId ?? null,
    health: visibleNpc?.health ?? 100,
    bleeding: visibleNpc?.bleeding ?? 0,
    injuries: sliceArray(visibleNpc?.injuries, 6),
    inventory,
    notes: sliceArray(visibleNpc?.notes, 8),
    relations: relationship ?? null,
    property: property ?? null,
    propertyClues: propertyClues ?? null,
    family: sliceArray(visibleNpc?.family, 8),
    motivation: includeDebug ? (visibleNpc?.motivation ?? null) : null,
    character: includeDebug ? (visibleNpc?.character ?? null) : null,
    schedule: visibleNpc?.schedule ?? null,
    visibleMarks: sliceArray(visibleNpc?.visibleMarks, 8),
    activeConditions: sliceArray(visibleNpc?.activeConditions, 8),
    availabilityWindow: visibleNpc?.availabilityWindow ?? null,
    movementWindow: visibleNpc?.movementWindow ?? null,
    ageRange: visibleNpc?.ageRange ?? null,
    origin: visibleNpc?.origin ?? null,
    visibleStatus: visibleNpc?.visibleStatus ?? null,
    trueStatus: null,
    reasonHere: visibleNpc?.reasonHere ?? null,
    occupation: visibleNpc?.occupation ?? null,
    skills: sliceArray(visibleNpc?.skills, 8),
    language: visibleNpc?.language ?? null,
    literacy: visibleNpc?.literacy ?? null,
    clothing: visibleNpc?.clothing ?? null,
    bodyState: visibleNpc?.bodyState ?? null,
    obligations: sliceArray(visibleNpc?.obligations, 8),
    goals: includeDebug ? sliceArray(visibleNpc?.goals, 8) : [],
    fears: includeDebug ? sliceArray(visibleNpc?.fears, 8) : [],
    memory: includeDebug ? sliceArray(visibleNpc?.memory, 8) : [],
    actorProfile: summarizePublicActorProfile(visibleNpc?.actorProfile, { includeDebug }),
    observedActorProfile: summarizeObservedActorProfile(visibleNpc)
  };
}

function summarizePublicActorProfile(profile, options = {}) {
  const includeDebug = options.includeDebug === true;
  if (!profile || typeof profile !== 'object') return null;
  if (includeDebug) {
    return {
      version: profile.version ?? 1,
      kind: profile.kind ?? null,
      source: profile.source ?? null,
      identity: {
        id: profile.identity?.id ?? null,
        name: profile.identity?.name ?? null,
        ageRange: profile.identity?.ageRange ?? null,
        origin: profile.identity?.origin ?? null,
        originDetail: profile.identity?.originDetail ?? null,
        socialPosition: profile.identity?.socialPosition ?? null,
        visibleStatus: profile.identity?.visibleStatus ?? null,
        trueStatus: null,
        reasonHere: profile.identity?.reasonHere ?? null,
        worldPosition: profile.identity?.worldPosition ?? null
      },
      kinship: {
        familyFacts: sliceArray(profile.kinship?.familyFacts, 8),
        noFamilyReason: profile.kinship?.noFamilyReason ?? null,
        obligations: sliceArray(profile.kinship?.obligations, 8),
        household: profile.kinship?.household ?? null,
        answerableTo: profile.kinship?.answerableTo ?? null,
        responsibleFor: sliceArray(profile.kinship?.responsibleFor, 8)
      },
      property: {
        carried: sliceArray(profile.property?.carried, 8),
        outsideAccess: sliceArray(profile.property?.outsideAccess, 8),
        rights: sliceArray(profile.property?.rights, 8),
        ownershipFacts: sliceArray(profile.property?.ownershipFacts, 8),
        access: sliceArray(profile.property?.access, 8)
      },
      work: {
        occupation: profile.work?.occupation ?? null,
        currentActivity: profile.work?.currentActivity ?? null,
        nextTask: profile.work?.nextTask ?? null,
        dutyWindow: profile.work?.dutyWindow ?? null,
        interruptionRule: profile.work?.interruptionRule ?? null,
        skills: sliceArray(profile.work?.skills, 8),
        routine: sliceArray(profile.work?.routine, 8),
        dutyTo: profile.work?.dutyTo ?? null,
        answerableTo: profile.work?.answerableTo ?? null,
        responsibleFor: sliceArray(profile.work?.responsibleFor, 8)
      },
      body: {
        bodyState: profile.body?.bodyState ?? null,
        health: profile.body?.health ?? null,
        bleeding: profile.body?.bleeding ?? null,
        pain: profile.body?.pain ?? null,
        intoxication: profile.body?.intoxication ?? null,
        visible_marks: sliceArray(profile.body?.visible_marks, 8),
        active_conditions: sliceArray(profile.body?.active_conditions, 8),
        clothing: profile.body?.clothing ?? null,
        language: profile.body?.language ?? null,
        literacy: profile.body?.literacy ?? null
      },
      mind: {
        seen: sliceArray(profile.mind?.seen, 8),
        heard: sliceArray(profile.mind?.heard, 8),
        misunderstood: sliceArray(profile.mind?.misunderstood, 8),
        manner: sliceArray(profile.mind?.manner, 8),
        speech: sliceArray(profile.mind?.speech, 8),
        memory: sliceArray(profile.mind?.memory, 8),
        knowledge: sliceArray(profile.mind?.knowledge, 8),
        hidden: [],
        fears: sliceArray(profile.mind?.fears, 8),
        goals: sliceArray(profile.mind?.goals, 8),
        courage: profile.mind?.courage ?? null,
        greed: profile.mind?.greed ?? null,
        caution: profile.mind?.caution ?? null,
        honesty: profile.mind?.honesty ?? null,
        superstition: profile.mind?.superstition ?? null,
        temper: profile.mind?.temper ?? null
      }
    };
  }
  return {
    version: profile.version ?? 1,
    kind: profile.kind ?? null,
    source: profile.source ?? null,
    identity: {
      id: profile.identity?.id ?? null,
      name: profile.identity?.name ?? null,
      ageRange: profile.identity?.ageRange ?? null,
      visibleStatus: profile.identity?.visibleStatus ?? null,
      role: profile.identity?.role ?? null
    },
    body: {
      bodyState: profile.body?.bodyState ?? null,
      health: profile.body?.health ?? null,
      bleeding: profile.body?.bleeding ?? null,
      pain: profile.body?.pain ?? null,
      intoxication: profile.body?.intoxication ?? null,
      visible_marks: sliceArray(profile.body?.visible_marks ?? profile.body?.visibleMarks, 8),
      active_conditions: sliceArray(profile.body?.active_conditions ?? profile.body?.activeConditions, 8),
      clothing: profile.body?.clothing ?? null,
      language: profile.body?.language ?? null,
      literacy: profile.body?.literacy ?? null
    },
    mind: {
      seen: sliceArray(profile.mind?.seen, 8),
      heard: sliceArray(profile.mind?.heard, 8),
      misunderstood: sliceArray(profile.mind?.misunderstood, 8),
      manner: sliceArray(profile.mind?.manner, 8),
      speech: sliceArray(profile.mind?.speech, 8)
    }
  };
}

function summarizeObservedPlayerProfile(player) {
  const carriedItems = player?.items && typeof player.items === 'object'
    ? sliceArray(player.items.carried_items, 8)
    : [];
  const propertyItems = player?.items && typeof player.items === 'object'
    ? sliceArray(player.items.property_not_carried, 8)
    : [];
  return {
    version: 1,
    kind: 'player',
    source: 'observed',
    identity: {
      id: player?.id ?? 'player',
      name: player?.name ?? 'Игрок',
      ageRange: player?.ageRange ?? null,
      origin: player?.origin ?? null,
      originDetail: 'неизвестно',
      socialPosition: player?.socialClass ?? 'неизвестно',
      visibleStatus: player?.visibleStatus ?? player?.status ?? 'неизвестно',
      trueStatus: null,
      reasonHere: player?.reasonHere ?? null,
      worldPosition: player?.worldPosition ?? null
    },
    kinship: {
      familyFacts: sliceArray(player?.family, 8),
      noFamilyReason: 'неизвестно',
      obligations: sliceArray(player?.obligations, 8),
      household: player?.household ?? 'неизвестно',
      answerableTo: player?.answerableTo ?? null,
      responsibleFor: sliceArray(player?.responsibleFor, 8)
    },
    property: {
      carried: carriedItems,
      outsideAccess: propertyItems,
      rights: [],
      ownershipFacts: [],
      access: sliceArray(player?.access, 8)
    },
    work: {
      occupation: player?.role ?? 'неизвестно',
      currentActivity: 'неизвестно',
      nextTask: 'неизвестно',
      dutyWindow: 'неизвестно',
      interruptionRule: 'неизвестно',
      skills: [],
      routine: sliceArray(player?.routine, 8),
      dutyTo: player?.dutyTo ?? null,
      answerableTo: player?.answerableTo ?? null,
      responsibleFor: sliceArray(player?.responsibleFor, 8)
    },
    body: {
      bodyState: player?.bodyState ?? 'неизвестно',
      health: player?.health ?? null,
      bleeding: player?.bleeding ?? null,
      pain: player?.pain ?? null,
      intoxication: player?.intoxication ?? null,
      clothing: player?.clothing ?? 'неизвестно',
      language: player?.language ?? 'неизвестно',
      literacy: player?.literacy ?? 'неизвестно'
    },
    mind: {
      memory: sliceArray(player?.memory, 8),
      knowledge: sliceArray(player?.knowledge, 8),
      seen: sliceArray(player?.knowledgeSeen, 8),
      heard: sliceArray(player?.knowledgeHeard, 8),
      misunderstood: sliceArray(player?.knowledgeMisread, 8),
      hidden: sliceArray(player?.knowledgeHidden, 8),
      fears: sliceArray(player?.fears, 8),
      goals: sliceArray(player?.goals, 8),
      manner: sliceArray(player?.manner, 8),
      speech: sliceArray(player?.speech, 8),
      courage: player?.courage ?? null,
      greed: player?.greed ?? null,
      caution: player?.caution ?? null,
      honesty: player?.honesty ?? null,
      superstition: player?.superstition ?? null,
      temper: player?.temper ?? null
    }
  };
}

function summarizeObservedActorProfile(npc) {
  const visibleNpc = applyNpcProfileDepth(npc ?? {});
  const carriedItems = visibleNpc?.items && typeof visibleNpc.items === 'object'
    ? sliceArray(visibleNpc.items.carried_items.filter(isVisibleItemForPublicSummary), 8)
    : [];
  return {
    version: 1,
    kind: 'npc',
    source: 'observed',
    identity: {
      id: visibleNpc?.id ?? null,
      name: visibleNpc?.name ?? null,
      ageRange: visibleNpc?.ageRange ?? null,
      visibleStatus: visibleNpc?.visibleStatus ?? visibleNpc?.status ?? null,
      role: visibleNpc?.role ?? null
    },
    body: {
      bodyState: visibleNpc?.bodyState ?? null,
      health: visibleNpc?.health ?? null,
      bleeding: visibleNpc?.bleeding ?? null,
      pain: visibleNpc?.pain ?? null,
      intoxication: visibleNpc?.intoxication ?? null,
      visible_marks: sliceArray(visibleNpc?.visibleMarks, 8),
      active_conditions: sliceArray(visibleNpc?.activeConditions, 8),
      clothing: visibleNpc?.clothing ?? null,
      language: visibleNpc?.language ?? null,
      literacy: visibleNpc?.literacy ?? null
    },
    mind: {
      seen: sliceArray(visibleNpc?.knowledgeSeen, 8),
      heard: sliceArray(visibleNpc?.knowledgeHeard, 8),
      misunderstood: sliceArray(visibleNpc?.knowledgeMisread, 8),
      manner: sliceArray(visibleNpc?.actorProfile?.mind?.manner, 8),
      speech: sliceArray(visibleNpc?.actorProfile?.mind?.speech, 8)
    },
    property: {
      carried: carriedItems
    }
  };
}

const ATTRIBUTE_ORDER = [
  ['strength', 'Сила'],
  ['agility', 'Ловкость'],
  ['endurance', 'Выносливость'],
  ['reason', 'Разум'],
  ['attention', 'Внимание'],
  ['influence', 'Влияние']
];

const SKILL_ORDER = [
  ['athletics', 'Атлетика'],
  ['stealth', 'Скрытность'],
  ['melee_combat', 'Ближний бой'],
  ['ranged_combat', 'Дальний бой'],
  ['craft', 'Ремесло'],
  ['household', 'Хозяйство'],
  ['survival', 'Выживание'],
  ['travel_transport', 'Путь и транспорт'],
  ['healing', 'Лечение'],
  ['observation', 'Наблюдательность'],
  ['communication_trade', 'Общение и торг'],
  ['custom_law_literacy', 'Обычай и закон']
];

function attributeBonus(value) {
  return Math.floor((Number(value) - 10) / 2);
}

function summarizePropertyLedgerForActor(ledger = [], actorId = null) {
  const wantedId = String(actorId ?? '').trim();
  if (!wantedId || !Array.isArray(ledger)) return null;

  const items = ledger
    .filter((item) => {
      const ownerId = String(item?.ownerId ?? '').trim();
      const holderId = String(item?.holderId ?? '').trim();
      if (ownerId !== wantedId && holderId !== wantedId) return false;
      return isVisibleLedgerItemForSummary(item);
    })
    .slice(0, 8)
    .map((item) => ({
      id: item?.id ?? null,
      label: item?.label ?? null,
      type: item?.type ?? null,
      material: item?.material ?? null,
      condition: item?.condition ?? item?.state ?? null,
      size: item?.size ?? null,
      weight: item?.weight ?? null,
      ownerId: item?.ownerId ?? null,
      ownerName: item?.ownerName ?? null,
      holderId: item?.holderId ?? null,
      holderName: item?.holderName ?? null,
      placement: item?.placement ?? null,
      access: item?.access ?? null,
      visibility: item?.visibility ?? null,
      discoverability: item?.discoverability ?? null,
      legalStatus: item?.legalStatus ?? null,
      function: item?.function ?? null,
      value: item?.value ?? null,
      risk: item?.risk ?? null,
      marks: Array.isArray(item?.marks) ? sliceArray(item.marks, 4) : [],
      rights: Array.isArray(item?.rights) ? sliceArray(item.rights, 4) : [],
      visible: item?.visible ?? null,
      locationId: item?.locationId ?? null,
      containerId: item?.containerId ?? null,
      contentsCount: visibleContentsCount(item),
      summaryText: describeLedgerItem(item)
    }));

  return items.length > 0 ? items : null;
}

function summarizePropertyLedgerCluesForActor(ledger = [], actorId = null) {
  const wantedId = String(actorId ?? '').trim();
  if (!wantedId || !Array.isArray(ledger)) return null;

  const clues = ledger
    .filter((item) => {
      const ownerId = String(item?.ownerId ?? '').trim();
      const holderId = String(item?.holderId ?? '').trim();
      if (ownerId !== wantedId && holderId !== wantedId) return false;
      return !isVisibleLedgerItemForSummary(item);
    })
    .slice(0, 8)
    .map((item) => describeLedgerItemClue(item))
    .filter(Boolean);

  return clues.length > 0 ? clues : null;
}

function isVisibleLedgerItemForSummary(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.visible === false) return false;
  if (String(item.visibility ?? '').trim().toLowerCase() === 'hidden') return false;
  const discoverability = Number(item.discoverability);
  if (Number.isFinite(discoverability) && discoverability <= 1) return false;
  return true;
}

function isVisibleItemForPublicSummary(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.visible === false) return false;
  const visibility = String(item.visibility ?? '').trim().toLowerCase();
  if (visibility === 'hidden') return false;
  const discoverability = Number(item.discoverability);
  if (Number.isFinite(discoverability) && discoverability <= 1) return false;
  return true;
}

function describeLedgerItemClue(item) {
  if (!item || typeof item !== 'object') return null;

  const marks = uniqueStrings(Array.isArray(item.marks) ? item.marks : [], 4).map((mark) => cleanText(mark).toLowerCase());
  const descriptors = [];
  const text = [
    cleanText(item.visibility ?? ''),
    cleanText(item.discoverability ?? ''),
    ...marks
  ].join(' ').toLowerCase();

  if (/под (подкладк|одежд)|за пазух|внутри|завёрнут|спрятан/.test(text)) {
    descriptors.push('заметна выпуклость под одеждой');
  }
  if (/звон|звя|металл/.test(text)) {
    descriptors.push('слышен тихий звон');
  }
  if (/рукоят|лезв|ножн/.test(text)) {
    descriptors.push('виден край рукояти');
  }
  if (/мешк|сумк|узелок|пояс|ремен|перевяз/.test(text)) {
    descriptors.push('заметен след переноски');
  }
  if (/запах|пахн/.test(text)) {
    descriptors.push('чувствуется запах вещи');
  }
  if (/гряз|кров|ожог|заплат|ремонт|царап/.test(text)) {
    descriptors.push('видны следы недавнего использования');
  }

  if (descriptors.length === 0) {
    if (
      item.visible === false ||
      String(item.visibility ?? '').trim().toLowerCase() === 'hidden' ||
      (Number.isFinite(Number(item.discoverability)) && Number(item.discoverability) <= 1)
    ) {
      descriptors.push('есть скрытый признак вещи');
    } else {
      return null;
    }
  }

  return uniqueStrings(descriptors, 3).join(' · ');
}

function summarizeMemory(memory, world = null) {
  const knownPlaces = summarizeKnownPlaces(memory?.visitedPlaces ?? {}, world);
  const knowledgeMap = world?.player?.knowledge_map ?? {};
  return {
    visitedPlaces: memory?.visitedPlaces ?? {},
    knownPlaces,
    knownRoutes: summarizeKnowledgeList(knowledgeMap.known_routes ?? knowledgeMap.knownRoutes ?? []),
    knownPeople: summarizeKnowledgeList(knowledgeMap.known_people ?? knowledgeMap.knownPeople ?? []),
    knownFacts: summarizeKnowledgeList(knowledgeMap.known_facts ?? knowledgeMap.knownFacts ?? []),
    heardRumors: sliceArray(memory?.heardRumors, 20),
    sceneNotes: sliceArray(memory?.sceneNotes, 20),
    masterNotes: sliceArray(memory?.masterNotes, 20)
  };
}

function summarizeKnowledgeMap(world = null) {
  const knowledge = world?.player?.knowledge_map ?? {};
  const knownPlaces = summarizeKnowledgeList(knowledge.known_places ?? knowledge.knownPlaces ?? []);
  const knownRoutes = summarizeKnowledgeList(knowledge.known_routes ?? knowledge.knownRoutes ?? []);
  const knownPeople = summarizeKnowledgeList(knowledge.known_people ?? knowledge.knownPeople ?? []);
  const knownFacts = summarizeKnowledgeList(knowledge.known_facts ?? knowledge.knownFacts ?? []);
  return {
    knownPlaces,
    knownRoutes,
    knownPeople,
    knownFacts,
    summaryText: [
      knownPlaces.length ? `мест ${knownPlaces.length}` : null,
      knownRoutes.length ? `путей ${knownRoutes.length}` : null,
      knownPeople.length ? `людей ${knownPeople.length}` : null,
      knownFacts.length ? `фактов ${knownFacts.length}` : null
    ].filter(Boolean).join(' · ') || 'карта знаний пуста'
  };
}

function summarizeKnowledgeList(values) {
  return uniqueStrings(Array.isArray(values) ? values : [], 20).map((item) => ({
    label: item,
    summaryText: item
  }));
}

function summarizeKnownPlaces(visitedPlaces, world = null) {
  if (!visitedPlaces || typeof visitedPlaces !== 'object') return [];

  return Object.entries(visitedPlaces)
    .slice(0, 12)
    .map(([placeId, record]) => {
      const location = Array.isArray(world?.locations)
        ? world.locations.find((item) => item?.id === placeId)
        : world?.locations?.[placeId] ?? null;
      const visits = Number(record?.visits ?? 0);
      const lastSeen = record?.lastSeenAt ?? null;
      return {
        id: placeId,
        label: String(location?.name ?? record?.name ?? record?.placeName ?? record?.title ?? placeId),
        visits,
        lastSeenAt: lastSeen,
        summaryText: buildKnownPlaceSummary(record, placeId, location)
      };
    });
}

function buildKnownPlaceSummary(record, placeId, location = null) {
  const label = String(location?.name ?? record?.name ?? record?.placeName ?? record?.title ?? placeId);
  const visits = Number(record?.visits ?? 0);
  const lastSeen = formatKnownPlaceTimestamp(record?.lastSeenAt ?? null);
  const parts = [label, `${visits} раз(а)`];
  if (lastSeen) parts.push(`последний раз ${lastSeen}`);
  return parts.join(' · ');
}

function formatKnownPlaceTimestamp(value) {
  if (!value || typeof value !== 'object') return '';
  const day = Number(value.day);
  const hour = Number(value.hour);
  const minute = Number(value.minute);
  if (!Number.isFinite(day) || !Number.isFinite(hour) || !Number.isFinite(minute)) return '';
  return `день ${Math.max(1, Math.floor(day))} ${String(Math.max(0, Math.min(23, Math.floor(hour)))).padStart(2, '0')}:${String(Math.max(0, Math.min(59, Math.floor(minute)))).padStart(2, '0')}`;
}

function summarizeHistorical(historical) {
  const regionalContext = historical?.regionalContext;
  const routeArchive = sliceArray(historical?.routeArchive, 20);
  const historicalEventsSummary = sliceArray(selectHistoricalEventSource(historical?.historicalEvents, historical?.historicalEventsSummary), 12)
    .map((event) => summarizeHistoricalEvent(event))
    .filter(Boolean);
  const activeHistoricalEventsSummary = sliceArray(selectHistoricalEventSource(historical?.activeHistoricalEvents, historical?.activeHistoricalEventsSummary), 12)
    .map((event) => summarizeHistoricalEvent(event))
    .filter(Boolean);
  const {
    historicalEvents: _historicalEvents,
    activeHistoricalEvents: _activeHistoricalEvents,
    historicalEventsSummary: _historicalEventsSummary,
    activeHistoricalEventsSummary: _activeHistoricalEventsSummary,
    sourceLog: _sourceLog,
    ...publicHistorical
  } = historical ?? {};
  return {
    ...publicHistorical,
    regionalContext: regionalContext ? {
      current: sanitizePublicRegionSummary(regionalContext.current ?? null),
      neighbors: Array.isArray(regionalContext.neighbors)
        ? regionalContext.neighbors.map((item) => sanitizePublicRegionSummary(item))
        : []
    } : null,
    routeArchive,
    routeArchiveVisible: routeArchive.filter((entry) => isVisibleRouteArchiveEntry(entry)),
    historicalEventsSummary,
    activeHistoricalEventsSummary,
    historicalPeople: sliceArray(historical?.historicalPeople, 12),
    medicalContext: sliceArray(historical?.medicalContext, 20),
    fieldCareContext: sliceArray(historical?.fieldCareContext, 20)
  };
}

function sanitizePublicRegionSummary(summary) {
  if (!summary || typeof summary !== 'object') return summary ?? null;
  const {
    confidence: _confidence,
    sources: _sources,
    catalogSize: _catalogSize,
    ...rest
  } = summary;
  const historicalTimeline = summary.historicalTimeline && typeof summary.historicalTimeline === 'object'
    ? {
        ...summary.historicalTimeline,
        after1237: []
      }
    : summary.historicalTimeline;
  const knowledgeBoundary = summary.knowledgeBoundary && typeof summary.knowledgeBoundary === 'object'
    ? {
        objectiveFacts: sliceArray(summary.knowledgeBoundary.objectiveFacts, 8),
        visibleToPlayer: sliceArray(summary.knowledgeBoundary.visibleToPlayer, 8)
      }
    : summary.knowledgeBoundary;

  return {
    ...rest,
    coordinates: null,
    knowledgeBoundary,
    sources: [],
    historicalTimeline
  };
}

function selectHistoricalEventSource(rawEvents, summaryEvents) {
  return Array.isArray(rawEvents) && rawEvents.length > 0
    ? rawEvents
    : summaryEvents;
}

function summarizeHistoricalEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const phase = event.activePhase ?? event.phases?.[0] ?? null;
  return {
    id: event.id ?? null,
    title: event.title ?? 'Историческое событие',
    region: event.region ?? null,
    dateRange: event.dateRange ?? null,
    duplicateKey: event.duplicateKey ?? null,
    activePhase: phase ? {
      id: phase.id ?? null,
      label: humanizeHistoricalPhaseLabel(phase),
      dateHint: phase.dateHint ?? null,
      visibleSigns: sliceArray(phase.visibleSigns, 4),
      consequences: sliceArray(phase.consequences, 4)
    } : null,
    visibleSigns: sliceArray(event.visibleSigns, 4),
    consequences: sliceArray(event.consequences, 4)
  };
}

function isVisibleRouteArchiveEntry(entry) {
  const route = entry?.route ?? null;
  return Boolean(route?.known_to_player || route?.known_to_character);
}

function summarizeEvents(events) {
  return sliceArray(events, 30);
}

function summarizeJournalEntries(world) {
  const entries = [];
  const rawJournal = Array.isArray(world?.journal) ? world.journal : [];

  for (const entry of rawJournal) {
    if (isTechnicalJournalEntry(entry)) continue;
    const summaryEntry = {
      kind: normalizeJournalEntryKind(entry),
      memoryClass: normalizeJournalMemoryClass(entry),
      at: entry?.at ?? null,
      time: entry?.time ?? entry?.at ?? null,
      title: buildJournalTitle(entry),
      detail: buildJournalDetail(entry),
      intent: entry?.intent ?? null,
      source: entry?.source ?? null,
      visibility: entry?.visibility ?? null,
      status: entry?.status ?? null,
      confidence: entry?.confidence ?? null
    };
    Object.defineProperty(summaryEntry, '__relatedIds', {
      value: resolveJournalRelatedIds(entry),
      enumerable: false,
      configurable: false,
      writable: false
    });
    entries.push(summaryEntry);
    if (entries.length >= 30) break;
  }

  return entries;
}

function summarizeJournal(world) {
  return summarizeJournalEntries(world);
}

function summarizeJournalSections(world) {
  const memory = summarizeMemory(world?.memory ?? {}, world);
  const knowledgeMap = summarizeKnowledgeMap(world);
  const journalEntries = summarizeJournalEntries(world);
  const memoryEntries = journalEntries
    .filter((entry) => entry?.memoryClass === 'fact')
    .slice(0, 8)
    .map((entry) => formatJournalSectionEntry(entry, world));
  const assumptionEntries = journalEntries
    .filter((entry) => entry?.memoryClass === 'assumption')
    .slice(0, 8)
    .map((entry) => formatJournalSectionEntry(entry, world));
  const placeEntries = journalEntries
    .filter((entry) => entry?.memoryClass === 'place')
    .slice(0, 8)
    .map((entry) => formatJournalSectionEntry(entry, world));
  const rumorEntries = journalEntries
    .filter((entry) => entry?.memoryClass === 'rumor')
    .slice(0, 8)
    .map((entry) => formatJournalSectionEntry(entry, world));
  const events = journalEntries
    .filter((entry) => !JOURNAL_KNOWLEDGE_CLASSES.has(String(entry?.memoryClass ?? '').toLowerCase()))
    .slice(0, 10)
    .map((entry) => formatJournalSectionEntry(entry, world));
  const obligations = [
    ...(Array.isArray(world?.player?.obligations) ? world.player.obligations : []),
    ...(Array.isArray(world?.player?.claims) ? world.player.claims.map((item) => `Претензия: ${item}`) : [])
  ].slice(0, 10);
  const people = (world?.npcs ?? [])
    .slice(0, 8)
    .map((npc) => `${npc.name ?? 'НПС'} · ${npc.role ?? 'неизвестно'} · ${npc.visibleStatus ?? npc.status ?? 'неизвестно'}`);
  const places = placeEntries.length > 0
    ? placeEntries
    : memory.knownPlaces.slice(0, 8).map((item) => item.summaryText);
  const visiblePropertyItems = (Array.isArray(world?.propertyLedger) ? world.propertyLedger : [])
    .filter((item) => isVisibleLedgerItemForSummary(item))
    .slice(0, 8)
    .map((item) => describeLedgerItem(item))
    .filter(Boolean);
  const propertyClues = uniqueStrings(
    (world?.npcs ?? []).flatMap((npc) => summarizePropertyLedgerCluesForActor(world?.propertyLedger ?? [], npc?.id) ?? []),
    12
  );
  const history = summarizeHistoricalPressureForJournal(world?.historical?.activeHistoricalEvents ?? []);
  const delayedEvents = summarizePublicDelayedEvents(world?.delayedEvents ?? []);
  const rumorsHistory = uniqueStrings([
    ...(rumorEntries.length > 0 ? rumorEntries : sliceArray(memory.heardRumors, 8)),
    ...(world?.historical?.anchorEvents ?? []).slice(0, 4)
  ], 12);

  return {
    events,
    facts: memoryEntries,
    assumptions: assumptionEntries,
    memory: memoryEntries.length > 0
      ? memoryEntries
      : sliceArray(memory.sceneNotes, 8).map((item) => {
        const noteText = item?.note ?? item?.text ?? JSON.stringify(item);
        const time = formatJournalTimestamp(item?.at, world);
        return [time, noteText].filter(Boolean).join(' · ');
      }),
    obligations,
    people,
    places,
    knowledge: [
      ...knowledgeMap.knownFacts.slice(0, 8).map((item) => item.summaryText),
      ...knowledgeMap.knownRoutes.slice(0, 8).map((item) => item.summaryText),
      ...knowledgeMap.knownPeople.slice(0, 8).map((item) => item.summaryText)
    ].filter(Boolean),
    knowledgeMap: [
      knowledgeMap.summaryText,
      ...knowledgeMap.knownPlaces.slice(0, 8).map((item) => item.summaryText)
    ].filter(Boolean),
    history,
    property: visiblePropertyItems,
    propertyClues,
    delayedEvents,
    rumorsHistory
  };
}

function summarizeHistoricalPressureForJournal(events = []) {
  return (Array.isArray(events) ? events : [])
    .slice(0, 8)
    .map((event) => {
      const phase = event?.activePhase ?? event?.phases?.[0] ?? null;
      const signs = uniqueStrings([
        ...(Array.isArray(phase?.visibleSigns) ? phase.visibleSigns : []),
        ...(Array.isArray(event?.visibleSigns) ? event.visibleSigns : [])
      ], 2);
      const signText = signs.length > 0 ? signs.join(' / ') : 'нет видимых признаков';
      const dateHint = cleanText(phase?.dateHint ?? '');
      return `${event?.title ?? 'Историческое событие'} · ${humanizeHistoricalPhaseLabel(phase)}${dateHint ? ` · ${dateHint}` : ''} · ${signText}`;
    })
    .filter(Boolean);
}

function summarizeDelayedEvents(events) {
  return (Array.isArray(events) ? events : [])
    .slice(0, 12)
    .map((event) => {
      const dueAt = formatDueAt(event?.dueAt ?? event?.due_at ?? null);
      const status = cleanText(event?.status ?? 'pending') || 'pending';
      const parts = [
        cleanText(event?.reason ?? event?.cause ?? 'Отложенное событие'),
        dueAt ? `к ${dueAt}` : null,
        status,
        cleanText(event?.result ?? '')
      ].filter(Boolean);
      return parts.join(' · ');
    })
    .filter(Boolean);
}

function formatDueAt(value) {
  if (!value || typeof value !== 'object') return '';
  const day = Number(value.day);
  const hour = Number(value.hour);
  const minute = Number(value.minute);
  if (!Number.isFinite(day) || !Number.isFinite(hour) || !Number.isFinite(minute)) return '';
  return `день ${Math.max(1, Math.floor(day))} ${String(Math.max(0, Math.min(23, Math.floor(hour)))).padStart(2, '0')}:${String(Math.max(0, Math.min(59, Math.floor(minute)))).padStart(2, '0')}`;
}

function formatJournalTimestamp(value, world) {
  return value && typeof value === 'object' ? formatClock(value, world) : '';
}

function isTechnicalJournalEntry(entry) {
  const intent = String(entry?.intent ?? '').toLowerCase();
  const kind = String(entry?.kind ?? '').toLowerCase();
  const source = String(entry?.source ?? '').toLowerCase();
  const visibility = String(entry?.visibility ?? '').toLowerCase();
  const status = String(entry?.status ?? '').toLowerCase();
  return (
    intent === 'world' ||
    intent === 'audit' ||
    intent === 'debug' ||
    kind === 'technical' ||
    kind === 'system' ||
    source === 'audit' ||
    visibility === 'hidden' ||
    status === 'technical'
  );
}

const JOURNAL_KNOWLEDGE_CLASSES = new Set(['fact', 'assumption', 'place', 'rumor', 'person', 'property', 'obligation']);

function formatJournalSectionEntry(entry, world) {
  const time = formatJournalTimestamp(entry?.at, world);
  const kind = String(entry?.kind ?? '').toLowerCase();
  const detail = kind === 'place'
    ? buildJournalPlaceSectionDetail(entry, world)
    : entry?.detail;
  return [time, entry?.title, detail].filter(Boolean).join(' · ');
}

function buildJournalPlaceSectionDetail(entry, world) {
  const relatedId = Array.isArray(entry?.__relatedIds) ? entry.__relatedIds[0] ?? null : null;
  const record = relatedId ? world?.memory?.visitedPlaces?.[relatedId] ?? null : null;
  if (record) {
    return buildKnownPlaceSummary(record, relatedId, resolveWorldLocation(world, relatedId));
  }
  return entry?.detail ?? null;
}

function resolveJournalRelatedIds(entry) {
  if (Array.isArray(entry?.relatedIds)) return sliceArray(entry.relatedIds, 8);
  if (Array.isArray(entry?.related_ids)) return sliceArray(entry.related_ids, 8);
  return [];
}

function resolveWorldLocation(world, placeId) {
  if (!placeId) return null;
  return Array.isArray(world?.locations)
    ? world.locations.find((item) => item?.id === placeId) ?? null
    : world?.locations?.[placeId] ?? null;
}

function normalizeJournalEntryKind(entry) {
  const kind = String(entry?.kind ?? entry?.intent ?? 'event').toLowerCase().trim();
  if (!kind) return 'event';
  if (kind === 'world') return 'system';
  if (kind === 'audit') return 'memory';
  return kind;
}

function normalizeJournalMemoryClass(entry) {
  const kind = String(entry?.kind ?? '').toLowerCase().trim();
  const intent = String(entry?.intent ?? '').toLowerCase().trim();
  const source = String(entry?.source ?? '').toLowerCase().trim();

  if (kind === 'place') return 'place';
  if (kind === 'rumor') return 'rumor';
  if (kind === 'person' || kind === 'npc') return 'person';
  if (kind === 'property' || kind === 'item' || source === 'property') return 'property';
  if (kind === 'obligation' || kind === 'claim' || intent === 'claim') return 'obligation';
  if (kind === 'assumption' || kind === 'hypothesis') return 'assumption';
  if (kind === 'audit' || kind === 'memory' || kind === 'fact' || intent === 'memory' || intent === 'scene' || intent === 'place') return 'fact';
  return 'event';
}

function buildJournalTitle(entry) {
  const title = String(entry?.input ?? entry?.label ?? entry?.result ?? entry?.message ?? 'Событие').trim();
  return title || 'Событие';
}

function buildJournalDetail(entry) {
  const detail = String(entry?.result ?? entry?.message ?? entry?.detail ?? '').trim();
  return detail || null;
}

function summarizeVisibleScene(world) {
  const scene = world?.scene ?? {};
  const place = world?.place ?? {};
  const microPlace = world?.microPlace ?? {};
  const currentLocationId = world?.current_position?.location_id ?? null;
  const visibleNpcs = (world?.npcs ?? []).filter((npc) => {
    const npcLocationId = npc?.current_position?.location_id ?? npc?.locationId ?? npc?.homeLocation ?? null;
    return npcLocationId === currentLocationId;
  });
  const visibleObjects = uniqueStrings(sliceArray(microPlace.visibleObjects, 6), 8);
  const landmarkNotes = uniqueStrings(sliceArray(place.landmarks, 4), 4);
  const visibleTransitions = uniqueStrings([
    ...sliceArray(place.exits, 4).map((exit) => {
      const label = exit?.label ?? exit?.name ?? exit?.direction ?? exit;
      const certainty = exit?.certainty ?? null;
      return certainty ? `${label} (${certainty})` : String(label);
    }),
    ...sliceArray(scene.connections, 4)
  ], 8);
  const visibleNpcLabels = visibleNpcs.slice(0, 4).map((npc) => npc?.name ?? 'кто-то');
  const visibleObjectLabels = uniqueStrings(visibleObjects, 4);
  const visibleTransitionLabels = uniqueStrings(visibleTransitions, 4);
  const sceneAccessBlocked = isSceneAccessBlocked(scene?.access);
  const prose = String(world?.lastNarratorProse ?? world?.openingText ?? '').trim();

  return {
    prose,
    markup: {
      atmosphere: {
        weather: scene.weather ?? null,
        light: scene.light ?? null,
        mood: scene.mood ?? null,
        access: scene.access ?? null,
        currentPeriod: scene.currentPeriod ?? null,
        purpose: scene.purpose ?? null,
        rhythm: scene.rhythm ?? null,
        orientation: scene.orientation ?? null,
        certainty: scene.certainty ?? null
      },
      entities: [
        ...visibleNpcs.slice(0, 4).map((npc) => ({
          kind: 'npc',
          id: npc?.id ?? null,
          label: npc?.name ?? 'кто-то',
          accessible: true,
          action: 'talk'
        })),
        ...visibleObjects.slice(0, 4).map((item, index) => ({
          kind: 'object',
          id: `object:${index}`,
          label: String(item),
          accessible: true,
          action: 'inspect'
        })),
        ...visibleTransitions.slice(0, 4).map((item, index) => ({
          kind: 'exit',
          id: `exit:${index}`,
          label: String(item),
          accessible: !sceneAccessBlocked,
          action: sceneAccessBlocked ? 'inspect' : 'move'
        }))
      ],
      highlights: [
        ...visibleNpcLabels.map((label) => ({ kind: 'npc', label, action: 'talk' })),
        ...visibleObjectLabels.map((label) => ({ kind: 'object', label, action: 'inspect' })),
        ...(!sceneAccessBlocked
          ? visibleTransitionLabels.map((label) => ({ kind: 'exit', label, action: 'move' }))
          : [])
      ].slice(0, 10),
      notes: [
        scene.weather ? `Погода: ${scene.weather}` : null,
        scene.light ? `Свет: ${scene.light}` : null,
        scene.mood ? `В воздухе: ${scene.mood}` : null,
        scene.access ? `Доступ: ${scene.access}` : null,
        landmarkNotes.length > 0 ? `Ориентиры места: ${landmarkNotes.join(' / ')}` : null,
        scene.hazards?.length ? `Риски: ${sliceArray(scene.hazards, 4).join(' / ')}` : null,
        scene.smells?.length ? `Запахи: ${sliceArray(scene.smells, 4).join(' / ')}` : null
      ].filter(Boolean)
    }
  };
}

function isSceneAccessBlocked(access) {
  const text = String(access ?? '').trim().toLowerCase();
  if (!text) return false;
  return /(закрыт|закрыто|по приглаш|по разреш|дозвол|под надзор|сторож|контрол|чужого сперва расспрашивают|доступ ограничен)/.test(text);
}

function buildPlayerOrientation(currentPosition, routeContext = null) {
  if (!currentPosition || typeof currentPosition !== 'object') {
    return {
      regionId: null,
      placeId: null,
      locationId: null,
      microLocationId: null,
      lastRouteId: routeContext?.lastRouteId ?? null
    };
  }
  return {
    regionId: cleanText(currentPosition.region_id ?? '') || null,
    placeId: cleanText(currentPosition.place_id ?? '') || null,
    locationId: cleanText(currentPosition.location_id ?? '') || null,
    microLocationId: cleanText(currentPosition.minilocation_id ?? '') || null,
    lastRouteId: routeContext?.lastRouteId ?? (cleanText(currentPosition.last_route_id ?? '') || null)
  };
}

function finalizePlayerPayload(player, includeDebug) {
  if (includeDebug || !player || typeof player !== 'object') return player;
  const {
    knowledge_map: _knowledgeMap,
    memory_profile: _memoryProfile,
    goals_profile: _goalsProfile,
    property_and_access: _propertyAndAccess,
    relations: _relations,
    position: _position,
    start_scene: _startScene,
    actorProfile: _actorProfile,
    ...publicPlayer
  } = player;
  return publicPlayer;
}

export function buildPlayerUiState(world) {
  return buildUiState(world, { includeDebug: false });
}

export function buildDebugUiState(world) {
  return buildUiState(world, { includeDebug: true });
}

export function buildClientControlState(world, meta = {}) {
  return {
    worldId: world?.worldId ?? null,
    worldKey: world?.worldKey ?? null,
    scenarioId: world?.scenarioId ?? null,
    createdAt: world?.createdAt ?? null,
    lastUpdatedAt: world?.lastUpdatedAt ?? null,
    catalogDirty: Boolean(world?.catalogDirty),
    hasSavedGame: Boolean(meta?.hasSavedGame)
  };
}

export function sanitizeBootstrapMeta(meta = {}) {
  const next = { ...meta };
  if (!meta.localOnly) {
    delete next.apiToken;
  }
  return next;
}

export function assertPublicUiState(uiState) {
  const violations = findForbiddenPublicKeys(uiState);
  if (violations.length > 0) {
    throw new Error(`Public UI state leaks forbidden keys: ${violations.slice(0, 8).join(', ')}`);
  }
  assertPublicUiRootKeys(uiState);
  return true;
}

function stripPublicForbiddenKeys(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stripPublicForbiddenKeys(item));
  }
  if (!value || typeof value !== 'object') return value;
  const next = {};
  for (const [key, nested] of Object.entries(value)) {
    if (isForbiddenPublicKey(key)) continue;
    next[key] = stripPublicForbiddenKeys(nested);
  }
  return next;
}

export function buildUiState(world, options = {}) {
  const includeDebug = Boolean(options.includeDebug);
  const player = summarizePlayer(world.player);
  const npcs = (world.npcs ?? []).map((npc) => summarizeNpc(
    npc,
    world.relationships?.[npc.id] ?? null,
    summarizePropertyLedgerForActor(world.propertyLedger, npc.id),
    summarizePropertyLedgerCluesForActor(world.propertyLedger, npc.id),
    { includeDebug }
  ));
  const historical = summarizeHistorical(world.historical);
  const knowledgeMap = summarizeKnowledgeMap(world);
  const currentPosition = structuredClone(world.current_position ?? null);
  const currentLocationId = currentPosition?.location_id ?? null;
  const currentMicroLocationId = currentPosition?.minilocation_id ?? null;
  const propertyView = buildPropertyView((Array.isArray(world?.propertyLedger) ? world.propertyLedger : []).filter((item) => isVisibleLedgerItemForSummary(item)));
  const socialTrace = describeSocialState(world);
  const socialSummary = {
    trace: socialTrace,
    suspicion: Number(world?.social?.suspicion ?? 0),
    recentWitnesses: Array.isArray(world?.social?.recentWitnesses) ? world.social.recentWitnesses.length : 0
  };
  const routeContext = {
    lastRouteId: cleanText(currentPosition?.last_route_id ?? '') || null
  };
  const orientation = buildPlayerOrientation(currentPosition, routeContext);
  const debug = includeDebug ? {
    cluster: structuredClone(world.cluster),
    riskAudit: structuredClone(world.lastRiskAudit ?? null),
    lastCheck: structuredClone(world.lastCheck ?? null),
    currentPosition,
    currentLocationId,
    currentMicroLocationId
  } : null;

  const state = {
    clock: structuredClone(world.clock),
    clockText: formatClock(world.clock, world),
    history: structuredClone(world.history),
    region: structuredClone(world.region),
    historical,
    legal: structuredClone(world.legal),
    place: structuredClone(world.place),
    visibleScene: summarizeVisibleScene(world),
    microPlace: structuredClone(world.microPlace),
    player: finalizePlayerPayload(player, includeDebug),
    orientation,
    npcs,
    visibleNpcs: npcs.filter((npc) => npc.locationId === currentLocationId),
    knowledgeMap,
    propertyView,
    socialTrace,
    socialSummary,
    routeContext,
    memory: summarizeMemory(world.memory, world),
    events: summarizeEvents(world.events),
    journal: summarizeJournal(world),
    journalSections: summarizeJournalSections(world),
    delayedEvents: summarizePublicDelayedEvents(world.delayedEvents),
    routeArchive: historical.routeArchive,
    medicalContext: historical.medicalContext,
    fieldCareContext: historical.fieldCareContext
  };

  if (includeDebug) {
    state.currentPosition = debug.currentPosition;
    state.currentLocationId = debug.currentLocationId;
    state.currentMicroLocationId = debug.currentMicroLocationId;
    state.debug = debug;
    state.relationships = structuredClone(world.relationships);
    state.propertyLedger = structuredClone(world.propertyLedger);
    state.social = structuredClone(world.social);
    state.technicalJournal = summarizeEvents((world.events ?? []).filter((entry) => isTechnicalJournalEntry(entry)));
    state.provider = {
      enabled: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
      provider: process.env.DEEPSEEK_API_KEY?.trim() ? 'deepseek' : 'not_configured',
      model: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat'
    };
  }

  if (!includeDebug) {
    state.player = stripPublicForbiddenKeys(state.player);
    state.npcs = state.npcs.map((npc) => stripPublicForbiddenKeys(npc));
    state.visibleNpcs = state.visibleNpcs.map((npc) => stripPublicForbiddenKeys(npc));
    assertPublicUiState(state);
  }

  return state;
}

export function buildUiBootstrap(world, openingText, meta = {}, extras = {}) {
  const safeMeta = sanitizeBootstrapMeta(meta);
  return {
    meta: safeMeta,
    openingText,
    state: buildUiState(world, { includeDebug: Boolean(meta?.debugVisible) }),
    client: buildClientControlState(world, meta),
    ...extras
  };
}
