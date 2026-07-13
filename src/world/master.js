import { classifyIntent, isInventoryIntent } from './intent.js';
import { estimateTravelMinutes, getCurrentLocation } from './location.js';
import { buildHistoricalContext, humanizeHistoricalPhaseLabel } from './historical-context.js';
import { buildLegalContext } from './law.js';
import { loadDesignBundle, loadDesignBundleSync, resolveDesignTask } from './corpus-loader.js';
import { armorCoverageSummary, deriveAttackFocus, summarizeActiveDefense, summarizeArmorProtection, summarizeBattleExertion, summarizeCombatVulnerability, summarizeWeaponDanger } from './combat-model.js';
import { buildMedicalContext } from './medical.js';
import { isQuickAccessibleItem } from './item-access.js';
import { buildRouteReconstruction, getLatestRouteReconstructions } from './routes.js';
import { describeSocialState } from './social.js';
import { getActiveStateValue } from './profile-v2.js';
import { sanitizeActorPublicProfile } from './json-contracts.js';
import { clampDifficulty } from './formulas.js';
import { getPendingSemanticWorld } from './semantic-gate.js';
import { migrateSkillKeys } from './social-generation-gate.js';

function joinList(value, separator = ' | ', fallback = 'не предоставлено') {
  return Array.isArray(value) && value.length > 0 ? value.join(separator) : fallback;
}

function summarizeSourceLog(sourceLog) {
  if (!Array.isArray(sourceLog) || sourceLog.length === 0) return 'не предоставлено';
  const parts = [];
  for (const entry of sourceLog.slice(0, 4)) {
    if (!entry || typeof entry !== 'object') continue;
    const status = String(entry.status ?? 'неизвестно').trim();
    const sourceCount = Array.isArray(entry.sources) ? entry.sources.length : 0;
    const usedInCount = Array.isArray(entry.usedIn) ? entry.usedIn.length : 0;
    parts.push(`${status}${sourceCount ? `; sources=${sourceCount}` : ''}${usedInCount ? `; usedIn=${usedInCount}` : ''}`);
  }
  return parts.length ? parts.join(' | ') : 'пусто';
}

export function buildMasterFrame(world, rawText) {
  const location = getCurrentLocation(world);
  const intent = classifyIntent(rawText);
  const claims = extractClaims(rawText);
  const travel = buildTravelContext(world, intent);
  const combat = buildCombatContext(world, intent);
  const medical = buildMedicalContext(world);
  const history = world.history ?? {};
  const place = world.place ?? {};
  const locationOccupants = Array.isArray(location?.occupants)
    ? location.occupants
    : (Array.isArray(place.occupants) ? place.occupants : []);
  const locationExits = Array.isArray(location?.exits)
    ? location.exits
    : (Array.isArray(place.exits) ? place.exits : []);
  const locationTraces = Array.isArray(location?.recentTraces)
    ? location.recentTraces
    : [];
  const clusterNeighbors = Array.isArray(world.cluster?.neighboringRegions)
    ? world.cluster.neighboringRegions
    : [];

  return {
    input: rawText,
    intent,
    historical: buildHistoricalContext(world),
    legal: buildLegalContext(world),
    travel,
    combat,
    medical,
    cluster: world.cluster ? {
      neighboringRegions: clusterNeighbors.slice(0, 4),
      activeRegion: world.cluster.activeRegion,
      place: world.cluster.place,
      location: world.cluster.location,
      microPlace: world.microPlace,
      startPosition: world.cluster.startPosition,
      graph: {
        nodes: world.cluster.graph?.nodes?.length ?? 0,
        edges: world.cluster.graph?.edges?.length ?? 0
      }
    } : null,
    world: {
      time: { ...world.clock },
      history: {
        era: history.era,
        year: history.year,
        season: history.season,
        macroForces: Array.isArray(history.macroForces) ? history.macroForces.slice(0, 4) : []
      },
      region: world.region?.name ?? null,
      location: {
        id: location?.id ?? world.current_position?.location_id ?? null,
        name: location?.name ?? place.name ?? null,
        kind: location?.kind ?? place.kind ?? null,
        occupants: locationOccupants.slice(),
        exits: locationExits.map((exit) => exit?.label ?? exit?.name ?? exit?.direction ?? exit).filter(Boolean),
        recentTraces: locationTraces.slice(0, 4).map((trace) => trace?.text ?? String(trace))
      },
      microPlace: {
        id: world.microPlace?.id ?? null,
        name: world.microPlace?.name ?? null,
        kind: world.microPlace?.kind ?? null,
        visibleObjects: world.microPlace?.visibleObjects?.slice(0, 6) ?? [],
        containers: world.microPlace?.containers?.slice(0, 4) ?? [],
        doors: world.microPlace?.doors?.slice(0, 4) ?? []
      },
      travel,
      combat,
      medical,
      social: {
        trace: describeSocialState(world),
        suspicion: world.social?.suspicion ?? 0,
        knownBy: Array.isArray(world.social?.knownBy) ? world.social.knownBy.slice(0, 4) : [],
        witnesses: Array.isArray(world.social?.recentWitnesses) ? world.social.recentWitnesses.slice(0, 4) : []
      },
      player: summarizeActor(world.player),
      npc: summarizeNearbyNpc(world),
      knowledge: summarizeKnowledgeBubble(world),
      property: summarizeProperty(world),
      memory: {
        rumors: Array.isArray(world.memory?.heardRumors) ? world.memory.heardRumors.slice(0, 3) : [],
        visits: Object.keys(world.memory?.visitedPlaces ?? {})
      },
      pendingSemanticWorld: getPendingSemanticWorld(world).slice(0, 6),
      inventoryFocus: isInventoryIntent(intent.type)
    },
    claims,
    constraints: buildConstraints(world, intent, claims, travel),
    risks: buildRisks(world, intent, claims, travel),
    possibleEffects: buildPossibleEffects(world, intent, claims, travel),
    selfChecks: buildSelfChecks(world, intent)
  };
}

