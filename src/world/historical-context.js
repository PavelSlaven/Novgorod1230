import centralEurope1241 from './history-packs/1241-central-europe.js';
import { isCentralEuropeFrame, isWorldDataPostgresEnabled, loadHistoryPackFromDb, resolveHistoryPackId } from './world-base-db.js';
import { buildRegionalContext } from './region-summary.js';
import { scheduleDelayedEvent } from './delayed-events.js';
import { recordWorldEvent } from './event-log.js';
import { allowsProceduralSemantics, queueSemanticPending } from './semantic-gate.js';

const HISTORICAL_PHASE_LABELS = new Map([
  ['background', 'Фон'],
  ['rumor', 'Предвестники'],
  ['pressure', 'Нарастание'],
  ['impact', 'Удар'],
  ['consequences', 'Последствия']
]);

export function buildHistoricalContext(world = {}) {
  const pack = selectHistoricalPack(world);
  const historicalEvents = buildHistoricalEvents(pack, world);
  const historicalPeople = buildHistoricalPeople(pack, historicalEvents, world);
  const sourceLog = buildHistoricalSourceLog(pack, world, historicalEvents);
  const roadRoutes = normalizeHistoricalRoadRoutes(pack.roadRoutes, world);
  const notablePeople = extractHistoricalPeople(pack.notablePeople).map((person) => person.name);
  const activeHistoricalEvents = historicalEvents.filter((event) => {
    const phaseId = String(event.activePhase?.id ?? '').toLowerCase();
    return phaseId && phaseId !== 'background';
  });
  const historicalEventsSummary = historicalEvents.slice(0, 12).map((event) => summarizeHistoricalEvent(event));
  const activeHistoricalEventsSummary = activeHistoricalEvents.slice(0, 12).map((event) => summarizeHistoricalEvent(event));
  return {
    packId: pack.id,
    era: pack.era,
    year: pack.year,
    regionHint: pack.regionHint,
    anchorEvents: pack.anchorEvents.slice(),
    notablePeople,
    historicalPeople,
    historicalEvents,
    activeHistoricalEvents,
    historicalEventsSummary,
    activeHistoricalEventsSummary,
    phasePressure: summarizeHistoricalPressure(activeHistoricalEvents),
    economicContext: pack.economicContext.slice(),
    materialCulture: pack.materialCulture.slice(),
    behavioralRules: pack.behavioralRules.slice(),
    roadRoutes,
    roadRisks: pack.roadRisks?.slice() ?? [],
    medicalContext: pack.medicalContext?.slice() ?? [],
    fieldCareContext: pack.fieldCareContext?.slice() ?? [],
    lawContext: pack.lawContext?.slice() ?? [],
    punishmentContext: pack.punishmentContext?.slice() ?? [],
    routeArchive: world.historical?.routeArchive?.slice(0, 12) ?? [],
    sourceUrls: pack.sourceUrls.slice(),
    sourceLog,
    regionalContext: buildRegionalContext(world),
    anomalyChecks: buildAnomalyChecks(world, pack)
  };
}

export function syncHistoricalContext(world = {}, options = {}) {
  if (!world || typeof world !== 'object') return null;
  const previousEvents = Array.isArray(world.historical?.historicalEvents)
    ? world.historical.historicalEvents
    : [];
  const historical = buildHistoricalContext(world);
  world.historical = historical;

  if (options.recordPhaseTransitions) {
    recordHistoricalPhaseTransitions(world, previousEvents, historical.historicalEvents);
  }

  if (options.schedulePhaseDelayedEvents) {
    scheduleHistoricalPhaseDelayedEvents(world, historical.historicalEvents);
  }

  return historical;
}

export function humanizeHistoricalPhaseLabel(phase = null) {
  const id = String(phase?.id ?? '').trim().toLowerCase();
  const label = String(phase?.label ?? '').trim();
  if (id && HISTORICAL_PHASE_LABELS.has(id)) {
    return HISTORICAL_PHASE_LABELS.get(id);
  }

  const normalizedLabel = label.toLowerCase();
  if (normalizedLabel && HISTORICAL_PHASE_LABELS.has(normalizedLabel)) {
    return HISTORICAL_PHASE_LABELS.get(normalizedLabel);
  }

  return label || 'Фон';
}