export function planMasterTurnSync(world, rawText) {
  const frame = buildMasterFrame(world, rawText);
  frame.prompt = buildMasterPromptSync(frame);
  return buildMasterTurnPlan(frame);
}

export async function planMasterTurn(world, rawText) {
  const frame = buildMasterFrame(world, rawText);
  frame.prompt = await buildMasterPrompt(frame);
  return buildMasterTurnPlan(frame);
}

function buildMasterTurnPlan(frame) {
  const claimText = frame.claims.length ? ` Заявление сохранено как претензия: ${joinList(frame.claims, '; ', '')}.` : '';
  const riskText = frame.risks.length ? ` Риски: ${joinList(frame.risks, '; ', '')}.` : '';
  const constraintText = frame.constraints.length ? ` Ограничения: ${joinList(frame.constraints, '; ', '')}.` : '';
  const effectText = frame.possibleEffects.length ? ` Возможные последствия: ${joinList(frame.possibleEffects, '; ', '')}.` : '';

  return {
    frame,
    prompt: frame.prompt,
    summary: [
      `Мастер разбирает намерение как ${frame.intent.type}.`,
      constraintText,
      riskText,
      effectText,
      claimText
    ]
      .filter(Boolean)
      .join(' '),
    minutes: estimateIntentMinutes(frame.intent.type, frame.travel?.estimatedMinutes ?? null),
    summaryTag: tagForIntent(frame.intent.type)
  };
}

export function estimateIntentMinutes(type, travelMinutes = null) {
  const numericTravelMinutes = Number(travelMinutes);
  const routeMinutes = Number.isFinite(numericTravelMinutes) && numericTravelMinutes > 0
    ? Math.floor(numericTravelMinutes)
    : null;

  switch (type) {
    case 'observe':
      return 3;
    case 'wait':
      return 60;
    case 'move':
      return routeMinutes ?? 35;
    case 'talk':
      return 5;
    case 'rest':
      return 180;
    case 'heal':
      return 30;
    case 'defend':
      return 0.5;
    case 'flee':
      return routeMinutes ?? 1;
    case 'trade':
      return 30;
    case 'attack':
      return 0.5;
    case 'claim':
      return 10;
    case 'steal':
      return 10;
    case 'item_take':
    case 'item_retrieve':
    case 'item_inspect':
      return 5;
    case 'item_open_container':
    case 'item_search_container':
      return 8;
    case 'item_equip':
    case 'item_unequip':
      return 6;
    case 'item_use':
      return 4;
    case 'item_drop':
    case 'item_store':
    case 'item_give':
    case 'item_hide':
      return 5;
    default:
      return 15;
  }
}

export function buildMasterPromptSync(frame) {
  const designTask = resolveDesignTask(frame);
  return assembleMasterPrompt(frame, loadDesignBundleSync(designTask, { frame }));
}

export async function buildMasterPrompt(frame) {
  const designTask = resolveDesignTask(frame);
  const designBundle = await loadDesignBundle(designTask, { frame });
  return assembleMasterPrompt(frame, designBundle);
}

function assembleMasterPrompt(frame, designBundle) {
  return [
    '# Роль',
    'Ты — мастер исторической RPG про XIII век.',
    '# Задача',
    'Не подыгрывай: переводи намерение игрока в правдоподобные последствия и структурируй ход симуляции.',
    '# Доступные источники',
    'Используй факты мира, исторический контекст, видимое состояние, память, свидетелей и журнал источников.',
    '# Проектная документация',
    designBundle,
    '# Уже установленные факты партии',
    'Не отменяй сохранённые факты, уже произошедшие последствия и подтверждённые ограничения.',
    '# Знания персонажа',
    'Ориентируйся только на то, что персонаж может знать, видеть, слышать или разумно выводить.',
    '# Видимый контекст',
    'Разделяй факт мира, наблюдение, память, слух, свидетельство и догадку.',
    '# Скрытая информация',
    'Не раскрывай скрытую правду мира, если она не находится в осведомлённости конкретного персонажа.',
    '# Ограничения',
    'Не используй кнопки, меню, фиксированные варианты или выбор из списка. Не объявляй предположение фактом. Не превращай невозможное в бесплатный успех.',
    '# Формат ответа',
    'Верни сухой смысловой разбор без художественной прозы, если не требуется иное в следующем этапе.',
    '# Критерии успеха',
    'Ответ должен быть исторически правдоподобным, причинно честным, согласованным со статусом, свидетелями и временем, и не должен утекать за пределы видимого слоя.',
    '',
    'Ты создаёшь и материализуешь мир, людей, NPC, предметы, погоду, следы, слухи, события, локальные напряжения и причинные связи.',
    'Работаешь по пузырям осведомлённости: факт мира отдельно, наблюдение отдельно, память отдельно, слух отдельно, свидетельство отдельно, догадка отдельно.',
    'Ты проверяешь историчность XIII века, физику, социальные ограничения, видимость, память, право, статус и биографическую правдоподобность.',
    'Когда действие рискованно, ты объясняешь, почему нужен риск или проверка, и какие факторы меняют сложность; если проверка уже дана движком, честно интерпретируй её и не переписывай результат.',
    'После исхода ты предлагаешь последствия, которые мир действительно может понести.',
    'Любое действие занимает время, а перемещение и бой зависят от здоровья, сытости, бодрости, активных состояний, света, погоды, статуса и свидетелей.',
    'Бой не отдельная мини-игра: оценивай дистанцию, оружие, тело, здоровье, сытость, бодрость, активные состояния, страх, погоду, свет, численность и намерения сторон как единый ruling.',
    '- Исторический контекст, место, свидетели и социальный статус важнее удобного успеха.',
    '- Невозможное превращай в риск, ограничение, ошибку, слух, долг, подозрение или конфликт.',
    '- Мир сохраняет состояние между ходами и не пересоздаётся заново.',
    '- Если намерение неясно, выбери наиболее вероятную трактовку по текущему состоянию, явно пометь допущение и не добавляй лишних целей за игрока. Запрашивай уточнение только если без него действие невозможно честно обработать.',
    '- Перед ответом сделай внутреннюю проверку на анахронизмы, логику и удобные, но ложные совпадения.',
    '- Используй реальные исторические личности, события, хозяйство и быт, когда они доступны в контексте.',
    '- Если меняются предметы, описывай это в state_delta.item_changes: holder меняется при физическом перемещении, owner меняется только при отдельном основании.',
    '',
    `Исторический контекст: ${frame.historical.era}, ${frame.historical.year}, ${frame.historical.regionHint}.`,
    `Опорные события: ${joinList(frame.historical.anchorEvents)}.`,
    `Личности: ${joinList(frame.historical.notablePeople)}.`,
    `Историческое давление: ${joinList((frame.historical.activeHistoricalEventsSummary ?? []).map((item) => `${item.title}: ${humanizeHistoricalPhaseLabel(item.activePhase)}`), ' | ', frame.historical.phasePressure ?? 'нет')}.`,
    `Экономика: ${joinList(frame.historical.economicContext)}.`,
    `Быт и материальная среда: ${joinList(frame.historical.materialCulture)}.`,
    frame.historical.regionalContext?.current
      ? `Региональное резюме: ${frame.historical.regionalContext.current.name}; ландшафт ${frame.historical.regionalContext.current.landscape?.[0] ?? 'нет'}; экономика ${frame.historical.regionalContext.current.economy?.[0] ?? 'нет'}; власть ${frame.historical.regionalContext.current.power?.[0] ?? 'нет'}.`
      : 'Региональное резюме: нет.',
    frame.historical.regionalContext?.neighbors?.length
      ? `Соседние регионы: ${frame.historical.regionalContext.neighbors.map((item) => `${item.name}/${item.externalPressures?.[0] ?? item.threats?.[0] ?? 'давление неизвестно'}`).join(' | ')}.`
      : 'Соседние регионы: нет.',
    `Поведенческие правила: ${joinList(frame.historical.behavioralRules)}.`,
    `Маршруты: ${joinList((frame.historical.roadRoutes ?? []).map((item) => `${item.region}: ${item.route} [${item.risk}]`), ' | ', 'нет')}.`,
    `Дорожные риски: ${joinList(frame.historical.roadRisks, ' | ', 'нет')}.`,
    `Медицинский быт: ${joinList(frame.historical.medicalContext, ' | ', 'нет')}.`,
    `Полевой уход: ${joinList(frame.historical.fieldCareContext, ' | ', 'нет')}.`,
    `Право: ${joinList(frame.legal.rules)}.`,
    `Наказания: ${joinList(frame.legal.punishments)}.`,
    `Аномалия-чек: ${joinList(frame.historical.anomalyChecks)}.`,
    frame.cluster
      ? `Кластер: соседние регионы ${frame.cluster.neighboringRegions.map((item) => `${item.direction}:${item.pressure}`).join(' | ')}. Активный регион ${frame.cluster.activeRegion.name}. Место ${frame.cluster.place.name}. Микролокация ${frame.cluster.microPlace?.name ?? 'нет'} (граф ${frame.cluster.graph.nodes} узлов / ${frame.cluster.graph.edges} рёбер).`
      : 'Кластер: не загружен.',
    '',
    `Контекст: ${frame.world.history.era}, ${frame.world.history.year}, ${frame.world.history.season}.`,
    `Место: ${frame.world.location.name} (${frame.world.location.kind}).`,
    `Микропозиция: ${frame.world.microPlace?.name ?? 'нет'} (${frame.world.microPlace?.kind ?? 'нет'}).`,
    `Переход: ${frame.world.travel?.summary ?? 'нет'}; ${frame.world.travel?.estimatedMinutes ?? frame.world.travel?.minutes ?? 'нет'} мин.`,
    `Столкновение: ${frame.world.combat?.summary ?? 'нет'}.`,
    `Медицина: ${frame.world.medical?.nearbyHealer?.name ?? 'нет врача'}; ${frame.world.medical?.playerBleeding ?? 0} bleeding.`,
    `Архив маршрутов: ${joinList((frame.world.travel?.routeArchive ?? []).map((item) => item.summary), ' | ', 'пусто')}.`,
    `Социальный след: ${frame.world.social.trace}.`,
    `Свидетели: ${joinList(frame.world.social.witnesses, ', ', 'нет')}.`,
    `Слухи: ${joinList(frame.world.memory.rumors, ', ', 'нет')}.`,
    `Осведомлённость: ${formatKnowledgeBubble(frame.world.knowledge)}.`,
    `NPC: ${joinList((frame.world.npc ?? []).map((npc) => `${npc.name}/${npc.role}/${npc.visibleStatus}/${npc.currentActivity ?? 'неизвестно'}/marks:${joinList(npc.visibleMarks, ',', 'нет')}/conds:${joinList(npc.activeConditions, ',', 'нет')}/avail:${npc.availabilityWindow ?? 'нет'}/move:${npc.movementWindow ?? 'нет'}`), ' | ', 'нет')}.`,
    `Имущество: ${joinList((frame.world.property ?? []).map((item) => `${item.label}->${item.ownerName}; access:${item.access ?? 'нет'}; legal:${item.legalStatus ?? 'нет'}; plausibility:${item.plausibility ?? 'нет'}; scenePlausibility:${item.scenePlausibility ?? 'нет'}`), ' | ', 'нет')}.`,
    `Двери: ${joinList((frame.world.microPlace?.doors ?? []).map((door) => door.label), ' | ', 'нет')}.`,
    `Контейнеры: ${joinList((frame.world.microPlace?.containers ?? []).map((box) => box.label), ' | ', 'нет')}.`,
    `Журнал источников: ${summarizeSourceLog(frame.historical?.sourceLog)}.`,
    'Смысловая роль: материализуй из заявки игрока мир, поведение NPC, предметы, погоду, слухи, следы, события и напряжения.',
    'Правило rulings: если ситуация рискованна, объясни факторы проверки; если проверка уже дана движком, интерпретируй её честно и не меняй исход.',
    'Причинность: последствия должны следовать из свидетелей, владения, права, статуса, памяти места и уже зафиксированных фактов.',
    frame.check?.required ? `Проверка: ${frame.check.reason}.` : 'Проверка: не нужна.',
    `Ограничения: ${joinList(frame.constraints, '; ', 'нет явных ограничений')}.`,
    `Риски: ${joinList(frame.risks, '; ', 'нет явных рисков')}.`,
    `Self-checks: ${joinList(frame.selfChecks)}.`
  ].join('\n');
}