function buildHistoricalEvents(pack = {}, world = {}) {
  const sourceEvents = Array.isArray(pack.historicalEvents) && pack.historicalEvents.length > 0
    ? pack.historicalEvents
    : buildFallbackHistoricalEvents(pack);
  return dedupeHistoricalEvents(sourceEvents.map((event, index) => normalizeHistoricalEvent(event, index, pack, world)));
}

function recordHistoricalPhaseTransitions(world, previousEvents = [], nextEvents = []) {
  const previousPhaseById = new Map(
    (Array.isArray(previousEvents) ? previousEvents : [])
      .map((event) => [String(event?.id ?? ''), String(event?.activePhase?.id ?? '')])
      .filter(([id, phaseId]) => id && phaseId)
  );

  for (const event of Array.isArray(nextEvents) ? nextEvents : []) {
    const eventId = String(event?.id ?? '');
    const nextPhaseId = String(event?.activePhase?.id ?? '');
    if (!eventId || !nextPhaseId) continue;

    const previousPhaseId = previousPhaseById.get(eventId);
    if (!previousPhaseId || previousPhaseId === nextPhaseId) continue;

    recordWorldEvent(world, {
      kind: 'historical',
      source: 'historical_context',
      visibility: 'public',
      status: 'changed',
      at: { ...world.clock },
      label: event.title ?? eventId,
      relatedIds: [eventId],
      result: `Историческое давление меняется: ${event.title ?? eventId} переходит в фазу ${humanizeHistoricalPhaseLabel(event.activePhase ?? { id: nextPhaseId, label: nextPhaseId })}.`
    });
  }
}

function scheduleHistoricalPhaseDelayedEvents(world, historicalEvents = []) {
  if (!world || typeof world !== 'object') return;
  if (!Array.isArray(world.delayedEvents)) world.delayedEvents = [];

  for (const event of Array.isArray(historicalEvents) ? historicalEvents : []) {
    const phase = event?.activePhase ?? null;
    const delayedEvents = Array.isArray(phase?.delayedEvents) ? phase.delayedEvents : [];
    if (!phase || delayedEvents.length === 0) continue;

    delayedEvents.forEach((entry, index) => {
      const text = cleanText(entry);
      if (!text) return;

      const id = `historical:${event.id}:${phase.id}:${index + 1}`;
      if (world.delayedEvents.some((item) => item?.id === id)) return;

      scheduleDelayedEvent(world, {
        id,
        reason: `${event.title ?? 'Историческое событие'} · ${humanizeHistoricalPhaseLabel(phase)}`,
        dueInMinutes: 30 * (index + 1),
        result: text,
        effect: {
          memory: {
            rumors_add: [text]
          }
        }
      });
    });
  }
}

export async function selectHistoricalPackAsync(world = {}, env = process.env) {
  if (isWorldDataPostgresEnabled(env)) {
    const packId = resolveHistoryPackId(world);
    if (packId) {
      try {
        const pack = await loadHistoryPackFromDb(packId);
        if (pack) return pack;
      } catch (_error) {
        // ponytail: postgres unavailable — fall back to filesystem pack
      }
    }
  }
  return selectHistoricalPack(world);
}

function selectHistoricalPack(world = {}) {
  const selectedYear = world.historicalFrame?.year ?? world.history?.year;

  if (selectedYear === centralEurope1241.year && isCentralEuropeFrame(world)) {
    return centralEurope1241;
  }

  return buildFrameScopedPack(world, selectedYear);
}

function buildFrameScopedPack(world = {}, selectedYear) {
  const year = Number.isInteger(selectedYear) ? selectedYear : 1241;
  const region = world.historicalFrame?.regionName ?? world.region?.name ?? world.history?.regionHint ?? 'неизвестный регион';
  const regionHint = world.historicalFrame?.regionHint ?? world.history?.regionHint ?? region;
  const era = world.history?.era ?? centralEurope1241.era;
  const season = cleanText(world.historicalFrame?.season ?? world.history?.season ?? '') || null;
  const economy = takeArray(world.region?.economy, []);
  const legitimacy = takeArray(world.history?.legitimacy, []);

  return {
    id: `${year}-${slug(regionHint)}`,
    era,
    year,
    season,
    regionHint,
    anchorEvents: [],
    notablePeople: [],
    economicContext: economy.slice(0, 4),
    materialCulture: [],
    behavioralRules: legitimacy.slice(0, 4),
    roadRoutes: buildLocalRoadRoutes(world, region).slice(0, 4),
    roadRisks: [],
    medicalContext: [],
    fieldCareContext: [],
    lawContext: [],
    punishmentContext: [],
    sourceUrls: []
  };
}