function buildConstraints(world, intent, claims, travel = null) {
  const constraints = [];
  const location = getCurrentLocation(world);

  constraints.push(`Исторический слой: ${world.history.era}, ${world.history.year}, ${world.history.season}.`);
  constraints.push(`Текущее место: ${location?.name ?? world.place.name}.`);

  if (intent.type === 'move' && (location?.exits?.length ?? 0) === 0) {
    constraints.push('Прямой выход отсюда не подтверждён.');
  }
  if (intent.type === 'attack' || intent.type === 'defend' || intent.type === 'flee') {
    constraints.push('Боевой контакт зависит от дистанции, тела, света, погоды и свидетелей.');
  }
  if (intent.type === 'move' || intent.type === 'flee' || intent.routeInquiry) {
    const route = travel?.routeReconstruction?.selected;
    if (route) {
      constraints.push(`Реконструкция пути: ${travel.routeReconstruction.summary}`);
      if (route.availability === 'blocked') {
        constraints.push('Путь сейчас ограничен сезоном или событиями.');
      }
    }
  }

  if (claims.length > 0) {
    constraints.push('Самоутверждение не равно признанию мира.');
  }

  if ((world.social?.suspicion ?? 0) > 8) {
    constraints.push('Подозрение уже высоко, поэтому любые странные действия будут замечены.');
  }

  return constraints;
}

function buildRisks(world, intent, claims, travel = null) {
  const risks = [];

  if (intent.type === 'attack') risks.push('шум, свидетели, ответное насилие');
  if (intent.type === 'move') risks.push('путь может оказаться длиннее или закрыт');
  if (intent.type === 'move' || intent.type === 'flee' || intent.routeInquiry) {
    const route = travel?.routeReconstruction?.selected;
    if (route?.risk) risks.push(route.risk);
    if (route?.availability === 'blocked') risks.push('маршрут может оказаться недоступен');
  }
  if (intent.type === 'attack' || intent.type === 'defend' || intent.type === 'flee') risks.push('дистанция, оружие, усталость и свидетели меняют исход боя');
  if (intent.type === 'trade') risks.push('торг без статуса и товара может вызвать отторжение');
  if (claims.length > 0) risks.push('ложное или неподтверждённое происхождение может вызвать сомнение');
  if ((world.social?.suspicion ?? 0) > 5) risks.push('тебя уже рассматривают как потенциальную проблему');

  return risks;
}