function buildLocalRoadRoutes(world = {}, region) {
  const currentLocationId = getHistoricalCurrentLocationId(world);
  const location = world.locations?.[currentLocationId] ?? null;
  const exits = Array.isArray(location?.exits) ? location.exits : [];
  const routes = exits.map((exit, index) => normalizeHistoricalRoadRoute({
    region,
    route: `${location?.name ?? world.place?.name ?? 'текущее место'} -> ${exit.label ?? exit.name ?? exit.direction ?? 'местный путь'}`,
    risk: 'Риск определяется текущим регионом, сезоном, свидетелями и локальной властью, а не чужим историческим пакетом.',
    from_id: location?.id ?? null,
    to_id: exit?.to ?? null,
    scale: 'local',
    type: 'path',
    access: 'open',
    conditions: uniqueStrings([exit?.label, exit?.name, exit?.direction], 2),
    known_to_character: Boolean(location?.id),
    known_to_player: Boolean(location?.id),
    last_used_at: null,
    reverse_route_id: null
  }, index, world));

  if (routes.length > 0) return routes;
  return [normalizeHistoricalRoadRoute({
    region,
    route: 'местное место -> ближайший двор или дорога',
    risk: 'Скорость, доступ и безопасность зависят от сезона, статуса, поручительства и слухов.',
    from_id: location?.id ?? null,
    to_id: null,
    scale: 'regional',
    type: 'road',
    access: 'unknown',
    conditions: [],
    known_to_character: false,
    known_to_player: false,
    last_used_at: null,
    reverse_route_id: null
  }, 0, world)];
}

function buildAnomalyChecks(world, pack) {
  return [
    `Сверь год ${world.history?.year ?? world.historicalFrame?.year ?? 'неизвестно'} с пакетом ${pack.year}.`,
    `Сверь регион ${world.region?.name ?? world.historicalFrame?.regionName ?? 'неизвестно'} с подсказкой ${pack.regionHint}.`,
    'Отбрасывай дороги, именованные события, войны, правителей и риски, если они пришли из другой исторической рамки.',
    'Отбрасывай вымышленные титулы, невозможную скорость пути и удобные, но ложные модернизации.',
    'Проверяй социальное поведение через статус, свидетелей, страх и опасность дороги.',
    'Предпочитай местную экономику, сезонную пищу, дорожные пошлины и материальные ограничения вместо общих средневековых штампов.'
  ];
}

function buildHistoricalSourceLog(pack = {}, world = {}, historicalEvents = []) {
  const now = new Date().toISOString();
  const sources = Array.isArray(pack.sourceUrls) ? pack.sourceUrls.slice(0, 12) : [];
  const hasExternalSources = sources.length > 0;
  if (!hasExternalSources) {
    sources.push('frame-scoped historical synthesis');
  }
  const relatedEvents = Array.isArray(historicalEvents)
    ? historicalEvents.slice(0, 8).map((event) => event?.id).filter(Boolean)
    : [];

  return [{
    createdAt: now,
    reason: `Загружен исторический пакет ${pack.id ?? 'unknown'} для ${pack.regionHint ?? world.history?.regionHint ?? 'текущей рамки'}.`,
    agent: 'historical-context',
    request: 'buildHistoricalContext',
    sources,
    summary: Array.isArray(pack.anchorEvents) ? pack.anchorEvents.slice(0, 3) : [],
    usedIn: ['world.historical', 'world.historical.regionalContext'],
    status: hasExternalSources ? 'usable_with_caution' : 'needs_review',
    conflicts: [],
    needsReview: !hasExternalSources,
    relatedEvents
  }];
}

function normalizeHistoricalRoadRoutes(routes = [], world = {}) {
  return (Array.isArray(routes) ? routes : []).map((route, index) => normalizeHistoricalRoadRoute(route, index, world));
}