function buildPossibleEffects(world, intent, claims, travel = null) {
  const effects = [];

  if (intent.type === 'observe') effects.push('обновить картину места и заметить следы');
  if (intent.type === 'wait') effects.push('подвинуть рутину мира вперёд без твоего контроля');
  if (intent.type === 'talk') effects.push('изменить доступ к людям через тон и статус');
  if (intent.type === 'move') effects.push('поменять локацию и зафиксировать визит');
  if (intent.type === 'move' || intent.routeInquiry) effects.push('пересобрать историческую картину маршрута и записать её в архив');
  if (intent.type === 'heal') effects.push('остановить кровотечение, снизить риск ухудшения и оставить раны в памяти');
  if (intent.type === 'defend') effects.push('удержать позицию или сорвать чужую атаку');
  if (intent.type === 'flee') effects.push('разорвать дистанцию или потерять контроль над сценой');
  if (intent.type === 'attack') effects.push('спровоцировать ответное насилие или вынужденную проверку');
  if (claims.length > 0) effects.push('сохранить утверждение в памяти как претензию, а не факт');
  if (intent.type === 'steal') effects.push('зафиксировать риск собственности, свидетелей и наказания');

  return effects;
}

function buildSelfChecks(world, intent) {
  return [
    `Does the action fit ${world.history?.year ?? 'the current year'}?`,
    `Does the response respect the current location ${getCurrentLocation(world)?.name ?? world.place.name}?`,
    `Are there witnesses or social consequences for ${intent.type}?`,
    'Is anything too convenient for the player?'
  ];
}

function extractClaims(text) {
  if (!text) return [];
  const matches = [];
  const claimRegex = /(я (?:сын|дочь|друг|родственник|посланник|купец|воин|монах|слуга)[^.,;!?]*)/gi;
  let match;
  while ((match = claimRegex.exec(text))) {
    matches.push(match[1].trim());
  }
  return matches;
}

function tagForIntent(type) {
  switch (type) {
    case 'observe':
      return 'observe';
    case 'wait':
      return 'wait';
    case 'move':
      return 'move';
    case 'talk':
      return 'talk';
    case 'rest':
      return 'rest';
    case 'heal':
      return 'heal';
    case 'defend':
      return 'defend';
    case 'flee':
      return 'flee';
    case 'trade':
      return 'trade';
    case 'attack':
      return 'conflict';
    case 'claim':
      return 'claim';
    case 'steal':
      return 'theft';
    case 'item_take':
    case 'item_drop':
    case 'item_store':
    case 'item_retrieve':
    case 'item_open_container':
    case 'item_search_container':
    case 'item_equip':
    case 'item_unequip':
    case 'item_use':
    case 'item_give':
    case 'item_hide':
    case 'item_inspect':
      return 'inventory';
    default:
      return 'ambiguous';
  }
}

function summarizeNearbyNpc(world) {
  return (world.npcs ?? []).slice(0, 6).map((npc) => ({
    id: npc.id,
    name: npc.name,
    role: npc.role,
    visibleStatus: npc.visibleStatus ?? npc.status ?? null,
    currentActivity: npc.actorProfile?.work?.currentActivity ?? null,
    bodyState: npc.bodyState ?? null,
    visibleMarks: Array.isArray(npc.visibleMarks) ? npc.visibleMarks.slice(0, 3) : [],
    activeConditions: Array.isArray(npc.activeConditions) ? npc.activeConditions.slice(0, 3) : [],
    availabilityWindow: npc.availabilityWindow ?? null,
    movementWindow: npc.movementWindow ?? null,
    visibleProperty: collectCarriedItemLabels(npc).slice(0, 3),
    attitudeToPlayer: npc.attitudeToPlayer ?? null,
    locationId: npc.locationId ?? npc.homeLocation ?? null
  }));
}

function summarizeActor(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const safe = sanitizeActorPublicProfile(profile) ?? profile;
  return {
    identity: {
      ageRange: safe.identity?.ageRange ?? null,
      origin: safe.identity?.origin ?? null,
      socialPosition: safe.identity?.socialPosition ?? null,
      visibleStatus: safe.identity?.visibleStatus ?? null,
      reasonHere: safe.identity?.reasonHere ?? null
    },
    kinship: {
      familyFacts: Array.isArray(safe.kinship?.familyFacts) ? safe.kinship.familyFacts.slice(0, 4) : [],
      noFamilyReason: safe.kinship?.noFamilyReason ?? null,
      obligations: Array.isArray(safe.kinship?.obligations) ? safe.kinship.obligations.slice(0, 4) : []
    },
    work: {
      occupation: safe.work?.occupation ?? null,
      currentActivity: safe.work?.currentActivity ?? null,
      nextTask: safe.work?.nextTask ?? null,
      dutyWindow: safe.work?.dutyWindow ?? null,
      interruptionRule: safe.work?.interruptionRule ?? null
    },
    body: {
      bodyState: safe.body?.bodyState ?? null,
      visibleMarks: Array.isArray(safe.body?.visible_marks) ? safe.body.visible_marks.slice(0, 4) : [],
      activeConditions: Array.isArray(safe.body?.active_conditions) ? safe.body.active_conditions.slice(0, 4) : [],
      clothing: safe.body?.clothing ?? null,
      language: safe.body?.language ?? null,
      literacy: safe.body?.literacy ?? null
    },
    mind: {
      fears: Array.isArray(safe.mind?.fears) ? safe.mind.fears.slice(0, 4) : [],
      goals: Array.isArray(safe.mind?.goals) ? safe.mind.goals.slice(0, 4) : [],
      knowledge: Array.isArray(safe.mind?.knowledge) ? safe.mind.knowledge.slice(0, 4) : []
    }
  };
}