function normalizeHistoricalRoadRoute(route = {}, index = 0, world = {}) {
  const rawRoute = cleanText(route?.route ?? route);
  const nodes = parseRoadNodes(rawRoute);
  const fromId = cleanText(route?.from_id ?? route?.fromId ?? nodes[0] ?? getHistoricalCurrentLocationId(world) ?? '');
  const toId = cleanText(route?.to_id ?? route?.toId ?? nodes[nodes.length - 1] ?? '');
  const scale = cleanText(route?.scale ?? (nodes.length > 2 ? 'regional' : 'local')) || 'regional';
  const type = cleanText(route?.type ?? (nodes.length > 2 ? 'road' : 'path')) || 'road';
  const conditions = uniqueStrings([
    ...(Array.isArray(route?.conditions) ? route.conditions : []),
    ...nodes.slice(1, -1)
  ], 4);
  const knownToCharacter = route?.known_to_character ?? route?.knownToCharacter ?? Boolean(rawRoute);
  const knownToPlayer = route?.known_to_player ?? route?.knownToPlayer ?? knownToCharacter;

  return {
    id: cleanText(route?.id ?? `road:${slug(route?.region ?? rawRoute ?? index + 1)}:${index + 1}`),
    region: cleanText(route?.region ?? world.region?.name ?? world.historicalFrame?.regionName ?? world.history?.regionHint ?? ''),
    route: rawRoute,
    from_id: fromId || null,
    to_id: toId || null,
    scale,
    type,
    base_time: Number.isFinite(route?.base_time) ? route.base_time : (scale === 'regional' ? 180 : 45),
    access: cleanText(route?.access ?? 'unknown') || 'unknown',
    conditions,
    risk: cleanText(route?.risk ?? '') || null,
    known_to_character: Boolean(knownToCharacter),
    known_to_player: Boolean(knownToPlayer),
    seasonal_rule: cleanText(route?.seasonal_rule ?? '') || null,
    reverse_route_id: cleanText(route?.reverse_route_id ?? '') || null,
    last_used_at: route?.last_used_at ?? null
  };
}

function getHistoricalCurrentLocationId(world = {}) {
  return cleanText(
    world?.current_position?.location_id
      ?? world?.current_position?.place_id
      ?? world?.currentLocationId
      ?? ''
  ) || null;
}

function parseRoadNodes(routeValue) {
  return cleanText(routeValue)
    .split(/\s*->\s*/g)
    .map((part) => cleanText(part))
    .filter(Boolean);
}

function buildFallbackHistoricalEvents(pack = {}) {
  const anchors = Array.isArray(pack.anchorEvents) ? pack.anchorEvents.slice(0, 4) : [];
  const people = extractHistoricalPeople(pack.notablePeople).slice(0, 4);
  if (anchors.length === 0) return [];
  const visibleSigns = uniqueStrings(anchors, 4);
  const consequences = Array.isArray(pack.roadRisks) ? uniqueStrings(pack.roadRisks, 4) : [];

  return [
    {
      id: `${pack.id ?? 'historical'}:anchor`,
      title: `${pack.era ?? 'Исторический контекст'}: опорное событие`,
      reason: anchors[0] ?? null,
      participants: people.map((person) => person.name),
      region: pack.regionHint ?? null,
      dateRange: {
        year: pack.year ?? null,
        season: null
      },
      duplicateKey: `${pack.id ?? 'historical'}:anchor`,
      visibleSigns: visibleSigns.slice(0, 3),
      consequences: consequences.slice(0, 3),
      phases: [
        {
          id: 'background',
          label: 'Background',
          dateHint: buildPhaseHint(pack, 'background'),
          visibleSigns: visibleSigns.slice(0, 1),
          consequences: [],
          delayedEvents: [],
          influence: ['общее историческое давление пока ощущается только как дальний фон']
        },
        {
          id: 'rumor',
          label: 'Rumor',
          dateHint: buildPhaseHint(pack, 'rumor'),
          visibleSigns: visibleSigns.slice(0, 2),
          consequences: consequences.slice(0, 1),
          delayedEvents: visibleSigns.slice(0, 1),
          influence: ['историческое событие входит в игру через слухи и тревогу']
        },
        {
          id: 'pressure',
          label: 'Pressure',
          dateHint: buildPhaseHint(pack, 'pressure'),
          visibleSigns: visibleSigns.slice(1, 3),
          consequences: consequences.slice(0, 2),
          delayedEvents: visibleSigns.slice(1, 2),
          influence: ['дороги, рынок и настороженность местных начинают меняться']
        },
        {
          id: 'impact',
          label: 'Impact',
          dateHint: buildPhaseHint(pack, 'impact'),
          visibleSigns: visibleSigns.slice(1, 3),
          consequences: consequences.slice(0, 2),
          delayedEvents: consequences.slice(0, 1),
          influence: ['событие напрямую меняет доступность дорог, власть или безопасность']
        },
        {
          id: 'consequences',
          label: 'Consequences',
          dateHint: buildPhaseHint(pack, 'consequences'),
          visibleSigns: visibleSigns.slice(2, 4),
          consequences: consequences.slice(0, 3),
          delayedEvents: consequences.slice(1, 3),
          influence: ['последствия сохраняются после основного удара и давят на регион дальше']
        }
      ]
    }
  ];
}