function summarizeKnowledgeBubble(world) {
  const location = getCurrentLocation(world);
  return {
    fact: {
      location: {
        id: location?.id ?? world.currentLocationId,
        name: location?.name ?? world.place.name,
        kind: location?.kind ?? world.place.kind
      },
      scene: {
        weather: world.scene?.weather ?? null,
        light: world.scene?.light ?? null,
        attention: world.scene?.attention ?? null
      }
    },
    perception: {
      visibleTraces: (location?.recentTraces ?? []).slice(0, 4).map((trace) => trace.text),
      visibleObjects: world.microPlace?.visibleObjects?.slice(0, 6) ?? [],
      visibleNpcs: (world.npcs ?? []).slice(0, 6).map((npc) => ({
        id: npc.id,
        name: npc.name,
        role: npc.role,
        visibleStatus: npc.visibleStatus ?? npc.status ?? null,
        currentActivity: npc.actorProfile?.work?.currentActivity ?? null
      }))
    },
    player: {
      memory: Array.isArray(world.player?.memory) ? world.player.memory.slice(0, 6) : [],
      knowledge: Array.isArray(world.player?.knowledge) ? world.player.knowledge.slice(0, 6) : [],
      obligations: Array.isArray(world.player?.obligations) ? world.player.obligations.slice(0, 6) : [],
      goals: Array.isArray(world.player?.goals) ? world.player.goals.slice(0, 6) : [],
      fears: Array.isArray(world.player?.fears) ? world.player.fears.slice(0, 6) : [],
      bodyState: world.player?.bodyState ?? null,
      visibleStatus: world.player?.visibleStatus ?? world.player?.status ?? null
    },
    memory: world.memory?.sceneNotes?.slice(0, 6) ?? [],
    rumor: world.memory?.heardRumors?.slice(0, 6) ?? [],
    testimony: world.social?.recentWitnesses?.slice(0, 6) ?? [],
    guess: Array.isArray(world.player?.claims) ? world.player.claims.slice(0, 6) : [],
    narrator: {
      mayRevealHiddenFacts: false,
      mayRevealUnknownStatuses: false,
      text: 'Рассказчик может описывать только наблюдаемое, слышимое, выводимое и уже зафиксированное.'
    }
  };
}

function formatKnowledgeBubble(knowledge) {
  if (!knowledge || typeof knowledge !== 'object') return 'нет';
  const parts = [];
  if (knowledge.fact?.location?.name) parts.push(`факт=${knowledge.fact.location.name}`);
  if (Array.isArray(knowledge.perception?.visibleTraces) && knowledge.perception.visibleTraces.length) parts.push(`видимое=${knowledge.perception.visibleTraces.length}`);
  if (Array.isArray(knowledge.player?.memory) && knowledge.player.memory.length) parts.push(`память=${knowledge.player.memory.length}`);
  if (Array.isArray(knowledge.testimony) && knowledge.testimony.length) parts.push(`свидетели=${knowledge.testimony.length}`);
  if (Array.isArray(knowledge.rumor) && knowledge.rumor.length) parts.push(`слухи=${knowledge.rumor.length}`);
  return parts.length ? parts.join('; ') : 'пусто';
}

function summarizeProperty(world) {
  return (world.propertyLedger ?? [])
    .filter((item) => isPublicPropertySignal(item))
    .slice(0, 8)
    .map((item) => ({
    id: item.id,
    label: item.label,
    ownerName: item.ownerName,
    ownerType: item.ownerType,
    holderName: item.holderName ?? null,
    placement: item.placement ?? null,
    access: item.access ?? null,
    legalStatus: item.legalStatus ?? null,
    plausibility: item.plausibility ?? null,
    scenePlausibility: inferSceneItemPlausibility(world, item),
    risk: item.risk ?? null,
    weight: item.weight ?? null,
    locationId: item.locationId
    }));
}

function isPublicPropertySignal(item) {
  if (!item || typeof item !== 'object') return false;
  const visibility = String(item.visibility ?? '').trim().toLowerCase();
  const access = String(item.access ?? '').trim().toLowerCase();
  const discoverability = Number(item.discoverability);
  if (visibility === 'hidden' || visibility === 'unknown') return false;
  if (access === 'closed_container') return false;
  if (Number.isFinite(discoverability) && discoverability <= 1) return false;
  return true;
}

function inferSceneItemPlausibility(world, item) {
  const base = Number(item?.plausibility);
  let score = Number.isFinite(base) ? base : 3;
  const sceneAccess = String(world?.scene?.access ?? '').trim().toLowerCase();
  const sceneOwnership = String(world?.scene?.ownership ?? world?.ownership ?? '').trim().toLowerCase();
  const ownerName = String(item?.ownerName ?? '').trim().toLowerCase();
  const access = String(item?.access ?? '').trim().toLowerCase();
  const legalStatus = String(item?.legalStatus ?? '').trim().toLowerCase();
  const placement = String(item?.placement ?? '').trim().toLowerCase();

  if (sceneOwnership && ownerName && sceneOwnership.includes(ownerName)) score += 1;
  if (sceneOwnership && ownerName && !sceneOwnership.includes(ownerName) && placement === 'carried') score -= 1;
  if (/(закрыт|надзор|разреш|приглаш|дозвол)/i.test(sceneAccess) && access && access !== 'immediate') score -= 1;
  if (legalStatus === 'disputed' || legalStatus === 'restricted') score -= 1;

  return Math.max(0, Math.min(5, Math.round(score)));
}