function buildHistoricalPeople(pack = {}, historicalEvents = [], world = null) {
  const people = extractHistoricalPeople(pack.notablePeople).slice(0, 12);
  const activeParticipants = new Set(
    (Array.isArray(historicalEvents) ? historicalEvents : [])
      .flatMap((event) => Array.isArray(event?.participants) ? event.participants : [])
      .map((item) => cleanText(item))
      .filter(Boolean)
  );

  return people.map((person, index) => {
    const role = person.role ?? null;
    const influenceMode = person.influenceMode ?? null;
    const contactMode = person.contactMode ?? null;
    const needsMaterialization = !person.role || !person.influenceMode || !person.contactMode;
    if (needsMaterialization && world && !allowsProceduralSemantics(world)) {
      queueSemanticPending(world, 'historical_person_profile', { name: person.name, index });
    }
    return {
      id: `${pack.id ?? 'historical'}:person:${index + 1}`,
      name: person.name,
      role,
      region: person.region ?? pack.regionHint ?? null,
      event: person.event ?? null,
      influenceMode,
      contactMode,
      knowledge: uniqueStrings(person.knowledge ?? person.localKnowledge ?? [], 4),
      presence: person.presence ?? null,
      consequences: uniqueStrings(person.consequences ?? [], 4),
      active: activeParticipants.has(person.name),
      visibleSigns: uniqueStrings(person.visibleSigns ?? [], 4),
      pending_semantic_materialization: needsMaterialization && !allowsProceduralSemantics(world) ? 'historical_person_profile' : null
    };
  });
}

function normalizeHistoricalEvent(event = {}, index = 0, pack = {}, world = {}) {
  const phases = normalizeHistoricalPhases(event.phases, event, pack);
  const participants = normalizeHistoricalParticipants(event.participants);
  const delayedEvents = uniqueStrings([
    ...(Array.isArray(event.delayedEvents) ? event.delayedEvents : []),
    ...(Array.isArray(event.delayed) ? event.delayed : []),
    ...phases.flatMap((phase) => Array.isArray(phase.delayedEvents) ? phase.delayedEvents : [])
  ], 6);
  const normalized = {
    id: String(event.id ?? `${pack.id ?? 'historical'}:${index}`),
    title: String(event.title ?? event.name ?? `Историческое событие ${index + 1}`),
    reason: cleanText(event.reason) || null,
    participants,
    region: cleanText(event.region ?? pack.regionHint ?? world.region?.name ?? '') || null,
    dateRange: normalizeHistoricalDateRange(event.dateRange, pack),
    duplicateKey: String(event.duplicateKey ?? `${pack.id ?? 'historical'}:${index}`),
    visibleSigns: uniqueStrings(event.visibleSigns ?? [], 6),
    consequences: uniqueStrings(event.consequences ?? [], 6),
    delayedEvents,
    phases
  };
  normalized.signature = buildHistoricalEventSignature(normalized);
  normalized.activePhase = selectHistoricalPhase(normalized, world);
  return normalized;
}

export function dedupeHistoricalEvents(events = []) {
  const result = [];
  const seenKeys = new Set();
  const seenSignatures = new Set();

  for (const event of Array.isArray(events) ? events : []) {
    const signature = String(event?.signature ?? buildHistoricalEventSignature(event)).trim();
    const duplicateKey = String(event?.duplicateKey ?? '').trim();
    if (signature && seenSignatures.has(signature)) continue;
    if (duplicateKey && seenKeys.has(duplicateKey)) continue;
    if (duplicateKey) seenKeys.add(duplicateKey);
    if (signature) seenSignatures.add(signature);
    result.push(event);
  }

  return result;
}