function buildTravelContext(world, intent) {
  const location = getCurrentLocation(world);
  const target = intent?.target ?? intent?.raw ?? '';
  const routeReconstruction = buildRouteReconstruction(world, intent);
  return {
    target,
    summary: `${location?.kind ?? world.place?.kind ?? 'место'} -> ${target || 'неуказанный путь'}`,
    estimatedMinutes: routeReconstruction.selected?.minutes ?? estimateTravelMinutes(world, target, location, null),
    routeReconstruction,
    routeArchive: getLatestRouteReconstructions(world, 3),
    routeTable: Array.isArray(world.historical?.roadRoutes) ? world.historical.roadRoutes.slice(0, 4) : [],
    roadRisks: Array.isArray(world.historical?.roadRisks) ? world.historical.roadRisks.slice(0, 4) : [],
    exits: (location?.exits ?? []).map((exit) => ({
      label: exit.label,
      to: exit.to
    })),
    terrain: location?.kind ?? world.place?.kind ?? 'неизвестно',
    weather: world.scene?.weather ?? 'неизвестно',
    light: world.scene?.light ?? 'неизвестно'
  };
}

function buildCombatContext(world, intent) {
  const location = getCurrentLocation(world);
  const nearby = (world.npcs ?? []).filter((npc) => (npc.locationId ?? npc.homeLocation) === location?.id);
  const attackFocus = deriveAttackFocus(intent, { input: intent?.raw ?? '' });
  const playerWeapons = collectWeaponLabels(world.player ?? {});
  const playerArmor = collectArmorLabels(world.player ?? {});
  const playerWeaponProfile = summarizeWeaponDanger(world.player ?? {});
  const playerArmorProfile = summarizeArmorProtection(world.player ?? {}, attackFocus);
  const playerActiveDefenseProfile = summarizeActiveDefense(world.player ?? {}, attackFocus);
  const playerBattleExertion = summarizeBattleExertion(world, intent, null);
  const playerArmorCoverage = armorCoverageSummary(world.player ?? {});
  const playerLoadCategory = resolveLoadCategory(world.player ?? {});
  const carriedItems = collectCarriedItemLabels(world.player ?? {});
  const target = resolveCombatTarget(world, intent, nearby);
  const canRetreat = Array.isArray(location?.exits) && location.exits.length > 0;
  const targetDefense = buildTargetDefense(world, target, location, attackFocus);
  const targetWeapons = target ? collectWeaponLabels(target) : [];
  const targetArmor = target ? collectArmorLabels(target) : [];
  const targetWeaponProfile = target ? summarizeWeaponDanger(target) : { value: 0, label: 'нет', items: [] };
  const targetArmorProfile = target ? summarizeArmorProtection(target, attackFocus) : { value: 0, label: 'нет', items: [] };
  const targetArmorCoverage = target ? armorCoverageSummary(target) : { value: 0, label: 'нет', items: [] };
  const targetActiveDefenseProfile = target ? summarizeActiveDefense(target, attackFocus) : { value: 0, label: 'нет', items: [] };
  const targetVulnerability = target ? summarizeCombatVulnerability(target) : 0;
  const targetLoadCategory = target ? resolveLoadCategory(target) : null;
  const legalContext = buildLegalContext(world);
  const legalPressure = legalContext.rules?.[0] ?? null;
  const locationExits = Array.isArray(location?.exits)
    ? location.exits.map((exit) => ({
      label: exit?.label ?? exit?.name ?? exit?.direction ?? null,
      to: exit?.to ?? null
    }))
    : [];
  return {
    intent: intent.type,
    summary: `${nearby.length} NPC; target ${target?.name ?? 'нет'}; defense ${targetDefense ?? 'нет'}; weapon danger ${playerWeaponProfile.value}; armor ${playerArmorProfile.value}; active defense ${playerActiveDefenseProfile.value}; exits ${locationExits.length}; witnesses ${world.social?.recentWitnesses?.length ?? 0}; retreat ${canRetreat ? 'yes' : 'no'}`,
    distance: world.microPlace?.kind ?? location?.kind ?? 'неизвестно',
    playerWeapons,
    playerArmor,
    playerWeaponDanger: playerWeaponProfile.value,
    playerWeaponLabel: playerWeaponProfile.label,
    playerArmorProtection: playerArmorProfile.value,
    playerArmorLabel: playerArmorProfile.label,
    playerActiveDefense: playerActiveDefenseProfile.value,
    playerActiveDefenseLabel: playerActiveDefenseProfile.label,
    playerBattleExertion: playerBattleExertion.value,
    playerBattleExertionLabel: playerBattleExertion.label,
    playerArmorCoverage: playerArmorCoverage.items,
    attackFocus,
    playerLoadCategory,
    carriedItems,
    canRetreat,
    targetDefense,
    target: target ? {
      id: target.id,
      name: target.name,
      role: target.role,
      mood: target.mood,
      health: target.health ?? 100,
      bleeding: target.bleeding ?? 0,
      locationId: target.locationId ?? target.homeLocation ?? null,
      weapons: targetWeapons,
      armor: targetArmor,
      weaponDanger: targetWeaponProfile.value,
      weaponLabel: targetWeaponProfile.label,
      armorProtection: targetArmorProfile.value,
      armorLabel: targetArmorProfile.label,
      activeDefense: targetActiveDefenseProfile.value,
      activeDefenseLabel: targetActiveDefenseProfile.label,
      armorCoverage: targetArmorCoverage.items,
      attackFocus,
      vulnerability: targetVulnerability,
      loadCategory: targetLoadCategory
    } : null,
    injuries: Array.isArray(world.player?.injuries) ? world.player.injuries.slice(0, 6) : [],
    nearby: nearby.map((npc) => ({
      name: npc.name,
      role: npc.role,
      mood: npc.mood,
      health: npc.health ?? 100,
      bleeding: npc.bleeding ?? 0,
      attitudeToPlayer: npc.attitudeToPlayer ?? null
    })),
    locationExits,
    weather: world.scene?.weather ?? 'неизвестно',
    light: world.scene?.light ?? 'неизвестно',
    witnesses: nearby.map((npc) => npc?.name).filter(Boolean).slice(0, 4),
    legal: legalContext,
    legalPressure
  };
}