function normalizeHistoricalPhases(phases = [], event = {}, pack = {}) {
  const source = Array.isArray(phases) && phases.length > 0
    ? phases
    : [
        {
          id: 'background',
          label: 'Background',
          visibleSigns: Array.isArray(event.visibleSigns) ? event.visibleSigns.slice(0, 2) : [],
          consequences: Array.isArray(event.consequences) ? event.consequences.slice(0, 2) : []
        }
      ];

  return source.map((phase, index) => ({
    id: String(phase.id ?? `phase-${index + 1}`),
    label: String(phase.label ?? phase.name ?? `Phase ${index + 1}`),
    dateHint: cleanText(phase.dateHint ?? phase.date ?? '') || null,
    scheduledAt: buildHistoricalPhaseSchedule(phase, pack, index),
    visibleSigns: uniqueStrings(phase.visibleSigns ?? phase.signs ?? [], 4),
    consequences: uniqueStrings(phase.consequences ?? [], 4),
    delayedEvents: uniqueStrings(phase.delayedEvents ?? phase.delayed ?? phase.followUps ?? [], 4),
    influence: uniqueStrings(phase.influence ?? [], 4)
  }));
}

function normalizeHistoricalDateRange(dateRange = {}, pack = {}) {
  const year = Number(dateRange?.year ?? pack.year ?? NaN);
  const season = cleanText(dateRange?.season ?? pack.season ?? '') || null;
  return {
    year: Number.isFinite(year) ? year : null,
    season
  };
}

function buildHistoricalEventSignature(event = {}) {
  const participants = uniqueStrings(event?.participants ?? [], 8).sort();
  const consequences = uniqueStrings(event?.consequences ?? [], 6).sort();
  return [
    cleanText(event?.reason ?? ''),
    cleanText(event?.region ?? ''),
    participants.join('|'),
    cleanText(event?.dateRange?.year ?? ''),
    cleanText(event?.dateRange?.season ?? ''),
    consequences.join('|')
  ]
    .map((item) => normalize(item))
    .filter(Boolean)
    .join('::') || 'historical-event';
}

function selectHistoricalPhase(event, world = {}) {
  const phases = Array.isArray(event?.phases) ? event.phases : [];
  if (phases.length === 0) return null;

  const eventYear = Number(event?.dateRange?.year ?? NaN);
  const worldYear = Number(world.history?.year ?? world.historicalFrame?.year ?? NaN);
  const season = cleanText(world.history?.season ?? world.historicalFrame?.season ?? '').toLowerCase();
  const seasonProgress = getSeasonProgress(world);

  if (Number.isFinite(eventYear) && Number.isFinite(worldYear) && worldYear !== eventYear) {
    return phases[0];
  }

  const scored = phases
    .map((phase, phaseIndex) => ({
      phase,
      phaseIndex,
      score: scoreHistoricalPhase(phase, phaseIndex, season, seasonProgress)
    }))
    .sort((a, b) => b.score - a.score || a.phaseIndex - b.phaseIndex);

  return scored[0]?.phase ?? phases[0];
}

function findHistoricalPhase(phases, keywords = []) {
  const source = Array.isArray(phases) ? phases : [];
  for (const keyword of keywords) {
    const match = source.find((phase) => {
      const id = String(phase?.id ?? '').toLowerCase();
      const label = String(phase?.label ?? '').toLowerCase();
      return id.includes(keyword) || label.includes(keyword);
    });
    if (match) return match;
  }
  return null;
}