function resolveCombatTarget(world, intent, nearby = []) {
  const targetText = String(intent?.target ?? '').trim().toLowerCase();
  if (targetText) {
    const explicitTarget = nearby.find((npc) => {
      const name = String(npc?.name ?? '').toLowerCase();
      return Boolean(name) && (name.includes(targetText) || targetText.includes(name));
    });
    if (explicitTarget) return explicitTarget;
  }
  return nearby[0] ?? null;
}

function buildTargetDefense(world, target, location = null, focus = null) {
  if (!target) return null;
  const health = Number(target?.states?.health ?? target?.health ?? 100);
  const agility = readAttributeValue(target, 'agility');
  const attention = readAttributeValue(target, 'attention');
  const skill = Math.max(
    readSkillValue(target, 'melee_combat'),
    readSkillValue(target, 'athletics'),
    readSkillValue(target, 'observation')
  );
  const loadCategory = resolveLoadCategory(target);
  const bleeding = Number(target?.bleeding ?? target?.states?.bleeding ?? 0);
  const fear = getActiveStateValue(target, 'fear') ?? 0;
  const currentMicroLocationId = world?.current_position?.minilocation_id ?? world?.currentMicroLocationId ?? null;
  const targetMicroLocationId = target?.current_position?.minilocation_id ?? target?.microLocationId ?? null;
  const sameMicroLocation = targetMicroLocationId && targetMicroLocationId === currentMicroLocationId;
  const positionBonus = sameMicroLocation ? 1 : ((location?.kind === 'вход' || location?.kind === 'ядро') ? 1 : 0);

  let defense = 10;
  if (health <= 0) defense = 5;
  else if (health <= 20) defense = 8;
  defense += Math.max(attributeBonus(agility), attributeBonus(attention));
  defense += skill;
  defense += summarizeActiveDefense(target, focus).value;
  defense += positionBonus;
  defense += loadDefenseModifier(loadCategory);
  if (bleeding > 0) defense -= 1;
  if (fear >= 50) defense -= 1;

  return clampDifficulty(defense);
}

function resolveLoadCategory(actor = {}) {
  const explicit = String(actor?.items?.load_category ?? '').trim().toLowerCase();
  if (explicit) return explicit;

  const totalWeight = Number(actor?.items?.total_weight);
  const strength = Number(actor?.attributes?.strength);
  if (!Number.isFinite(totalWeight) || !Number.isFinite(strength)) return null;
  if (strength <= 0) return totalWeight > 0 ? 'overloaded' : 'light';
  if (totalWeight <= strength * 2) return 'light';
  if (totalWeight <= strength * 4) return 'moderate';
  if (totalWeight <= strength * 6) return 'heavy';
  return 'overloaded';
}

function loadDefenseModifier(loadCategory) {
  const text = String(loadCategory ?? '').toLowerCase();
  if (text === 'moderate') return -1;
  if (text === 'heavy') return -2;
  if (text === 'overloaded') return -3;
  return 0;
}

function collectCarriedItemLabels(actor = {}) {
  const items = Array.isArray(actor.items?.carried_items) ? actor.items.carried_items : [];
  return items.map((item) => itemLabel(item)).filter(Boolean);
}

function collectWeaponLabels(actor = {}) {
  const items = Array.isArray(actor.items?.weapons) ? actor.items.weapons : [];
  return items
    .filter((item) => item && typeof item === 'object' && String(item.type ?? '').trim().toLowerCase() === 'weapon')
    .filter((item) => isQuickAccessibleItem(item))
    .map((item) => itemLabel(item))
    .filter(Boolean);
}

function collectArmorLabels(actor = {}) {
  const items = Array.isArray(actor.items?.armor) ? actor.items.armor : [];
  return items
    .filter((item) => item && typeof item === 'object' && ['armor', 'clothing'].includes(String(item.type ?? '').trim().toLowerCase()))
    .filter((item) => isQuickAccessibleItem(item))
    .map((item) => itemLabel(item))
    .filter(Boolean);
}

function itemLabel(item) {
  return String(item?.label ?? item?.name ?? item?.title ?? item ?? '').trim();
}

function readAttributeValue(actor, key) {
  const value = Number(actor?.attributes?.[key]);
  return Number.isFinite(value) ? value : 10;
}

function readSkillValue(actor, key) {
  const bonuses = migrateSkillKeys(actor?.skill_bonuses ?? {});
  const value = Number(bonuses[key]);
  return Number.isFinite(value) ? value : 0;
}

function attributeBonus(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.floor((numeric - 10) / 2);
}