function scoreHistoricalPhase(phase, index, season, seasonProgress) {
  const id = String(phase?.id ?? '').toLowerCase();
  const label = String(phase?.label ?? '').toLowerCase();
  const hint = String(phase?.dateHint ?? '').toLowerCase();
  const hasHint = Boolean(hint);
  let score = 0;

  if (hasHint) {
    if (index === 0) score += 1;
    if (id.includes('background') || label.includes('background')) score += 1;
    if (id.includes('rumor') || label.includes('rumor')) score += 1;
    if (id.includes('pressure') || label.includes('pressure')) score += 1;
    if (id.includes('impact') || label.includes('impact')) score += 1;
    if (id.includes('consequence') || label.includes('consequence') || id.includes('after') || label.includes('after')) score += 1;
    score += index * 0.05;
  } else {
    if (index === 0) score += 1;
    if (id.includes('background') || label.includes('background')) score += 3;
    if (id.includes('rumor') || label.includes('rumor')) score += 2;
    if (id.includes('pressure') || label.includes('pressure')) score += 3;
    if (id.includes('impact') || label.includes('impact')) score += 4;
    if (id.includes('consequence') || label.includes('consequence') || id.includes('after') || label.includes('after')) score += 2;
  }

  const hintSeason = normalizeSeasonHint(hint);
  if (hintSeason && season && hintSeason === season) score += 2;
  if (!hintSeason && season && /(spring|summer|autumn|fall|winter|весн|лет|осен|зим)/i.test(hint)) score += 1;

  const hintProgress = parseSeasonProgressHint(hint);
  if (hintProgress != null && seasonProgress != null) {
    const distance = Math.abs(hintProgress - seasonProgress);
    score += Math.max(0, 4 - (distance * 2));
  }

  return score;
}

function buildHistoricalPhaseSchedule(phase, pack = {}, index = 0) {
  const hint = cleanText(phase?.dateHint ?? phase?.date ?? '');
  if (!hint) {
    return {
      year: pack.year ?? null,
      season: pack.season ?? null,
      approxDay: index === 0 ? 1 : index * 10 + 1
    };
  }

  const season = normalizeSeasonHint(hint) ?? pack.season ?? null;
  return {
    year: Number.isFinite(Number(pack.year)) ? Number(pack.year) : null,
    season,
    approxDay: estimatePhaseDayFromHint(hint, index)
  };
}

function buildPhaseHint(pack = {}, phaseId = '') {
  const season = cleanText(pack?.season ?? '') || null;
  if (!season) {
    switch (phaseId) {
      case 'background':
        return 'начало периода';
      case 'rumor':
        return 'середина периода';
      case 'pressure':
        return 'поздний период';
      case 'impact':
        return 'перелом периода';
      case 'consequences':
        return 'после перелома';
      default:
        return null;
    }
  }

  const seasonPhrases = {
    весна: {
      background: 'ранняя весна',
      rumor: 'середина весны',
      pressure: 'поздняя весна',
      impact: 'конец весны',
      consequences: 'после весны'
    },
    лето: {
      background: 'раннее лето',
      rumor: 'середина лета',
      pressure: 'позднее лето',
      impact: 'конец лета',
      consequences: 'после лета'
    },
    осень: {
      background: 'ранняя осень',
      rumor: 'середина осени',
      pressure: 'поздняя осень',
      impact: 'конец осени',
      consequences: 'после осени'
    },
    зима: {
      background: 'ранняя зима',
      rumor: 'середина зимы',
      pressure: 'поздняя зима',
      impact: 'конец зимы',
      consequences: 'после зимы'
    }
  };

  const seasonMap = seasonPhrases[season];
  if (seasonMap?.[phaseId]) {
    return seasonMap[phaseId];
  }

  switch (phaseId) {
    case 'background':
      return `ранняя ${season}`;
    case 'rumor':
      return `середина ${season}`;
    case 'pressure':
      return `поздняя ${season}`;
    case 'impact':
      return `конец ${season}`;
    case 'consequences':
      return `после ${season}`;
    default:
      return season;
  }
}

function estimatePhaseDayFromHint(hint, index = 0) {
  const value = normalize(hint);
  if (/early|начала|начал|ранн/.test(value)) return 3;
  if (/mid|middle|середин/.test(value)) return 15;
  if (/late|end|поздн|конец/.test(value)) return 27;
  return index === 0 ? 1 : index * 10 + 1;
}

function getSeasonProgress(world = {}) {
  const day = Number(world.clock?.day ?? 1);
  if (!Number.isFinite(day)) return null;
  const normalizedDay = ((Math.max(1, Math.floor(day)) - 1) % 30) + 1;
  return Math.min(2, Math.floor((normalizedDay - 1) / 10));
}

function parseSeasonProgressHint(text) {
  const value = String(text ?? '').toLowerCase();
  if (!value) return null;
  if (/early|ранн|начал/.test(value)) return 0;
  if (/mid|middle|середин/.test(value)) return 1;
  if (/late|end|поздн/.test(value)) return 2;
  const dayMatch = value.match(/\b([0-9]{1,2})\b/u);
  if (dayMatch) {
    const day = Number(dayMatch[1]);
    if (Number.isFinite(day)) {
      return Math.min(2, Math.floor((Math.max(1, day) - 1) / 10));
    }
  }
  return null;
}

function normalizeSeasonHint(text) {
  const value = String(text ?? '').toLowerCase();
  if (/весн|spring/.test(value)) return 'весна';
  if (/лет|summer/.test(value)) return 'лето';
  if (/осен|fall|autumn/.test(value)) return 'осень';
  if (/зим|winter/.test(value)) return 'зима';
  return null;
}

function summarizeHistoricalPressure(events = []) {
  if (!Array.isArray(events) || events.length === 0) return 'нет';

  return events.map((event) => {
    const phase = event.activePhase ?? event.phases?.[0] ?? null;
    const signs = uniqueStrings([
      ...(Array.isArray(phase?.visibleSigns) ? phase.visibleSigns : []),
      ...(Array.isArray(event.visibleSigns) ? event.visibleSigns : [])
    ], 2);
    const signText = signs.length > 0 ? signs.join('; ') : 'нет видимых признаков';
    const dateHint = cleanText(phase?.dateHint ?? '');
    return `${event.title} — ${humanizeHistoricalPhaseLabel(phase)}${dateHint ? ` (${dateHint})` : ''}: ${signText}`;
  }).join(' | ');
}

function summarizeHistoricalEvent(event = {}) {
  const phase = event?.activePhase ?? event?.phases?.[0] ?? null;
  return {
    id: event?.id ?? null,
    title: event?.title ?? 'Историческое событие',
    region: event?.region ?? null,
    dateRange: event?.dateRange ?? null,
    duplicateKey: event?.duplicateKey ?? null,
    delayedEvents: Array.isArray(event?.delayedEvents) ? event.delayedEvents.slice(0, 4) : [],
    activePhase: phase ? {
      id: phase.id ?? null,
      label: humanizeHistoricalPhaseLabel(phase),
      dateHint: phase.dateHint ?? null,
      scheduledAt: phase.scheduledAt ?? null,
      visibleSigns: Array.isArray(phase.visibleSigns) ? phase.visibleSigns.slice(0, 4) : [],
      consequences: Array.isArray(phase.consequences) ? phase.consequences.slice(0, 4) : [],
      delayedEvents: Array.isArray(phase.delayedEvents) ? phase.delayedEvents.slice(0, 4) : [],
      influence: Array.isArray(phase.influence) ? phase.influence.slice(0, 4) : []
    } : null,
    visibleSigns: Array.isArray(event?.visibleSigns) ? event.visibleSigns.slice(0, 4) : [],
    consequences: Array.isArray(event?.consequences) ? event.consequences.slice(0, 4) : []
  };
}

function uniqueStrings(values, limit = Infinity) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = cleanText(value);
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

function takeArray(value, fallback = []) {
  return Array.isArray(value) && value.length > 0 ? value.slice() : fallback.slice();
}

function normalize(value) {
  return String(value ?? '').toLowerCase();
}

function extractHistoricalPeople(value) {
  if (!Array.isArray(value)) return [];
  const people = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      const name = cleanText(entry);
      if (!name) continue;
      people.push({ name });
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const name = cleanText(entry.name ?? entry.fullName ?? entry.label ?? '');
    if (!name) continue;
    people.push({
      name,
      role: cleanText(entry.role ?? '') || null,
      region: cleanText(entry.region ?? '') || null,
      event: cleanText(entry.event ?? entry.linkedEvent ?? '') || null,
      influenceMode: cleanText(entry.influenceMode ?? '') || null,
      contactMode: cleanText(entry.contactMode ?? '') || null,
      presence: cleanText(entry.presence ?? '') || null,
      knowledge: uniqueStrings(entry.knowledge ?? [], 4),
      localKnowledge: uniqueStrings(entry.localKnowledge ?? [], 4),
      consequences: uniqueStrings(entry.consequences ?? [], 4),
      visibleSigns: uniqueStrings(entry.visibleSigns ?? [], 4)
    });
  }
  return people;
}

function normalizeHistoricalParticipants(participants = []) {
  return extractHistoricalPeople(Array.isArray(participants) ? participants : [])
    .map((person) => person.name)
    .filter(Boolean);
}

function slug(value) {
  return normalize(value)
    .replace(/[^a-zа-я0-9]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'frame';
}
